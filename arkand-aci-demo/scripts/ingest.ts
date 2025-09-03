import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { ChromaClient } from "chromadb";
import chunkMarkdown from "../lib/chunk";
import embedTexts from "../lib/embed";

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listMarkdownFiles(p)));
    else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) out.push(p);
  }
  return out;
}

function extractTextFromAst(node: any): string {
  const type = node?.type;
  if (!type) return "";
  switch (type) {
    case "text":
      return node.value || "";
    case "inlineCode":
    case "code":
      return node.value || "";
    case "image":
      return node.alt || "";
    case "link":
    case "emphasis":
    case "strong":
    case "delete":
    case "paragraph":
    case "heading":
    case "blockquote":
    case "list":
    case "listItem":
    case "root": {
      const children = node.children || [];
      return children.map(extractTextFromAst).join(" ");
    }
    case "break":
    case "thematicBreak":
      return "\n";
    default: {
      const children = node.children || [];
      return children.map(extractTextFromAst).join(" ");
    }
  }
}

async function markdownToText(md: string): Promise<string> {
  const tree = unified().use(remarkParse).parse(md);
  const text = extractTextFromAst(tree)
    .replace(/\s+/g, " ")
    .replace(/\n\s*/g, "\n")
    .trim();
  return text;
}

async function main() {
  const root = ((globalThis as any)?.process?.cwd?.() as string) || path.resolve(".");
  const dataDir = path.join(root, "data", "aci");
  const chromaPath = (globalThis as any)?.process?.env?.CHROMA_PATH || ".chroma/aci";
  const chromaDir = path.isAbsolute(chromaPath) ? chromaPath : path.join(root, chromaPath);

  await ensureDir(chromaDir);

  const files = await listMarkdownFiles(dataDir);
  if (files.length === 0) {
    console.log("No markdown files found in", dataDir);
    return;
  }

  const envHost = (globalThis as any)?.process?.env?.CHROMA_HOST as string | undefined;
  const envPort = (globalThis as any)?.process?.env?.CHROMA_PORT as string | undefined;
  const host = envHost || "localhost";
  const port = envPort ? Number(envPort) : 8000;
  const client = new ChromaClient({ host, port, ssl: false });
  const collection = await client.getOrCreateCollection({
    name: "aci_demo",
    embeddingFunction: {
      generate: async (inputs: string[]) => embedTexts(inputs),
    },
  });

  let totalChunks = 0;
  for (const filePath of files) {
    const relFile = path.relative(dataDir, filePath);
    const raw = await fs.readFile(filePath, "utf8");
    const { data, content } = matter(raw);

    const title = (data?.title as string) || relFile;
    const source = (data?.source as string) || "";
    const topic = (data?.topic as string) || "general";

    const plain = await markdownToText(content);
    const chunks = chunkMarkdown(plain, 800);

  const ids: string[] = [];
  const documents: string[] = [];
  const metadatas: Array<Record<string, any>> = [];

    chunks.forEach((ch, idx) => {
      const id = `${relFile}#${idx}`.replace(/\s+/g, "_");
      ids.push(id);
      documents.push(ch.content);
  metadatas.push({ title, source, topic, file: relFile, chunk: idx });
    });

    const embeddings = await embedTexts(documents);

    // Upsert/add in the same batch size as embeddings
    await collection.add({ ids, embeddings, documents, metadatas });

    totalChunks += chunks.length;
    console.log(`Indexed ${chunks.length} chunks from ${relFile}`);
  }

  console.log(`Done. Total chunks: ${totalChunks}. Chroma path: ${chromaDir}`);
}

main().catch((err) => {
  console.error(err);
  (globalThis as any)?.process?.exit?.(1);
});

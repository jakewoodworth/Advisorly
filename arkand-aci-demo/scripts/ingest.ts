export {};
import { promises as fs } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { Pinecone } from "@pinecone-database/pinecone";
import chunkMarkdown from "../lib/chunk";
import embedTexts from "../lib/embed";

function loadEnvFiles(paths: string[]) {
  for (const p of paths) {
    try {
  const raw = readFileSync(p, "utf8");
      raw
        .split(/\r?\n/)
        .map((l: string) => l.trim())
        .filter((l: string) => l && !l.startsWith("#"))
        .forEach((line: string) => {
          const idx = line.indexOf("=");
          if (idx === -1) return;
          const key = line.slice(0, idx).trim();
          let val = line.slice(idx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) process.env[key] = val;
        });
    } catch {}
  }
}

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

type AstNode = { type?: string; value?: string; alt?: string; children?: AstNode[] };

function extractTextFromAst(node: AstNode): string {
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
  const text = extractTextFromAst(tree as unknown as AstNode)
    .replace(/\s+/g, " ")
    .replace(/\n\s*/g, "\n")
    .trim();
  return text;
}

type VectorMeta = { title: string; source: string; topic: string; file: string; chunk: number; content: string };

async function main() {
  const root = process.cwd();
  // Load env from local files if not already set (helps when running from repo root)
  if (!process.env.OPENAI_API_KEY || !process.env.PINECONE_API_KEY) {
    loadEnvFiles([
      path.join(root, ".env.local"),
      path.join(root, ".env"),
      path.join(root, "aci-chatbot", ".env.local"),
      path.join(root, "aci-chatbot", ".env"),
    ]);
  }
  const dataDir = path.join(root, "data", "aci");
  // Pinecone config
  const pcApiKey = process.env.PINECONE_API_KEY;
  const pcEnv = process.env.PINECONE_ENVIRONMENT; // optional in v6, but prefer set
  const indexName = process.env.PINECONE_INDEX || "quickstart";
  if (!pcApiKey) throw new Error("Missing PINECONE_API_KEY");

  const files = await listMarkdownFiles(dataDir);
  if (files.length === 0) {
    console.log("No markdown files found in", dataDir);
    return;
  }

  // Initialize Pinecone
  const pc = new Pinecone({ apiKey: pcApiKey } as any);
  const index = pc.Index(indexName);

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
  const metadatas: VectorMeta[] = [];

    chunks.forEach((ch, idx) => {
      const id = `${relFile}#${idx}`.replace(/\s+/g, "_");
      ids.push(id);
      documents.push(ch.content);
      metadatas.push({ title, source, topic, file: relFile, chunk: idx, content: ch.content });
    });

    const embeddings = await embedTexts(documents);
    // Upsert to Pinecone in batches
    const vectors = ids.map((id, i) => ({ id, values: embeddings[i], metadata: metadatas[i] }));
    const BATCH = 100;
    for (let i = 0; i < vectors.length; i += BATCH) {
      const slice = vectors.slice(i, i + BATCH);
      await index.upsert(slice as any);
    }

    totalChunks += chunks.length;
    console.log(`Indexed ${chunks.length} chunks from ${relFile}`);
  }

  console.log(`Done. Total chunks: ${totalChunks}. Pinecone index: ${indexName}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

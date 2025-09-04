import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { ChromaClient } from "chromadb";
import chunkMarkdown from "../lib/chunk";
import embedTexts from "../lib/embed";

function loadEnvFiles(paths: string[]) {
  for (const p of paths) {
    try {
      const raw = require("node:fs").readFileSync(p, "utf8");
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
  // Load env from local files if not already set (helps when running from repo root)
  if (!process.env.OPENAI_API_KEY) {
    loadEnvFiles([
      path.join(root, ".env.local"),
      path.join(root, ".env"),
      path.join(root, "aci-chatbot", ".env.local"),
      path.join(root, "aci-chatbot", ".env"),
    ]);
  }
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
  const pathUrl = `http://${host}:${port}`;
  let collection: any;
  try {
    // Prefer host/port; pass embeddingFunction: null and provide embeddings explicitly when adding
    // Try JS client first; if it fails with NotFound, fall back to REST calls
    try {
      const client = new ChromaClient({ host, port, ssl: false });
      collection = await client.getOrCreateCollection({
        name: "aci_demo",
        embeddingFunction: null as any,
      });
    } catch (e: any) {
      console.warn("JS client getOrCreateCollection failed; using REST fallback.");
      const base = `http://${host}:${port}/api/v1`;
      // Try to find existing collection by name
      let collId: string | null = null;
      try {
        const listRes = await fetch(`${base}/collections`);
        if (listRes.ok) {
          const list: any[] = await listRes.json();
          const found = list.find((c: any) => c?.name === "aci_demo");
          if (found) collId = found.id;
        }
      } catch {}
      if (!collId) {
        const res = await fetch(`${base}/collections`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "aci_demo" }),
        });
        if (!res.ok) {
          // As a fallback, list again in case it was created concurrently
          const listRes2 = await fetch(`${base}/collections`);
          if (!listRes2.ok) throw new Error(`REST create collection failed: ${res.status} ${res.statusText}`);
          const list2: any[] = await listRes2.json();
          const found2 = list2.find((c: any) => c?.name === "aci_demo");
          if (!found2) throw new Error(`REST create collection failed: ${res.status} ${res.statusText}`);
          collId = found2.id;
        } else {
          const data = await res.json();
          collId = data.id;
        }
      }
      collection = { id: collId!, name: "aci_demo" };
      (collection as any)._rest = true;
      (collection as any)._base = base;
    }
  } catch (err: any) {
    console.error("Chroma connection failed. Ensure the Chroma server is running.");
    console.error("Tip: Start Docker Desktop, then run:");
    console.error("  docker run -d --name chroma-aci -p 8000:8000 \\");
    console.error("    -e CHROMA_SERVER_CORS_ALLOW_ORIGINS=\"*\" \\");
    console.error("    -v \"$(pwd)/.chroma/aci:/chroma/chroma\" \\");
    console.error("    chromadb/chroma:0.5.5");
    console.error(`Current target: http://${host}:${port}`);
    throw err;
  }

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
    if ((collection as any)._rest) {
      const payload = {
        ids,
        embeddings,
        documents,
        metadatas,
      };
      const r = await fetch(`${(collection as any)._base}/collections/${collection.id}/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`REST add failed: ${r.status} ${r.statusText}`);
    } else {
      await collection.add({ ids, embeddings, documents, metadatas });
    }

    totalChunks += chunks.length;
    console.log(`Indexed ${chunks.length} chunks from ${relFile}`);
  }

  console.log(`Done. Total chunks: ${totalChunks}. Chroma path: ${chromaDir}`);
}

main().catch((err) => {
  console.error(err);
  (globalThis as any)?.process?.exit?.(1);
});

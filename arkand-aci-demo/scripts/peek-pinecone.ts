export {};
import path from "node:path";
import { readFileSync } from "node:fs";
import { Pinecone } from "@pinecone-database/pinecone";
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

async function main() {
  const root = process.cwd();
  if (!process.env.OPENAI_API_KEY || !process.env.PINECONE_API_KEY) {
    loadEnvFiles([
      path.join(root, ".env.local"),
      path.join(root, ".env"),
      path.join(root, "aci-chatbot", ".env.local"),
      path.join(root, "aci-chatbot", ".env"),
    ]);
  }

  const args = process.argv.slice(2);
  const query = args.length ? args.join(" ") : "";
  if (!query) {
    console.error("Usage: tsx scripts/peek-pinecone.ts \"your query\"");
    process.exit(1);
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  const pcKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX || "quickstart";
  if (!openaiKey) throw new Error("Missing OPENAI_API_KEY");
  if (!pcKey) throw new Error("Missing PINECONE_API_KEY");

  console.log(`Querying Pinecone index: ${indexName}`);

  const [embedding] = await embedTexts([query]);
  const pc = new Pinecone({ apiKey: pcKey } as any);
  const index = pc.Index(indexName);

  const res = await index.query({
    vector: embedding,
    topK: 3,
    includeMetadata: true,
  } as any);

  const matches = (res as any)?.matches ?? [];
  if (!Array.isArray(matches) || matches.length === 0) {
    console.log("No results.");
    return;
  }

  console.log(`Top ${Math.min(3, matches.length)} results for: ${query}`);
  for (let i = 0; i < Math.min(3, matches.length); i++) {
    const m = matches[i] as any;
    const meta = (m?.metadata ?? {}) as Record<string, any>;
    const content: string = (meta.content || meta.text || meta.document || "").toString();
    const snippet = content.replace(/\s+/g, " ").slice(0, 200);
    const title = meta.title || meta.file || "";
    const topic = meta.topic || "";
    const source = meta.source || "";
    const file = meta.file || "";
    const score = typeof m?.score === "number" ? m.score.toFixed(4) : String(m?.score ?? "");
    console.log(`\n#${i + 1} id=${m?.id} score=${score}`);
    console.log(`   title=${title} topic=${topic} file=${file} source=${source}`);
    console.log(`   snippet: ${snippet}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

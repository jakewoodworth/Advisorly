import { readFileSync } from "node:fs";
import { join } from "node:path";
import chunkMarkdown from "../lib/chunkMarkdown";

const file = process.argv[2] ?? join(__dirname, "../data/aci/conference-refunds.md");
const max = process.argv[3] ? Number(process.argv[3]) : 200;

const text = readFileSync(file, "utf8");
const chunks = chunkMarkdown(text, max);

console.log(`Chunks: ${chunks.length}`);
for (const c of chunks) {
  console.log("---\nID:", c.id, "\nLEN:", c.content.length, "\nTOKENS:", c.tokens, "\nCONTENT:\n", c.content);
}

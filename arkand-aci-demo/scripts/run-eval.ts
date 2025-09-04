#!/usr/bin/env tsx
import { readFile, mkdir, appendFile, writeFile } from "node:fs/promises";
import * as path from "node:path";

type Result = { q: string; answer: string; ms: number; status: string };

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function isOk(answer: string): boolean {
  const a = (answer || "").toLowerCase();
  // Generic fallback detection per requirement
  return !a.includes("i don’t have that information") && !a.includes("i don't have that information");
}

function csvEscape(s: string): string {
  // Simple CSV escaping: wrap in quotes and double any existing quotes
  const t = (s ?? "").replace(/"/g, '""');
  return `"${t}"`;
}

async function main() {
  const root = process.cwd();
  const questionsPath = path.join(root, "data", "eval-questions.txt");
  const logsDir = path.join(root, "logs");
  const day = todayYMD();
  const outJsonl = path.join(logsDir, `eval-results-${day}.jsonl`);
  const outCsv = path.join(logsDir, `eval-summary-${day}.csv`);
  const apiUrl = process.env.API_URL || "http://localhost:3000/api/chat";

  const raw = await readFile(questionsPath, "utf8").catch(() => null);
  if (!raw) throw new Error(`Could not read ${questionsPath}`);

  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  const questions = lines.filter((l) => l && !l.startsWith("#"));

  await mkdir(logsDir, { recursive: true });
  // Write CSV header
  await writeFile(outCsv, "q,ms,ok\n", "utf8");

  let idx = 0;
  for (const q of questions) {
    idx += 1;
    const started = Date.now();
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const data = await res.json().catch(() => ({} as any));
      const answer: string = (data?.answer as string) || "";
      const ms = Date.now() - started;
      const status = `${res.status} ${res.statusText}`.trim();

      const result: Result = { q, answer, ms, status };
      await appendFile(outJsonl, JSON.stringify(result) + "\n", "utf8");
      const ok = isOk(answer);
      await appendFile(outCsv, `${csvEscape(q)},${ms},${ok}\n`, "utf8");
    } catch (err: any) {
      const ms = Date.now() - started;
      const answer = "";
      const status = `error: ${err?.message || String(err)}`;
      const result: Result = { q, answer, ms, status };
      await appendFile(outJsonl, JSON.stringify(result) + "\n", "utf8");
      await appendFile(outCsv, `${csvEscape(q)},${ms},false\n`, "utf8");
    }
    // Small delay to reduce burstiness
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`Wrote results: ${outJsonl}`);
  console.log(`Wrote summary: ${outCsv}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

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
  const healthUrl = (() => {
    try {
      const u = new URL(apiUrl);
      return `${u.protocol}//${u.host}/api/health`;
    } catch {
      return "http://localhost:3000/api/health";
    }
  })();

  const raw = await readFile(questionsPath, "utf8").catch(() => null);
  if (!raw) throw new Error(`Could not read ${questionsPath}`);

  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  const questions = lines.filter((l) => l && !l.startsWith("#"));

  await mkdir(logsDir, { recursive: true });
  // Write CSV header
  await writeFile(outCsv, "q,ms,ok\n", "utf8");

  // Best-effort readiness check to avoid hitting a cold dev server
  try {
    const h = await fetch(healthUrl, { method: "GET" });
    if (!h.ok) {
      // small grace period if health isn't OK yet
      await new Promise((r) => setTimeout(r, 800));
    }
  } catch {
    // If the health endpoint isn't available, continue anyway
  }

  let idx = 0;
  for (const q of questions) {
    idx += 1;
    const started = Date.now();
    let attempt = 0;
    let recorded = false;
    while (attempt < 3 && !recorded) {
      attempt += 1;
      try {
        const res = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: q }),
        });
  const data: unknown = await res.json().catch(() => ({}));
  const answer: string = (data && typeof data === 'object' && 'answer' in data ? String((data as any).answer) : "");
        const ms = Date.now() - started;
        const status = `${res.status} ${res.statusText}`.trim();

        const result: Result = { q, answer, ms, status };
        await appendFile(outJsonl, JSON.stringify(result) + "\n", "utf8");
        const ok = isOk(answer);
        await appendFile(outCsv, `${csvEscape(q)},${ms},${ok}\n`, "utf8");
        recorded = true;
    } catch (err) {
        if (attempt >= 3) {
          const ms = Date.now() - started;
          const answer = "";
      const status = `error: ${err instanceof Error ? err.message : String(err)}`;
          const result: Result = { q, answer, ms, status };
          await appendFile(outJsonl, JSON.stringify(result) + "\n", "utf8");
          await appendFile(outCsv, `${csvEscape(q)},${ms},false\n`, "utf8");
          recorded = true;
        } else {
          // backoff before retrying
          await new Promise((r) => setTimeout(r, 300 * attempt));
        }
      }
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

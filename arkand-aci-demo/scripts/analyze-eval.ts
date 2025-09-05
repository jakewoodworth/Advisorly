#!/usr/bin/env tsx
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";

type Result = { q: string; answer: string; ms: number; status: string };

function isFallback(answer: string): boolean {
  const a = (answer || "").toLowerCase();
  return a.includes("i don’t have that information") || a.includes("i don't have that information");
}

function statusCode(status: string): number | null {
  const m = String(status || "").match(/^(\d{3})/);
  return m ? Number(m[1]) : null;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const arr = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
}

const STOPWORDS = new Set(
  [
    "a","an","the","and","or","but","if","then","else","when","where","why","how",
    "what","which","who","whom","whose","is","are","was","were","be","been","being",
    "to","of","in","on","for","from","by","with","about","as","at","it","its","this",
    "that","these","those","i","you","we","they","he","she","them","me","my","your",
    "our","can","could","should","would","do","does","did","done","make","made","use",
    "using","into","over","under","per","vs","via","than","too","also","not","no","yes",
    "up","down","out","into","more","most","less","least","have","has","having","got",
    "tell","me","please","give","show","any","some","many","much","new","old","same",
    "vs.","ok","okay","info","information","details","detail",
  ]
);

function tokenize(text: string): string[] {
  const cleaned = (text || "").toLowerCase().replace(/[^a-z0-9\s'-]+/g, " ");
  const tokens = cleaned
    .split(/\s+/)
    .map((t) => t.replace(/^'+|'+$/g, ""))
    .filter((t) => t && t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
  return tokens;
}

async function findLatestResultsFile(logsDir: string): Promise<string | null> {
  try {
    const files = await readdir(logsDir);
    const candidates = files
      .filter((f) => /^eval-results-\d{8}\.jsonl$/.test(f))
      .sort() // lexicographic sort works for YYYYMMDD
      .reverse();
    if (candidates.length === 0) return null;
    return path.join(logsDir, candidates[0]);
  } catch {
    return null;
  }
}

async function main() {
  const root = process.cwd();
  const logsDir = path.join(root, "logs");
  const latest = await findLatestResultsFile(logsDir);
  if (!latest) {
    console.error("No eval results found in logs/. Run scripts/run-eval.ts first.");
    process.exit(1);
  }

  const raw = await readFile(latest, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const byQ = new Map<string, Result>();
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj && typeof obj.q === "string") {
        const r: Result = { q: obj.q, answer: obj.answer ?? "", ms: Number(obj.ms) || 0, status: String(obj.status || "") };
        const prev = byQ.get(r.q);
        if (!prev) {
          byQ.set(r.q, r);
        } else {
          const prevCode = statusCode(prev.status) ?? 0;
          const currCode = statusCode(r.status) ?? 0;
          const prevAns = (prev.answer || "").trim();
          const currAns = (r.answer || "").trim();
          const prevOk = prevCode === 200;
          const currOk = currCode === 200;
          const prevGood = prevOk && !isFallback(prevAns) && prevAns.length > 0;
          const currGood = currOk && !isFallback(currAns) && currAns.length > 0;

          let takeCurrent = false;
          if (currOk && !prevOk) takeCurrent = true;
          else if (currOk && prevOk) {
            if (currGood && !prevGood) takeCurrent = true;
            else if ((currGood && prevGood) || (!currGood && !prevGood)) {
              // Prefer longer answer as a simple tie-breaker
              if (currAns.length > prevAns.length) takeCurrent = true;
            }
          }
          // If both non-200, keep the previous (earlier success may exist elsewhere)
          if (takeCurrent) byQ.set(r.q, r);
        }
      }
    } catch {
      // skip malformed lines
    }
  }
  const results: Result[] = Array.from(byQ.values());

  if (results.length === 0) {
    console.error(`No parsable rows in ${latest}`);
    process.exit(1);
  }

  const total = results.length;
  const latencies = results.map((r) => r.ms).filter((n) => Number.isFinite(n));
  const med = median(latencies);

  const fallbackCount = results.reduce((acc, r) => acc + (isFallback(r.answer) ? 1 : 0), 0);
  const fallbackPct = (fallbackCount / total) * 100;

  const failures = results.filter((r) => {
    const code = statusCode(r.status);
    const ans = (r.answer || "").trim();
    const ok = code === 200 && !isFallback(ans) && ans.length > 0;
    return !ok;
  });

  // Word frequencies from failed questions
  const freq = new Map<string, number>();
  for (const r of failures) {
    for (const tok of tokenize(r.q)) {
      freq.set(tok, (freq.get(tok) || 0) + 1);
    }
  }
  const topWords = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);

  // Slowest 10 queries
  const slowest = [...results].sort((a, b) => b.ms - a.ms).slice(0, 10);

  // Write failed questions list
  await mkdir(logsDir, { recursive: true });
  const missesPath = path.join(logsDir, "eval-misses.txt");
  await writeFile(missesPath, failures.map((r) => r.q).join("\n") + "\n", "utf8");

  // Output summary
  console.log(`Analyzing: ${path.relative(root, latest)}`);
  console.log(`Total queries: ${total}`);
  console.log(`Median latency: ${Math.round(med)} ms`);
  console.log(`Fallback answers: ${fallbackCount}/${total} (${fallbackPct.toFixed(1)}%)`);
  console.log(`Failures: ${failures.length}/${total} (${((failures.length / total) * 100).toFixed(1)}%)`);
  console.log("");
  console.log("Top 10 words in failed questions:");
  if (topWords.length === 0) {
    console.log("  (none)");
  } else {
    for (const [w, c] of topWords) {
      console.log(`  ${w.padEnd(18)} ${String(c).padStart(3)}`);
    }
  }
  console.log("");
  console.log("10 slowest queries:");
  const header = `${"#".padStart(2)}  ${"ms".padStart(6)}  ${"code".padStart(4)}  q`;
  console.log(header);
  console.log("-".repeat(header.length + 20));
  slowest.forEach((r, i) => {
    const code = statusCode(r.status) ?? 0;
    const qShort = r.q.length > 100 ? r.q.slice(0, 97) + "..." : r.q;
    console.log(`${String(i + 1).padStart(2)}  ${String(Math.round(r.ms)).padStart(6)}  ${String(code).padStart(4)}  ${qShort}`);
  });

  console.log("");
  console.log(`Wrote misses: ${path.relative(root, missesPath)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

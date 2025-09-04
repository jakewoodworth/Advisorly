#!/usr/bin/env tsx
import { readFile } from "node:fs/promises";
import * as path from "node:path";

type TestItem = { question: string; expectUnknown: boolean };

function parseEvalFile(text: string): TestItem[] {
  const lines = text.split(/\r?\n/);
  const out: TestItem[] = [];
  for (let raw of lines) {
    let line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    let expectUnknown = false;
    // Allow inline markers
    if (/\[unknown\]/i.test(line) || /#\s*unknown\b/i.test(line)) {
      expectUnknown = true;
      line = line.replace(/\[unknown\]/ig, "").replace(/#\s*unknown\b/i, "").trim();
    }
    // Strip trailing question mark spacing
    line = line.replace(/\s+\?$/, "?");
    out.push({ question: line, expectUnknown });
  }
  return out;
}

async function* iterQuestions(filePath: string, limit = 10) {
  const text = await readFile(filePath, "utf8").catch(() => "");
  if (!text) throw new Error(`Could not read questions from ${filePath}`);
  const items = parseEvalFile(text).slice(0, limit);
  for (const it of items) yield it;
}

function includesIDontKnow(ans: string): boolean {
  const a = ans.toLowerCase();
  return a.includes("i don’t know") || a.includes("i don't know");
}

async function run() {
  const root = process.cwd();
  const evalPath = path.join(root, "data", "eval-questions.txt");
  const apiUrl = process.env.API_URL || "http://localhost:3000/api/chat";

  let total = 0;
  let passed = 0;
  const results: Array<{ i: number; q: string; ok: boolean; status: string; answer: string }>
    = [];

  let i = 0;
  for await (const { question, expectUnknown } of iterQuestions(evalPath, 10)) {
    i += 1; total += 1;
    const started = Date.now();
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question }),
      });
      const data = await res.json().catch(() => ({} as any));
      const answer: string = (data?.answer as string) || "";
      const ms = Date.now() - started;

      let ok = true;
      let status = `${res.status} ${res.statusText} in ${ms}ms`;
      if (expectUnknown) {
        ok = includesIDontKnow(answer);
        status += ok ? " (expected unknown ✓)" : " (expected unknown ✗)";
      }
      if (ok) passed += 1;
      results.push({ i, q: question, ok, status, answer });
    } catch (err: any) {
      results.push({ i, q: question, ok: false, status: `error: ${err?.message || err}`, answer: "" });
    }
    // small delay to avoid rate spikes
    await new Promise((r) => setTimeout(r, 150));
  }

  // Print report
  for (const r of results) {
    const mark = r.ok ? "PASS" : "FAIL";
    console.log(`\n[${mark}] #${r.i} ${r.q}`);
    console.log(`  ${r.status}`);
    if (!r.ok) {
      console.log(`  Answer: ${r.answer?.slice(0, 200)}${r.answer.length > 200 ? "…" : ""}`);
    }
  }
  console.log(`\nSummary: ${passed}/${total} passed.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

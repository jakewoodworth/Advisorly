#!/usr/bin/env tsx
export {};
/*
  Simple smoke tests for /api/chat
  Cases:
  - empty input
  - 1000-char input (truncation path)
  - multi-question input
  - unknown topic input
  Prints PASS/FAIL per case and exits non-zero if any fail.
*/

type SmokeResult = { name: string; pass: boolean; info?: string };

const API_URL = process.env.API_URL || "http://localhost:3000/api/chat";
const FALLBACK = "I don’t have that in this demo. Try the meeting policies, registration portal, or contact the events team.";
const TRUNCATION = "Note: Your question was long; I used the first 500 characters.";
const MULTI_Q = "I can only answer one question at a time. Which part would you like me to answer first?";

async function callChat(message: string, ip: string): Promise<{ status: number; answer: string; raw: unknown }>
{
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify({ message }),
  });
  let data: unknown = null;
  try { data = await res.json(); } catch {}
  const answer: string = (data && typeof data === 'object' && 'answer' in data ? String((data as any).answer) : "");
  return { status: res.status, answer, raw: data };
}

async function testEmptyInput(): Promise<SmokeResult> {
  const name = "empty input";
  // Body validator will fail or message-too-short branch triggers; should use the standard fallback text.
  const { status, answer, raw } = await callChat("", "198.51.100.101");
  if (status === 429) return { name, pass: false, info: "rate-limited" };
  const pass = answer.includes("I don’t have that in this demo.");
  return { name, pass, info: pass ? undefined : `status=${status}, answer=${JSON.stringify(answer)}, raw=${JSON.stringify(raw)}` };
}

async function testLongInput(): Promise<SmokeResult> {
  const name = "1000-char input";
  // Use a single-question long prompt to trigger truncation without multi-question guard.
  const base = "Refund policy ";
  let msg = "";
  while (msg.length < 1000) msg += base;
  msg = (msg.slice(0, 1000) + "?").slice(0, 1001); // ensure only one '?'
  const { status, answer, raw } = await callChat(msg, "198.51.100.102");
  if (status === 429) return { name, pass: false, info: "rate-limited" };
  const pass = answer.startsWith(TRUNCATION);
  return { name, pass, info: pass ? undefined : `status=${status}, answerPreview=${JSON.stringify(answer.slice(0, 120))}` };
}

async function testMultiQuestion(): Promise<SmokeResult> {
  const name = "multi-question input";
  const msg = "What’s included with registration? What is the refund policy?";
  const { status, answer, raw } = await callChat(msg, "198.51.100.103");
  if (status === 429) return { name, pass: false, info: "rate-limited" };
  const pass = answer === MULTI_Q;
  return { name, pass, info: pass ? undefined : `status=${status}, answer=${JSON.stringify(answer)}` };
}

async function testUnknownTopic(): Promise<SmokeResult> {
  const name = "unknown topic";
  const msg = "What’s the Wi‑Fi password?";
  const { status, answer, raw } = await callChat(msg, "198.51.100.104");
  if (status === 429) return { name, pass: false, info: "rate-limited" };
  // Expect fallback when no matching context is found.
  const pass = answer.includes("I don’t have that in this demo.");
  return { name, pass, info: pass ? undefined : `status=${status}, answer=${JSON.stringify(answer)}` };
}

async function main() {
  const tests = [testEmptyInput, testLongInput, testMultiQuestion, testUnknownTopic];
  const results: SmokeResult[] = [];
  for (const t of tests) {
    try {
      const r = await t();
      results.push(r);
    } catch (e) {
      const info = e instanceof Error ? e.message : String(e);
      results.push({ name: t.name || "unknown", pass: false, info });
    }
  }

  const pad = (s: string, n = 26) => (s + " ").slice(0, n);
  let failures = 0;
  results.forEach((r) => {
    const line = `${pad(r.name)} ${r.pass ? "PASS" : "FAIL"}${r.pass ? "" : `  ${r.info || ""}`}`;
    console.log(line);
    if (!r.pass) failures += 1;
  });
  if (failures > 0) {
    console.log(`\n${failures} test(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log("\nAll smoke tests passed.");
  }
}

main().catch((e) => {
  console.error("Smoke tests crashed:", e);
  process.exit(1);
});

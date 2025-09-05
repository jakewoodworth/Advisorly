#!/usr/bin/env tsx
export {};
/**
 * Production smoke checks for the live chatbot API.
 * Default URL: https://aci-demo.arkand.ai/api/chat (override with PROD_URL env).
 * Prints compact PASS/FAIL per test and exits non-zero on failure.
 */

type Expect = "ok" | "fallback";
type Check = { name: string; message: string; expect: Expect };
type Result = { name: string; pass: boolean; info?: string };

const PROD_URL = process.env.PROD_URL || "https://aci-demo.arkand.ai/api/chat";
const FALLBACK_TEXT = "I don’t have that in this demo. Try the meeting policies, registration portal, or contact the events team.";
const MULTIQ_TEXT = "I can only answer one question at a time. Which part would you like me to answer first?";
const RL_MSG = "Daily demo limit reached. Try again tomorrow or contact Arkand AI for full access.";

const TESTS: Check[] = [
  { name: "included with registration", message: "What’s included with registration?", expect: "ok" },
  { name: "refund policy", message: "What’s the refund policy?", expect: "ok" },
  { name: "sponsor event", message: "How do I sponsor an event?", expect: "ok" },
  { name: "agenda", message: "Where can I find the agenda?", expect: "ok" },
  { name: "slides after event", message: "Are session slides available after the event?", expect: "ok" },
  { name: "unknown topic", message: "What’s the Wi‑Fi password?", expect: "fallback" },
];

async function hit(message: string, ipHint: string): Promise<{ status: number; answer: string; raw: unknown }> {
  const res = await fetch(PROD_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ipHint },
    body: JSON.stringify({ message }),
  });
  let data: unknown = null;
  try { data = await res.json(); } catch {}
  const answer: string = (data && typeof data === 'object' && 'answer' in data ? String((data as any).answer) : "");
  return { status: res.status, answer, raw: data };
}

function evaluate(expect: Expect, status: number, answer: string) {
  if (status === 429) return { pass: false, info: "429 rate-limited" };
  if (status !== 200) return { pass: false, info: `status ${status}` };
  const a = (answer || "").trim();
  if (expect === "ok") {
    const bad = !a || a.includes(FALLBACK_TEXT) || a === MULTIQ_TEXT || a === RL_MSG;
    return { pass: !bad, info: bad ? `unexpected: ${a.slice(0, 80)}` : undefined };
  }
  // expect fallback
  const pass = a.includes(FALLBACK_TEXT);
  return { pass, info: pass ? undefined : `expected fallback, got: ${a.slice(0, 80)}` };
}

async function main() {
  const results: Result[] = [];
  let i = 0;
  for (const t of TESTS) {
    i += 1;
    try {
      const ipHint = `203.0.113.${100 + i}`; // reduce chance of shared IP collisions
      const { status, answer } = await hit(t.message, ipHint);
      const { pass, info } = evaluate(t.expect, status, answer);
      results.push({ name: t.name, pass, info });
    } catch (e) {
      const info = e instanceof Error ? e.message : String(e);
      results.push({ name: t.name, pass: false, info });
    }
    // small delay to avoid burstiness
    await new Promise((r) => setTimeout(r, 150));
  }

  const pad = (s: string, n = 24) => (s + " ").slice(0, n);
  let fails = 0;
  for (const r of results) {
    if (!r.pass) fails += 1;
    console.log(`${pad(r.name)} ${r.pass ? "PASS" : "FAIL"}${r.pass ? "" : `  ${r.info || ""}`}`);
  }
  if (fails > 0) {
    console.log(`\n${fails} failure(s). URL: ${PROD_URL}`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll production checks passed. URL: ${PROD_URL}`);
  }
}

main().catch((e) => {
  console.error("prod-check crashed:", e);
  process.exit(1);
});

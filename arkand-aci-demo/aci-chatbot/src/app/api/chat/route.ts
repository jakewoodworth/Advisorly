import { NextResponse } from "next/server";
import { z } from "zod";
import { searchChunks } from "@/lib/vector";
import { checkAndIncrement } from "@/lib/ratelimit";
import OpenAI from "openai";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

const SYSTEM_PROMPT = `You are ACI-NA’s helpful assistant for conferences, programming, membership, and committees.

CORE RULES
1) Use ONLY the provided context to answer. If the context is insufficient, say: “I don’t have that in this demo. Try the meeting policies, registration portal, or contact the events team.”
2) Do NOT include citations, links, or source callouts.
3) Be concise, plain-English, and specific. Prefer short paragraphs or 3–7 bullet points.
4) If the user’s question is ambiguous, ask a brief clarifying question before answering.
5) If the user asks for policy, deadlines, or pricing not present in context, state you don’t have it and suggest who to contact or where it typically appears (e.g., meeting policies page, registration portal).
6) Never invent dates, prices, names, or private data.
7) Safety: decline anything outside professional scope (e.g., personal data, legal/medical advice).

TONE & STYLE
- Professional, friendly, and direct.
- No marketing fluff. No emojis. No citations or URLs.
- Use the user’s wording where helpful (e.g., if they say “refund,” respond with “refund” not “reimbursement” unless the context prefers a specific term).

WHEN CONTEXT IS THIN
- Offer the closest relevant details from context and clearly label any gaps.
- Provide one actionable next step (e.g., “Check your registration email for the confirmation link” or “Contact the events team for specifics on substitutions”).

ESCALATION
- If multiple follow-ups are needed, keep it to one short question at a time.
- If the answer requires systems access (e.g., membership status, payments), say you can’t access accounts in this demo.

You must follow these rules for every response.`;

const FORMAT_GUARD = `FORMAT: Respond with either:
A) A single short paragraph (<= 120 words), or
B) 3–7 bullets, each <= 20 words.
No links, no citations, no footers.
If unsure, say: “I don’t have that in this demo. Try the meeting policies, registration portal, or contact the events team.”`;

export const runtime = "nodejs";

const bodySchema = z.object({
  message: z.string().min(1, "message is required"),
});

export async function POST(req: Request) {
  const started = Date.now();
  let question: string | undefined;
  let ip = "unknown";
  const writeLog = async (entry: { ip: string; question: string | undefined; answer: string; chunksUsed: number; success: boolean }) => {
    try {
      const root = path.resolve(process.cwd(), "..");
      const logDir = path.join(root, "logs");
      await mkdir(logDir, { recursive: true });
      const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const file = path.join(logDir, `demo-${day}.jsonl`);
      const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
      await appendFile(file, line);
    } catch {
      // ignore
    }
  };

  try {
    // Rate limit check: enforce daily cap via env DEMO_DAILY_CAP (default 100)
    ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
    const cap = Number(process.env.DEMO_DAILY_CAP || 100);
    const rate = await checkAndIncrement(ip, Number.isFinite(cap) && cap > 0 ? cap : 100);
  if (!rate.allowed) {
      const answer = "Daily demo limit reached. Try again tomorrow or contact Arkand AI for full access.";
      await writeLog({ ip, question, answer, chunksUsed: 0, success: false });
      return NextResponse.json(
        { answer, resetAt: rate.resetAt },
        { status: 429 }
      );
    }

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
  const answer = "I don’t have that in this demo. Try the meeting policies, registration portal, or contact the events team.";
      await writeLog({ ip, question, answer, chunksUsed: 0, success: false });
      return NextResponse.json({ answer });
    }

    const rawMessage = (parsed.data.message || "").trim();
    if (!rawMessage || rawMessage.length < 3) {
  const answer = "I don’t have that in this demo. Try the meeting policies, registration portal, or contact the events team.";
      await writeLog({ ip, question: rawMessage, answer, chunksUsed: 0, success: false });
      return NextResponse.json({ answer });
    }

    // Truncate overly long inputs to protect retrieval and model
    let message = rawMessage;
    let truncationWarning: string | null = null;
    if (message.length > 500) {
      message = message.slice(0, 500);
      truncationWarning = "Note: Your question was long; I used the first 500 characters.";
    }
    question = rawMessage;

    // Detect multiple questions (separated by '?' or joined with 'and') and ask to focus
    const qmParts = rawMessage.split("?").filter((p) => p.trim().length > 0);
    const lower = rawMessage.toLowerCase();
    const whMatches = lower.match(/\b(what|when|where|who|why|how|can|do|does|is|are|should|could|would|may)\b/g) || [];
    if (qmParts.length >= 2 || (/(^|\s)and(\s|$)/.test(lower) && whMatches.length >= 2)) {
  const answer = "I can only answer one question at a time. Which part would you like me to answer first?";
      await writeLog({ ip, question: rawMessage, answer, chunksUsed: 0, success: false });
      return NextResponse.json({ answer });
    }

    const hits = await searchChunks(message, 5);
    if (!hits || hits.length === 0) {
      const answer = "I don’t have that in this demo. Try the meeting policies, registration portal, or contact the events team.";
      await writeLog({ ip, question: rawMessage, answer, chunksUsed: 0, success: true });
      return NextResponse.json({ answer });
    }
    const sources = hits
      .map((h: { metadata?: Record<string, any> }) => (h.metadata?.source as string) || (h.metadata?.file as string) || "")
      .filter(Boolean)
      .slice(0, 5);
    const topKContextChunks = hits.map((h: any) => ({
      text: h?.content ?? "",
      meta: {
        title: h?.metadata?.title || h?.metadata?.file || "",
        topic: h?.metadata?.topic || "",
      },
    }));

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      const answer = "I don’t have that in this demo. Try the meeting policies, registration portal, or contact the events team.";
      await writeLog({ ip, question: rawMessage, answer, chunksUsed: hits.length, success: false });
      return NextResponse.json({ answer });
    }

    const openai = new OpenAI({ apiKey });
    const userContent = `User question:
${message}

Relevant context (do not display verbatim unless needed):
---
${topKContextChunks
  .map(
    (c, i) => `[#${i + 1}] ${c.text}
(meta: title=${c.meta?.title || ''}; topic=${c.meta?.topic || ''})`
  )
  .join("\n\n")}
---`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "system", content: FORMAT_GUARD },
        { role: "user", content: userContent },
      ],
    });

    let answer = completion.choices?.[0]?.message?.content?.trim() || "I don’t know.";
    if (truncationWarning) {
      answer = `${truncationWarning}\n\n${answer}`;
    }
  await writeLog({ ip, question: rawMessage, answer, chunksUsed: hits.length, success: true });
    return NextResponse.json({ answer });
  } catch (err: any) {
  const answer = "I don’t have that in this demo. Try the meeting policies, registration portal, or contact the events team.";
  await writeLog({ ip, question, answer, chunksUsed: 0, success: false });
  return NextResponse.json({ answer });
  }
}

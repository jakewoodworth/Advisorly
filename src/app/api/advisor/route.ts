import { NextResponse } from "next/server";

import { parseAdvice } from "@/lib/advisorRules";
import type { Preferences } from "@/types/catalog";

interface AdvisorRequestBody {
  text: string;
  prefs: Preferences;
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (process.env.AI_ENABLED !== "true") {
    return NextResponse.json({ error: "Advisor AI disabled" }, { status: 503 });
  }

  let payload: AdvisorRequestBody;
  try {
    payload = (await request.json()) as AdvisorRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { text, prefs } = payload;

  if (!text?.trim()) {
    return NextResponse.json({ error: "Missing advisory text" }, { status: 400 });
  }

  const refinedPrefs = parseAdvice(text, prefs);
  let rationale = `Updated preferences based on: "${text.trim()}".`;

  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          input: `Student request: ${text}. Current preferences: ${JSON.stringify(
            prefs
          )}. Summarize the change in one sentence for the student dashboard.`,
          max_output_tokens: 60,
        }),
        signal: controller.signal,
      });

      if (response.ok) {
        const result = await response.json();
        const summary = result?.output?.[0]?.content?.[0]?.text ?? result?.choices?.[0]?.message?.content;
        if (summary && typeof summary === "string") {
          rationale = summary.trim();
        }
      }
    } catch (error) {
      // Ignore LLM errors and fall back to rule-based rationale.
      if (process.env.NODE_ENV === "development") {
        console.warn("LLM refinement failed", error);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return NextResponse.json({ prefs: refinedPrefs, rationale });
}

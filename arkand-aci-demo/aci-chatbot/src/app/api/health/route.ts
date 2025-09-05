import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const started = Date.now();
  const details: Record<string, unknown> = { ok: true };
  try {
    // Check OpenAI key presence without leaking value
    details.openai = { configured: Boolean(process.env.OPENAI_API_KEY) };

    // Check Chroma heartbeat
    const host = process.env.CHROMA_HOST || "localhost";
    const port = process.env.CHROMA_PORT ? Number(process.env.CHROMA_PORT) : 8000;
    const hb = await fetch(`http://${host}:${port}/api/v1/heartbeat`).then((r) => r.json()).catch(() => null);
    details.chroma = { up: Boolean(hb), heartbeat: hb };

    // Optionally verify collection exists
    const list: unknown = await fetch(`http://${host}:${port}/api/v1/collections`).then((r) => r.json()).catch(() => []);
    const found = Array.isArray(list)
      ? list.find((c) => typeof c === "object" && c !== null && (c as { name?: string }).name === "aci_demo")
      : null;
    details.collection = { name: "aci_demo", exists: Boolean(found) };
  } catch (e) {
    (details as { ok: boolean }).ok = false;
    (details as { error?: string }).error = e instanceof Error ? e.message : String(e);
  } finally {
    (details as { ms: number }).ms = Date.now() - started;
  }
  const status = details.ok ? 200 : 500;
  return NextResponse.json(details, { status });
}

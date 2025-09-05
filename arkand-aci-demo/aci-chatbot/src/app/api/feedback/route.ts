import { NextResponse } from "next/server";
import { z } from "zod";
import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const schema = z.object({
  messageId: z.string().min(1),
  vote: z.enum(["up", "down"]),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
    }

    const { messageId, vote } = parsed.data;
    const root = path.resolve(process.cwd(), "..");
    const logDir = path.join(root, "logs");
    await mkdir(logDir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(logDir, `feedback-${day}.jsonl`);
  const line = JSON.stringify({ ts: new Date().toISOString(), messageId, vote }) + "\n";
  await appendFile(file, line);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

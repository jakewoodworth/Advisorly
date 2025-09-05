import fs from "fs/promises";
import path from "path";

type FeedbackRow = {
  ts: string;
  messageId?: string;
  vote?: string;
  snippet?: string;
};

async function fileExists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJsonl(filePath: string): Promise<any[]> {
  const raw = await fs.readFile(filePath, "utf8").catch(() => "");
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((v) => v && typeof v === "object");
}

async function getNearbyDemoSnippet(logsDir: string, tsIso?: string): Promise<string | undefined> {
  if (!tsIso) return undefined;
  // Try to read the same-day demo log and pick the last entry at or before ts.
  try {
    const day = tsIso.slice(0, 10);
    const demoFile = path.join(logsDir, `demo-${day}.jsonl`);
    if (!(await fileExists(demoFile))) return undefined;
    const entries = await readJsonl(demoFile);
    const ts = Date.parse(tsIso);
    let best: any | undefined;
    for (const e of entries) {
      const ets = Date.parse(String(e.ts ?? ""));
      if (Number.isFinite(ets) && ets <= ts) best = e;
    }
    if (best) {
      const q: string = String(best.question ?? "");
      const a: string = String(best.answer ?? "");
      const qS = q ? q.slice(0, 80) : "";
      const aS = a ? a.slice(0, 80) : "";
      const joined = [qS, aS].filter(Boolean).join(" — ");
      return joined || undefined;
    }
  } catch {
    // ignore
  }
  return undefined;
}

export default async function Page() {
  // Server-side read of feedback logs
  const root = path.resolve(process.cwd(), "..");
  const logsDir = path.join(root, "logs");

  // Prefer combined file; fallback to per-day files
  const combinedPath = path.join(logsDir, "feedback.log.jsonl");
  let rows: FeedbackRow[] = [];

  if (await fileExists(combinedPath)) {
    const items = await readJsonl(combinedPath);
    rows = await Promise.all(
      items.slice(-500).map(async (it: any) => ({
        ts: String(it.ts ?? ""),
        messageId: String(it.messageId ?? ""),
        vote: String(it.vote ?? ""),
        snippet: (await getNearbyDemoSnippet(logsDir, String(it.ts ?? ""))) ?? "",
      }))
    );
  } else {
    // Aggregate all feedback-*.jsonl files
    try {
      const listing = await fs.readdir(logsDir).catch(() => [] as string[]);
      const files = listing
        .filter((f) => /^feedback-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
        .sort()
        .slice(-7) // last 7 days
        .map((f) => path.join(logsDir, f));
      const all: any[] = [];
      for (const f of files) {
        const items = await readJsonl(f);
        all.push(...items);
      }
      const mapped = await Promise.all(
        all.map(async (it: any) => ({
          ts: String(it.ts ?? ""),
          messageId: String(it.messageId ?? ""),
          vote: String(it.vote ?? ""),
          snippet: (await getNearbyDemoSnippet(logsDir, String(it.ts ?? ""))) ?? "",
        }))
      );
      // Sort newest first and trim
      rows = mapped
        .filter((r) => r.ts)
        .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
        .slice(0, 500);
    } catch {
      rows = [];
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 p-4">
      <div className="mx-auto w-full max-w-5xl">
        <h1 className="text-lg font-semibold mb-3">Feedback Log</h1>
        <div className="rounded-lg border border-neutral-200 bg-white overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-100 text-neutral-700">
              <tr>
                <th className="text-left px-3 py-2 border-b border-neutral-200">Timestamp</th>
                <th className="text-left px-3 py-2 border-b border-neutral-200">Message ID</th>
                <th className="text-left px-3 py-2 border-b border-neutral-200">Vote</th>
                <th className="text-left px-3 py-2 border-b border-neutral-200">Snippet (Q — A)</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-neutral-500" colSpan={4}>
                    No feedback entries found.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={`${r.ts}-${r.messageId}-${i}`} className={i % 2 === 0 ? "bg-white" : "bg-neutral-50"}>
                    <td className="px-3 py-2 align-top whitespace-nowrap text-neutral-700">{r.ts ? new Date(r.ts).toLocaleString() : ""}</td>
                    <td className="px-3 py-2 align-top font-mono text-[11px] text-neutral-600">{r.messageId || ""}</td>
                    <td className="px-3 py-2 align-top">{r.vote || ""}</td>
                    <td className="px-3 py-2 align-top text-neutral-700">
                      {r.snippet ? r.snippet : <span className="text-neutral-400">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

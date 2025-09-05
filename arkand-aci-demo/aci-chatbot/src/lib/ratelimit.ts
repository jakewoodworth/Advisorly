import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Store = {
  // key: `${YYYY-MM-DD}::${ip}` -> count
  counts: Record<string, number>;
};

const root = path.resolve(process.cwd(), "..");
const logsDir = path.join(root, "logs");
const storePath = path.join(logsDir, "ratelimit.json");

let store: Store = { counts: {} };
let loaded = false;
let dirty = false;
let debounceTimer: NodeJS.Timeout | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const buf = await readFile(storePath, "utf8");
    const json = JSON.parse(buf);
    if (json && typeof json === "object" && json.counts && typeof json.counts === "object") {
      store = { counts: json.counts };
    }
  } catch {
    // ignore; will create on first save
  }
}

function scheduleSave() {
  dirty = true;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    // serialize writes to avoid races
    writeChain = writeChain.then(async () => {
      if (!dirty) return;
      dirty = false;
      await mkdir(logsDir, { recursive: true });
      const json = JSON.stringify(store);
      await writeFile(storePath, json, "utf8");
    });
  }, 150);
}

function today(): string {
  const d = new Date();
  // YYYY-MM-DD in local time for simplicity
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function checkAndIncrement(ip: string, limit = 100): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: string; // ISO end of day
}> {
  await load();
  const day = today();
  const key = `${day}::${ip || "unknown"}`;
  const current = store.counts[key] ?? 0;
  const allowed = current < limit;
  const next = allowed ? current + 1 : current;
  store.counts[key] = next;
  if (allowed) scheduleSave();

  // compute end of day reset
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { allowed, remaining: Math.max(0, limit - next), resetAt: end.toISOString() };
}

export default checkAndIncrement;

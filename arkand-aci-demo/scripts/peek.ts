import embedTexts from "../lib/embed";

type QueryResponse = {
  distances?: number[][] | null;
  documents?: (string | null)[][] | null;
  metadatas?: (Record<string, unknown> | null)[][] | null;
};

async function main() {
  const q = process.argv[2] || "refund policy";
  const host = process.env.CHROMA_HOST || "localhost";
  const port = process.env.CHROMA_PORT ? Number(process.env.CHROMA_PORT) : 8000;
  const base = `http://${host}:${port}/api/v1`;

  // Ensure collection exists via REST
  let collId: string | null = null;
  const list: unknown = await fetch(`${base}/collections`).then((r) => r.json()).catch(() => []);
  if (Array.isArray(list)) {
    const found = list.find((c) => typeof c === "object" && c !== null && (c as { name?: string }).name === "aci_demo") as
      | { id?: string }
      | undefined;
    if (found) collId = found.id ?? null;
  }
  if (!collId) {
    const created = await fetch(`${base}/collections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "aci_demo" }),
  }).then((r) => r.json()).catch(() => null as unknown);
  if (!created || typeof created !== 'object' || !('id' in created)) throw new Error("Failed to ensure collection aci_demo");
  collId = (created as { id: string }).id;
  }

  const [queryEmbedding] = await embedTexts([q]);

  const res = await fetch(`${base}/collections/${collId}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query_embeddings: [queryEmbedding],
      n_results: 5,
      include: ["metadatas", "documents", "distances"],
    }),
  }).then((r) => r.json() as Promise<QueryResponse>);

  const distances = (res?.distances?.[0] || []) as Array<number | null>;
  const docs = (res?.documents?.[0] || []) as Array<string | null>;
  const metas = (res?.metadatas?.[0] || []) as Array<Record<string, unknown> | null>;

  const rows = docs.map((val, i) => {
    const content = val ?? "";
    const score = distances[i] ?? null;
    const meta = metas[i] ?? {};
    const source = (typeof meta === 'object' && meta && 'source' in meta ? String((meta as any).source) :
      (typeof meta === 'object' && meta && 'file' in meta ? String((meta as any).file) : ""));
    return { score, content, source };
  });

  for (const r of rows) {
    console.log(JSON.stringify(r, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

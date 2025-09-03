import { ChromaClient } from "chromadb";
import embedTexts from "../lib/embed";

async function main() {
  const q = process.argv[2] || "refund policy";
  const host = process.env.CHROMA_HOST || "localhost";
  const port = process.env.CHROMA_PORT ? Number(process.env.CHROMA_PORT) : 8000;

  const client = new ChromaClient({ host, port, ssl: false });
  const collection = await client.getOrCreateCollection({
    name: "aci_demo",
    embeddingFunction: {
      generate: async (inputs: string[]) => embedTexts(inputs),
    },
  });

  const [queryEmbedding] = await embedTexts([q]);

  const res = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: 5,
    include: ["metadatas", "documents", "distances"],
  });

  const distances = (res.distances?.[0] || []) as Array<number | null>;
  const docs = (res.documents?.[0] || []) as Array<string | null>;
  const metas = (res.metadatas?.[0] || []) as Array<Record<string, any> | null>;

  const rows = docs.map((val, i) => {
    const content = val ?? "";
    const score = distances[i] ?? null;
    const meta = metas[i] ?? {};
    const source = (meta as any)?.source ?? (meta as any)?.file ?? "";
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

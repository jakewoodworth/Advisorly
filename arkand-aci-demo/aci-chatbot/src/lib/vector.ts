import OpenAI from "openai";
import { getPineconeIndex } from "@/lib/pinecone";

async function embedBatch(inputs: string[], apiKey?: string): Promise<number[][]> {
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  const openai = new OpenAI({ apiKey });
  const BATCH = 100;
  const out: number[][] = [];
  for (let i = 0; i < inputs.length; i += BATCH) {
    const slice = inputs.slice(i, i + BATCH);
    const res = await openai.embeddings.create({ model: "text-embedding-3-small", input: slice });
    for (const d of res.data) out.push(d.embedding as unknown as number[]);
  }
  return out;
}

export async function upsertChunks(chunks: { id: string; content: string; metadata: any }[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  if (!Array.isArray(chunks) || chunks.length === 0) return { upserted: 0 };

  const index = getPineconeIndex();
  const texts = chunks.map((c) => c.content);
  const embeddings = await embedBatch(texts, apiKey);
  const vectors = chunks.map((c, i) => ({
    id: c.id,
    values: embeddings[i],
    metadata: { ...c.metadata, content: c.content },
  }));

  // v6 SDK supports array form
  // @ts-ignore - tolerate minor type differences across SDK versions
  await index.upsert(vectors);
  return { upserted: vectors.length };
}

export async function searchChunks(
  query: string,
  k = 5
): Promise<Array<{ content: string; metadata: Record<string, any>; score: number | null }>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  const [embedding] = await embedBatch([query], apiKey);
  const index = getPineconeIndex();

  const res = await index.query({
    topK: k,
    vector: embedding,
    includeMetadata: true,
  } as any);

  const matches = (res as any)?.matches ?? [];
  const items = (Array.isArray(matches) ? matches : []).map((m: any) => {
    const meta = (m?.metadata ?? {}) as Record<string, any>;
    const text = (meta.content ?? meta.text ?? meta.document ?? "") as string;
    const score = typeof m?.score === "number" ? m.score : null;
    return { content: text, metadata: meta, score };
  });
  return items;
}

export default searchChunks;

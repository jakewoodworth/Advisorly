import OpenAI from "openai";

/**
 * Generate embeddings for an array of texts using OpenAI's text-embedding-3-small.
 * - Reads API key from process.env.OPENAI_API_KEY
 * - Batches requests in groups of 100
 * - Preserves input order in the result
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!Array.isArray(texts)) throw new TypeError("embedTexts: texts must be a string[]");
  if (texts.length === 0) return [];

  const apiKey: string | undefined = (globalThis as any)?.process?.env?.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY in environment");

  const client = new OpenAI({ apiKey });
  const BATCH_SIZE = 100;
  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    const res = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: batch,
    });

    // res.data is aligned with input order
    for (const item of res.data) {
      out.push(item.embedding as unknown as number[]);
    }
  }

  return out;
}

export default embedTexts;

import 'server-only';
import { Pinecone } from '@pinecone-database/pinecone';

// Minimal Pinecone client initializer.
// Reads API key from env and targets the desired index (default: "quickstart").

let client: Pinecone | null = null;

function getClient(): Pinecone {
  if (client) return client;
  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) throw new Error('Missing PINECONE_API_KEY');
  client = new Pinecone({ apiKey } as any);
  return client;
}

export function getPineconeIndex() {
  const indexName = process.env.PINECONE_INDEX || 'quickstart';
  const pc = getClient();
  // The TypeScript types allow direct Index(name)
  return pc.Index(indexName);
}

export default getPineconeIndex;

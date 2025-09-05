// Ambient type declarations for environment variables
// This file must not include runtime code.

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV?: 'development' | 'production' | 'test';
    OPENAI_API_KEY?: string;
    CHROMA_PATH?: string;
    CHROMA_HOST?: string;
    CHROMA_PORT?: string;
    DEMO_PASSWORD?: string;
    DEMO_EXPIRY?: string; // ISO date YYYY-MM-DD
    DEMO_DAILY_CAP?: string; // number as string
  PINECONE_API_KEY?: string;
  PINECONE_INDEX?: string;
  PINECONE_ENVIRONMENT?: string;
  }
}

export {};

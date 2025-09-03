import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  OPENAI_API_KEY: z.string().min(10),
  CHROMA_PATH: z.string().default(".chroma/aci"),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(input: Partial<Record<string, string>>): Env {
  return envSchema.parse(input);
}


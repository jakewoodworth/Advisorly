/// <reference lib="webworker" />

import type { GenerateSchedulesInput, GenerateSchedulesResult } from "@/lib/generator";
import { generateSchedules } from "@/lib/generator";

interface GeneratorRequest {
  id: string;
  input: GenerateSchedulesInput;
}

interface GeneratorResponse {
  id: string;
  result: GenerateSchedulesResult;
}

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<GeneratorRequest>) => {
  const { id, input } = event.data;
  try {
    const result = generateSchedules(input);
    const message: GeneratorResponse = { id, result };
    self.postMessage(message);
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

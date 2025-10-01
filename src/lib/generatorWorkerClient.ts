import type { GenerateSchedulesInput, GenerateSchedulesResult } from "@/lib/generator";

function createWorker() {
  return new Worker(new URL("../../worker/generatorWorker.ts", import.meta.url), {
    type: "module",
  });
}

class GeneratorWorkerClient {
  private worker: Worker;

  constructor() {
    this.worker = createWorker();
  }

  run(input: GenerateSchedulesInput, signal?: AbortSignal): Promise<GenerateSchedulesResult> {
    const id = crypto.randomUUID();

    type WorkerMessage = {
      id: string;
      result?: GenerateSchedulesResult;
      error?: string;
    };

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.worker.removeEventListener("message", onMessage);
        this.worker.removeEventListener("error", onError);
        signal?.removeEventListener("abort", onAbort);
      };

      const onAbort = () => {
        cleanup();
        reject(new DOMException("Aborted", "AbortError"));
      };

      const onMessage = (event: MessageEvent<WorkerMessage>) => {
        if (!event.data || event.data.id !== id) return;
        cleanup();
        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          if (!event.data.result) {
            reject(new Error("Worker returned no result"));
            return;
          }
          resolve(event.data.result);
        }
      };

      const onError = (event: ErrorEvent) => {
        cleanup();
        reject(event.error ?? new Error(event.message));
      };

      this.worker.addEventListener("message", onMessage);
      this.worker.addEventListener("error", onError);
      signal?.addEventListener("abort", onAbort, { once: true });

      this.worker.postMessage({ id, input });
    });
  }
}

const client = new GeneratorWorkerClient();

export function generateSchedulesAsync(input: GenerateSchedulesInput, signal?: AbortSignal) {
  return client.run(input, signal);
}

// Keep the deadline active through body consumption for both Images and Responses.
export async function fetchOpenAIWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<{
  response?: Response;
  text?: string;
  timedOut: boolean;
  error?: unknown;
}> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("OpenAI response deadline exceeded."));
      }, timeoutMs);
    });
    const result = await Promise.race([
      (async () => {
        const response = await fetch(url, { ...init, signal: controller.signal });
        return { response, text: await response.text() };
      })(),
      deadline,
    ]);
    return { ...result, timedOut: false };
  } catch (error) {
    const timedOut = controller.signal.aborted ||
      (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"));
    return { timedOut, error };
  } finally {
    clearTimeout(timer);
  }
}

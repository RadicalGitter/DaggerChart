const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchJsonWithRetry(url, {
  attempts = 3,
  timeoutMs = 3500,
  fetchImpl = globalThis.fetch,
  pause = delay
} = {}) {
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { cache: "no-store", signal: controller.signal });
      const text = await response.text();
      let body = {};
      if (text) {
        try { body = JSON.parse(text); }
        catch { throw new Error("The table returned an unreadable response."); }
      }
      if (!response.ok) {
        const error = new Error(body.error || `Request failed (${response.status}).`);
        error.status = response.status;
        throw error;
      }
      return body;
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      const retryable = !status || status === 408 || status === 429 || status >= 500;
      if (!retryable || attempt === attempts - 1) throw error;
    } finally {
      clearTimeout(timeout);
    }
    await pause(250 * (attempt + 1));
  }

  throw lastError || new Error("The table could not be reached.");
}

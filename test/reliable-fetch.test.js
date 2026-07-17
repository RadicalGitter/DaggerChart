import test from "node:test";
import assert from "node:assert/strict";
import { fetchJsonWithRetry } from "../public/shared/reliable-fetch.js";

const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body)
});

test("reliable JSON fetch retries transient failures", async () => {
  let calls = 0;
  const body = await fetchJsonWithRetry("/character", {
    attempts: 3,
    pause: async () => {},
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("connection dropped");
      return response(200, { id: "oore" });
    }
  });
  assert.deepEqual(body, { id: "oore" });
  assert.equal(calls, 2);
});

test("reliable JSON fetch does not retry a missing character", async () => {
  let calls = 0;
  await assert.rejects(() => fetchJsonWithRetry("/missing", {
    attempts: 3,
    pause: async () => {},
    fetchImpl: async () => {
      calls += 1;
      return response(400, { error: "No such character." });
    }
  }), (error) => error.status === 400);
  assert.equal(calls, 1);
});

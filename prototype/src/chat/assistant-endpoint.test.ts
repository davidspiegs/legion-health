import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../../api/assistant";

// Every request here is turned away before the model is called, so nothing leaves the machine.
const SITE = "https://wren-preview.vercel.app";
const call = (headers: Record<string, string>, body: unknown = { question: "When is my visit?" }) =>
  POST(
    new Request(`${SITE}/api/assistant`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );

function withKey(run: () => Promise<void>) {
  return async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "not-a-real-key";
    try {
      await run();
    } finally {
      if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = saved;
    }
  };
}

test("without a key the endpoint says so, and the app answers from Legion's policies", async () => {
  const saved = { key: process.env.ANTHROPIC_API_KEY, token: process.env.ANTHROPIC_AUTH_TOKEN };
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  try {
    const response = await call({ origin: SITE });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "not_configured" });
  } finally {
    if (saved.key !== undefined) process.env.ANTHROPIC_API_KEY = saved.key;
    if (saved.token !== undefined) process.env.ANTHROPIC_AUTH_TOKEN = saved.token;
  }
});

test(
  "only this site's own pages get an answer",
  withKey(async () => {
    assert.equal((await call({ "x-real-ip": "203.0.113.1" })).status, 403, "no Origin, as from a script");
    assert.equal((await call({ origin: "https://elsewhere.example", "x-real-ip": "203.0.113.1" })).status, 403);
    assert.equal((await call({ origin: SITE, "x-real-ip": "203.0.113.1" }, { question: "  " })).status, 400);
  }),
);

test(
  "one caller can't run up the bill",
  withKey(async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++)
      statuses.push((await call({ origin: SITE, "x-real-ip": "203.0.113.2" }, { question: "" })).status);
    assert.deepEqual(statuses.slice(0, 20), Array(20).fill(400), "the first twenty are read");
    assert.equal(statuses[20], 429, "the twenty-first is turned away");
    assert.equal((await call({ origin: SITE, "x-real-ip": "203.0.113.3" }, { question: "" })).status, 400, "others still get through");
  }),
);

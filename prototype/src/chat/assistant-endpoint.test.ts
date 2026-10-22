import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../../api/assistant";

// Requests here are either turned away before the model is called, or answered by a
// stand-in for the Anthropic API (see withModel), so nothing leaves the machine.
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

interface SentRequest {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: string; content: string }[];
  output_config: { effort: string; format: { type: string; schema: Record<string, unknown> } };
}

/**
 * Stands in for the Anthropic API: the SDK's fetch gets `output` back as the model's
 * text, and every request it would have sent is kept for the test to read.
 */
function withModel(output: unknown, run: (sent: SentRequest[]) => Promise<void>) {
  return withKey(async () => {
    const sent: SentRequest[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = input instanceof Request ? await input.text() : String(init?.body ?? "");
      sent.push(JSON.parse(body) as SentRequest);
      const message = {
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [{ type: "text", text: typeof output === "string" ? output : JSON.stringify(output) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      };
      return new Response(JSON.stringify(message), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      await run(sent);
    } finally {
      globalThis.fetch = real;
    }
  });
}

test("without a key the endpoint says so, and the app answers from Legion's policies", async () => {
  const saved = { key: process.env.ANTHROPIC_API_KEY, token: process.env.ANTHROPIC_AUTH_TOKEN };
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  try {
    const response = await call({ origin: SITE });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "not_configured" });
    assert.equal((await call({ origin: SITE }, { task: "story", text: "I can't focus" })).status, 503);
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
    for (let i = 0; i < 41; i++)
      statuses.push((await call({ origin: SITE, "x-real-ip": "203.0.113.2" }, { question: "" })).status);
    assert.deepEqual(statuses.slice(0, 40), Array(40).fill(400), "the first forty are read");
    assert.equal(statuses[40], 429, "the forty-first is turned away");
    assert.equal((await call({ origin: SITE, "x-real-ip": "203.0.113.3" }, { question: "" })).status, 400, "others still get through");
  }),
);

test(
  "each task needs its own input, and unknown tasks are turned away",
  withKey(async () => {
    const headers = { origin: SITE, "x-real-ip": "203.0.113.4" };
    for (const body of [
      { task: "story" },
      { task: "story", text: "   " },
      { task: "story", question: "I can't focus" },
      { task: "brief" },
      { task: "brief", context: { unknown: "dropped", stage: 3 } },
      { task: "triage", context: { stage: "booked" } },
      { task: "triage", message: "" },
      { task: "question" },
      { task: "summarize", text: "hello" },
      { task: 7, question: "When is my visit?" },
      { task: "toString", question: "When is my visit?" },
    ]) {
      const response = await call(headers, body);
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.deepEqual(await response.json(), { error: "bad_request" });
    }
  }),
);

const ipFor = (n: number) => ({ origin: SITE, "x-real-ip": `198.51.100.${n}` });
const schemaOf = (request: SentRequest) => request.output_config.format.schema;

test(
  "a question with no task is still a question, with only known actions",
  withModel({ reply: " Take it with food. ", actions: ["message", "dance", "calendar", "support"] }, async (sent) => {
    const response = await call(ipFor(1), { question: "Can I take Adderall with food?" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { reply: "Take it with food.", actions: ["message", "calendar"] });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].model, "claude-opus-5-5");
    assert.equal(sent[0].max_tokens, 700);
    assert.equal(sent[0].output_config.effort, "low");
    assert.equal(schemaOf(sent[0]).additionalProperties, false);
    assert.match(sent[0].system, /psychiatric nurse/);
    assert.match(sent[0].messages[0].content, /The patient asks:\nCan I take Adderall with food\?/);
  }),
);

test(
  "the patient context passes only known fields, each cut to its length",
  withModel({ reply: "Yes.", actions: [] }, async (sent) => {
    const context = {
      stage: "booked",
      clinician: "Dr. Chen",
      medications: "m".repeat(800),
      allergies: "a".repeat(300),
      plan: "p".repeat(700),
      secret: "never sent",
      conditions: ["ADHD"],
    };
    await call(ipFor(2), { task: "question", question: "Is that right?", context });
    const content = sent[0].messages[0].content;
    assert.ok(content.startsWith("Context about this patient: "));
    const passed = JSON.parse(content.slice("Context about this patient: ".length, content.indexOf("\n\n")));
    assert.deepEqual(Object.keys(passed).sort(), ["allergies", "clinician", "medications", "plan", "stage"]);
    assert.equal(passed.medications.length, 600);
    assert.equal(passed.plan.length, 600);
    assert.equal(passed.allergies.length, 160);
  }),
);

test(
  "a story is read into the intake's own choices",
  withModel(
    {
      conditions: ["Anxiety", "Insomnia", "I'm not sure", "Other", "Anxiety"],
      other: " trouble sleeping ",
      reflection: "Here’s what I heard: worry and trouble sleeping.",
      crisis: false,
    },
    async (sent) => {
      const response = await call(ipFor(3), { task: "story", text: "I worry all day and can't sleep." });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        conditions: ["Anxiety", "Other"],
        other: "trouble sleeping",
        reflection: "Here’s what I heard: worry and trouble sleeping.",
        crisis: false,
      });
      assert.equal(sent[0].max_tokens, 400);
      assert.equal(schemaOf(sent[0]).additionalProperties, false);
      assert.match(sent[0].system, /intake choices/);
      assert.match(sent[0].messages[0].content, /I worry all day and can't sleep\./);
      assert.doesNotMatch(sent[0].messages[0].content, /Context about this patient/);
    },
  ),
);

test(
  "a story with nothing that fits comes back as \"I'm not sure\" alone",
  withModel({ conditions: ["Made up"], other: "something", reflection: "Here’s what I heard: a hard year.", crisis: true }, async () => {
    const response = await call(ipFor(4), { task: "story", text: "It's been a hard year." });
    assert.deepEqual(await response.json(), {
      conditions: ["I'm not sure"],
      other: "",
      reflection: "Here’s what I heard: a hard year.",
      crisis: true,
    });
  }),
);

test(
  "a story without a reflection isn't used",
  withModel({ conditions: ["ADHD"], other: "", reflection: " ", crisis: false }, async () => {
    const response = await call(ipFor(5), { task: "story", text: "I can't focus." });
    assert.equal(response.status, 502);
  }),
);

test(
  "the brief is drafted from the patient context",
  withModel({ reason: " Alex wants help with focus at work. ", focus: "" }, async (sent) => {
    const response = await call(ipFor(6), {
      task: "brief",
      context: { conditions: "ADHD", story: "I can't focus at work", goal: "Talk about medication", note: "" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { reason: "Alex wants help with focus at work.", focus: "" });
    assert.equal(sent[0].max_tokens, 600);
    assert.equal(schemaOf(sent[0]).additionalProperties, false);
    assert.match(sent[0].system, /visit brief/);
    assert.match(sent[0].messages[0].content, /"story":"I can't focus at work"/);
    assert.doesNotMatch(sent[0].messages[0].content, /"note"/, "empty fields are dropped");
  }),
);

test(
  "a care message is triaged, and an unknown category becomes other",
  withModel(
    { category: "urgent", summary: "Asks about a refill.", draft: "Thanks for writing. Dr. Chen will follow up today." },
    async (sent) => {
      const response = await call(ipFor(7), {
        task: "triage",
        message: "Can I get my refill early?",
        context: { medications: "Adderall 20 mg once every morning" },
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        category: "other",
        summary: "Asks about a refill.",
        draft: "Thanks for writing. Dr. Chen will follow up today.",
      });
      assert.equal(sent[0].max_tokens, 700);
      assert.equal(schemaOf(sent[0]).additionalProperties, false);
      assert.match(sent[0].system, /first pass/);
      assert.match(sent[0].system, /"medication" and "clinical" messages[^\n]*first person as that clinician/);
      assert.match(sent[0].system, /every other category, write as the Legion care team/);
      assert.match(sent[0].messages[0].content, /The patient's message to the care team:\nCan I get my refill early\?/);
    },
  ),
);

test(
  "a triage in a known category keeps it",
  withModel({ category: "billing", summary: "Asks about the copay.", draft: "Your copay is charged after the visit." }, async () => {
    const response = await call(ipFor(8), { task: "triage", message: "When do I pay?" });
    assert.equal(((await response.json()) as { category: string }).category, "billing");
  }),
);

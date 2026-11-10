import { test } from "node:test";
import assert from "node:assert/strict";
import { llmProvider, llmLabel, parseJsonReply, complete, LlmError } from "./llm";

const KEYS = ["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GROQ_API_KEY"];
const withEnv = (vars: Record<string, string>, fn: () => void | Promise<void>) => async () => {
  const saved = Object.fromEntries(KEYS.map(k => [k, process.env[k]]));
  KEYS.forEach(k => delete process.env[k]);
  Object.assign(process.env, vars);
  try {
    await fn();
  } finally {
    KEYS.forEach(k => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k])));
  }
};

test("no key: AI is off and complete() says which keys to set", withEnv({}, async () => {
  assert.equal(llmProvider(), null);
  await assert.rejects(complete({ system: "s", prompt: "p" }), (e: any) => e instanceof LlmError && /ANTHROPIC_API_KEY/.test(e.message));
}));

test("provider order: Anthropic, then Gemini, then Groq", withEnv({ GROQ_API_KEY: "g" }, () => {
  assert.equal(llmProvider(), "groq");
  process.env.GEMINI_API_KEY = "x";
  assert.equal(llmProvider(), "gemini");
  process.env.ANTHROPIC_API_KEY = "a";
  assert.equal(llmProvider(), "anthropic");
  assert.match(llmLabel()!, /^Claude \(/);
}));

test("parseJsonReply tolerates a ```json fence", () => {
  assert.deepEqual(parseJsonReply('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonReply('{"a":2}'), { a: 2 });
});

test("pickGroqModel skips the retired model and non-chat models", async () => {
  const { pickGroqModel } = await import("./llm");
  assert.equal(
    pickGroqModel(["whisper-large-v3", "llama-3.1-8b-instant", "openai/gpt-oss-20b", "llama-3.3-70b-versatile"], "llama-3.1-8b-instant"),
    "llama-3.3-70b-versatile",
  );
  assert.equal(pickGroqModel(["whisper-large-v3", "qwen/qwen3-32b"], "x"), "qwen/qwen3-32b");
  assert.equal(pickGroqModel([], "x"), undefined);
});

test("Groq: a retired model is replaced from the live model list", withEnv({ GROQ_API_KEY: "g" }, async () => {
  const realFetch = globalThis.fetch;
  const models: string[] = [];
  globalThis.fetch = (async (url: string, init?: any) => {
    if (url.endsWith("/models")) return new Response(JSON.stringify({ data: [{ id: "llama-3.3-70b-versatile", active: true }, { id: "qwen/qwen3-32b", active: true }] }));
    const model = JSON.parse(init.body).model;
    models.push(model);
    if (model === "llama-3.3-70b-versatile" && models.length === 1) {
      return new Response(JSON.stringify({ error: { message: "The model `llama-3.3-70b-versatile` has been decommissioned", code: "model_decommissioned" } }), { status: 400 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }));
  }) as any;
  try {
    const r = await complete({ system: "s", prompt: "p" });
    assert.equal(r.text, "ok");
    assert.deepEqual(models, ["llama-3.3-70b-versatile", "qwen/qwen3-32b"]);
  } finally {
    globalThis.fetch = realFetch;
  }
}));

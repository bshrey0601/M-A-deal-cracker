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

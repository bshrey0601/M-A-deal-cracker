import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";

/**
 * One entry point for the AI features (deal memo / thesis, and the opt-in "AI estimate").
 * Uses the first provider with a key set: Anthropic (Claude) -> Google Gemini -> Groq.
 *
 * AI is used for writing and analysis only. Company financials come from SEC filings and
 * market data providers (server/marketService.ts), never from a model.
 */

export type LlmProvider = "anthropic" | "gemini" | "groq";

export class LlmError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const env = (name: string) => process.env[name]?.trim() || undefined;

export function llmProvider(): LlmProvider | null {
  if (env("ANTHROPIC_API_KEY")) return "anthropic";
  if (env("GEMINI_API_KEY") || env("GOOGLE_API_KEY")) return "gemini";
  if (env("GROQ_API_KEY")) return "groq";
  return null;
}

export const anthropicModel = () => env("ANTHROPIC_MODEL") ?? "claude-opus-5-5";
export const geminiModel = () => env("GEMINI_MODEL") ?? "gemini-2.5-flash";
export const groqModel = () => env("GROQ_MODEL") ?? "llama-3.1-8b-instant";

export function llmLabel(provider = llmProvider()): string | null {
  switch (provider) {
    case "anthropic": return `Claude (${anthropicModel()})`;
    case "gemini": return `Gemini (${geminiModel()})`;
    case "groq": return `Groq (${groqModel()})`;
    default: return null;
  }
}

export const NO_AI_KEY =
  "No AI key is configured on the server. Set ANTHROPIC_API_KEY, GEMINI_API_KEY or GROQ_API_KEY to enable AI writing.";

interface CompleteOptions {
  system: string;
  prompt: string;
  /** Ask for a single JSON object back. */
  json?: boolean;
  maxTokens?: number;
}

export async function complete(opts: CompleteOptions): Promise<{ text: string; provider: string }> {
  const provider = llmProvider();
  if (!provider) throw new LlmError(503, NO_AI_KEY);
  const text =
    provider === "anthropic" ? await viaAnthropic(opts) : provider === "gemini" ? await viaGemini(opts) : await viaGroq(opts);
  return { text, provider: llmLabel(provider)! };
}

let anthropicClient: Anthropic | undefined;
async function viaAnthropic({ system, prompt, json, maxTokens = 16000 }: CompleteOptions): Promise<string> {
  anthropicClient ??= new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
  try {
    const response = await anthropicClient.beta.messages.create({
      model: anthropicModel(),
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      // If the model declines (e.g. a safety classifier false positive), the API retries on a fallback model.
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: json ? `${system}\nRespond with one JSON object only, no markdown fences.` : system,
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal") throw new LlmError(502, "Claude declined this request.");
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map(b => b.text)
      .join("")
      .trim();
    if (!text) throw new LlmError(502, "Claude returned an empty response.");
    return text;
  } catch (e) {
    if (e instanceof LlmError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new LlmError(401, "ANTHROPIC_API_KEY was rejected. Check the key.");
    if (e instanceof Anthropic.RateLimitError) throw new LlmError(429, "Claude rate limit reached; try again in a minute.");
    if (e instanceof Anthropic.APIError) throw new LlmError(e.status ?? 502, `Claude API error: ${e.message}`);
    throw new LlmError(502, `Could not reach Claude: ${(e as Error).message}`);
  }
}

let geminiClient: GoogleGenAI | undefined;
async function viaGemini({ system, prompt, json }: CompleteOptions): Promise<string> {
  geminiClient ??= new GoogleGenAI({ apiKey: env("GEMINI_API_KEY") ?? env("GOOGLE_API_KEY") });
  try {
    const response = await geminiClient.models.generateContent({
      model: geminiModel(),
      contents: prompt,
      config: { systemInstruction: system, ...(json ? { responseMimeType: "application/json" } : {}) },
    });
    const text = response.text?.trim();
    if (!text) throw new LlmError(502, "Gemini returned an empty response.");
    return text;
  } catch (e: any) {
    if (e instanceof LlmError) throw e;
    const status = typeof e?.status === "number" ? e.status : 502;
    throw new LlmError(status, `Gemini API error: ${e?.message ?? e}`);
  }
}

async function viaGroq({ system, prompt, json }: CompleteOptions): Promise<string> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env("GROQ_API_KEY")}` },
    body: JSON.stringify({
      model: groqModel(),
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature: json ? 0 : 0.7,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  }).catch((e: Error) => {
    throw new LlmError(502, `Could not reach Groq: ${e.message}`);
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new LlmError(response.status, `Groq API error: ${data.error?.message ?? response.statusText}`);
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new LlmError(502, "Groq returned an empty response.");
  return text;
}

/** Parse a model's JSON reply, tolerating a ```json fence around it. */
export function parseJsonReply(text: string): any {
  const body = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(body);
}

import OpenAI from "openai";
import { env } from "./env.js";

/** Sera uses OpenAI for chat (tool-calling) and embeddings (RAG). */
export const isAiConfigured = (): boolean => Boolean(env.OPENAI_API_KEY);

let client: OpenAI | null = null;
export function openai(): OpenAI {
  if (!env.OPENAI_API_KEY) {
    throw new Error("Sera is not configured — set OPENAI_API_KEY in the environment");
  }
  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return client;
}

export const AI_CHAT_MODEL = env.OPENAI_CHAT_MODEL;
export const AI_EMBED_MODEL = env.OPENAI_EMBEDDING_MODEL;

/** Map OpenAI SDK errors to a friendly, user-facing message. */
export function aiErrorMessage(err: unknown): string {
  const status = (err as { status?: number })?.status;
  if (status === 429) return "AI is temporarily unavailable — the OpenAI account has no remaining quota. Add billing/credits at platform.openai.com.";
  if (status === 401) return "The OpenAI API key is invalid. Please check OPENAI_API_KEY.";
  return err instanceof Error ? err.message : "AI request failed.";
}

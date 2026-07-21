// Model provider: builds Gemini primary and Groq fallback as plain LangChain
// chat models, plus a shared UsageBucket wired to both via a callback
// handler. Fallback is orchestrated by the caller (see agent.ts) so we
// don't have to subclass BaseChatModel — LangGraph's ReAct executor
// specifically probes for `_isBaseChatModel`, and a hand-rolled wrapper
// fails that check.
//
// Every `.invoke()` on either model automatically records tokens into the
// bucket via `handleLLMEnd` — the callback surface every LangChain chat
// model implements.

import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { LLMResult } from '@langchain/core/outputs';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGroq } from '@langchain/groq';

import type { RuntimeConfig } from '../config.js';

export type TokenUsage = { in: number; out: number };
export type ModelUsageEntry = { model: string; in: number; out: number };

export class UsageBucket {
  private entries: ModelUsageEntry[] = [];

  record(model: string, tokens: TokenUsage): void {
    this.entries.push({ model, in: tokens.in, out: tokens.out });
  }

  totals(): { model: string; in: number; out: number } {
    // Reports the model that produced the last recorded call — matches
    // "which model actually answered" when reporting on a run.
    let last = 'unknown';
    let tin = 0;
    let tout = 0;
    for (const e of this.entries) {
      tin += e.in;
      tout += e.out;
      last = e.model;
    }
    return { model: last, in: tin, out: tout };
  }

  breakdown(): ModelUsageEntry[] {
    return [...this.entries];
  }
}

/**
 * Classifies whether an error from the primary model is worth retrying on
 * the fallback. Kept generous — the cost of a false positive (one extra
 * retry) is far lower than the cost of a false negative (run fails when
 * the fallback would have succeeded).
 */
export function shouldFallback(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as { status?: number; code?: string | number; message?: string };
  if (typeof anyErr.status === 'number') {
    if (anyErr.status === 429) return true;
    if (anyErr.status >= 500 && anyErr.status < 600) return true;
    if (anyErr.status === 401 || anyErr.status === 403) return true;
  }
  const msg = (anyErr.message ?? '').toLowerCase();
  if (msg.includes('quota') || msg.includes('rate limit') || msg.includes('rate_limit')) return true;
  if (msg.includes('429') || msg.includes('503') || msg.includes('overloaded')) return true;
  if (msg.includes('api key') && msg.includes('invalid')) return true;
  if (msg.includes('econnrefused') || msg.includes('etimedout') || msg.includes('fetch failed')) return true;
  return false;
}

class UsageRecorder extends BaseCallbackHandler {
  public name = 'usage_recorder';

  constructor(
    private readonly bucket: UsageBucket,
    private readonly modelId: string,
  ) {
    super();
  }

  // Called after each LLM invocation. LLMResult.llmOutput is
  // provider-specific — we read the standard `tokenUsage` shape that both
  // Gemini and Groq populate.
  override handleLLMEnd(output: LLMResult): void {
    // Preferred: per-generation usage_metadata (aggregates on AIMessage).
    const generations = output.generations ?? [];
    let inTokens = 0;
    let outTokens = 0;
    let sawUsage = false;
    for (const gs of generations) {
      for (const g of gs) {
        const message = (g as unknown as { message?: { usage_metadata?: { input_tokens?: number; output_tokens?: number } } }).message;
        const usage = message?.usage_metadata;
        if (usage) {
          inTokens += usage.input_tokens ?? 0;
          outTokens += usage.output_tokens ?? 0;
          sawUsage = true;
        }
      }
    }
    // Fallback: llmOutput.tokenUsage (older-shape LangChain providers).
    if (!sawUsage) {
      const meta = (output.llmOutput ?? {}) as {
        tokenUsage?: { promptTokens?: number; completionTokens?: number };
      };
      if (meta.tokenUsage) {
        inTokens = meta.tokenUsage.promptTokens ?? 0;
        outTokens = meta.tokenUsage.completionTokens ?? 0;
        sawUsage = true;
      }
    }
    if (sawUsage) this.bucket.record(this.modelId, { in: inTokens, out: outTokens });
  }
}

export type ModelProvider = {
  primary: BaseChatModel;
  primaryId: string;
  fallback: BaseChatModel | null;
  fallbackId: string | null;
  usage: UsageBucket;
  /** Which model produced the most recent successful call. */
  currentModelId: () => string;
  /** Set by the run loop when it switches to the fallback. */
  markUsingFallback: () => void;
};

export function buildModelProvider(config: RuntimeConfig): ModelProvider {
  const usage = new UsageBucket();

  const primary = config.model.geminiApiKey
    ? new ChatGoogleGenerativeAI({
        model: config.model.geminiModel,
        apiKey: config.model.geminiApiKey,
        temperature: 0,
        maxRetries: 0,
        callbacks: [new UsageRecorder(usage, config.model.geminiModel)],
      })
    : null;

  const fallback = config.model.groqApiKey
    ? new ChatGroq({
        model: config.model.groqModel,
        apiKey: config.model.groqApiKey,
        temperature: 0,
        maxRetries: 0,
        callbacks: [new UsageRecorder(usage, config.model.groqModel)],
      })
    : null;

  if (!primary && !fallback) {
    throw new Error(
      'No model configured. Set GEMINI_API_KEY (primary) and/or GROQ_API_KEY (fallback).',
    );
  }

  // ADR-003: Gemini primary when available. If only one is configured, use
  // it alone with no fallback path.
  const effectivePrimary = (primary ?? fallback) as BaseChatModel;
  const effectivePrimaryId = primary ? config.model.geminiModel : config.model.groqModel;
  const effectiveFallback = primary && fallback ? fallback : null;
  const effectiveFallbackId = effectiveFallback ? config.model.groqModel : null;

  let usingFallback = false;

  return {
    primary: effectivePrimary,
    primaryId: effectivePrimaryId,
    fallback: effectiveFallback,
    fallbackId: effectiveFallbackId,
    usage,
    currentModelId: () => (usingFallback && effectiveFallbackId ? effectiveFallbackId : effectivePrimaryId),
    markUsingFallback: () => {
      usingFallback = true;
    },
  };
}

// One function to talk to whichever model the team brings. Set ASKMAP_MODEL to `provider:model`:
//   ollama:qwen3:1.7b (default)   openai:gpt-5-mini   anthropic:claude-haiku-5-5
//   openrouter:mistralai/mistral-small   compat:<model> with ASKMAP_BASE_URL (vLLM, LM Studio, Azure…)
// Keys come from the usual env vars. askmap never sends anything anywhere else.

import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { generateText } from "ai"
import type { LanguageModel } from "ai"
import { z } from "zod"
import { fakeAnswer } from "./fake.ts"

/** Ollama goes through its native API (thinking off, schema-constrained JSON); everything else through the AI SDK. */
export type ModelRef = { id: string; local: boolean } & ({ kind: "sdk"; model: LanguageModel } | { kind: "ollama"; host: string; name: string } | { kind: "fake" })

export function resolveModel(spec = process.env.ASKMAP_MODEL ?? "ollama:qwen3:1.7b"): ModelRef {
  if (spec === "fake") return { id: "fake", local: true, kind: "fake" }
  const i = spec.indexOf(":")
  const provider = i === -1 ? "ollama" : spec.slice(0, i)
  const name = i === -1 ? spec : spec.slice(i + 1)
  switch (provider) {
    case "fake":
      return { id: "fake", local: true, kind: "fake" }
    case "ollama": {
      const host = (process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(/\/$/, "")
      return { id: spec, local: true, kind: "ollama", host: /^https?:/.test(host) ? host : `http://${host}`, name }
    }
    case "compat": {
      const baseURL = process.env.ASKMAP_BASE_URL
      if (!baseURL) throw new Error("compat: models need ASKMAP_BASE_URL")
      const local = /^(https?:\/\/)?(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(baseURL)
      return { id: spec, local, kind: "sdk", model: createOpenAICompatible({ name: "compat", baseURL, apiKey: process.env.ASKMAP_API_KEY })(name) }
    }
    case "openai":
      return { id: spec, local: false, kind: "sdk", model: createOpenAI()(name) }
    case "anthropic":
      return { id: spec, local: false, kind: "sdk", model: createAnthropic()(name) }
    case "openrouter":
      return { id: spec, local: false, kind: "sdk", model: createOpenRouter()(name) }
    default:
      throw new Error(`Unknown provider "${provider}". Use ollama, openai, anthropic, openrouter or compat.`)
  }
}

/** Pulls the first JSON object out of a reply: models wrap it in prose, fences or <think> blocks. */
export function firstJson(text: string): unknown {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/g, "")
  const start = clean.indexOf("{")
  if (start === -1) throw new Error("no JSON in reply")
  let depth = 0
  let inString = false
  for (let i = start; i < clean.length; i++) {
    const ch = clean[i]
    if (inString) {
      if (ch === "\\") i++
      else if (ch === '"') inString = false
    } else if (ch === '"') inString = true
    else if (ch === "{") depth++
    else if (ch === "}" && --depth === 0) return JSON.parse(clean.slice(start, i + 1))
  }
  throw new Error("unterminated JSON in reply")
}

async function ollamaChat(ref: Extract<ModelRef, { kind: "ollama" }>, system: string, prompt: string, format: unknown) {
  const res = await fetch(`${ref.host}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: ref.name,
      stream: false,
      think: false,
      format,
      options: { temperature: 0.2, num_ctx: 4096 },
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  })
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = (await res.json()) as { message?: { content?: string } }
  return body.message?.content ?? ""
}

/**
 * Asks for JSON and validates it. Ollama gets the JSON schema as a hard constraint; other
 * providers get it in the prompt (no reliance on native structured output). Retries with the error.
 */
export async function ask<T>(ref: ModelRef, system: string, prompt: string, schema: z.ZodType<T>, attempts = 3): Promise<T> {
  if (ref.kind === "fake") return schema.parse(fakeAnswer(prompt))
  const jsonSchema = z.toJSONSchema(schema)
  let last = ""
  for (let a = 0; a < attempts; a++) {
    const p = last ? `${prompt}\n\nYour previous reply was invalid (${last}). Reply with valid JSON only.` : prompt
    const sys = `${system}\n\nReply with one JSON object and nothing else.`
    const text =
      ref.kind === "ollama"
        ? await ollamaChat(ref, sys, p, jsonSchema)
        : (await generateText({ model: ref.model, system: `${sys} It must match this JSON schema: ${JSON.stringify(jsonSchema)}`, prompt: p, temperature: 0.2, maxRetries: 2 })).text
    try {
      return schema.parse(firstJson(text))
    } catch (e) {
      last = e instanceof Error ? e.message.slice(0, 200) : "invalid"
    }
  }
  throw new Error(`The model did not return valid JSON: ${last}`)
}

/** Runs async work with a fixed number in flight. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>, onDone?: (n: number) => void, signal?: AbortSignal): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  let done = 0
  async function worker() {
    while (next < items.length) {
      if (signal?.aborted) throw new Error("Stopped")
      const i = next++
      out[i] = await fn(items[i], i)
      onDone?.(++done)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

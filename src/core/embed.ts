// Step 2a: summaries become vectors with a small embedding model that runs inside Node
// (transformers.js, ONNX). No key, no network after the first model download.

import type { FeatureExtractionPipeline } from "@huggingface/transformers"

export const EMBEDDER = "Xenova/all-MiniLM-L6-v2"

let extractor: Promise<FeatureExtractionPipeline> | null = null

async function load() {
  const { pipeline, env } = await import("@huggingface/transformers")
  if (process.env.ASKMAP_MODELS_DIR) env.cacheDir = process.env.ASKMAP_MODELS_DIR
  return (await pipeline("feature-extraction", EMBEDDER, { dtype: "fp32" })) as FeatureExtractionPipeline
}

export async function embed(texts: string[], signal?: AbortSignal, batch = 32): Promise<number[][]> {
  extractor ??= load()
  const run = await extractor
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += batch) {
    if (signal?.aborted) throw new Error("Stopped")
    const t = await run(texts.slice(i, i + batch), { pooling: "mean", normalize: true })
    out.push(...(t.tolist() as number[][]))
  }
  return out
}

// The whole pipeline: logs in, one AskMap out. Each run is a session saved in
// .askmap/maps/<id>/map.json. Facets are cached per conversation and model in .askmap/facets.jsonl,
// shared by all sessions, so a second map over the same logs only pays for new conversations.

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { baseK, kmeans, nearest, topK } from "./cluster.ts"
import { auditCluster, nameCluster, nameParent } from "./describe.ts"
import { EMBEDDER, embed } from "./embed.ts"
import { extractFacets } from "./facets.ts"
import { hash, readLogs } from "./ingest.ts"
import { pool, resolveModel } from "./llm.ts"
import type { SourceId } from "./sources.ts"
import type { AskMap, Cluster, Conversation, Facets, Outcome, Share } from "./types.ts"

export type Progress = { step: string; done: number; total: number }

export type RunOptions = {
  logs: string
  out: string
  model?: string
  source?: SourceId
  /** Shown as the map's source; defaults to the file or folder name. */
  label?: string
  limit?: number
  concurrency?: number
  minUsers?: number
  onProgress?: (p: Progress) => void
  /** Abort to stop between conversations; the run rejects with "Stopped". */
  signal?: AbortSignal
}

export const mapsDir = (out: string) => join(out, "maps")

const sessionId = (label: string, at = new Date()) => {
  const pad = (n: number) => String(n).padStart(2, "0")
  const stamp = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`
  const slug = label.replace(/\.[a-z]+$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "map"
  return `${stamp}-${slug}`
}

const top = (values: string[], n = 6): Share[] => {
  const m = new Map<string, number>()
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, count]) => ({ key, count }))
}

const sample = <T,>(xs: T[], n: number, seed = 1) => {
  const a = xs.map((x, i) => [x, Math.sin(seed * 9301 + i * 49297) % 1] as const)
  return a.sort((p, q) => p[1] - q[1]).slice(0, n).map(([x]) => x)
}

async function loadCache(file: string) {
  const cache = new Map<string, Facets>()
  try {
    for (const line of (await readFile(file, "utf8")).split("\n"))
      if (line.trim()) {
        const { key, facets } = JSON.parse(line) as { key: string; facets: Facets }
        cache.set(key, facets)
      }
  } catch {
    // first run
  }
  return cache
}

export async function run(o: RunOptions): Promise<AskMap> {
  const progress = (step: string, done = 0, total = 0) => {
    if (o.signal?.aborted) throw new Error("Stopped")
    o.onProgress?.({ step, done, total })
  }
  const ref = resolveModel(o.model)
  await mkdir(o.out, { recursive: true })

  progress("Reading logs")
  const read = await readLogs(o.logs, o.source)
  let convs: Conversation[] = read.conversations
  if (o.limit) convs = convs.slice(0, o.limit)
  if (convs.length < 10) throw new Error(`Found ${convs.length} conversations. askmap needs at least 10.`)

  // 1. Facets, cached.
  const cacheFile = join(o.out, "facets.jsonl")
  const cache = await loadCache(cacheFile)
  const keyOf = (c: Conversation) => hash(`${ref.id}|${c.id}|${c.messages.length}`)
  let firstError = ""
  let failures = 0
  let answered = 0
  const facets = await pool(
    convs,
    o.concurrency ?? (ref.local ? 2 : 8),
    async (c) => {
      if (o.signal?.aborted) throw new Error("Stopped")
      const key = keyOf(c)
      const hit = cache.get(key)
      if (hit) return answered++, hit
      // If the first conversations all fail, the model is unreachable: stop early with its error.
      if (failures >= 6 && answered === 0) throw new Error(`The model didn't answer: ${firstError}`)
      try {
        const f = await extractFacets(ref, c)
        await appendFile(cacheFile, `${JSON.stringify({ key, facets: f })}\n`)
        answered++
        return f
      } catch (e) {
        failures++
        firstError ||= e instanceof Error ? e.message.slice(0, 200) : String(e)
        return null
      }
    },
    (n) => progress("Reading conversations", n, convs.length),
  )
  const ok = convs.map((c, i) => ({ c, f: facets[i] })).filter((x): x is { c: Conversation; f: Facets } => !!x.f)
  if (ok.length < 10) throw new Error(`The model read ${ok.length} of ${convs.length} conversations. ${firstError || "Try another model."}`)

  // 2. Embed summaries and cluster.
  progress("Embedding summaries")
  const vectors = await embed(ok.map((x) => `${x.f.task}. ${x.f.summary}`), o.signal)
  const k = baseK(ok.length)
  const { assign, centroids } = kmeans(vectors, k)
  const members = centroids.map((_, ci) => ok.map((_, i) => i).filter((i) => assign[i] === ci)).filter((m) => m.length)

  // Privacy thresholds: distinct users when the logs have them, else conversations.
  const countsUsers = ok.some((x) => x.c.user)
  const minUsers = o.minUsers ?? (countsUsers ? 5 : 10)
  const usersIn = (idx: number[]) => new Set(idx.map((i) => ok[i].c.user ?? ok[i].c.id)).size
  const visible = members.filter((m) => usersIn(m) >= minUsers)
  const hidden = members.filter((m) => usersIn(m) < minUsers)

  // 3. Name visible clusters with contrast from their neighbours.
  const centroidOf = (idx: number[]) => {
    const sum = new Array<number>(vectors[0].length).fill(0)
    for (const i of idx) for (let d = 0; d < sum.length; d++) sum[d] += vectors[i][d]
    const n = Math.sqrt(sum.reduce((s, x) => s + x * x, 0)) || 1
    return sum.map((x) => x / n)
  }
  const names = await pool(
    visible,
    ref.local ? 2 : 6,
    async (idx) => {
      const inside = sample(idx, 18).map((i) => ok[i].f.summary)
      const outside = nearest(vectors, centroidOf(idx), 40, new Set(idx)).slice(0, 10).map((i) => ok[i].f.summary)
      return nameCluster(ref, inside, outside)
    },
    (n) => progress("Naming clusters", n, visible.length),
  )

  // 4. Hierarchy: cluster the cluster names into a few top-level categories.
  progress("Building categories")
  const nameVectors = await embed(names.map((n) => `${n.name}. ${n.description}`), o.signal)
  const parents = visible.length > 4 ? kmeans(nameVectors, topK(visible.length)).assign : visible.map(() => 0)
  const groups = [...new Set(parents)].map((p) => visible.map((_, i) => i).filter((i) => parents[i] === p))
  const parentNames = await pool(groups, ref.local ? 2 : 6, (g) => nameParent(ref, g.map((i) => names[i])), (n) => progress("Naming categories", n, groups.length))

  // 5. Privacy audit on everything an analyst will read.
  let rewritten = 0
  const audited = await pool(
    [...names, ...parentNames],
    ref.local ? 2 : 6,
    async (n) => {
      try {
        const a = await auditCluster(ref, n)
        if (a.score < 4) rewritten++
        return a.score < 4 ? { name: a.name, description: a.description } : n
      } catch {
        return n
      }
    },
    (n) => progress("Checking privacy", n, names.length + parentNames.length),
  )

  // Assemble.
  const stats = (idx: number[]) => {
    const outcomes: Record<Outcome, number> = { resolved: 0, partial: 0, unresolved: 0, unclear: 0 }
    for (const i of idx) outcomes[ok[i].f.outcome]++
    return {
      conversations: idx.length,
      users: usersIn(idx),
      outcomes,
      languages: top(idx.map((i) => ok[i].f.language)),
      turns: Math.round((idx.reduce((s, i) => s + ok[i].f.turns, 0) / Math.max(1, idx.length)) * 10) / 10,
    }
  }
  const clusters: Cluster[] = []
  groups.forEach((g, gi) => {
    const pid = `c${gi}`
    const all = g.flatMap((i) => visible[i])
    const p = audited[names.length + gi]
    const children = g.map((i, j) => {
      const n = audited[i]
      return {
        id: `${pid}.${j}`,
        ...n,
        level: 1 as const,
        parent: pid,
        ...stats(visible[i]),
        examples: sample(visible[i], 6, 3).map((x) => ok[x].f.summary),
      }
    })
    clusters.push({ id: pid, ...p, level: 0, children: children.map((c) => c.id), ...stats(all), examples: [] }, ...children)
  })

  const label = o.label ?? basename(o.logs)
  const createdAt = new Date()
  const map: AskMap = {
    version: 1,
    id: sessionId(label, createdAt),
    createdAt: createdAt.toISOString(),
    source: label,
    format: read.source,
    model: ref.id,
    embedder: EMBEDDER,
    conversations: ok.length,
    users: countsUsers ? new Set(ok.map((x) => x.c.user ?? x.c.id)).size : 0,
    clusters,
    privacy: { minUsers, countsUsers, hiddenClusters: hidden.length, hiddenConversations: hidden.reduce((s, m) => s + m.length, 0), rewritten },
  }
  const dir = join(mapsDir(o.out), map.id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, "map.json"), JSON.stringify(map, null, 2))
  progress("Done", 1, 1)
  return map
}

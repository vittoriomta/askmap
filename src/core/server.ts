// The local API behind the app. Loopback only. The export a user drops is copied into
// .askmap/inbox, recognised, and analysed on request; keys arrive with the run and live only
// in this process's memory.
//
//   GET    /api/maps        every saved map, newest first: { id, source, format, createdAt, conversations, users }
//   GET    /api/map?id=     one map (the newest without an id), 404 if none
//   DELETE /api/maps?id=    delete a saved map
//   GET    /api/source      what's in the inbox: format, conversations, people
//   POST   /api/source      add one file (body = file text, ?name=relative/path)
//   DELETE /api/source      empty the inbox
//   GET    /api/models      is Ollama running, and which models it has
//   POST   /api/run         { model, apiKey?, baseUrl?, minUsers? } starts an analysis
//   GET    /api/run         progress: { running, step, done, total, error, mapId }
//   DELETE /api/run         stop the run

import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import type { IncomingMessage, ServerResponse } from "node:http"
import { dirname, join, normalize } from "node:path"
import { readLogs } from "./ingest.ts"
import { mapsDir, run } from "./run.ts"
import type { Progress } from "./run.ts"
import { SOURCES } from "./sources.ts"
import type { AskMap } from "./types.ts"

type State = { running: boolean; step: string; done: number; total: number; error?: string; finishedAt?: number; mapId?: string }
export type MapEntry = Pick<AskMap, "id" | "source" | "format" | "createdAt" | "conversations" | "users">

const safeId = (id: string) => /^[\w.-]+$/.test(id) && !id.startsWith(".")

/** Every saved map, newest first. A map.json from before sessions is moved into maps/ once. */
export async function listMaps(out: string): Promise<MapEntry[]> {
  const legacy = join(out, "map.json")
  const old = await readFile(legacy, "utf8").catch(() => null)
  if (old) {
    const m = JSON.parse(old) as AskMap
    const id = m.id ?? `${m.createdAt.slice(0, 10)}-legacy`
    await mkdir(join(mapsDir(out), id), { recursive: true })
    await writeFile(join(mapsDir(out), id, "map.json"), JSON.stringify({ ...m, id }, null, 2))
    await rename(legacy, `${legacy}.migrated`)
  }
  const ids = await readdir(mapsDir(out)).catch(() => [] as string[])
  const out_: MapEntry[] = []
  for (const id of ids) {
    const raw = await readFile(join(mapsDir(out), id, "map.json"), "utf8").catch(() => null)
    if (!raw) continue
    const m = JSON.parse(raw) as AskMap
    out_.push({ id, source: m.source, format: m.format, createdAt: m.createdAt, conversations: m.conversations, users: m.users })
  }
  return out_.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

const KEY_ENV: Record<string, string> = { openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY", openrouter: "OPENROUTER_API_KEY", compat: "ASKMAP_API_KEY" }

export function createHandler(out: string) {
  const inbox = join(out, "inbox")
  const labelFile = join(out, "inbox.label")
  const state: State = { running: false, step: "", done: 0, total: 0 }
  let label: string | undefined
  const readLabel = async () => (label ??= (await readFile(labelFile, "utf8").catch(() => "")) || undefined)
  const clearInbox = async () => {
    await rm(inbox, { recursive: true, force: true })
    await rm(labelFile, { force: true })
    label = undefined
  }
  let controller: AbortController | undefined

  const json = (res: ServerResponse, code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" })
    res.end(JSON.stringify(body))
  }
  const body = async (req: IncomingMessage) => {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    return Buffer.concat(chunks).toString("utf8")
  }
  const summary = async () => {
    try {
      const { conversations, source } = await readLogs(inbox)
      const users = new Set(conversations.map((c) => c.user).filter(Boolean)).size
      return { format: source, name: SOURCES.find((s) => s.id === source)?.name, label: await readLabel(), conversations: conversations.length, people: users }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return msg.includes("ENOENT") || msg === "Add an export first." ? null : { error: msg }
    }
  }

  /** Returns true when it handled the request. */
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? "/", "http://localhost")
    const path = url.pathname
    if (!path.startsWith("/api/")) return false
    try {
      if (path === "/api/maps") {
        if (req.method === "GET") return json(res, 200, await listMaps(out)), true
        if (req.method === "DELETE") {
          const id = url.searchParams.get("id") ?? ""
          if (!safeId(id)) return json(res, 400, { error: "bad id" }), true
          await rm(join(mapsDir(out), id), { recursive: true, force: true })
          return json(res, 200, { ok: true }), true
        }
      }
      if (path === "/api/map" && req.method === "GET") {
        const asked = url.searchParams.get("id")
        const id = asked && safeId(asked) ? asked : (await listMaps(out))[0]?.id
        const file = id ? await readFile(join(mapsDir(out), id, "map.json")).catch(() => null) : null
        if (!file) return json(res, 404, { error: "no map yet" }), true
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
        res.end(file)
        return true
      }
      if (path === "/api/source") {
        if (req.method === "GET") return json(res, 200, await summary()), true
        if (req.method === "DELETE") {
          await clearInbox()
          return json(res, 200, null), true
        }
        if (req.method === "POST") {
          const name = normalize(url.searchParams.get("name") ?? "export.jsonl").replace(/^(\.\.(\/|\\|$))+/, "")
          const file = join(inbox, name)
          if (!file.startsWith(inbox)) return json(res, 400, { error: "bad name" }), true
          await mkdir(dirname(file), { recursive: true })
          await writeFile(file, await body(req))
          if (!(await readLabel())) {
            label = name.split(/[\\/]/)[0]
            await writeFile(labelFile, label)
          }
          return json(res, 200, { ok: true }), true
        }
      }
      if (path === "/api/models" && req.method === "GET") {
        const host = (process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(/\/$/, "")
        const r = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(1500) }).catch(() => null)
        const models = r?.ok ? ((await r.json()) as { models: { name: string }[] }).models.map((m) => m.name) : []
        return json(res, 200, { ollama: !!r?.ok, models }), true
      }
      if (path === "/api/run") {
        if (req.method === "GET") return json(res, 200, state), true
        if (req.method === "DELETE") {
          controller?.abort()
          return json(res, 200, { ok: true }), true
        }
        if (req.method === "POST") {
          if (state.running) return json(res, 409, { error: "Already running" }), true
          const opts = JSON.parse((await body(req)) || "{}") as { model?: string; apiKey?: string; baseUrl?: string; minUsers?: number }
          const provider = (opts.model ?? "").split(":")[0]
          if (opts.apiKey && KEY_ENV[provider]) process.env[KEY_ENV[provider]] = opts.apiKey
          if (opts.baseUrl) process.env.ASKMAP_BASE_URL = opts.baseUrl
          Object.assign(state, { running: true, step: "Starting", done: 0, total: 0, error: undefined, finishedAt: undefined, mapId: undefined })
          controller = new AbortController()
          run({
            logs: inbox,
            out,
            label: await readLabel(),
            model: opts.model,
            minUsers: opts.minUsers,
            signal: controller.signal,
            onProgress: (p: Progress) => Object.assign(state, p),
          })
            .then(async (m) => {
              // The map keeps what it needs; the next New map starts empty.
              await clearInbox()
              Object.assign(state, { running: false, finishedAt: Date.now(), mapId: m.id })
            })
            .catch((e: unknown) => Object.assign(state, { running: false, error: e instanceof Error ? e.message : String(e) }))
          return json(res, 202, state), true
        }
      }
      json(res, 404, { error: "not found" })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!res.headersSent) json(res, msg.includes("ENOENT") ? 404 : 500, { error: msg })
    }
    return true
  }
}

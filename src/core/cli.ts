// askmap <logs.jsonl>   analyse, then open the map
// askmap                open the last map in ./.askmap
// Options: --source jsonl|otel|chatgpt|claude|copilot|gemini  --model provider:name  --limit n  --min-users n  --port n  --no-open  --out dir

import { createServer } from "node:http"
import { readFile, stat } from "node:fs/promises"
import { extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"
import { run } from "./run.ts"
import { createHandler } from "./server.ts"

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? undefined : args[i + 1]
}
const has = (name: string) => args.includes(`--${name}`)
const logs = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"))
const out = resolve(flag("out") ?? ".askmap")
const port = Number(flag("port") ?? 4317)

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`
const bar = (done: number, total: number) => {
  const w = 24
  const f = total ? Math.round((done / total) * w) : 0
  return `${"━".repeat(f)}${dim("━".repeat(w - f))}`
}

async function analyse() {
  if (!logs) return
  const started = Date.now()
  let last = ""
  const map = await run({
    logs: resolve(logs),
    out,
    model: flag("model"),
    source: flag("source") as import("./sources.ts").SourceId | undefined,
    limit: flag("limit") ? Number(flag("limit")) : undefined,
    minUsers: flag("min-users") ? Number(flag("min-users")) : undefined,
    onProgress: ({ step, done, total }) => {
      const line = total ? `${step.padEnd(22)} ${bar(done, total)} ${done}/${total}` : step
      if (line === last) return
      last = line
      process.stdout.write(`\r\x1b[2K${line}`)
    },
  })
  const s = Math.round((Date.now() - started) / 1000)
  process.stdout.write(
    `\r\x1b[2K${map.conversations} conversations, ${map.clusters.filter((c) => c.level === 1).length} clusters, ${map.clusters.filter((c) => c.level === 0).length} categories ${dim(`in ${s}s with ${map.model}`)}\n`,
  )
}

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2" }

async function serve() {
  const ui = fileURLToPath(new URL("../ui", import.meta.url))
  const api = createHandler(out)
  const server = createServer(async (req, res) => {
    if (await api(req, res)) return
    const url = new URL(req.url ?? "/", "http://localhost")
    try {
      let file = join(ui, url.pathname === "/" ? "index.html" : url.pathname)
      if (!file.startsWith(ui) || !(await stat(file).catch(() => null))?.isFile()) file = join(ui, "index.html")
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" })
      res.end(await readFile(file))
    } catch {
      res.writeHead(404).end()
    }
  })
  // Loopback only: the map never listens on the network.
  server.listen(port, "127.0.0.1", () => {
    const href = `http://127.0.0.1:${port}`
    console.log(`Map at ${href} ${dim("· Ctrl-C to stop")}`)
    if (!has("no-open")) spawn(process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open", process.platform === "win32" ? ["/c", "start", href] : [href], { stdio: "ignore", detached: true }).unref()
  })
}

analyse()
  .then(() => (has("no-serve") ? process.exit(0) : serve()))
  .catch((e: unknown) => {
    console.error(`\n${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  })

import assert from "node:assert/strict"
import { mkdtemp, readFile, readdir } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { readLogs } from "../src/core/ingest.ts"
import { run } from "../src/core/run.ts"

const logs = "test/fixtures/synthetic.jsonl"

test("a full run with the fake model makes a consistent, private map", async () => {
  const out = await mkdtemp("/tmp/askmap-run-")
  const map = await run({ logs, out, model: "fake", limit: 400 })

  // Saved as a session, with a facets cache.
  assert.deepEqual(await readdir(join(out, "maps")), [map.id])
  const saved = JSON.parse(await readFile(join(out, "maps", map.id, "map.json"), "utf8"))
  assert.equal(saved.id, map.id)
  assert.equal((await readFile(join(out, "facets.jsonl"), "utf8")).trim().split("\n").length, 400)

  // Totals add up: shown + held back = everything read.
  const cats = map.clusters.filter((c) => c.level === 0)
  const kids = map.clusters.filter((c) => c.level === 1)
  assert.ok(cats.length >= 1 && kids.length >= 1)
  assert.equal(cats.reduce((s, c) => s + c.conversations, 0) + map.privacy.hiddenConversations, map.conversations)
  for (const cat of cats) assert.equal(cat.conversations, kids.filter((k) => k.parent === cat.id).reduce((s, k) => s + k.conversations, 0))
  for (const k of kids) {
    assert.ok(cats.some((c) => c.id === k.parent))
    assert.equal(Object.values(k.outcomes).reduce((a, b) => a + b, 0), k.conversations)
  }

  // Privacy: every shown cluster clears the threshold; no raw text reaches the map.
  for (const k of kids) assert.ok(k.users >= map.privacy.minUsers, `${k.name} has ${k.users} people`)
  const { conversations } = await readLogs(logs)
  const json = JSON.stringify(map)
  for (const c of conversations.slice(0, 400)) {
    const raw = c.messages[0].content.trim().slice(0, 60)
    if (raw.length >= 30) assert.ok(!json.includes(raw), `raw text leaked: ${raw}`)
  }
  // The synthetic export is full of names, emails and order numbers: none may reach the map.
  for (const leak of ["Giulia", "Bianchi", "example-corp.com", "#480", "@"]) assert.ok(!json.includes(leak), `leaked: ${leak}`)
  for (const k of kids) for (const e of k.examples) assert.ok(e.startsWith("Asked the assistant to"))
})

test("a second map reuses the cache and makes a new session", async () => {
  const out = await mkdtemp("/tmp/askmap-cache-")
  const a = await run({ logs, out, model: "fake", limit: 120 })
  await new Promise((r) => setTimeout(r, 1100))
  const b = await run({ logs, out, model: "fake", limit: 120, label: "second" })
  assert.notEqual(a.id, b.id)
  assert.equal((await readdir(join(out, "maps"))).length, 2)
  assert.equal((await readFile(join(out, "facets.jsonl"), "utf8")).trim().split("\n").length, 120)
  assert.equal(b.source, "second")
})

test("too few conversations is a clear error", async () => {
  const out = await mkdtemp("/tmp/askmap-few-")
  await assert.rejects(run({ logs, out, model: "fake", limit: 5 }), /needs at least 10/)
})

test("stopping a run rejects with Stopped", async () => {
  const out = await mkdtemp("/tmp/askmap-stop-")
  const controller = new AbortController()
  const p = run({ logs, out, model: "fake", limit: 400, signal: controller.signal, onProgress: (x) => x.done > 20 && controller.abort() })
  await assert.rejects(p, /Stopped/)
})

test("an unreachable model fails fast with its error", async () => {
  const out = await mkdtemp("/tmp/askmap-down-")
  const prev = process.env.OLLAMA_HOST
  process.env.OLLAMA_HOST = "http://127.0.0.1:9"
  const t0 = Date.now()
  await assert.rejects(run({ logs, out, model: "ollama:qwen3:1.7b", limit: 60 }), /didn't answer|read 0 of/)
  assert.ok(Date.now() - t0 < 30000)
  process.env.OLLAMA_HOST = prev
})

test("stopping during embedding also stops", async () => {
  const out = await mkdtemp("/tmp/askmap-stop2-")
  const controller = new AbortController()
  const p = run({ logs, out, model: "fake", limit: 600, signal: controller.signal, onProgress: (x) => x.step === "Embedding summaries" && controller.abort() })
  await assert.rejects(p, /Stopped/)
})

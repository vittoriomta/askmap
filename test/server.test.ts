import assert from "node:assert/strict"
import { mkdtemp, readFile } from "node:fs/promises"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { after, before, test } from "node:test"
import { createHandler } from "../src/core/server.ts"

let base = ""
let close = () => {}

before(async () => {
  const out = await mkdtemp("/tmp/askmap-api-")
  const handle = createHandler(out)
  const server = createServer(async (req, res) => {
    if (!(await handle(req, res))) res.writeHead(404).end()
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
  close = () => server.close()
})
after(() => close())

const get = async (path: string) => {
  const r = await fetch(`${base}/${path}`)
  return { status: r.status, body: await r.json() }
}

test("a fresh install has no map and no source", async () => {
  assert.equal((await get("map")).status, 404)
  assert.deepEqual((await get("maps")).body, [])
  assert.equal((await get("source")).body, null)
})

test("upload, detect, run, open, stop and delete", async () => {
  const sample = (await readFile("test/fixtures/synthetic.jsonl", "utf8")).split("\n").slice(0, 150).join("\n")
  assert.equal((await fetch(`${base}/source?name=logs/part.jsonl`, { method: "POST", body: sample })).status, 200)
  const src = (await get("source")).body
  assert.equal(src.format, "jsonl")
  assert.ok(src.conversations >= 140, `${src.conversations}`)
  const count = src.conversations

  // Paths can't escape the inbox.
  assert.equal((await fetch(`${base}/source?name=../../evil.json`, { method: "POST", body: "{}" })).status, 200)
  assert.equal((await get("source")).body.conversations, count)

  const started = await fetch(`${base}/run`, { method: "POST", body: JSON.stringify({ model: "fake" }) })
  assert.equal(started.status, 202)
  assert.equal((await fetch(`${base}/run`, { method: "POST", body: JSON.stringify({ model: "fake" }) })).status, 409)
  let state = (await get("run")).body
  for (let i = 0; i < 120 && state.running; i++) {
    await new Promise((r) => setTimeout(r, 250))
    state = (await get("run")).body
  }
  assert.equal(state.error, undefined)
  assert.ok(state.mapId)

  // The export is cleared once its map exists; the next New map starts empty.
  assert.equal((await get("source")).body, null)
  const maps = (await get("maps")).body
  assert.equal(maps.length, 1)
  assert.equal(maps[0].source, "logs")
  assert.equal((await get(`map?id=${state.mapId}`)).body.id, state.mapId)
  assert.equal((await get("map")).body.id, state.mapId)
  assert.equal((await fetch(`${base}/maps?id=../x`, { method: "DELETE" })).status, 400)

  // A run can be stopped.
  await fetch(`${base}/source?name=again.jsonl`, { method: "POST", body: sample })
  await fetch(`${base}/run`, { method: "POST", body: JSON.stringify({ model: "fake" }) })
  await fetch(`${base}/run`, { method: "DELETE" })
  for (let i = 0; i < 80 && (await get("run")).body.running; i++) await new Promise((r) => setTimeout(r, 100))
  const stopped = (await get("run")).body
  assert.ok(!stopped.running)

  assert.equal((await fetch(`${base}/maps?id=${state.mapId}`, { method: "DELETE" })).status, 200)
  assert.equal((await get("maps")).body.length, stopped.mapId ? 1 : 0)
  await fetch(`${base}/source`, { method: "DELETE" })
  assert.equal((await get("source")).body, null)
})

test("a run without a source reports an error", async () => {
  for (let i = 0; i < 80 && (await get("run")).body.running; i++) await new Promise((r) => setTimeout(r, 100))
  assert.equal((await fetch(`${base}/run`, { method: "POST", body: JSON.stringify({ model: "fake" }) })).status, 202)
  let state = (await get("run")).body
  for (let i = 0; i < 40 && state.running; i++) {
    await new Promise((r) => setTimeout(r, 100))
    state = (await get("run")).body
  }
  assert.equal(state.error, "Add an export first.")
})

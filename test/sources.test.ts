import assert from "node:assert/strict"
import { test } from "node:test"
import { readLogs } from "../src/core/ingest.ts"

const cases: [file: string, source: string, messages: number, user?: string][] = [
  ["otel.json", "otel", 4, "u-7"],
  ["chatgpt.json", "chatgpt", 2],
  ["claude.json", "claude", 2, "acc-1"],
  ["copilot.json", "copilot", 2, "usr-1"],
  ["gemini.json", "gemini", 2, "emp-9"],
  ["generic.jsonl", "jsonl", 2, "x"],
]

for (const [file, source, messages, user] of cases)
  test(`reads ${source} exports`, async () => {
    const r = await readLogs(`test/fixtures/${file}`)
    assert.equal(r.source, source)
    assert.equal(r.conversations.length, 1)
    const c = r.conversations[0]
    assert.equal(c.messages.length, messages)
    if (user) assert.equal(c.user, user)
    assert.ok(c.messages.every((m) => m.content.trim()))
    assert.equal(c.messages[0].role, "user")
  })

test("chatgpt keeps the active branch and drops system messages", async () => {
  const { conversations } = await readLogs("test/fixtures/chatgpt.json")
  assert.deepEqual(conversations[0].messages.map((m) => m.role), ["user", "assistant"])
})

test("copilot strips html from responses", async () => {
  const { conversations } = await readLogs("test/fixtures/copilot.json")
  assert.ok(!conversations[0].messages[1].content.includes("<"))
  assert.ok(!conversations[0].messages[1].content.includes("&nbsp;"))
})

test("otel keeps the longest history once per conversation", async () => {
  const { conversations } = await readLogs("test/fixtures/otel.json")
  assert.equal(conversations[0].id, "conv-1")
  assert.equal(conversations[0].messages.at(-1)!.content, "Ask your manager to approve VPN access.")
})

test("reads a whole folder of one export", async () => {
  const { mkdtemp, readFile, writeFile, mkdir } = await import("node:fs/promises")
  const dir = await mkdtemp("/tmp/askmap-folder-")
  const lines = (await readFile("test/fixtures/synthetic.jsonl", "utf8")).trim().split("\n")
  await mkdir(`${dir}/2026-11`, { recursive: true })
  await writeFile(`${dir}/part-1.jsonl`, lines.slice(0, 300).join("\n"))
  await writeFile(`${dir}/2026-11/part-2.jsonl`, lines.slice(300).join("\n"))
  const all = await readLogs(dir)
  assert.equal(all.source, "jsonl")
  assert.equal(all.conversations.length, 600)
})

test("unknown exports fail with the list of formats", async () => {
  const { mkdtemp, writeFile } = await import("node:fs/promises")
  const dir = await mkdtemp("/tmp/askmap-unknown-")
  await writeFile(`${dir}/x.json`, JSON.stringify([{ foo: 1 }]))
  await assert.rejects(readLogs(dir), /Couldn't recognise this export/)
})

test("--source forces a format", async () => {
  const r = await readLogs("test/fixtures/generic.jsonl", "jsonl")
  assert.equal(r.source, "jsonl")
})

test("broken files say which file", async () => {
  const { mkdtemp, writeFile } = await import("node:fs/promises")
  const dir = await mkdtemp("/tmp/askmap-broken-")
  await writeFile(`${dir}/bad.jsonl`, "{not json\n")
  await assert.rejects(readLogs(dir), /bad\.jsonl isn't valid JSON/)
  await assert.rejects(readLogs(`${dir}/missing`), /Add an export first/)
})

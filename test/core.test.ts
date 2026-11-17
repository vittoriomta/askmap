import assert from "node:assert/strict"
import { test } from "node:test"
import { baseK, kmeans, topK } from "../src/core/cluster.ts"
import { transcript } from "../src/core/ingest.ts"
import { firstJson } from "../src/core/llm.ts"

test("firstJson finds the object in noisy replies", () => {
  assert.deepEqual(firstJson('{"a":1}'), { a: 1 })
  assert.deepEqual(firstJson('Sure!\n```json\n{"a": "x}y"}\n```'), { a: "x}y" })
  assert.deepEqual(firstJson('<think>{"no":1}</think>{"yes":2}'), { yes: 2 })
  assert.deepEqual(firstJson('{"a":{"b":[1,2]},"c":"\\"q\\""} trailing'), { a: { b: [1, 2] }, c: '"q"' })
  assert.throws(() => firstJson("no json here"), /no JSON/)
  assert.throws(() => firstJson('{"a": 1'), /unterminated/)
})

test("kmeans assigns everything, is deterministic and respects k", () => {
  const v = Array.from({ length: 60 }, (_, i) => {
    const a = (i % 3) * 2 + Math.sin(i) * 0.1
    const x = [Math.cos(a), Math.sin(a)]
    const n = Math.hypot(x[0], x[1])
    return [x[0] / n, x[1] / n]
  })
  const r1 = kmeans(v, 3)
  const r2 = kmeans(v, 3)
  assert.deepEqual(r1.assign, r2.assign)
  assert.equal(r1.assign.length, 60)
  assert.equal(new Set(r1.assign).size, 3)
  assert.equal(kmeans(v.slice(0, 2), 10).centroids.length, 2)
})

test("cluster counts scale with the data", () => {
  assert.equal(baseK(10), 3)
  assert.equal(baseK(1200), 30)
  assert.equal(baseK(100000), 120)
  assert.ok(topK(30) >= 2 && topK(30) <= 12)
})

test("transcripts are trimmed per turn and in total", () => {
  const long = "x".repeat(10000)
  const t = transcript({ id: "1", messages: [{ role: "user", content: long }, { role: "assistant", content: long }] })
  assert.ok(t.length <= 3500)
  assert.ok(t.startsWith("User: "))
  assert.ok(t.includes("Assistant: "))
})

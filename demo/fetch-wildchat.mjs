// Builds demo/wildchat-sample.jsonl from AI2's WildChat-1M (ODC-BY 1.0), via the public
// Hugging Face datasets server. Keeps non-toxic, non-redacted conversations, spread across
// the dataset, and keeps only what askmap reads: id, hashed user, messages.
// Usage: node demo/fetch-wildchat.mjs [count]

import { writeFile } from "node:fs/promises"

const want = Number(process.argv[2] ?? 1200)
const base = "https://datasets-server.huggingface.co/rows?dataset=allenai/WildChat-1M&config=default&split=train"
const out = []
const seen = new Set()
// Spread pages across the first ~800k rows so the sample isn't one week of traffic.
for (let page = 0; out.length < want && page < 400; page++) {
  const offset = (page * 7919 * 101) % 800000
  const res = await fetch(`${base}&offset=${offset}&length=100`)
  if (!res.ok) {
    await new Promise((r) => setTimeout(r, 2000))
    continue
  }
  const { rows } = await res.json()
  for (const { row } of rows) {
    if (row.toxic || row.redacted || seen.has(row.conversation_hash)) continue
    const messages = row.conversation.map((m) => ({ role: m.role, content: m.content })).filter((m) => m.content?.trim())
    if (!messages.length || messages.reduce((s, m) => s + m.content.length, 0) > 20000) continue
    seen.add(row.conversation_hash)
    out.push({ id: row.conversation_hash, user: row.conversation[0]?.hashed_ip, messages })
    if (out.length >= want) break
  }
  process.stdout.write(`\r${out.length}/${want}`)
}
await writeFile(new URL("./wildchat-sample.jsonl", import.meta.url), out.map((r) => JSON.stringify(r)).join("\n") + "\n")
console.log(`\nwrote ${out.length} conversations`)

// Reads an export (a file or a folder of files, JSON or JSONL), recognises which source it came
// from, and returns conversations. See sources.ts for the formats.

import { createHash } from "node:crypto"
import { readdir, readFile, stat } from "node:fs/promises"
import { extname, join } from "node:path"
import { SOURCES, detect } from "./sources.ts"
import type { SourceId } from "./sources.ts"
import type { Conversation } from "./types.ts"

export const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16)

/** A file is JSON (one document) or JSONL (one document per line). */
export function parseDocs(raw: string): unknown[] {
  const t = raw.trim()
  if (!t) return []
  try {
    return [JSON.parse(t)]
  } catch {
    return t
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l))
  }
}

async function files(path: string): Promise<string[]> {
  const st = await stat(path).catch(() => null)
  if (!st) throw new Error("Add an export first.")
  if (!st.isDirectory()) return [path]
  const out: string[] = []
  for (const e of await readdir(path, { withFileTypes: true })) {
    const p = join(path, e.name)
    if (e.isDirectory()) out.push(...(await files(p)))
    else if ([".json", ".jsonl", ".ndjson"].includes(extname(e.name))) out.push(p)
  }
  return out.sort()
}

export async function readLogs(path: string, source?: SourceId): Promise<{ conversations: Conversation[]; source: SourceId }> {
  const docs: unknown[] = []
  const list = await files(path)
  if (!list.length) throw new Error("Add an export first.")
  for (const f of list) {
    try {
      docs.push(...parseDocs(await readFile(f, "utf8")))
    } catch {
      throw new Error(`${f.split("/").pop()} isn't valid JSON or JSONL.`)
    }
  }
  const src = source ? SOURCES.find((s) => s.id === source) : detect(docs)
  if (!src) throw new Error(`Couldn't recognise this export. Formats: ${SOURCES.map((s) => s.id).join(", ")}. Pass --source to choose one.`)
  // Ids from different sources can collide; dedupe on id.
  const seen = new Set<string>()
  const conversations = src.read(docs).filter((c) => !seen.has(c.id) && seen.add(c.id))
  return { conversations, source: src.id }
}

/** The conversation as the model sees it: long turns are trimmed, so one chat can't blow the budget. */
export function transcript(c: Conversation, maxChars = 3500) {
  const per = Math.max(400, Math.floor(maxChars / Math.max(1, c.messages.length)))
  return c.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.length > per ? `${m.content.slice(0, per)} […]` : m.content}`)
    .join("\n\n")
    .slice(0, maxChars)
}

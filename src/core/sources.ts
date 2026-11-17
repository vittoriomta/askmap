// Where conversations come from. Each source knows how to recognise its export and turn it into
// Conversations. askmap reads exports someone already knows how to produce: it never calls a
// vendor API itself.
//
//   jsonl      one conversation per line: messages | conversation | turns (OpenAI, AI SDK, WildChat)
//   otel       OpenTelemetry GenAI spans (OTLP JSON): LiteLLM, Langfuse, Arize, Datadog, any OTel SDK
//   chatgpt    ChatGPT Enterprise / Edu Compliance API logs, and the personal conversations.json export
//   claude     Claude Enterprise Compliance API chats, and the personal conversations.json export
//   copilot    Microsoft 365 Copilot interaction export (Graph aiInteractionHistory)
//   gemini     Gemini conversations exported from Google Vault (JSON)

import type { Conversation, Message, Role } from "./types.ts"

type Raw = Record<string, unknown>
export type SourceId = "jsonl" | "otel" | "chatgpt" | "claude" | "copilot" | "gemini"

export type Source = {
  id: SourceId
  name: string
  /** True when a parsed document (object, array or JSONL rows) looks like this source. */
  detect: (docs: unknown[]) => boolean
  read: (docs: unknown[]) => Conversation[]
}

const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown) => (v == null ? "" : String(v))
const ROLES: Record<string, Role> = { user: "user", human: "user", assistant: "assistant", ai: "assistant", model: "assistant", gpt: "assistant", bot: "assistant", system: "system", tool: "tool", function: "tool" }
const role = (v: unknown) => ROLES[str(v).toLowerCase()]

/** Text out of the content shapes vendors use: strings, parts arrays, {text}, {content}, {parts}. */
export function text(v: unknown): string {
  if (typeof v === "string") return v
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join("\n")
  const o = obj(v)
  if (o.type && o.type !== "text" && !("text" in o) && !("content" in o)) return ""
  if ("text" in o) return text(o.text)
  if ("parts" in o) return text(o.parts)
  if ("content" in o) return text(o.content)
  if ("value" in o) return text(o.value)
  return ""
}

const keep = (messages: (Message | null)[]) => messages.filter((m): m is Message => !!m && m.content.trim().length > 0)
const conversation = (id: string, user: string | undefined, messages: Message[]): Conversation | null =>
  messages.some((m) => m.role === "user") ? { id, user: user || undefined, messages } : null
const done = (cs: (Conversation | null)[]) => cs.filter((c): c is Conversation => !!c)

/** Flattens documents into records: a JSON array, {data|value|items|chats|conversations: [...]}, or a single object. */
function records(docs: unknown[]): Raw[] {
  return docs.flatMap((d) => {
    if (Array.isArray(d)) return d.map(obj)
    const o = obj(d)
    for (const k of ["data", "value", "items", "chats", "conversations", "results"]) if (Array.isArray(o[k])) return arr(o[k]).map(obj)
    return [o]
  })
}

// ── Generic JSONL ──────────────────────────────────────────────────────────

const generic: Source = {
  id: "jsonl",
  name: "JSONL",
  detect: (docs) => records(docs).some((r) => Array.isArray(r.messages ?? r.conversation ?? r.turns)),
  read: (docs) =>
    done(
      records(docs).map((r, i) => {
        const list = arr(r.messages ?? r.conversation ?? r.turns ?? r.chat)
        const messages = keep(list.map((m) => {
          const o = obj(m)
          const ro = role(o.role ?? o.from ?? o.speaker)
          return ro ? { role: ro, content: text(o.content ?? o.value ?? o.text) } : null
        }))
        const meta = obj(r.metadata)
        return conversation(str(r.id ?? r.conversation_id ?? r.conversation_hash ?? i), str(r.user ?? r.user_id ?? r.userId ?? r.hashed_ip ?? meta.user ?? meta.user_id), messages)
      }),
    ),
}

// ── OpenTelemetry GenAI ────────────────────────────────────────────────────
// OTLP JSON: resourceSpans[].scopeSpans[].spans[] with gen_ai.* attributes. Messages live in
// gen_ai.input.messages / gen_ai.output.messages (current conventions) or in span events
// gen_ai.user.message / gen_ai.choice (older ones). Spans group into conversations by
// gen_ai.conversation.id, falling back to the trace.

type Attr = { key: string; value: Raw }
const attrValue = (v: Raw): unknown => v.stringValue ?? v.intValue ?? v.doubleValue ?? v.boolValue ?? (v.arrayValue ? arr(obj(v.arrayValue).values).map((x) => attrValue(obj(x))) : undefined)
const attrs = (list: unknown) => Object.fromEntries(arr(list).map((a) => [(a as Attr).key, attrValue(obj((a as Attr).value))]))
const parseJson = (v: unknown) => {
  if (typeof v !== "string") return v
  try {
    return JSON.parse(v)
  } catch {
    return v
  }
}

const otel: Source = {
  id: "otel",
  name: "OpenTelemetry",
  detect: (docs) => docs.some((d) => Array.isArray(obj(d).resourceSpans)),
  read: (docs) => {
    type Turn = { at: number; messages: Message[]; user?: string }
    const groups = new Map<string, Turn[]>()
    for (const d of docs)
      for (const rs of arr(obj(d).resourceSpans)) {
        const res = attrs(obj(obj(rs).resource).attributes)
        for (const ss of arr(obj(rs).scopeSpans))
          for (const sp of arr(obj(ss).spans)) {
            const s = obj(sp)
            const a = { ...res, ...attrs(s.attributes) }
            const msgs: Message[] = []
            const add = (list: unknown) => {
              for (const m of arr(parseJson(list))) {
                const o = obj(m)
                const ro = role(o.role)
                if (ro) msgs.push({ role: ro, content: text(o.parts ?? o.content) })
              }
            }
            add(a["gen_ai.input.messages"])
            add(a["gen_ai.output.messages"])
            for (const ev of arr(s.events)) {
              const e = obj(ev)
              const ea = attrs(e.attributes)
              if (e.name === "gen_ai.client.inference.operation.details") {
                add(ea["gen_ai.input.messages"])
                add(ea["gen_ai.output.messages"])
              } else if (str(e.name).startsWith("gen_ai.") && str(e.name).endsWith(".message")) {
                const ro = role(str(e.name).split(".")[1])
                if (ro) msgs.push({ role: ro, content: text(parseJson(ea.content ?? ea["gen_ai.event.content"])) })
              } else if (e.name === "gen_ai.choice") msgs.push({ role: "assistant", content: text(obj(parseJson(ea.message)).content ?? ea.content) })
            }
            if (!msgs.length) continue
            const key = str(a["gen_ai.conversation.id"] ?? a["session.id"] ?? s.traceId)
            const list = groups.get(key) ?? []
            list.push({ at: Number(s.startTimeUnixNano ?? 0), messages: keep(msgs), user: str(a["enduser.id"] ?? a["user.id"] ?? a["gen_ai.user.id"]) || undefined })
            groups.set(key, list)
          }
      }
    // Each inference span repeats the history it was sent; keep the last (longest) one per conversation.
    return done(
      [...groups].map(([id, turns]) => {
        turns.sort((a, b) => a.at - b.at)
        const last = turns.reduce((best, t) => (t.messages.length >= best.messages.length ? t : best), turns[0])
        return conversation(id, turns.find((t) => t.user)?.user, last.messages)
      }),
    )
  },
}

// ── ChatGPT ────────────────────────────────────────────────────────────────
// Personal export (conversations.json): [{ id, title, mapping: { node: { message: { author: { role },
// content: { parts } }, parent, children } } }]. Compliance API logs carry the same message objects,
// either as a mapping or as a messages list, with the workspace user on the record.

function walkMapping(mapping: Raw, current?: string): Message[] {
  // Follow the active branch: start from current_node and walk parents, else take any leaf.
  const nodes = mapping
  let id = current ?? Object.keys(nodes).find((k) => !arr(obj(nodes[k]).children).length)
  const chain: Raw[] = []
  while (id && nodes[id]) {
    chain.push(obj(nodes[id]))
    id = str(obj(nodes[id]).parent) || undefined
  }
  return keep(chain.reverse().map((n) => chatgptMessage(n.message)))
}
function chatgptMessage(m: unknown): Message | null {
  const o = obj(m)
  const ro = role(obj(o.author).role ?? o.role)
  if (!ro || ro === "system" || ro === "tool") return null
  const c = obj(o.content)
  if (c.content_type && c.content_type !== "text" && c.content_type !== "multimodal_text") return null
  return { role: ro, content: text(c.parts ?? o.content) }
}

const chatgpt: Source = {
  id: "chatgpt",
  name: "ChatGPT Enterprise",
  detect: (docs) => records(docs).some((r) => (!!r.mapping && typeof r.mapping === "object") || arr(r.messages).some((m) => obj(obj(m).author).role)),
  read: (docs) =>
    done(
      records(docs).map((r, i) => {
        const messages = r.mapping ? walkMapping(obj(r.mapping), str(r.current_node) || undefined) : keep(arr(r.messages).map(chatgptMessage))
        const user = obj(r.user)
        return conversation(str(r.id ?? r.conversation_id ?? i), str(r.user_id ?? user.id ?? r.user_email ?? user.email), messages)
      }),
    ),
}

// ── Claude ─────────────────────────────────────────────────────────────────
// Personal export and Compliance API chats: { uuid, name, account | user, chat_messages: [{ sender:
// "human" | "assistant", text, content: [{ type: "text", text }] }] }.

const claude: Source = {
  id: "claude",
  name: "Claude Enterprise",
  detect: (docs) => records(docs).some((r) => Array.isArray(r.chat_messages)),
  read: (docs) =>
    done(
      records(docs).map((r, i) => {
        const messages = keep(arr(r.chat_messages).map((m) => {
          const o = obj(m)
          const ro = role(o.sender ?? o.role)
          return ro ? { role: ro, content: text(o.content) || text(o.text) } : null
        }))
        return conversation(str(r.uuid ?? r.id ?? i), str(obj(r.account).uuid ?? obj(r.user).id ?? r.user_id ?? obj(r.user).email), messages)
      }),
    ),
}

// ── Microsoft 365 Copilot ──────────────────────────────────────────────────
// Graph aiInteractionHistory/getAllEnterpriseInteractions: one record per turn,
// { sessionId, interactionType: "userPrompt" | "aiResponse", from: { user: { id } }, body: { content },
// createdDateTime }. Turns group into conversations by sessionId.

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim()

const copilot: Source = {
  id: "copilot",
  name: "Microsoft Copilot",
  detect: (docs) => records(docs).some((r) => "interactionType" in r && "sessionId" in r),
  read: (docs) => {
    const sessions = new Map<string, { at: string; m: Message; user?: string }[]>()
    for (const r of records(docs)) {
      if (!r.sessionId) continue
      const type = str(r.interactionType)
      const ro: Role | undefined = type === "userPrompt" ? "user" : type === "aiResponse" ? "assistant" : undefined
      if (!ro) continue
      const body = obj(r.body)
      const content = str(body.contentType).toLowerCase() === "html" ? stripHtml(str(body.content)) : str(body.content)
      const list = sessions.get(str(r.sessionId)) ?? []
      list.push({ at: str(r.createdDateTime), m: { role: ro, content }, user: str(obj(obj(r.from).user).id) || undefined })
      sessions.set(str(r.sessionId), list)
    }
    return done(
      [...sessions].map(([id, turns]) => {
        turns.sort((a, b) => a.at.localeCompare(b.at))
        return conversation(id, turns.find((t) => t.m.role === "user")?.user, keep(turns.map((t) => t.m)))
      }),
    )
  },
}

// ── Gemini (Google Vault) ──────────────────────────────────────────────────
// Vault's Gemini export is new (2026) and its fields vary by product. askmap reads the common
// shapes: conversations with turns of prompt/response, or one record per message with a
// conversation id and an author. Anything else: convert to JSONL first.

const gemini: Source = {
  id: "gemini",
  name: "Gemini (Vault)",
  detect: (docs) => records(docs).some((r) => Array.isArray(r.turns) && arr(r.turns).some((t) => "prompt" in obj(t) || "response" in obj(t))) || records(docs).some((r) => "conversationId" in r && ("prompt" in r || "response" in r)),
  read: (docs) => {
    const out = new Map<string, { user?: string; messages: Message[] }>()
    for (const r of records(docs)) {
      const id = str(r.conversationId ?? r.conversation_id ?? r.id)
      const entry = out.get(id) ?? { user: str(r.user ?? r.userEmail ?? obj(r.author).email) || undefined, messages: [] }
      const turns = Array.isArray(r.turns) ? arr(r.turns).map(obj) : [r]
      for (const t of turns) {
        if (t.prompt != null) entry.messages.push({ role: "user", content: text(t.prompt) })
        if (t.response != null) entry.messages.push({ role: "assistant", content: text(t.response) })
      }
      out.set(id, entry)
    }
    return done([...out].map(([id, e]) => conversation(id, e.user, keep(e.messages))))
  },
}

/** Most specific first: generic JSONL also matches some vendor shapes. */
export const SOURCES: Source[] = [otel, copilot, claude, chatgpt, gemini, generic]

export function detect(docs: unknown[]): Source | undefined {
  return SOURCES.find((s) => s.detect(docs))
}

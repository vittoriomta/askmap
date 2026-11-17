// The askmap data model. A run reads conversations, extracts private-by-design facets from
// each one, clusters them, and writes one Map file the UI reads. Raw text never reaches the Map.

export type Role = "user" | "assistant" | "system" | "tool"
export type Message = { role: Role; content: string }

export type Conversation = {
  id: string
  /** Anyone who can be counted as a distinct person: account id, hashed ip, employee id. */
  user?: string
  messages: Message[]
}

export type Outcome = "resolved" | "partial" | "unresolved" | "unclear"

/** What askmap keeps about one conversation. No names, no quotes, no identifiers. */
export type Facets = {
  summary: string
  task: string
  language: string
  outcome: Outcome
  turns: number
}

export type Share = { key: string; count: number }

export type Cluster = {
  id: string
  name: string
  description: string
  level: 0 | 1
  parent?: string
  children?: string[]
  conversations: number
  users: number
  outcomes: Record<Outcome, number>
  languages: Share[]
  turns: number
  /** Privacy-preserving summaries, only from clusters that pass the thresholds. */
  examples: string[]
}

export type Privacy = {
  minUsers: number
  countsUsers: boolean
  hiddenClusters: number
  hiddenConversations: number
  rewritten: number
}

export type AskMap = {
  version: 1
  /** Folder name under .askmap/maps: date and source, e.g. 2026-11-17-1530-compliance-logs. */
  id: string
  createdAt: string
  source: string
  /** Which export it came from: jsonl, otel, chatgpt, claude, copilot, gemini. */
  format: string
  model: string
  embedder: string
  conversations: number
  users: number
  clusters: Cluster[]
  privacy: Privacy
}

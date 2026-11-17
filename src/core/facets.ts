// Step 1: one model call per conversation turns it into facets. The summary is written to be
// private by construction: what was asked, never who asked or what their data said.

import { z } from "zod"
import { transcript } from "./ingest.ts"
import { ask } from "./llm.ts"
import type { ModelRef } from "./llm.ts"
import type { Conversation, Facets } from "./types.ts"

const SYSTEM = `You analyse conversations between a user and an AI assistant inside a company, to understand what people use the assistant for. You never reveal anything that could identify a person or an organisation.

Privacy rules, always:
- No names of people, companies, customers, products or projects that are not widely known public products.
- No email addresses, phone numbers, account numbers, amounts, dates, places or quotes from the conversation.
- Describe the kind of request, not its private content. "Draft a reply to a customer asking for a refund", not "Draft a reply to Maria about order 4412".`

const PROMPT = (t: string) => `Conversation:
<conversation>
${t}
</conversation>

Return:
- "summary": one sentence, at most 25 words, starting with a verb, describing what the user wanted from the assistant. Generic enough that it could describe many people's conversations.
- "task": the type of work in 2 to 5 words, like "Debug Python code", "Draft customer email", "Summarize meeting notes".
- "language": the main language the user wrote in, in English, like "English", "Italian".
- "outcome": did the assistant give the user what they needed? "resolved" if yes, "partial" if partly or with friction, "unresolved" if it failed, refused or the user gave up, "unclear" if you cannot tell.`

const schema = z.object({
  summary: z.string().min(3).max(300),
  task: z.string().min(2).max(80),
  language: z.string().min(2).max(40),
  outcome: z.enum(["resolved", "partial", "unresolved", "unclear"]).catch("unclear"),
})

export async function extractFacets(ref: ModelRef, c: Conversation): Promise<Facets> {
  const f = await ask(ref, SYSTEM, PROMPT(transcript(c)), schema)
  return { ...f, summary: f.summary.trim(), turns: c.messages.filter((m) => m.role === "user").length }
}

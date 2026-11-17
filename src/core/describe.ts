// Steps 3 and 4: name each cluster from its own summaries plus contrasting ones from nearby
// clusters, then group the clusters into a few top-level categories and name those.
// Step 5 lives here too: a privacy audit of every name and description before anyone sees it.

import { z } from "zod"
import { ask } from "./llm.ts"
import type { ModelRef } from "./llm.ts"

const named = z.object({ name: z.string().min(2).max(90), description: z.string().min(5).max(400) })

const RULES = `Names are short imperative phrases of at most 8 words, specific enough to tell this group apart from its neighbours, like "Debug failing SQL migrations" or "Draft replies to refund requests". Descriptions are two plain sentences. Never include names of people or organisations, numbers, places or anything that could identify someone.`

export async function nameCluster(ref: ModelRef, inside: string[], outside: string[]) {
  return ask(
    ref,
    `You name groups of conversations people had with a company's AI assistant. ${RULES}`,
    `Summaries of conversations IN this group:
${inside.map((s) => `- ${s}`).join("\n")}

Summaries from NEARBY groups (for contrast, these are NOT in the group):
${outside.map((s) => `- ${s}`).join("\n") || "- (none)"}

Return {"name": "...", "description": "..."} for the group, capturing what its conversations share and what sets it apart from the nearby ones.`,
    named,
  )
}

export async function nameParent(ref: ModelRef, children: { name: string; description: string }[]) {
  return ask(
    ref,
    `You name broad categories that group related kinds of conversations with a company's AI assistant. Category names are 2 to 5 words, like "Software development" or "Customer communication". Descriptions are one plain sentence. Never include anything that could identify a person or organisation.`,
    `These groups belong to one category:
${children.map((c) => `- ${c.name}: ${c.description}`).join("\n")}

Return {"name": "...", "description": "..."} for the category.`,
    named,
  )
}

const audit = z.object({
  score: z.coerce.number().int().min(1).max(5),
  name: z.string().min(2).max(90),
  description: z.string().min(5).max(400),
})

/**
 * The paper's 1–5 privacy scale: 1 identifies a person, 5 is fully general. Anything under 4 is
 * rewritten by the model to be general, and the rewrite is what the map shows.
 */
export async function auditCluster(ref: ModelRef, c: { name: string; description: string }) {
  const r = await ask(
    ref,
    `You are a privacy reviewer. You check text that will be shown to analysts, and make sure it cannot identify any person, customer or organisation.`,
    `Text:
name: ${c.name}
description: ${c.description}

Score its privacy from 1 to 5:
1 = identifies a specific person or organisation
2 = contains details that could identify someone with little effort
3 = mostly general, with one or two overly specific details
4 = general, no identifying details
5 = completely general

If the score is below 4, rewrite the name and description to be general while keeping their meaning. Otherwise return them unchanged.
Return {"score": n, "name": "...", "description": "..."}.`,
    audit,
  )
  return r
}

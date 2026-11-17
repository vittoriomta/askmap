// Writes demo/example-map.json: an illustrative map of a company assistant, for the playground
// and screenshots. Hand-written example data, not the output of a run, and labelled as such.
// Usage: node demo/example-map.mjs

import { writeFileSync } from "node:fs"

const CATS = {
  "IT and access": [
    ["Reset VPN and two-factor access", 96, 0.46, ["Asked how to regain VPN access after a phone change", "Wanted to reset two-factor authentication on a new laptop", "Asked why the VPN client rejects their login"]],
    ["Set up laptops and accounts", 64, 0.22, ["Asked which software to install on a new laptop", "Wanted access to a shared drive for a new team"]],
    ["Fix email and calendar sync", 41, 0.31, ["Asked why meetings don't appear on their phone", "Wanted to recover deleted calendar invites"]],
  ],
  "People and HR": [
    ["Explain leave and holiday policy", 88, 0.12, ["Asked how many holiday days carry over to next year", "Wanted to know how parental leave is calculated"]],
    ["Draft job descriptions", 47, 0.08, ["Asked for a job description for a data analyst role", "Wanted a shorter version of an existing posting"]],
    ["Prepare performance reviews", 39, 0.18, ["Asked for help structuring feedback for a direct report", "Wanted examples of measurable goals"]],
  ],
  "Finance and expenses": [
    ["Check expense and travel rules", 72, 0.38, ["Asked whether a client dinner can be expensed", "Wanted the daily limit for travel in another country"]],
    ["Explain invoices and payments", 44, 0.27, ["Asked why a supplier invoice is still unpaid", "Wanted to understand a payment term on a contract"]],
  ],
  "Customers and sales": [
    ["Reply to customer complaints", 83, 0.19, ["Asked for a polite reply to a late-delivery complaint", "Wanted to soften the tone of a refusal"]],
    ["Summarize accounts before calls", 58, 0.14, ["Asked for a summary of an account before a renewal call", "Wanted the open issues for a customer in three bullets"]],
    ["Write sales follow-ups", 51, 0.1, ["Asked for a follow-up email after a demo", "Wanted a reminder that doesn't sound pushy"]],
  ],
  "Writing and documents": [
    ["Summarize long documents", 92, 0.09, ["Asked for a one-page summary of a policy document", "Wanted the key decisions from meeting notes"]],
    ["Translate internal documents", 57, 0.16, ["Asked to translate a procedure into Italian", "Wanted an English version of a supplier contract clause"]],
    ["Polish slides and reports", 46, 0.12, ["Asked to tighten the wording on a quarterly slide", "Wanted clearer headings for a report"]],
  ],
  "Data and reports": [
    ["Write spreadsheet formulas", 69, 0.24, ["Asked for a formula that sums sales by region", "Wanted to fix a lookup that returns errors"]],
    ["Query the sales database", 38, 0.42, ["Asked for SQL to list customers who churned last quarter", "Wanted to join orders with invoices by customer"]],
  ],
}

const LANGS = ["English", "Italian", "German", "Spanish", "French"]
let seed = 11
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const clusters = []
Object.entries(CATS).forEach(([name, kids], ci) => {
  const pid = `c${ci}`
  const children = kids.map(([kname, n, f, examples], j) => {
    const unresolved = Math.round(n * f * 0.7)
    const partial = Math.round(n * f * 0.6)
    const unclear = Math.round(n * 0.03)
    return {
      id: `${pid}.${j}`, name: kname, description: `People ask the assistant to ${kname.charAt(0).toLowerCase()}${kname.slice(1)}.`, level: 1, parent: pid,
      conversations: n, users: Math.round(n * (0.55 + rnd() * 0.25)), outcomes: { resolved: n - unresolved - partial - unclear, partial, unresolved, unclear },
      languages: LANGS.slice(0, 3).map((l, i) => ({ key: l, count: Math.round(n / (i + 1.6)) })), turns: Math.round((1.5 + rnd() * 3) * 10) / 10, examples,
    }
  })
  const sum = (k) => children.reduce((s, c) => s + c[k], 0)
  const out = (k) => children.reduce((s, c) => s + c.outcomes[k], 0)
  clusters.push({ id: pid, name, description: `Conversations about ${name.toLowerCase()}.`, level: 0, children: children.map((c) => c.id), conversations: sum("conversations"), users: sum("users"), outcomes: { resolved: out("resolved"), partial: out("partial"), unresolved: out("unresolved"), unclear: out("unclear") }, languages: [], turns: 2.4, examples: [] }, ...children)
})
const shown = clusters.filter((c) => c.level === 0).reduce((s, c) => s + c.conversations, 0)
const map = {
  version: 1, id: "example", createdAt: "2026-11-17T09:00:00.000Z", source: "Example data", format: "jsonl", model: "example", embedder: "Xenova/all-MiniLM-L6-v2",
  conversations: shown + 23, users: Math.round(shown * 0.62), clusters,
  privacy: { minUsers: 5, countsUsers: true, hiddenClusters: 3, hiddenConversations: 23, rewritten: 1 },
}
writeFileSync(new URL("./example-map.json", import.meta.url), JSON.stringify(map, null, 2))
console.log(`example map: ${clusters.length} clusters, ${map.conversations} conversations`)

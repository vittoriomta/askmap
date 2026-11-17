// Writes test/fixtures/synthetic.jsonl: 600 made-up conversations of a company assistant, with
// fake names, emails and order numbers, so tests can check none of them reach the map.
// Usage: node test/fixtures/make-synthetic.mjs

import { writeFileSync } from "node:fs"

const NAMES = ["Giulia Rossi", "Marco Bianchi", "Sofia Ferrari", "Luca Romano", "Anna Weber", "Tom Becker", "Lena Novak", "Omar Haddad"]
const ASKS = [
  ["My VPN stopped working after I changed phone, can you help? I'm {name}, {email}.", "Open the access portal and choose Reset two-factor."],
  ["Write a python function that merges two CSV files by customer id for {name}.", "Here is a function using pandas: merge on customer_id."],
  ["Fix this SQL error in my report query, ticket {num}.", "The GROUP BY is missing the region column."],
  ["Draft an email reply to a customer complaining about order {num} arriving late.", "Dear customer, we're sorry your order arrived late."],
  ["Translate this procedure into Italian for {name}'s team.", "Ecco la traduzione della procedura."],
  ["Summarize these meeting notes into five bullets, sent by {email}.", "Here are the five key decisions from the meeting."],
  ["Write a short fantasy story about a dragon for my kid.", "Once upon a time a small dragon lived in the hills."],
  ["Can I expense a client dinner of 140 euros? I'm {name}.", "Client dinners up to 150 euros per person can be expensed."],
  ["Solve this math problem: what is 15 percent of 2,340?", "15 percent of 2,340 is 351."],
  ["Plan a marketing strategy for our new product launch in Spain.", "Start with three channels and a launch week."],
]
let seed = 42
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const pick = (xs) => xs[Math.floor(rnd() * xs.length)]
const rows = []
for (let i = 0; i < 600; i++) {
  const [ask, answer] = ASKS[i % ASKS.length]
  const name = pick(NAMES)
  const fill = (s) => s.replace("{name}", name).replace("{email}", `${name.split(" ")[0].toLowerCase()}.${i}@example-corp.com`).replace("{num}", `#${48000 + i}`)
  rows.push({ id: `syn-${i}`, user: `user-${Math.floor(rnd() * 220)}`, messages: [{ role: "user", content: fill(ask) }, { role: "assistant", content: fill(answer) }] })
}
writeFileSync(new URL("./synthetic.jsonl", import.meta.url), rows.map((r) => JSON.stringify(r)).join("\n") + "\n")
console.log(`wrote ${rows.length} synthetic conversations`)

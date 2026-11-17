// A deterministic stand-in for a language model, for tests and offline demos: `--model fake`.
// It answers the four askmap prompts from keywords, instantly, with no network.

const TASKS: [RegExp, string][] = [
  [/\b(code|python|javascript|function|error|bug|sql|api|java|react|css|html|script|compile)\b/i, "Debug and write code"],
  [/\b(story|poem|character|fantasy|novel|roleplay|role-play|lyrics|scene)\b/i, "Write creative stories"],
  [/\b(translate|translation|traduc|übersetz)\b/i, "Translate text"],
  [/\b(email|letter|reply|message to|cover letter)\b/i, "Draft emails and letters"],
  [/\b(math|equation|solve|calculate|integral|probability|percent)\b/i, "Solve math problems"],
  [/\b(essay|summar|rewrite|paraphrase|article|grammar)\b/i, "Rewrite and summarize text"],
  [/\b(business|marketing|sales|market|strategy|product|customer)\b/i, "Plan business and marketing"],
  [/\b(health|diet|workout|symptom|doctor|sleep)\b/i, "Ask about health and fitness"],
]

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7) >>> 0

function language(t: string) {
  if (/[Ѐ-ӿ]/.test(t)) return "Russian"
  if (/[一-鿿]/.test(t)) return "Chinese"
  if (/[぀-ヿ]/.test(t)) return "Japanese"
  if (/\b(el|la|los|que|para|por favor)\b/i.test(t)) return "Spanish"
  if (/\b(il|che|per|grazie|ciao)\b/i.test(t)) return "Italian"
  return "English"
}

function facets(conversation: string) {
  const user = (conversation.match(/User: ([\s\S]*?)(\n\nAssistant:|$)/)?.[1] ?? conversation).slice(0, 600)
  const task = TASKS.find(([re]) => re.test(user))?.[1] ?? "Ask general questions"
  const outcomes = ["resolved", "resolved", "resolved", "partial", "unresolved", "unclear"]
  return {
    summary: `Asked the assistant to ${task.charAt(0).toLowerCase()}${task.slice(1)} for a personal or work task`,
    task,
    language: language(user),
    outcome: outcomes[hash(user) % outcomes.length],
  }
}

const most = (xs: string[]) => {
  const m = new Map<string, number>()
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "General questions"
}

export function fakeAnswer(prompt: string): unknown {
  if (prompt.includes("<conversation>")) return facets(prompt.split("<conversation>")[1] ?? "")
  if (prompt.includes("Summaries of conversations IN this group")) {
    const inside = prompt.split("Summaries from NEARBY")[0]
    const task = most([...inside.matchAll(/to ([a-z][a-z ]+?) for a/g)].map((m) => m[1]))
    const name = task.charAt(0).toUpperCase() + task.slice(1)
    return { name, description: `People ask the assistant to ${task}. Requests range from quick questions to longer sessions.` }
  }
  if (prompt.includes("These groups belong to one category")) {
    const first = prompt.match(/- ([^:\n]+):/)?.[1] ?? "General"
    return { name: first.split(" ").slice(-2).join(" ").replace(/^./, (c) => c.toUpperCase()), description: "Related kinds of requests." }
  }
  if (prompt.includes("Score its privacy")) {
    const name = prompt.match(/name: (.*)/)?.[1] ?? "Group"
    const description = prompt.match(/description: (.*)/)?.[1] ?? "Related requests."
    return { score: 5, name, description }
  }
  return {}
}

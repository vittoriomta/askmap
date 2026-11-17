// Sources: what askmap can read, and how to get each export. The one this map came from is marked.

import { fmtInt } from "./data"
import type { AskMap } from "./data"

const SOURCES: { id: string; name: string; how: string }[] = [
  { id: "chatgpt", name: "ChatGPT Enterprise", how: "Compliance API logs, or conversations.json" },
  { id: "claude", name: "Claude Enterprise", how: "Compliance API chats, or conversations.json" },
  { id: "copilot", name: "Microsoft Copilot", how: "Graph interaction export" },
  { id: "gemini", name: "Gemini", how: "Google Vault export" },
  { id: "otel", name: "OpenTelemetry", how: "GenAI spans from LiteLLM, Langfuse, Arize, Datadog" },
  { id: "jsonl", name: "JSONL", how: "One conversation per line, with messages" },
]

export function Sources({ map, onNew }: { map: AskMap; onNew?: () => void }) {
  return (
    <div className="scroll absolute inset-0 overflow-y-auto">
      <div className="rise mx-auto grid w-full max-w-[640px] gap-8 px-6 pt-6 pb-12">
        <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
          <div className="grid min-w-0 flex-1">
            <span className="truncate font-medium">{map.source}</span>
            <span className="tab text-[12px] text-muted-foreground">
              {fmtInt(map.conversations)} conversations{map.users ? ` · ${fmtInt(map.users)} people` : ""} · {new Date(map.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </span>
          </div>
          {onNew && <button type="button" onClick={onNew} className="h-7 rounded-md bg-foreground px-3 text-[12px] font-medium text-background active:scale-[.98]">
            New map
          </button>}
        </div>
        <ul className="grid">
          {SOURCES.map((s) => {
            const used = map.format === s.id
            return (
              <li key={s.id} className="grid grid-cols-[180px_1fr_auto] items-baseline gap-4 border-b py-3 last:border-0">
                <span className={used ? "font-medium" : ""}>{s.name}</span>
                <span className="text-muted-foreground">{s.how}</span>
                {used ? <span className="inline-flex items-center gap-1.5 text-[12px] text-brand"><i className="size-1.5 rounded-full bg-brand" />In use</span> : <span />}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

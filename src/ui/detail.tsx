// One cluster, only what you need to decide: what it is, how big, how well it goes, what people ask.

import { X } from "lucide-react"
import { fmtInt, fmtPct, friction, OUTCOME_LABEL, pct } from "./data"
import type { AskMap, Cluster, Outcome } from "./data"

const ORDER: Outcome[] = ["resolved", "partial", "unresolved", "unclear"]
const TONE: Record<Outcome, string> = {
  resolved: "color-mix(in srgb, var(--foreground) 50%, transparent)",
  partial: "color-mix(in srgb, var(--brand) 45%, var(--card))",
  unresolved: "var(--brand)",
  unclear: "transparent",
}

export function Detail({ map, cluster: c, onClose, onSelect }: { map: AskMap; cluster: Cluster; onClose: () => void; onSelect: (id: string) => void }) {
  const parent = c.parent ? map.clusters.find((x) => x.id === c.parent) : undefined
  const children = c.children ? map.clusters.filter((x) => x.parent === c.id).sort((a, b) => b.conversations - a.conversations) : []
  const f = friction(c)

  return (
    <aside className="slide scroll flex w-[320px] shrink-0 flex-col gap-6 overflow-y-auto border-l bg-background px-5 py-4 [&>*]:shrink-0">
      <div className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1 gap-0.5">
          {parent && (
            <button type="button" onClick={() => onSelect(parent.id)} className="truncate text-left text-[11px] text-muted-foreground hover:text-foreground">
              {parent.name}
            </button>
          )}
          <h2 className="text-[15px] leading-snug" title={c.description}>
            {c.name}
          </h2>
          <p className="tab text-[12px] text-muted-foreground">
            {fmtPct(pct(c.conversations, map.conversations))} · {fmtInt(c.conversations)} chats{map.privacy.countsUsers ? ` · ${fmtInt(c.users)} people` : ""}
          </p>
        </div>
        <button type="button" onClick={onClose} title="Close  Esc" className="-mt-0.5 -mr-1.5 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>

      <div className="grid gap-1.5">
        <div className="flex h-1 overflow-hidden rounded-full bg-accent">
          {ORDER.map((o) => (
            <span key={o} title={`${OUTCOME_LABEL[o]} ${fmtPct(pct(c.outcomes[o], c.conversations))}`} style={{ width: `${pct(c.outcomes[o], c.conversations)}%`, background: TONE[o] }} />
          ))}
        </div>
        <span className={`tab text-[12px] ${f >= 0.3 ? "text-brand" : "text-muted-foreground"}`}>{fmtPct(f * 100)} friction</span>
      </div>

      {c.examples.length > 0 && (
        <ul className="grid gap-3">
          {c.examples.slice(0, 3).map((e, i) => (
            <li key={i} className="text-[13px] leading-relaxed text-foreground/80">
              {e}
            </li>
          ))}
        </ul>
      )}

      {children.length > 0 && (
        <ul className="-mx-1.5 grid">
          {children.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => onSelect(x.id)} className="tab flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-[13px] hover:bg-accent">
                <span className="min-w-0 flex-1 truncate">{x.name}</span>
                <span className="text-[12px] text-muted-foreground">{fmtPct(pct(x.conversations, map.conversations))}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

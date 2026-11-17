// Topics: every category and its clusters as a list, sortable by share or friction.

import { Search } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { ColorMode } from "./app"
import { fmtInt, fmtPct, friction, pct } from "./data"
import type { AskMap } from "./data"
import { AllHidden } from "./map"
import { Bar, Kbd, Segmented } from "./ui"

type Sort = "share" | "friction"

export function Topics({ map, color, selected, onSelect }: { map: AskMap; color: ColorMode; selected: string | null; onSelect: (id: string | null) => void }) {
  const [q, setQ] = useState("")
  const [sort, setSort] = useState<Sort>(color === "outcome" ? "friction" : "share")
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => setSort(color === "outcome" ? "friction" : "share"), [color])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== input.current) {
        e.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const key = (c: { conversations: number; outcomes: AskMap["clusters"][number]["outcomes"] }) => (sort === "share" ? c.conversations : friction(c))
    return map.clusters
      .filter((c) => c.level === 0)
      .map((cat) => ({
        cat,
        items: map.clusters
          .filter((c) => c.parent === cat.id && (!needle || `${c.name} ${c.description} ${cat.name}`.toLowerCase().includes(needle)))
          .sort((a, b) => key(b) - key(a)),
      }))
      .filter((g) => g.items.length)
      .sort((a, b) => key(b.cat) - key(a.cat))
  }, [map, q, sort])

  const max = Math.max(1, ...map.clusters.filter((c) => c.level === 1).map((c) => c.conversations))
  if (!map.clusters.some((c) => c.level === 1)) return <AllHidden map={map} />

  return (
    <div className="scroll absolute inset-0 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-[760px] gap-7 px-6 pt-5 pb-12">
        <div className="flex items-center gap-3">
          <label className="relative mr-auto flex items-center">
            <Search className="absolute left-0 size-3.5 text-muted-foreground" />
            <input
              ref={input}
              placeholder="Search topics"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && (setQ(""), e.currentTarget.blur())}
              className="h-7 w-64 bg-transparent pl-5 text-[13px] outline-none placeholder:text-muted-foreground"
              spellCheck={false}
              autoComplete="off"
            />
            {!q && <span className="pointer-events-none absolute right-0"><Kbd>/</Kbd></span>}
          </label>
          <Segmented
            value={sort}
            onChange={setSort}
            options={[
              { value: "share", label: "Share" },
              { value: "friction", label: "Friction" },
            ]}
          />
        </div>

        {groups.map(({ cat, items }, gi) => (
          <section key={cat.id} className="rise grid" style={{ animationDelay: `${gi * 30}ms` }}>
            <button type="button" onClick={() => onSelect(cat.id)} className="flex items-baseline gap-2 border-b pb-2 text-left">
              <h2 className="text-[13px] font-medium">{cat.name}</h2>
              <span className="tab ml-auto text-[12px] text-muted-foreground">
                {fmtPct(pct(cat.conversations, map.conversations))} · {fmtInt(cat.conversations)}
              </span>
            </button>
            <ul className="grid">
              {items.map((c) => {
                const f = friction(c)
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(selected === c.id ? null : c.id)}
                      className={`tab -mx-2 grid h-9 w-[calc(100%+16px)] grid-cols-[minmax(0,1fr)_96px_44px_64px] items-center gap-4 rounded-md px-2 text-left transition-colors ${selected === c.id ? "bg-accent" : "hover:bg-accent/60"}`}
                    >
                      <span className="truncate">{c.name}</span>
                      <Bar value={c.conversations / max} />
                      <span className="text-right text-muted-foreground">{fmtPct(pct(c.conversations, map.conversations))}</span>
                      <span className={`text-right text-[12px] ${f >= 0.3 ? "font-medium text-brand" : "text-muted-foreground"}`} title="Unresolved, plus half of partly resolved">
                        {fmtPct(f * 100)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}

        {!groups.length && <p className="py-16 text-center text-muted-foreground">No topic matches "{q}".</p>}
      </div>
    </div>
  )
}

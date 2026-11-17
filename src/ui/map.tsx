// The map: categories as soft circles, clusters packed inside, area = conversations.
// Click a category to zoom in, a cluster to open it, the background (or Esc) to step back.

import { hierarchy, pack } from "d3-hierarchy"
import type { HierarchyCircularNode } from "d3-hierarchy"
import { useEffect, useMemo, useRef, useState } from "react"
import type { ColorMode } from "./app"
import { fmtInt, fmtPct, friction, pct } from "./data"
import type { AskMap, Cluster } from "./data"
import { HUES } from "./ui"

type Datum = { id: string; cluster?: Cluster; value?: number; children?: Datum[] }
type Node = HierarchyCircularNode<Datum>

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

/** The top arc of a circle, left to right, for a label that follows the edge. */
const arc = (x: number, y: number, r: number) => {
  const a0 = (200 * Math.PI) / 180
  const a1 = (340 * Math.PI) / 180
  return `M ${x + r * Math.cos(a0)} ${y + r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${x + r * Math.cos(a1)} ${y + r * Math.sin(a1)}`
}

export function MapView({ map, color, selected, onSelect, focus, onFocus }: { map: AskMap; color: ColorMode; selected: string | null; onSelect: (id: string | null) => void; focus: string | null; onFocus: (id: string | null) => void }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>()
  const [hover, setHover] = useState<{ node: Node; x: number; y: number } | null>(null)

  const cats = useMemo(() => map.clusters.filter((c) => c.level === 0).sort((a, b) => b.conversations - a.conversations), [map])
  const hueOf = useMemo(() => new Map(cats.map((c, i) => [c.id, HUES[i % HUES.length]])), [cats])

  const root = useMemo(() => {
    if (!w || !h) return null
    const data: Datum = {
      id: "root",
      children: cats.map((c) => ({
        id: c.id,
        cluster: c,
        children: map.clusters.filter((x) => x.parent === c.id).map((x) => ({ id: x.id, cluster: x, value: x.conversations })),
      })),
    }
    const s = Math.min(w, h) - 48
    return pack<Datum>()
      .size([s, s])
      .padding((d) => (d.depth === 0 ? 22 : 3))(hierarchy(data).sum((d) => d.value ?? 0).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)))
  }, [w, h, cats, map])

  if (!cats.length) return <AllHidden map={map} />
  if (!root) return <div ref={ref} className="absolute inset-0" />

  const s = Math.min(w, h) - 48
  const ox = (w - s) / 2
  const oy = (h - s) / 2
  const focused = focus ? root.descendants().find((n) => n.data.id === focus) : undefined
  const k = focused ? s / (focused.r * 2 * 1.06) : 1
  const tx = focused ? s / 2 - focused.x * k : 0
  const ty = focused ? s / 2 - focused.y * k : 0
  const total = map.conversations

  const fillOf = (n: Node) => {
    const c = n.data.cluster!
    if (color === "outcome") {
      // Neutral at no friction, full accent from about half the conversations failing.
      const f = Math.min(1, friction(c) / 0.5)
      return `color-mix(in srgb, var(--brand) ${Math.round(6 + Math.pow(f, 0.8) * 94)}%, var(--muted))`
    }
    return `color-mix(in srgb, ${hueOf.get(c.parent ?? c.id)} 26%, var(--card))`
  }

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden" onPointerLeave={() => setHover(null)}>
      <svg width={w} height={h} className="block" onClick={() => (selected ? onSelect(null) : onFocus(null))}>
        <g transform={`translate(${ox} ${oy})`}>
          <g style={{ transform: `translate(${tx}px, ${ty}px) scale(${k})`, transformOrigin: "0 0", transition: "transform .55s cubic-bezier(.2,.8,.2,1)" }}>
            {root.children?.map((cat) => {
              const dim = focus && focus !== cat.data.id
              return (
                <g key={cat.data.id} style={{ opacity: dim ? 0.25 : 1, transition: "opacity .3s" }}>
                  <circle
                    cx={cat.x}
                    cy={cat.y}
                    r={cat.r}
                    fill="var(--card)"
                    stroke="var(--border)"
                    strokeWidth={1 / k}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelect(null)
                      onFocus(focus === cat.data.id ? null : cat.data.id)
                    }}
                  />
                  {cat.children?.map((n) => {
                    const on = selected === n.data.id
                    const shown = n.r * k > 30
                    return (
                      <g key={n.data.id}>
                        <circle
                          cx={n.x}
                          cy={n.y}
                          r={n.r}
                          fill={fillOf(n)}
                          stroke={on ? "var(--brand)" : "transparent"}
                          strokeWidth={2 / k}
                          className="transition-[fill] duration-300"
                          style={{ cursor: "default" }}
                          onPointerMove={(e) => setHover({ node: n, x: e.clientX, y: e.clientY })}
                          onPointerLeave={() => setHover(null)}
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelect(on ? null : n.data.id)
                          }}
                        />
                        {shown && (
                          <foreignObject x={n.x - n.r * 0.82} y={n.y - n.r * 0.5} width={n.r * 1.64} height={n.r} pointerEvents="none">
                            <div
                              className="flex h-full items-center justify-center text-center leading-[1.2] text-foreground/85"
                              style={{ fontSize: Math.min(13, Math.max(9, n.r * k * 0.16)) / k }}
                            >
                              <span className="line-clamp-3">{n.data.cluster!.name}</span>
                            </div>
                          </foreignObject>
                        )}
                      </g>
                    )
                  })}
                  {!focus && cat.r > 36 && (
                    <>
                      <path id={`arc-${cat.data.id}`} d={arc(cat.x, cat.y, cat.r + 5)} fill="none" />
                      <text pointerEvents="none" className="fill-muted-foreground text-[11px] font-medium" style={{ letterSpacing: "0.01em" }}>
                        <textPath href={`#arc-${cat.data.id}`} startOffset="50%" textAnchor="middle">
                          {cat.data.cluster!.name}
                        </textPath>
                      </text>
                    </>
                  )}
                </g>
              )
            })}
          </g>
        </g>
      </svg>

      {hover && (
        <div
          className="pointer-events-none fixed z-10 max-w-64 rounded-md border bg-card px-2.5 py-1.5 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.25)]"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          <div className="text-[12px] font-medium leading-snug">{hover.node.data.cluster!.name}</div>
          <div className="tab text-[11px] text-muted-foreground">
            {fmtPct(pct(hover.node.data.cluster!.conversations, total))} · {fmtInt(hover.node.data.cluster!.conversations)} conversations
            {color === "outcome" && ` · ${fmtPct(friction(hover.node.data.cluster!) * 100)} friction`}
          </div>
        </div>
      )}

    </div>
  )
}

/** Every cluster was smaller than the privacy threshold: say so instead of drawing nothing. */
export function AllHidden({ map }: { map: AskMap }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="rise grid max-w-72 gap-1.5 text-center">
        <h2 className="text-[13px] font-medium">Every group is too small to show</h2>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          No topic reached {map.privacy.minUsers} {map.privacy.countsUsers ? "people" : "conversations"}. Add more conversations to see the map.
        </p>
      </div>
    </div>
  )
}

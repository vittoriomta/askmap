// Exports. Excel: a tidy workbook (Topics, Categories, About). PDF: a print-only report the
// browser saves as PDF, so it stays vector and uses the same type as the app.

import { hierarchy, pack } from "d3-hierarchy"
import { fmtInt, fmtPct, friction, pct } from "./data"
import type { AskMap, Cluster } from "./data"
import { HUES } from "./ui"

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
const fileBase = (map: AskMap) => `askmap-${map.source.replace(/\.[a-z]+$/i, "").replace(/[^\w-]+/g, "-")}-${map.createdAt.slice(0, 10)}`

// ── Excel ──────────────────────────────────────────────────────────────────

export async function exportExcel(map: AskMap) {
  const { default: ExcelJS } = await import("exceljs")
  const wb = new ExcelJS.Workbook()
  wb.creator = "askmap"
  wb.created = new Date(map.createdAt)
  const head = { font: { bold: true, color: { argb: "FF1D1F1C" } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0ED" } } as const, border: { bottom: { style: "thin", color: { argb: "FFE4E4E0" } } } as const }
  const cats = map.clusters.filter((c) => c.level === 0).sort((a, b) => b.conversations - a.conversations)
  const kids = (id: string) => map.clusters.filter((c) => c.parent === id).sort((a, b) => b.conversations - a.conversations)
  const row = (c: Cluster) => ({
    share: pct(c.conversations, map.conversations) / 100,
    conversations: c.conversations,
    people: c.users,
    friction: friction(c),
    resolved: c.outcomes.resolved,
    partial: c.outcomes.partial,
    unresolved: c.outcomes.unresolved,
    unclear: c.outcomes.unclear,
  })

  const topics = wb.addWorksheet("Topics", { views: [{ state: "frozen", ySplit: 1 }] })
  topics.columns = [
    { header: "Category", key: "category", width: 26 },
    { header: "Topic", key: "topic", width: 44 },
    { header: "Share", key: "share", width: 9, style: { numFmt: "0.0%" } },
    { header: "Conversations", key: "conversations", width: 14 },
    { header: "People", key: "people", width: 9 },
    { header: "Friction", key: "friction", width: 9, style: { numFmt: "0%" } },
    { header: "Resolved", key: "resolved", width: 10 },
    { header: "Partly", key: "partial", width: 9 },
    { header: "Unresolved", key: "unresolved", width: 11 },
    { header: "Unclear", key: "unclear", width: 9 },
    { header: "Description", key: "description", width: 70 },
  ]
  for (const cat of cats) for (const c of kids(cat.id)) topics.addRow({ category: cat.name, topic: c.name, description: c.description, ...row(c) })

  const categories = wb.addWorksheet("Categories", { views: [{ state: "frozen", ySplit: 1 }] })
  categories.columns = [
    { header: "Category", key: "category", width: 30 },
    { header: "Share", key: "share", width: 9, style: { numFmt: "0.0%" } },
    { header: "Conversations", key: "conversations", width: 14 },
    { header: "People", key: "people", width: 9 },
    { header: "Friction", key: "friction", width: 9, style: { numFmt: "0%" } },
    { header: "Topics", key: "topics", width: 8 },
    { header: "Description", key: "description", width: 70 },
  ]
  for (const cat of cats) categories.addRow({ category: cat.name, description: cat.description, topics: kids(cat.id).length, ...row(cat) })

  const about = wb.addWorksheet("About")
  about.columns = [
    { header: "", key: "k", width: 26 },
    { header: "", key: "v", width: 60 },
  ]
  for (const [k, v] of [
    ["Source", map.source],
    ["Format", map.format],
    ["Created", day(map.createdAt)],
    ["Conversations", map.conversations],
    ["People", map.users || "not in the export"],
    ["Model", map.model],
    ["Embeddings", map.embedder],
    ["Smallest cluster shown", `${map.privacy.minUsers} ${map.privacy.countsUsers ? "people" : "conversations"}`],
    ["Clusters held back", `${map.privacy.hiddenClusters} (${map.privacy.hiddenConversations} conversations)`],
    ["Friction", "Unresolved conversations, plus half of the partly resolved ones"],
  ] as [string, string | number][])
    about.addRow({ k, v })
  about.getColumn("k").font = { color: { argb: "FF6F716C" } }
  about.spliceRows(1, 1)

  for (const ws of [topics, categories])
    ws.getRow(1).eachCell((cell) => {
      cell.font = head.font
      cell.fill = head.fill
      cell.border = head.border
    })
  for (const ws of [topics, categories, about]) ws.eachRow((r) => (r.alignment = { vertical: "top", wrapText: false }))

  const buf = await wb.xlsx.writeBuffer()
  download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${fileBase(map)}.xlsx`)
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// ── PDF (print) ────────────────────────────────────────────────────────────

export function exportPdf(map: AskMap) {
  const title = document.title
  document.title = fileBase(map)
  window.print()
  document.title = title
}

/** A static map for the report: same packing as the app, topic colours, no interaction. */
function StaticMap({ map, size }: { map: AskMap; size: number }) {
  const cats = map.clusters.filter((c) => c.level === 0).sort((a, b) => b.conversations - a.conversations)
  const hue = new Map(cats.map((c, i) => [c.id, HUES[i % HUES.length]]))
  type D = { id: string; value?: number; children?: D[] }
  const data: D = { id: "root", children: cats.map((c) => ({ id: c.id, children: map.clusters.filter((x) => x.parent === c.id).map((x) => ({ id: x.id, value: x.conversations })) })) }
  const root = pack<D>()
    .size([size, size])
    .padding((d) => (d.depth === 0 ? 10 : 2))(
    hierarchy(data)
      .sum((d) => d.value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
  )
  const byId = new Map(map.clusters.map((c) => [c.id, c]))
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {root.children?.map((cat) => (
        <g key={cat.data.id}>
          <circle cx={cat.x} cy={cat.y} r={cat.r} fill="none" stroke="#e4e4e0" />
          {cat.children?.map((n) => (
            <circle key={n.data.id} cx={n.x} cy={n.y} r={n.r} fill={`color-mix(in srgb, ${hue.get(cat.data.id)} 28%, white)`} />
          ))}
          {cat.r > 30 && (
            <text x={cat.x} y={cat.y + 3} textAnchor="middle" fontSize="8" fontWeight="600" fill="#1d1f1c">
              {byId.get(cat.data.id)!.name}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}

export function Report({ map }: { map: AskMap }) {
  const cats = map.clusters.filter((c) => c.level === 0).sort((a, b) => b.conversations - a.conversations)
  const topics = map.clusters.filter((c) => c.level === 1)
  const minSize = Math.max(5, Math.round(map.conversations * 0.01))
  const struggles = topics.filter((c) => c.conversations >= minSize).sort((a, b) => friction(b) - friction(a)).slice(0, 5)
  return (
    <div className="report">
      <header className="flex items-baseline justify-between border-b pb-3">
        <div className="grid gap-0.5">
          <span className="text-[10px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">askmap</span>
          <h1 className="text-[20px]">{map.source}</h1>
        </div>
        <span className="tab text-[11px] text-muted-foreground">
          {day(map.createdAt)} · {fmtInt(map.conversations)} conversations{map.users ? ` · ${fmtInt(map.users)} people` : ""} · {map.model}
        </span>
      </header>

      <section className="grid grid-cols-[300px_1fr] gap-8 pt-6">
        <StaticMap map={map} size={300} />
        <div className="grid content-start gap-2">
          <h2 className="text-[12px] font-semibold">Where it struggles</h2>
          {struggles.map((c) => (
            <div key={c.id} className="tab grid grid-cols-[1fr_auto] gap-3 border-b py-1.5 text-[11px]">
              <span>{c.name}</span>
              <span className="font-medium text-brand">{fmtPct(friction(c) * 100)}</span>
            </div>
          ))}
          <p className="pt-1 text-[10px] text-muted-foreground">Friction: unresolved conversations, plus half of the partly resolved ones.</p>
        </div>
      </section>

      <section className="grid gap-5 pt-8">
        {cats.map((cat) => (
          <div key={cat.id} className="report-group grid">
            <div className="tab flex items-baseline justify-between border-b pb-1.5">
              <h2 className="text-[12px] font-semibold">{cat.name}</h2>
              <span className="text-[11px] text-muted-foreground">
                {fmtPct(pct(cat.conversations, map.conversations))} · {fmtInt(cat.conversations)}
              </span>
            </div>
            {map.clusters
              .filter((c) => c.parent === cat.id)
              .sort((a, b) => b.conversations - a.conversations)
              .map((c) => (
                <div key={c.id} className="tab grid grid-cols-[1fr_56px_56px] gap-3 border-b py-1.5 text-[11px] last:border-0">
                  <span>{c.name}</span>
                  <span className="text-right text-muted-foreground">{fmtPct(pct(c.conversations, map.conversations))}</span>
                  <span className={`text-right ${friction(c) >= 0.3 ? "text-brand" : "text-muted-foreground"}`}>{fmtPct(friction(c) * 100)}</span>
                </div>
              ))}
          </div>
        ))}
      </section>

      <footer className="pt-8 text-[10px] leading-relaxed text-muted-foreground">
        Summaries and counts only. Clusters smaller than {map.privacy.minUsers} {map.privacy.countsUsers ? "people" : "conversations"} are not shown ({map.privacy.hiddenClusters} held back), and every name was checked for identifying details.
      </footer>
    </div>
  )
}

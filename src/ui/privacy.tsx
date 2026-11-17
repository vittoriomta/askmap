// Privacy: what the map contains, what was held back, and where the text went to be read.

import { fmtInt } from "./data"
import type { AskMap } from "./data"
import { SectionTitle } from "./ui"

const LOCAL = /^(ollama:|compat:|fake$)/

export function Privacy({ map }: { map: AskMap }) {
  const p = map.privacy
  const local = LOCAL.test(map.model)
  const rows: [string, string][] = [
    ["Smallest cluster shown", `${p.minUsers} ${p.countsUsers ? "different people" : "conversations"}`],
    ["Clusters held back", `${fmtInt(p.hiddenClusters)} (${fmtInt(p.hiddenConversations)} conversations)`],
    ["Names rewritten by the audit", fmtInt(p.rewritten)],
  ]
  const models: [string, string][] = [
    ["Reading and naming", `${map.model}${local ? " · on this machine" : " · sent to the provider"}`],
    ["Embeddings", `${map.embedder.split("/").pop()} · on this machine`],
    ["Map file", `.askmap/maps/${map.id} · summaries and counts only`],
  ]
  return (
    <div className="scroll absolute inset-0 overflow-y-auto">
      <div className="rise mx-auto grid w-full max-w-[640px] gap-8 px-6 pt-6 pb-12">
        <p className="text-[15px] leading-relaxed">
          Nobody reads a conversation. A model reads each one and keeps only a general summary, clusters too small to hide a person are left out, and every name is audited before it is shown.
        </p>
        <Table title="Thresholds" rows={rows} />
        <Table title="Where the text went" rows={models} />
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Method after Anthropic's <a className="underline decoration-border underline-offset-2 hover:text-foreground" href="https://www.anthropic.com/research/clio" target="_blank" rel="noreferrer">Clio</a>. Raw conversations never leave your file.
        </p>
      </div>
    </div>
  )
}

function Table({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <section className="grid">
      <SectionTitle>{title}</SectionTitle>
      <dl className="grid">
        {rows.map(([k, v]) => (
          <div key={k} className="tab grid grid-cols-[200px_1fr] gap-4 border-b py-2.5 last:border-0">
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

// The Map file, shared types (re-exported from core) and small formatting helpers.

import type { AskMap, Cluster, Outcome } from "../core/types"

export type { AskMap, Cluster, Outcome }

export type MapEntry = Pick<AskMap, "id" | "source" | "format" | "createdAt" | "conversations" | "users">

// Without the local server (a static host, like the playground on a website) askmap shows a
// bundled example map, read-only.
let example: AskMap | null = null
export const isStatic = () => !!example

const json = async <T,>(res: Response | null): Promise<T | null> => {
  if (!res?.ok || !res.headers.get("content-type")?.includes("json")) return null
  return (await res.json()) as T
}

export async function loadMap(id?: string): Promise<AskMap | null> {
  if (example) return example
  return json<AskMap>(await fetch(`./api/map${id ? `?id=${encodeURIComponent(id)}` : ""}`, { cache: "no-store" }).catch(() => null))
}

export async function loadMaps(): Promise<MapEntry[]> {
  const list = await json<MapEntry[]>(await fetch("./api/maps", { cache: "no-store" }).catch(() => null))
  if (list) return list
  example = await json<AskMap>(await fetch("./example-map.json").catch(() => null))
  return example ? [{ id: example.id, source: example.source, format: example.format, createdAt: example.createdAt, conversations: example.conversations, users: example.users }] : []
}

export const deleteMap = (id: string) => fetch(`./api/maps?id=${encodeURIComponent(id)}`, { method: "DELETE" })

export const pct = (n: number, d: number) => (d ? (n / d) * 100 : 0)
export const fmtPct = (v: number) => (v >= 10 ? `${Math.round(v)}%` : v >= 1 ? `${v.toFixed(1)}%` : v > 0 ? "<1%" : "0%")
export const fmtInt = (n: number) => n.toLocaleString("en-US")

/** Share of conversations where the assistant didn't fully deliver: unresolved counts fully, partial half. */
export const friction = (c: Pick<Cluster, "outcomes" | "conversations">) =>
  c.conversations ? (c.outcomes.unresolved + c.outcomes.partial * 0.5) / c.conversations : 0

export const OUTCOME_LABEL: Record<Outcome, string> = {
  resolved: "Resolved",
  partial: "Partly",
  unresolved: "Unresolved",
  unclear: "Unclear",
}

export function byId(map: AskMap) {
  return new Map(map.clusters.map((c) => [c.id, c]))
}

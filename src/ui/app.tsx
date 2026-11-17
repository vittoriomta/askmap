import { ChevronRight, Download, Inbox, List, Map as MapIcon, Plus, ShieldCheck, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { byId, deleteMap, fmtInt, isStatic, loadMap, loadMaps } from "./data"
import type { AskMap, MapEntry } from "./data"
import { Detail } from "./detail"
import { exportExcel, exportPdf, Report } from "./export"
import { MapView } from "./map"
import { Privacy } from "./privacy"
import { Setup } from "./setup"
import { Sources } from "./sources"
import { Topics } from "./topics"
import { Segmented } from "./ui"

type View = "map" | "topics" | "privacy" | "sources"
export type ColorMode = "topic" | "outcome"

const VIEWS: { id: View; label: string; icon: ReactNode; key: string }[] = [
  { id: "map", label: "Map", icon: <MapIcon />, key: "1" },
  { id: "topics", label: "Topics", icon: <List />, key: "2" },
  { id: "privacy", label: "Privacy", icon: <ShieldCheck />, key: "3" },
  { id: "sources", label: "Sources", icon: <Inbox />, key: "4" },
]

const read = <T extends string>(k: string, d: T): T => {
  try {
    return (localStorage.getItem(`askmap:${k}`) as T) ?? d
  } catch {
    return d
  }
}
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(`askmap:${k}`, v)
  } catch {
    // private mode
  }
}

/** Today, Yesterday, This week, Earlier: how supersim groups its history. */
const DAY = 86400000
const groupOf = (iso: string) => {
  const t = new Date(iso).getTime()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = today.getTime()
  return t >= d ? "Today" : t >= d - DAY ? "Yesterday" : t >= d - 7 * DAY ? "This week" : "Earlier"
}
const when = (iso: string) => {
  const d = new Date(iso)
  return groupOf(iso) === "Today" || groupOf(iso) === "Yesterday"
    ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

export function App() {
  const [maps, setMaps] = useState<MapEntry[] | null>(null)
  const [map, setMap] = useState<AskMap | null>(null)
  const [creating, setCreating] = useState(false)
  const [view, setView] = useState<View>(() => read("view", "map"))
  const [color, setColor] = useState<ColorMode>(() => read("color", "topic"))
  const [selected, setSelected] = useState<string | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [open, setOpen] = useState(() => read("maps-open", "1") === "1")
  const [confirm, setConfirm] = useState<string | null>(null)
  const confirmTimer = useRef(0)
  const clusters = useMemo(() => (map ? byId(map) : new Map()), [map])

  const openMap = useCallback(async (id?: string) => {
    const m = await loadMap(id)
    setMap(m)
    setSelected(null)
    setFocus(null)
    setCreating(false)
    if (m) write("map", m.id)
  }, [])

  const refresh = useCallback(async (id?: string) => {
    const list = await loadMaps()
    setMaps(list)
    const remembered = read("map", "")
    const target = id ?? (list.some((m) => m.id === remembered) ? remembered : list[0]?.id)
    if (target) await openMap(target)
    else setMap(null)
    return list
  }, [openMap])

  useEffect(() => void refresh(), [refresh])
  useEffect(() => write("view", view), [view])
  useEffect(() => write("color", color), [color])
  useEffect(() => write("maps-open", open ? "1" : "0"), [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target instanceof Element && e.target.closest("input, textarea, select"))) return
      if (creating) {
        if (e.key === "Escape" && map) setCreating(false)
        return
      }
      const v = VIEWS.find((x) => x.key === e.key)
      if (v) return setView(v.id)
      if (e.key === "n" && !isStatic()) return setCreating(true)
      if (e.key === "t") return setColor((c) => (c === "topic" ? "outcome" : "topic"))
      if (e.key === "Escape") {
        if (selected) setSelected(null)
        else if (focus) setFocus(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selected, focus, creating, map])

  const done = async (id?: string) => {
    await refresh(id)
    setView("map")
  }

  const remove = async (id: string) => {
    if (confirm !== id) {
      setConfirm(id)
      window.clearTimeout(confirmTimer.current)
      confirmTimer.current = window.setTimeout(() => setConfirm(null), 4000)
      return
    }
    setConfirm(null)
    await deleteMap(id)
    const list = await loadMaps()
    setMaps(list)
    if (map?.id === id) {
      if (list[0]) await openMap(list[0].id)
      else setMap(null)
    }
  }

  if (maps === null) return <div className="h-full" />
  // First run: nothing saved yet, the whole window is the start screen.
  if (!maps.length) return <Setup first onDone={done} />

  const sel = selected ? clusters.get(selected) : undefined
  const groups = [...new Set(maps.map((m) => groupOf(m.createdAt)))].map((g) => ({ g, items: maps.filter((m) => groupOf(m.createdAt) === g) }))

  return (
    <>
      <div className="app-root flex h-full overflow-hidden">
        <aside className="flex w-[232px] shrink-0 flex-col border-r bg-sidebar">
          <div className="flex h-[52px] items-center gap-2 px-4">
            <img src="./mark.svg" alt="" className="size-[18px] rounded-[5px]" />
            <span className="text-[13px] font-semibold tracking-[-0.01em]">askmap</span>
          </div>
          <nav className="grid gap-px px-2">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => (setView(v.id), setCreating(false))}
                className={`flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors [&_svg]:size-4 [&_svg]:stroke-[1.75] ${
                  view === v.id && !creating ? "bg-sidebar-accent font-medium" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                }`}
              >
                {v.icon}
                {v.label}
                <span className="ml-auto text-[11px] text-faint">{v.key}</span>
              </button>
            ))}
          </nav>

          <div className="mt-5 flex min-h-0 flex-1 flex-col">
            <div className="group/maps flex h-7 items-center px-4">
              <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
                Maps
                <ChevronRight className={`size-3 transition-transform ${open ? "rotate-90 opacity-0 group-hover/maps:opacity-100" : ""}`} />
              </button>
              {!isStatic() && <button
                type="button"
                onClick={() => setCreating(true)}
                title="New map  N"
                className={`ml-auto grid size-6 place-items-center rounded-md transition-colors ${creating ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"}`}
              >
                <Plus className="size-3.5" />
              </button>}
            </div>
            {open && (
              <div className="scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {groups.map(({ g, items }) => (
                  <div key={g} className="grid gap-px pt-2 first:pt-0">
                    {groups.length > 1 && <div className="px-2.5 pb-0.5 text-[11px] text-faint">{g}</div>}
                    {items.map((m) => {
                      const active = m.id === map?.id && !creating
                      const arming = confirm === m.id
                      return (
                        <div key={m.id} className={`group/row relative flex h-8 min-w-0 items-center rounded-md transition-colors ${arming ? "bg-brand-soft" : active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"}`}>
                          <button type="button" onClick={() => (openMap(m.id), setView((v) => v))} className="flex min-w-0 flex-1 items-center gap-2 px-2.5 text-left" title={`${m.source} · ${fmtInt(m.conversations)} conversations`}>
                            <span className={`min-w-0 truncate text-[13px] ${arming ? "text-brand" : active ? "text-foreground" : "text-muted-foreground group-hover/row:text-foreground"}`}>{arming ? "Delete this map?" : m.source}</span>
                            {!arming && <span className="tab ml-auto shrink-0 text-[11px] text-faint group-hover/row:hidden">{when(m.createdAt)}</span>}
                          </button>
                          {!isStatic() && <button
                            type="button"
                            onClick={() => remove(m.id)}
                            title={arming ? "Click again to delete" : "Delete"}
                            className={`mr-1 grid size-6 shrink-0 place-items-center rounded-md ${arming ? "text-brand" : "hidden text-muted-foreground group-hover/row:grid hover:text-foreground"}`}
                          >
                            <Trash2 className="size-3.5" />
                          </button>}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-[52px] shrink-0 items-center gap-3 border-b px-6">
            {creating || !map ? (
              <span className="text-[13px] font-semibold tracking-[-0.01em]">New map</span>
            ) : (
              <div className="tab flex min-w-0 items-center gap-2 text-[13px]">
                <span className="truncate font-semibold tracking-[-0.01em]">{map.source}</span>
                <span className="truncate text-muted-foreground">
                  {fmtInt(map.conversations)} conversations{map.users ? ` · ${fmtInt(map.users)} people` : ""} · {map.model.replace(/^[a-z]+:/, "")}
                </span>
              </div>
            )}
            {map && !creating && (
              <div className="ml-auto flex items-center gap-2">
                {view === "map" && (
                  <Segmented
                    value={color}
                    onChange={setColor}
                    options={[
                      { value: "topic", label: "Topics" },
                      { value: "outcome", label: "Friction" },
                    ]}
                    title="Colour by  T"
                  />
                )}
                <div className="relative">
                  <button type="button" onClick={() => setMenu((m) => !m)} title="Export" className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                    <Download className="size-4" />
                  </button>
                  {menu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                      <div className="rise absolute top-8 right-0 z-20 grid w-36 rounded-lg border bg-card p-1 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.3)]">
                        {(
                          [
                            ["PDF", () => exportPdf(map)],
                            ["Excel", () => void exportExcel(map)],
                          ] as [string, () => void][]
                        ).map(([label, fn]) => (
                          <button key={label} type="button" onClick={() => (setMenu(false), fn())} className="flex h-7 items-center rounded-md px-2 text-left text-[13px] hover:bg-accent">
                            {label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </header>

          <div className="flex min-h-0 flex-1">
            <div className="relative min-w-0 flex-1">
              {creating || !map ? (
                <Setup key="setup" onDone={done} />
              ) : (
                <>
                  {view === "map" && <MapView map={map} color={color} selected={selected} onSelect={setSelected} focus={focus} onFocus={setFocus} />}
                  {view === "topics" && <Topics map={map} color={color} selected={selected} onSelect={setSelected} />}
                  {view === "privacy" && <Privacy map={map} />}
                  {view === "sources" && <Sources map={map} onNew={isStatic() ? undefined : () => setCreating(true)} />}
                </>
              )}
            </div>
            {map && !creating && sel && (view === "map" || view === "topics") && <Detail key={sel.id} map={map} cluster={sel} onClose={() => setSelected(null)} onSelect={setSelected} />}
          </div>
        </main>
      </div>
      {map && (
        <div className="report-root">
          <Report map={map} />
        </div>
      )}
    </>
  )
}

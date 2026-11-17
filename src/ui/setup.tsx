// New map: drop an export, pick who reads it, draw. Three steps on one screen.

import { FileUp, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { fmtInt } from "./data"
import { Segmented } from "./ui"

type Source = { format: string; name?: string; label?: string; conversations: number; people: number } | { error: string } | null
type Run = { running: boolean; step: string; done: number; total: number; error?: string; finishedAt?: number; mapId?: string }
type Provider = "openai" | "anthropic" | "openrouter" | "compat"

const PROVIDERS: { id: Provider; label: string; model: string }[] = [
  { id: "openai", label: "OpenAI", model: "gpt-5-mini" },
  { id: "anthropic", label: "Anthropic", model: "claude-haiku-5-5" },
  { id: "openrouter", label: "OpenRouter", model: "mistralai/mistral-small-3.2" },
  { id: "compat", label: "Other", model: "" },
]

const api = (path: string, init?: RequestInit) => fetch(`./api/${path}`, init).then((r) => (r.ok ? r.json() : r.json().then((b) => Promise.reject(new Error(b?.error ?? r.statusText)))))

/** Every JSON/JSONL file in a drop, folders included, with its relative path. */
async function filesFrom(items: DataTransferItemList): Promise<File[]> {
  const out: File[] = []
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((ok, no) => (entry as FileSystemFileEntry).file(ok, no))
      out.push(new File([file], `${prefix}${file.name}`))
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      let batch: FileSystemEntry[]
      do {
        batch = await new Promise((ok, no) => reader.readEntries(ok, no))
        for (const e of batch) await walk(e, `${prefix}${entry.name}/`)
      } while (batch.length)
    }
  }
  for (const it of [...items]) {
    const e = it.webkitGetAsEntry()
    if (e) await walk(e, "")
  }
  return out
}

const useful = (f: File) => /\.(jsonl?|ndjson)$/i.test(f.name)

export function Setup({ onDone, first = false }: { onDone: (mapId?: string) => void; first?: boolean }) {
  const [source, setSource] = useState<Source>(null)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const [mode, setMode] = useState<"local" | "api">("local")
  const [ollama, setOllama] = useState<{ ollama: boolean; models: string[] } | null>(null)
  const [localModel, setLocalModel] = useState("")
  const [provider, setProvider] = useState<Provider>("openai")
  const [model, setModel] = useState(PROVIDERS[0].model)
  const [key, setKey] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [run, setRun] = useState<Run | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api("source").then(setSource).catch(() => setSource(null))
    api("models")
      .then((m: { ollama: boolean; models: string[] }) => {
        setOllama(m)
        setLocalModel((cur) => cur || m.models[0] || "qwen3:1.7b")
        if (!m.ollama) setMode("api")
      })
      .catch(() => setOllama({ ollama: false, models: [] }))
    api("run").then((r: Run) => r.running && setRun(r))
  }, [])

  // Poll while a run is going; open the map when it lands.
  useEffect(() => {
    if (!run?.running) return
    const t = setInterval(async () => {
      const r: Run = await api("run")
      setRun(r)
      if (!r.running && !r.error) onDone(r.mapId)
    }, 700)
    return () => clearInterval(t)
  }, [run?.running, onDone])

  const upload = async (files: File[]) => {
    const list = files.filter(useful)
    if (!list.length) return setSource({ error: "No .json or .jsonl files in that drop." })
    setBusy(true)
    try {
      await api("source", { method: "DELETE" })
      for (const f of list) await fetch(`./api/source?name=${encodeURIComponent(f.webkitRelativePath || f.name)}`, { method: "POST", body: await f.text() })
      setSource(await api("source"))
    } catch (e) {
      setSource({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    await api("source", { method: "DELETE" })
    setSource(null)
  }

  const start = async () => {
    const spec = mode === "local" ? `ollama:${localModel}` : `${provider}:${model}`
    const r: Run = await api("run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: spec, apiKey: mode === "api" ? key : undefined, baseUrl: provider === "compat" ? baseUrl : undefined }) }).catch((e: Error) => ({ running: false, step: "", done: 0, total: 0, error: e.message }))
    setRun(r)
  }

  const loaded = source && "format" in source
  const modelReady = mode === "local" ? !!ollama?.ollama && !!localModel : !!model && (provider === "compat" ? !!baseUrl : !!key)
  const running = !!run?.running

  return (
    <div className="scroll absolute inset-0 overflow-y-auto">
      <div className={`rise mx-auto grid w-full max-w-[460px] gap-8 px-6 pb-16 ${first ? "pt-[12vh]" : "pt-10"}`}>
        {first ? (
          <div className="grid justify-items-start gap-4">
            <Glyph />
            <div className="grid gap-1.5">
              <h1 className="text-[20px] leading-tight">See what people ask your AI</h1>
              <p className="text-[13px] leading-relaxed text-muted-foreground">A private map of your assistant's conversations: what people use it for, and where it struggles. It runs on your computer, with your own model or key.</p>
            </div>
          </div>
        ) : null}

        <Step n={1} title="Source">
          {loaded ? (
            <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
              <FileUp className="size-4 text-muted-foreground" />
              <div className="grid min-w-0 flex-1">
                <span className="truncate font-medium">{source.label ?? source.name}</span>
                <span className="tab truncate text-[12px] text-muted-foreground">
                  {source.label ? `${source.name} · ` : ""}
                  {fmtInt(source.conversations)} conversations{source.people ? ` · ${fmtInt(source.people)} people` : ""}
                </span>
              </div>
              {!running && (
                <button type="button" onClick={clear} title="Remove" className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                  <X className="size-4" />
                </button>
              )}
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDrag(true)
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={async (e) => {
                e.preventDefault()
                setDrag(false)
                upload(await filesFrom(e.dataTransfer.items))
              }}
              className={`grid h-28 place-items-center rounded-lg border border-dashed text-center transition-colors ${drag ? "border-brand bg-brand-soft" : "bg-card"}`}
            >
              <div className="grid gap-1">
                <span>{busy ? "Reading…" : "Drop an export"}</span>
                <span className="text-[12px] text-muted-foreground">
                  or choose a{" "}
                  <button type="button" onClick={() => fileInput.current?.click()} className="text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
                    file
                  </button>{" "}
                  or a{" "}
                  <button type="button" onClick={() => folderInput.current?.click()} className="text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
                    folder
                  </button>
                </span>
              </div>
              <input ref={fileInput} type="file" accept=".json,.jsonl,.ndjson" multiple hidden onChange={(e) => e.target.files && upload([...e.target.files])} />
              <input ref={folderInput} type="file" hidden {...{ webkitdirectory: "" }} onChange={(e) => e.target.files && upload([...e.target.files])} />
            </div>
          )}
          {source && "error" in source && <p className="text-[12px] text-brand">{source.error}</p>}
        </Step>

        <Step n={2} title="Model">
          <fieldset disabled={running} className={`grid gap-3 transition-opacity ${running ? "opacity-50" : ""}`}>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "local", label: "This computer" },
              { value: "api", label: "API" },
            ]}
          />
          {mode === "local" ? (
            ollama?.ollama ? (
              <Field label="Model">
                <select value={localModel} onChange={(e) => setLocalModel(e.target.value)} className={fieldClass}>
                  {(ollama.models.length ? ollama.models : [localModel]).map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Field>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                Ollama isn't running. Start it with <code className="font-mono">ollama serve</code>, or use an API.
              </p>
            )
          ) : (
            <>
              <Segmented
                value={provider}
                onChange={(p) => {
                  setProvider(p)
                  setModel(PROVIDERS.find((x) => x.id === p)!.model)
                }}
                options={PROVIDERS.map((p) => ({ value: p.id, label: p.label }))}
              />
              {provider === "compat" && (
                <Field label="Endpoint">
                  <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…/v1" className={fieldClass} spellCheck={false} />
                </Field>
              )}
              <Field label="Model">
                <input value={model} onChange={(e) => setModel(e.target.value)} className={fieldClass} spellCheck={false} />
              </Field>
              <Field label="Key">
                <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={provider === "compat" ? "Optional" : ""} className={fieldClass} autoComplete="off" />
              </Field>
            </>
          )}
          </fieldset>
        </Step>

        {running || run?.error ? (
          <div className="grid gap-2">
            <div className="tab flex items-baseline justify-between text-[12px]">
              <span>{run?.error ? <span className={run.error === "Stopped" ? "text-muted-foreground" : "text-brand"}>{run.error === "Stopped" ? "Stopped." : run.error}</span> : run?.step}</span>
              {run && run.total > 0 && !run.error && (
                <span className="text-muted-foreground">
                  {fmtInt(run.done)} / {fmtInt(run.total)}
                </span>
              )}
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-accent">
              <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: run && run.total ? `${(run.done / run.total) * 100}%` : running ? "8%" : "0%" }} />
            </div>
            {run?.error ? (
              <button type="button" onClick={() => setRun(null)} className="justify-self-start text-[12px] text-muted-foreground hover:text-foreground">
                Try again
              </button>
            ) : (
              <button type="button" onClick={() => void fetch("./api/run", { method: "DELETE" })} className="justify-self-start text-[12px] text-muted-foreground hover:text-foreground">
                Stop
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            disabled={!loaded || !modelReady}
            onClick={start}
            className="h-9 rounded-md bg-foreground text-[13px] font-medium text-background transition-[opacity,transform] active:scale-[.98] disabled:opacity-30"
          >
            Draw the map
          </button>
        )}
      </div>
    </div>
  )
}

const fieldClass = "h-8 w-full rounded-md border border-input bg-card px-2.5 text-[13px] outline-none focus:border-foreground/40"

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <div className="flex items-baseline gap-2">
        <span className="tab text-[12px] text-faint">{n}</span>
        <h2 className="text-[13px] font-medium">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid grid-cols-[64px_1fr] items-center gap-3">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

/** A small, quiet map: what the user is about to get. */
function Glyph() {
  const dots: [number, number, number, string][] = [
    [34, 38, 26, "var(--accent)"], [78, 30, 18, "var(--accent)"], [70, 66, 14, "var(--accent)"], [90, 62, 9, "var(--brand)"], [26, 74, 9, "var(--accent)"], [48, 82, 7, "var(--accent)"],
  ]
  return (
    <svg width="120" height="96" viewBox="0 0 120 96" aria-hidden>
      <circle cx="58" cy="50" r="46" fill="none" stroke="var(--border)" />
      {dots.map(([x, y, r, f], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={f} className="rise" style={{ animationDelay: `${i * 60}ms` }} />
      ))}
    </svg>
  )
}

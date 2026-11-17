// Small controls in the house style: 28px, 13px, neutral, one accent.

import { useLayoutEffect, useRef, useState } from "react"
import type { ReactNode } from "react"

/** A segmented control whose pill slides to the selected option. */
export function Segmented<T extends string>({ value, options, onChange, title }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; title?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-value="${value}"]`)
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth })
  }, [value, options.length])
  return (
    <div ref={ref} role="radiogroup" title={title} className="relative inline-flex h-7 items-center rounded-md bg-accent p-0.5">
      {pill && (
        <span
          aria-hidden
          className="absolute top-0.5 bottom-0.5 rounded-[5px] bg-card shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-[left,width] duration-200 ease-[cubic-bezier(.2,.8,.2,1)]"
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          data-value={o.value}
          onClick={() => onChange(o.value)}
          className={`relative h-6 rounded-[5px] px-2.5 text-[12px] transition-colors ${o.value === value ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A thin horizontal bar, for shares and rates. */
export function Bar({ value, tone = "neutral", className = "" }: { value: number; tone?: "neutral" | "brand"; className?: string }) {
  return (
    <span className={`relative block h-1 overflow-hidden rounded-full bg-accent ${className}`}>
      <span className={`absolute inset-y-0 left-0 rounded-full ${tone === "brand" ? "bg-brand" : "bg-foreground/55"}`} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </span>
  )
}

export function SectionTitle({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 border-b pb-2">
      <h2 className="text-[13px] font-medium">{children}</h2>
      {extra && <span className="tab ml-auto text-[12px] text-muted-foreground">{extra}</span>}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border bg-card px-1 font-sans text-[10.5px] text-muted-foreground">{children}</kbd>
}

/** Categorical colours for top-level categories: muted, distinguishable, fine on both themes. */
export const HUES = ["#6d5bb5", "#2f7ea3", "#c27c2c", "#178049", "#a5527d", "#4f8f7a", "#b5651d", "#3d6fb5", "#8c6d3c", "#9a4f4f", "#5b7f8c", "#7a7a3a"]

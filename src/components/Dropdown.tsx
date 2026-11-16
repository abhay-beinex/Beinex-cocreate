// Themed dropdown: replaces the browser's native select popup, which cannot be styled. Keyboard: arrows, Enter, Escape, type to search.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Children as ChildrenT, Children, isValidElement } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cx } from './ui'

export type DropItem = { value: string; label: ReactNode; text?: string; disabled?: boolean; group?: string }

export function Dropdown({ value, items, onChange, trigger, align = 'start', width, searchable, placeholder, className, ariaLabel, disabled }: { value: string; items: DropItem[]; onChange: (v: string) => void; trigger?: (open: boolean, current?: DropItem) => ReactNode; align?: 'start' | 'end'; width?: number; searchable?: boolean; placeholder?: string; className?: string; ariaLabel?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const btn = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null)
  const current = items.find((i) => i.value === value)
  const search = searchable ?? items.length > 12
  const shown = useMemo(() => { const s = q.trim().toLowerCase(); return s ? items.filter((i) => (i.text ?? String(i.label)).toLowerCase().includes(s) || i.value.toLowerCase().includes(s)) : items }, [items, q])
  const place = () => { const r = btn.current?.getBoundingClientRect(); if (!r) return; const w = Math.max(width ?? r.width, 180); const h = Math.min(360, 44 + shown.length * 36 + (search ? 44 : 0)); const up = r.bottom + h + 8 > window.innerHeight && r.top > h; const left = align === 'end' ? Math.max(8, r.right - w) : Math.min(r.left, window.innerWidth - w - 8); setPos({ top: up ? r.top - 6 : r.bottom + 6, left, width: w, up }) }
  useLayoutEffect(() => { if (open) place() }, [open, shown.length]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btn.current?.focus() } }
    const onScroll = () => place()
    window.addEventListener('mousedown', onDown); window.addEventListener('keydown', onKey, true); window.addEventListener('resize', onScroll); document.addEventListener('scroll', onScroll, true)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onScroll); document.removeEventListener('scroll', onScroll, true) }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setQ(''); const i = Math.max(0, items.findIndex((x) => x.value === value)); setActive(i); setTimeout(() => (list.current?.querySelector<HTMLElement>(search ? 'input' : '[data-active="true"]'))?.focus(), 10) } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { list.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }) }, [active, open])
  const choose = (v: string) => { onChange(v); setOpen(false); btn.current?.focus() }
  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); const it = shown[active]; if (it && !it.disabled) choose(it.value) }
    else if (e.key === 'Home') { setActive(0) } else if (e.key === 'End') { setActive(shown.length - 1) }
  }
  let lastGroup: string | undefined
  return (
    <>
      <button ref={btn} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} onClick={() => setOpen(!open)} onKeyDown={(e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true) } }} className={cx(trigger ? 'inline-flex' : 'input text-start flex items-center gap-2 pe-9 relative', className)}>
        {trigger ? trigger(open, current) : <><span className={cx('truncate flex-1', !current && 'muted')}>{current?.label ?? placeholder ?? 'Choose'}</span><ChevronDown size={14} className={cx('absolute end-3 top-1/2 -translate-y-1/2 muted transition-transform', open && 'rotate-180')} /></>}
      </button>
      {open && pos && createPortal(
        <div ref={list} role="listbox" aria-activedescendant={shown[active] ? `opt-${shown[active].value}` : undefined} tabIndex={-1} onKeyDown={onListKey} className="fixed z-[80] pop rounded-[14px] p-1.5 flex flex-col max-h-[360px]" style={{ top: pos.up ? undefined : pos.top, bottom: pos.up ? window.innerHeight - pos.top : undefined, left: pos.left, width: pos.width }}>
          {search && <div className="relative mb-1 shrink-0"><Search size={13} className="absolute start-2.5 top-1/2 -translate-y-1/2 muted" /><input value={q} onChange={(e) => { setQ(e.target.value); setActive(0) }} placeholder="Search" aria-label="Search options" className="input !h-8 !ps-8 !text-[12.5px]" /></div>}
          <div className="scroll min-h-0 flex flex-col">
            {shown.length === 0 && <div className="px-2.5 py-3 text-[12.5px] muted">No match.</div>}
            {shown.map((it, i) => {
              const head = it.group && it.group !== lastGroup ? it.group : undefined; lastGroup = it.group; return (
                <div key={it.value}>
                  {head && <div className="text-[10.5px] font-semibold uppercase tracking-wider muted px-2.5 pt-2 pb-1">{head}</div>}
                  <button type="button" id={`opt-${it.value}`} role="option" aria-selected={it.value === value} data-active={i === active} disabled={it.disabled} onMouseEnter={() => setActive(i)} onClick={() => choose(it.value)} className={cx('w-full flex items-center gap-2 px-2.5 h-9 rounded-[9px] text-[13px] text-left disabled:opacity-50', i === active && 'bg-[var(--clay-dark)]', it.value === value && 'font-semibold')}>
                    <span className="flex-1 min-w-0 truncate">{it.label}</span>{it.value === value && <Check size={13} className="accent-ink shrink-0" />}
                  </button>
                </div>
              )
            })}
          </div>
        </div>, document.body)}
    </>
  )
}

/** Turn <option> / <optgroup> children into dropdown items, so Select keeps the native markup. */
export function itemsFromOptions(children: ReactNode): DropItem[] {
  const out: DropItem[] = []
  const walk = (nodes: ReactNode, group?: string) => Children.forEach(nodes as Parameters<typeof ChildrenT.forEach>[0], (c) => {
    if (!isValidElement(c)) return
    const p = c.props as { value?: string | number; children?: ReactNode; disabled?: boolean; label?: string }
    if (c.type === 'optgroup') { walk(p.children, p.label); return }
    if (c.type === 'option') { const text = Children.toArray(p.children).map((x) => (typeof x === 'string' || typeof x === 'number' ? String(x) : '')).join(''); out.push({ value: String(p.value ?? text), label: text, text, disabled: p.disabled, group }); return }
    if (p.children) walk(p.children, group)
  })
  walk(children)
  return out
}

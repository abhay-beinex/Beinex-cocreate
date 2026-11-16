import { Dropdown, itemsFromOptions } from './Dropdown'
import { useEffect, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

/** Closes an overlay on Escape while it is open. */
function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => { if (!open) return; const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }; window.addEventListener('keydown', h, true); return () => window.removeEventListener('keydown', h, true) }, [open, onClose])
}

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')

export function Button({ variant = 'default', size, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'ghost'; size?: 'sm' }) {
  return <button className={cx('btn', variant === 'primary' && 'btn-primary', variant === 'ghost' && 'btn-ghost', size === 'sm' && 'btn-sm', className)} {...props} />
}
export function IconButton({ className, size, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { size?: 'sm' }) {
  return <button className={cx('btn btn-ghost btn-icon', size === 'sm' && 'btn-sm', className)} {...props} />
}

export function Panel({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('clay', className)} {...rest}>{children}</div>
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={cx('input', props.className)} /> }
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...props} className={cx('input', props.className)} /> }
/** Same markup as a native select (value, onChange, <option>, <optgroup>) but renders a themed dropdown. */
export function Select({ value, onChange, children, className, disabled, 'aria-label': ariaLabel }: SelectHTMLAttributes<HTMLSelectElement>) {
  const items = itemsFromOptions(children)
  return <Dropdown value={String(value ?? '')} items={items} disabled={disabled} ariaLabel={ariaLabel} className={className} onChange={(v) => onChange?.({ target: { value: v }, currentTarget: { value: v } } as unknown as React.ChangeEvent<HTMLSelectElement>)} />
}

export function Chip({ children, tone, className }: { children: ReactNode; tone?: 'accent' | 'ok' | 'warn' | 'danger'; className?: string }) {
  return <span className={cx('chip', tone && `chip-${tone}`, className)}>{children}</span>
}

export function Field({ label, children, hint, action }: { label: string; children: ReactNode; hint?: string; action?: ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[12px] font-semibold">{label}</div>
        {action}
      </div>
      {children}
      {hint && <div className="text-[11.5px] muted mt-1.5">{hint}</div>}
    </div>
  )
}

export function Segmented<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode }[] }) {
  return (
    <div className="seg">
      {items.map((it) => <button key={it.id} onClick={() => onChange(it.id)} className={cx(value === it.id && 'on')}>{it.label}</button>)}
    </div>
  )
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange(!checked)}
      className={cx('relative w-10 h-[22px] rounded-full transition-all disabled:opacity-40', checked ? 'bg-[var(--accent)]' : 'bg-[var(--clay-dark)]')}>
      <span className={cx('absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all', checked ? 'left-[21px]' : 'left-[3px]')} />
    </button>
  )
}

export function Avatar({ initials, size = 32, className }: { initials: string; size?: number; className?: string }) {
  return (
    <span className={cx('inline-grid place-items-center rounded-full text-white font-bold select-none shrink-0', className)}
      style={{ width: size, height: size, fontSize: size * 0.36, background: 'linear-gradient(135deg,#22c7f8,#0074d9)' }}>{initials}</span>
  )
}

const palette = ['#0ea5e9', '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#14b8a6', '#8b5cf6', '#f97316']
export const colorFor = (s: string) => palette[Array.from(s).reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length]

export function Tile({ children, color, size = 36, radius = 11, className }: { children: ReactNode; color: string; size?: number; radius?: number; className?: string }) {
  return <span className={cx('tile', className)} style={{ width: size, height: size, borderRadius: radius, background: color }}>{children}</span>
}

export function Dot({ tone }: { tone: 'ok' | 'warn' | 'danger' | 'muted' | 'accent' }) {
  const c = { ok: 'var(--ok)', warn: 'var(--warn)', danger: 'var(--danger)', muted: 'var(--muted)', accent: 'var(--accent)' }[tone]
  return <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c }} />
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 mb-5">
      <div>
        <h1 className="display text-[22px] font-bold leading-tight">{title}</h1>
        {subtitle && <p className="muted mt-0.5 text-[13px]">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2 shrink-0">{actions}</div>}
    </div>
  )
}

export function SearchBox({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cx('relative', className)}>
      <svg className="absolute start-3 top-1/2 -translate-y-1/2 muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? 'Search'} className="input !ps-8 !h-9" />
    </div>
  )
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="py-14 text-center">
      <div className="font-semibold text-[13.5px]">{title}</div>
      {body && <div className="muted text-[12.5px] mt-1 max-w-md mx-auto">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Modal({ open, onClose, title, children, width = 540 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  useEscape(open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose} style={{ background: 'rgba(10,20,40,.3)', backdropFilter: 'blur(6px)' }}>
      <div className="clay p-6 w-full fade-up max-h-[90vh] scroll" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="display text-[17px] font-bold">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Drawer({ open, onClose, title, children, width = 500 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  useEscape(open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end p-3" onClick={onClose} style={{ background: 'rgba(10,20,40,.2)', backdropFilter: 'blur(4px)' }}>
      <div className="glass h-full p-6 scroll fade-up rounded-[22px]" style={{ width, maxWidth: '100%' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="display text-[17px] font-bold">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Confirm({ open, title, body, confirmLabel = 'Confirm', danger, onConfirm, onClose, children }: { open: boolean; title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void; children?: ReactNode }) {
  useEscape(open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4" onClick={onClose} style={{ background: 'rgba(10,20,40,.3)', backdropFilter: 'blur(6px)' }}>
      <div className="clay p-6 w-full max-w-[440px] fade-up" onClick={(e) => e.stopPropagation()}>
        <h2 className="display text-[16px] font-bold">{title}</h2>
        {body && <div className="text-[13px] muted mt-2 leading-relaxed">{body}</div>}
        {children}
        <div className="flex justify-end gap-2 mt-5">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" className={danger ? '!bg-[var(--danger)] !bg-none !shadow-none' : undefined} onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
}

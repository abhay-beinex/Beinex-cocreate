import { Sparkles, Bot, Search, PenLine, BarChart3, LifeBuoy, Globe, Shield, BookOpen, Calculator, Mail, Briefcase, Scale, Lightbulb, Megaphone, Wrench } from 'lucide-react'
import { colorFor, cx } from './ui'

export const AGENT_ICONS = { sparkles: Sparkles, bot: Bot, search: Search, pen: PenLine, chart: BarChart3, support: LifeBuoy, globe: Globe, shield: Shield, book: BookOpen, calculator: Calculator, mail: Mail, briefcase: Briefcase, scale: Scale, idea: Lightbulb, megaphone: Megaphone, wrench: Wrench } as const
export type AgentIcon = keyof typeof AGENT_ICONS
export const AGENT_COLORS = ['#0ea5e9', '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#14b8a6', '#8b5cf6', '#f97316', '#10385b', '#64748b']

export function AgentAvatar({ name, icon, color, size = 36, radius, className }: { name: string; icon?: string; color?: string; size?: number; radius?: number; className?: string }) {
  const Icon = AGENT_ICONS[(icon as AgentIcon) ?? 'sparkles'] ?? Sparkles
  return (
    <span className={cx('tile', className)} style={{ width: size, height: size, borderRadius: radius ?? Math.round(size * 0.3), background: color ?? colorFor(name || 'agent') }}>
      <Icon size={Math.round(size * 0.46)} />
    </span>
  )
}

export function AvatarPicker({ icon, color, onChange }: { icon?: string; color?: string; onChange: (p: { icon?: string; color?: string }) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider muted mb-1.5">Icon</div>
        <div className="grid grid-cols-8 gap-1.5">
          {(Object.keys(AGENT_ICONS) as AgentIcon[]).map((k) => { const I = AGENT_ICONS[k]; const on = (icon ?? 'sparkles') === k; return (
            <button type="button" key={k} onClick={() => onChange({ icon: k })} className={cx('w-8 h-8 rounded-[9px] grid place-items-center transition-all', on ? 'bg-[var(--accent)] text-white' : 'bg-[var(--clay-dark)] muted hover:text-[var(--text)]')}><I size={15} /></button>
          ) })}
        </div>
      </div>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider muted mb-1.5">Colour</div>
        <div className="flex gap-1.5 flex-wrap">
          {AGENT_COLORS.map((c) => <button type="button" key={c} onClick={() => onChange({ color: c })} className={cx('w-7 h-7 rounded-full border-2 transition-transform', color === c ? 'border-[var(--text)] scale-110' : 'border-transparent')} style={{ background: c }} />)}
        </div>
      </div>
    </div>
  )
}

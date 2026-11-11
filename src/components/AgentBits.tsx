// Small shared pieces for showing agents: ability wells, thinking meter, agent card, readiness ring.
import { motion } from 'framer-motion'
import { MessageSquare, MoreHorizontal, FlaskConical, Workflow } from 'lucide-react'
import type { Agent, CustomTool } from '@/lib/data'
import { abilityOf, THINKING, thinkingOf } from '@/lib/agentVocab'
import { AgentAvatar } from './AgentAvatar'
import { Dot, cx } from './ui'

export function AbilityWells({ tools, custom = [], max = 6, size = 26 }: { tools: string[]; custom?: CustomTool[]; max?: number; size?: number }) {
  const shown = tools.slice(0, max)
  return (
    <span className="inline-flex items-center gap-1.5">
      {shown.map((t) => { const a = abilityOf(t, custom); if (!a) return null; const I = a.icon; return <span key={t} title={`${a.label} · ${a.sub}`} className={cx('pressed grid place-items-center', a.gated ? 'text-[var(--warn)]' : 'muted')} style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}><I size={Math.round(size * 0.5)} /></span> })}
      {tools.length > max && <span className="text-[11px] muted">+{tools.length - max}</span>}
      {tools.length === 0 && <span className="text-[11.5px] muted">No abilities</span>}
    </span>
  )
}

export function ThinkingMeter({ model, profiles, defaultModel, withLabel = true }: { model: string; profiles: { id: string; model: string }[]; defaultModel: string; withLabel?: boolean }) {
  const t = thinkingOf({ model }, profiles, defaultModel)
  const level = t?.level ?? 0
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] muted" title={t ? `${t.label} thinking` : model}>
      <span className="inline-flex items-end gap-[2px] h-[14px]">{[6, 10, 14].map((h, i) => <i key={i} className={cx('block w-[3px] rounded-[2px]', i < level ? 'bg-[var(--accent)]' : 'bg-[var(--clay-dark)]')} style={{ height: h }} />)}</span>
      {withLabel && <span>{t ? t.label : (model.split('/')[1] ?? model)}</span>}
    </span>
  )
}

export function AgentCard({ a, custom, profiles, defaultModel, onOpen, onChat, menu, selected, onSelect, selectable, usedIn = 0 }: { a: Agent; custom: CustomTool[]; profiles: { id: string; model: string }[]; defaultModel: string; onOpen: () => void; onChat: () => void; menu?: React.ReactNode; selected?: boolean; onSelect?: () => void; selectable?: boolean; usedIn?: number }) {
  const tests = a.tests ?? []; const ran = tests.filter((t) => t.last); const passed = ran.filter((t) => t.last!.pass).length
  return (
    <motion.div whileHover={{ y: -3 }} onClick={onOpen} className={cx('clay p-5 cursor-pointer flex flex-col gap-3 min-h-[196px] relative group', selected && 'outline outline-2 outline-[var(--accent)]')}>
      <div className="absolute inset-0 rounded-[24px] overflow-hidden pointer-events-none"><div className="absolute -right-10 -top-10 w-32 h-32 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: `radial-gradient(circle, ${a.color ?? '#0ea5e9'}33, transparent 70%)` }} /></div>
      {selectable && <button onClick={(e) => { e.stopPropagation(); onSelect?.() }} className={cx('absolute top-3 left-3 z-10 w-5 h-5 rounded-[6px] border grid place-items-center transition-opacity', selected ? 'opacity-100 bg-[var(--accent)] border-[var(--accent)] text-white' : 'opacity-0 group-hover:opacity-100 border-[var(--muted)]')} title="Select">{selected && <span className="text-[11px] font-bold">✓</span>}</button>}
      <div className="flex items-start gap-3">
        <AgentAvatar name={a.name} icon={a.icon} color={a.color} size={42} />
        <div className="flex-1 min-w-0 pt-0.5"><div className="display font-bold text-[15px] truncate">{a.name}</div><div className="text-[11.5px] muted flex items-center gap-1.5"><Dot tone={a.status === 'live' ? 'ok' : 'muted'} /><span>{a.status === 'live' ? 'Live' : 'Draft'}</span><span>· v{a.version}</span></div></div>
        <div onClick={(e) => e.stopPropagation()} className="relative z-10">{menu ?? <button className="btn btn-ghost btn-sm btn-icon"><MoreHorizontal size={15} /></button>}</div>
      </div>
      <p className="text-[12.5px] muted leading-relaxed line-clamp-2 min-h-[36px]">{a.description || 'No description yet.'}</p>
      <AbilityWells tools={a.tools} custom={custom} />
      <div className="flex items-center gap-1.5 text-[11px] muted flex-wrap">
        {tests.length > 0 && <span className={cx('inline-flex items-center gap-1 h-5 px-1.5 rounded-full font-medium', ran.length === 0 ? 'bg-[var(--clay-dark)]' : passed === ran.length ? 'text-[var(--ok)] bg-[color-mix(in_srgb,var(--ok)_12%,transparent)]' : 'text-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]')} title="Tests passed"><FlaskConical size={10} /> {ran.length === 0 ? `${tests.length} test${tests.length === 1 ? '' : 's'}` : `${passed}/${ran.length} pass`}</span>}
        {usedIn > 0 && <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-full bg-[var(--clay-dark)] font-medium"><Workflow size={10} /> {usedIn} workflow{usedIn === 1 ? '' : 's'}</span>}
        {a.knowledge.length > 0 && <span className="inline-flex items-center h-5 px-1.5 rounded-full bg-[var(--clay-dark)] font-medium">{a.knowledge.length} librar{a.knowledge.length === 1 ? 'y' : 'ies'}</span>}
      </div>
      <div className="mt-auto flex items-center gap-2 pt-1">
        <ThinkingMeter model={a.model} profiles={profiles} defaultModel={defaultModel} />
        <div className="flex-1" />
        <button onClick={(e) => { e.stopPropagation(); onChat() }} className="btn btn-sm !font-medium"><MessageSquare size={12} /> {a.status === 'live' ? 'Chat' : 'Try it'}</button>
      </div>
    </motion.div>
  )
}

export function ReadinessRing({ score, total, size = 44 }: { score: number; total: number; size?: number }) {
  const r = (size - 6) / 2; const c = 2 * Math.PI * r; const pct = total ? score / total : 0
  return (
    <span className="relative inline-grid place-items-center shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90"><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--clay-dark)" strokeWidth="4" /><motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={pct >= 1 ? 'var(--ok)' : 'var(--accent)'} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - pct) }} transition={{ duration: 0.8, ease: 'easeOut' }} /></svg>
      <span className="absolute text-[10.5px] font-bold tabular-nums">{score}/{total}</span>
    </span>
  )
}

export const thinkingLabel = (model: string, profiles: { id: string; model: string }[], defaultModel: string) => thinkingOf({ model }, profiles, defaultModel)?.label ?? THINKING[1].label

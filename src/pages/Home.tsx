import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUp, ShieldAlert, BadgeCheck, PiggyBank, Info, ChevronRight, Sparkles, Workflow, CalendarClock, Activity } from 'lucide-react'
import { useApp, useUser } from '@/store/app'
import { deadlines, roleLabel, type Suggestion } from '@/lib/data'
import { Button, Tile, colorFor } from '@/components/ui'
import { Page, Stagger, Item, Rise, ease } from '@/components/motion'

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' }
const kind: Record<Suggestion['kind'], { icon: typeof Info; color: string }> = {
  risk: { icon: ShieldAlert, color: '#ef6c5a' }, approval: { icon: BadgeCheck, color: '#0ea5e9' }, saving: { icon: PiggyBank, color: '#10b981' }, info: { icon: Info, color: '#8b5cf6' },
}

export default function Home() {
  const user = useUser()!
  const nav = useNavigate()
  const { suggestions, agents, workflows, runs, setSuggestionStatus, dailyCap } = useApp()
  const [q, setQ] = useState('')
  const [focus, setFocus] = useState(false)

  const attention = useMemo(() => {
    const open = suggestions.filter((s) => s.status !== 'history')
    const mine = user.role === 'approver' || user.role === 'security' ? [...open.filter((s) => s.kind === 'approval'), ...open.filter((s) => s.kind !== 'approval')] : open
    return dailyCap ? mine.slice(0, dailyCap) : mine
  }, [suggestions, user.role, dailyCap])
  const waiting = runs.filter((r) => r.status === 'waiting').length
  const ask = () => { if (q.trim()) nav(`/chat?q=${encodeURIComponent(q.trim())}`) }
  const hour = new Date().getHours()
  const sky = hour < 11 ? ['#ffd59e', '#04bbf2'] : hour < 17 ? ['#04bbf2', '#0074d9'] : ['#6d5cff', '#0074d9']
  const prompts = user.role === 'approver' ? ['What is waiting for my approval?', 'Summarise run R-1288', 'Any invoices above AED 50,000 today?'] : ['Check INV-20931 for duplicates', 'Draft a supplier status reply', 'Which licences expire soon?']

  return (
    <Page className="max-w-[760px] mx-auto pt-14 pb-16 px-4 relative">
      <motion.div aria-hidden className="absolute -top-10 right-0 w-[260px] h-[260px] rounded-full pointer-events-none" style={{ background: `radial-gradient(circle at 40% 40%, ${sky[0]}66, ${sky[1]}22 55%, transparent 72%)`, filter: 'blur(14px)' }}
        animate={{ scale: [1, 1.08, 1], x: [0, -10, 0] }} transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }} />

      <Rise>
        <div className="text-[11.5px] font-semibold muted mb-2">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · {roleLabel[user.role]}</div>
        <h1 className="display text-[32px] font-bold leading-tight">{greeting()}, {user.name.split(' ')[0]}</h1>
        <p className="muted mt-1.5 text-[14px]">{waiting > 0 && (user.role === 'approver' || user.role === 'security') ? `${waiting} run${waiting === 1 ? '' : 's'} waiting for your sign-off.` : 'What would you like to get done today?'}</p>
      </Rise>

      <Rise delay={0.08}>
        <motion.div animate={{ boxShadow: focus ? '0 0 0 4px color-mix(in srgb, var(--accent) 20%, transparent), inset 5px 5px 12px var(--clay-light), inset -5px -7px 14px var(--clay-dark), 0 18px 34px -20px var(--clay-drop)' : undefined }} className="clay p-2 mt-7">
          <textarea value={q} onChange={(e) => setQ(e.target.value)} rows={2} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }}
            placeholder="Ask Co-Create, or describe an agent or workflow to build…"
            className="w-full bg-transparent outline-0 resize-none text-[14.5px] px-3 pt-3 placeholder:text-[var(--muted)]" />
          <div className="flex items-center gap-1.5 px-1.5 pb-1 flex-wrap">
            {prompts.map((s) => <button key={s} onClick={() => nav(`/chat?q=${encodeURIComponent(s)}`)} className="chip hover:text-[var(--text)]">{s}</button>)}
            <div className="flex-1" />
            <motion.button whileTap={{ scale: 0.9 }} onClick={ask} className="btn btn-primary btn-icon !rounded-full !w-9 !h-9" title="Send"><ArrowUp size={16} /></motion.button>
          </div>
        </motion.div>
      </Rise>

      <section className="mt-10">
        <Rise delay={0.12}><div className="flex items-center justify-between mb-2 px-1">
          <h2 className="text-[13px] font-semibold">Needs your attention</h2>
          <button onClick={() => nav('/runs?tab=approvals')} className="text-[12px] font-medium muted hover:text-[var(--text)]">View all</button>
        </div></Rise>
        <div className="clay px-3 py-1">
          <AnimatePresence initial={false}>
            {attention.length === 0 && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-10 text-center muted text-[13px]">You're all caught up.</motion.div>}
            {attention.map((s, i) => {
              const k = kind[s.kind]; const Icon = k.icon
              return (
                <motion.div key={s.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.15 + i * 0.05, duration: 0.4, ease } }} exit={{ opacity: 0, x: 40, transition: { duration: 0.25 } }} className="row group">
                  <Tile color={k.color} size={34}><Icon size={16} /></Tile>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-medium truncate">{s.title}</div>
                    <div className="text-[12px] muted truncate">{s.source} · {s.when}{s.confidence ? ` · ${s.confidence}% confident` : ''}{s.savingHours ? ` · ~${s.savingHours} h/week` : ''}</div>
                  </div>
                  <button onClick={() => setSuggestionStatus(s.id, 'history')} className="text-[12px] muted opacity-0 group-hover:opacity-100 hover:text-[var(--text)] transition-opacity">Dismiss</button>
                  <Button size="sm" onClick={() => nav(s.link ?? '/runs')}>{s.primary}</Button>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </section>

      <Stagger className="mt-10 grid md:grid-cols-2 gap-4" delay={0.08}>
        <Item>
          <Header title="Agents" onAll={() => nav('/agents')} />
          <div className="clay px-3 py-1">
            {agents.slice(0, 3).map((a) => <RowLink key={a.id} name={a.name} meta={`${a.status} · ${a.model.split('/')[1] ?? a.model}`} icon={<Sparkles size={14} />} color={colorFor(a.name)} onClick={() => nav(`/agents/${a.id}`)} />)}
          </div>
        </Item>
        <Item>
          <Header title="Workflows" onAll={() => nav('/workflows')} />
          <div className="clay px-3 py-1">
            {workflows.slice(0, 3).map((w) => <RowLink key={w.id} name={w.name} meta={`${w.status} · ${w.runsWeek} runs this week`} icon={<Workflow size={14} />} color={colorFor(w.name)} onClick={() => nav(`/workflows/${w.id}`)} />)}
          </div>
        </Item>
        <Item>
          <Header title="Deadlines" />
          <div className="clay px-3 py-1">
            {deadlines.map((d) => (
              <div key={d.id} className="row">
                <Tile color={d.days <= 14 ? '#ef6c5a' : '#64748b'} size={30} radius={9}><CalendarClock size={14} /></Tile>
                <div className="flex-1 min-w-0"><div className="text-[13px] font-medium truncate">{d.name}</div><div className="text-[11.5px] muted">{d.due}</div></div>
                <span className={`text-[12px] font-semibold tabular-nums ${d.days <= 14 ? 'text-[var(--danger)]' : 'muted'}`}>{d.days} days</span>
              </div>
            ))}
          </div>
        </Item>
        <Item>
          <Header title="This week" onAll={() => nav('/runs')} />
          <div className="clay px-3 py-1">
            {[['Runs', '1,284', '+12%'], ['Straight-through', '87.4%', '+2.1 pts'], ['Waiting for sign-off', String(waiting), waiting > 0 ? '1 over 4h' : '']].map(([k, v, d]) => (
              <div key={k} className="row"><Tile color="#0ea5e9" size={30} radius={9}><Activity size={14} /></Tile><div className="flex-1 text-[13px] font-medium">{k}</div><span className="text-[13px] font-semibold tabular-nums">{v}</span>{d && <span className="text-[11.5px] muted w-[60px] text-right">{d}</span>}</div>
            ))}
          </div>
        </Item>
      </Stagger>
    </Page>
  )
}

const Header = ({ title, onAll }: { title: string; onAll?: () => void }) => (
  <div className="flex items-center justify-between mb-2 px-1"><h2 className="text-[13px] font-semibold">{title}</h2>{onAll && <button onClick={onAll} className="text-[12px] font-medium muted hover:text-[var(--text)]">View all</button>}</div>
)
const RowLink = ({ name, meta, icon, color, onClick }: { name: string; meta: string; icon: React.ReactNode; color: string; onClick: () => void }) => (
  <button onClick={onClick} className="row hover w-full text-left">
    <Tile color={color} size={30} radius={9}>{icon}</Tile>
    <div className="flex-1 min-w-0"><div className="text-[13px] font-medium truncate">{name}</div><div className="text-[11.5px] muted truncate capitalize">{meta}</div></div>
    <ChevronRight size={15} className="muted" />
  </button>
)

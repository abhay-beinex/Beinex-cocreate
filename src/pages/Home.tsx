import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUp, Sparkles, Workflow, BookOpen, KeyRound, Check, ChevronRight, ShieldCheck, ListChecks, Globe } from 'lucide-react'
import { useApp, useUser, can } from '@/store/app'
import { roleLabel } from '@/lib/data'
import { Button, Tile, colorFor, cx } from '@/components/ui'
import { Page, Stagger, Item, Rise, ease } from '@/components/motion'

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' }

export default function Home() {
  const user = useUser()!
  const nav = useNavigate()
  const { agents, workflows, runs, libraries, apiKey } = useApp()
  const [q, setQ] = useState('')
  const [focus, setFocus] = useState(false)

  const waiting = runs.filter((r) => r.status === 'waiting')
  const recent = runs.slice(0, 4)
  const hasDocs = libraries.some((l) => l.docs.length > 0)
  const steps = [
    { done: !!apiKey, label: 'Connect OpenRouter', desc: 'Pick any model from the catalog', icon: KeyRound, to: '/settings?tab=openrouter', color: '#64748b' },
    { done: agents.length > 0, label: 'Create an agent', desc: 'Describe it or start from a template', icon: Sparkles, to: '/agents?new=1', color: '#0ea5e9' },
    { done: hasDocs, label: 'Add knowledge', desc: 'Documents agents can cite', icon: BookOpen, to: '/knowledge', color: '#8b5cf6' },
    { done: workflows.length > 0, label: 'Build a workflow', desc: 'Chain agents with a human gate', icon: Workflow, to: '/workflows', color: '#10b981' },
  ]
  const doneCount = steps.filter((s) => s.done).length
  const ask = () => { if (q.trim()) nav(`/chat?q=${encodeURIComponent(q.trim())}`) }
  const hour = new Date().getHours()
  const sky = hour < 11 ? ['#ffd59e', '#04bbf2'] : hour < 17 ? ['#04bbf2', '#0074d9'] : ['#6d5cff', '#0074d9']
  const prompts = ['Research the latest on EU AI regulation', 'Summarise this page: https://openrouter.ai/docs', 'What is 18% of 42,500?']

  return (
    <Page className="max-w-[760px] mx-auto pt-14 pb-16 px-4 relative">
      <motion.div aria-hidden className="absolute -top-10 right-0 w-[260px] h-[260px] rounded-full pointer-events-none" style={{ background: `radial-gradient(circle at 40% 40%, ${sky[0]}66, ${sky[1]}22 55%, transparent 72%)`, filter: 'blur(14px)' }} animate={{ scale: [1, 1.08, 1], x: [0, -10, 0] }} transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }} />

      <Rise>
        <div className="text-[11.5px] font-semibold muted mb-2">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · {roleLabel[user.role]}</div>
        <h1 className="display text-[32px] font-bold leading-tight">{greeting()}, {user.name.split(' ')[0]}</h1>
        <p className="muted mt-1.5 text-[14px]">{waiting.length > 0 && can(user, 'approve') ? `${waiting.length} item${waiting.length === 1 ? '' : 's'} waiting for your sign-off.` : 'Ask anything, or build something.'}</p>
      </Rise>

      <Rise delay={0.08}>
        <motion.div animate={{ boxShadow: focus ? '0 0 0 4px color-mix(in srgb, var(--accent) 20%, transparent), inset 5px 5px 12px var(--clay-light), inset -5px -7px 14px var(--clay-dark), 0 18px 34px -20px var(--clay-drop)' : undefined }} className="clay p-2 mt-7">
          <textarea value={q} onChange={(e) => setQ(e.target.value)} rows={2} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }}
            placeholder="Ask the assistant. It can search the web, read pages, calculate and run code…" className="w-full bg-transparent outline-0 resize-none text-[14.5px] px-3 pt-3 placeholder:text-[var(--muted)]" />
          <div className="flex items-center gap-1.5 px-1.5 pb-1 flex-wrap">
            {prompts.map((s) => <button key={s} onClick={() => nav(`/chat?q=${encodeURIComponent(s)}`)} className="chip hover:text-[var(--text)]">{s}</button>)}
            <div className="flex-1" />
            <motion.button whileTap={{ scale: 0.9 }} onClick={ask} className="btn btn-primary btn-icon !rounded-full !w-9 !h-9" title="Send"><ArrowUp size={16} /></motion.button>
          </div>
        </motion.div>
      </Rise>

      {doneCount < steps.length && can(user, 'build') && (
        <section className="mt-10">
          <Rise delay={0.12}><div className="flex items-center justify-between mb-2 px-1"><h2 className="text-[13px] font-semibold">Get started</h2><span className="text-[12px] muted">{doneCount} of {steps.length}</span></div></Rise>
          <Stagger className="grid sm:grid-cols-2 gap-3" delay={0.06}>
            {steps.map((s) => (
              <Item key={s.label}>
                <button onClick={() => nav(s.to)} className={cx('clay-sm p-4 w-full text-left flex items-center gap-3 hover:-translate-y-0.5 transition-transform', s.done && 'opacity-60')}>
                  <Tile color={s.done ? '#10b981' : s.color} size={36}>{s.done ? <Check size={16} /> : <s.icon size={16} />}</Tile>
                  <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">{s.label}</span><span className="block text-[11.5px] muted truncate">{s.desc}</span></span>
                  {!s.done && <ChevronRight size={15} className="muted" />}
                </button>
              </Item>
            ))}
          </Stagger>
        </section>
      )}

      {(waiting.length > 0 || recent.length > 0) && (
        <section className="mt-10">
          <Rise delay={0.12}><div className="flex items-center justify-between mb-2 px-1"><h2 className="text-[13px] font-semibold">{waiting.length > 0 ? 'Needs attention' : 'Recent runs'}</h2><button onClick={() => nav(waiting.length > 0 ? '/runs?tab=approvals' : '/runs')} className="text-[12px] font-medium muted hover:text-[var(--text)]">View all</button></div></Rise>
          <div className="clay px-3 py-1">
            <AnimatePresence initial={false}>
              {(waiting.length > 0 ? waiting : recent).slice(0, 5).map((r, i) => (
                <motion.div key={r.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.15 + i * 0.05, duration: 0.4, ease } }} exit={{ opacity: 0, x: 40 }} className="row">
                  <Tile color={r.status === 'waiting' ? '#f59e0b' : r.status === 'failed' || r.status === 'rejected' ? '#ef6c5a' : '#10b981'} size={34}>{r.status === 'waiting' ? <ShieldCheck size={16} /> : <ListChecks size={16} />}</Tile>
                  <div className="flex-1 min-w-0"><div className="text-[13.5px] font-medium truncate">{r.summary ?? r.workflow}</div><div className="text-[12px] muted truncate">{r.workflow} · {r.started} · <span className="capitalize">{r.status}</span></div></div>
                  <Button size="sm" onClick={() => nav(`/runs?open=${r.id}`)}>{r.status === 'waiting' ? (can(user, 'approve') ? 'Review' : 'Open') : 'Open'}</Button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      <Stagger className="mt-10 grid md:grid-cols-2 gap-4" delay={0.08}>
        <Item>
          <Header title="Agents" onAll={() => nav('/agents')} />
          <div className="clay px-3 py-1">
            {agents.length === 0 && <EmptyRow text="No agents yet." action="Create one" onClick={() => nav('/agents?new=1')} />}
            {agents.slice(0, 3).map((a) => <RowLink key={a.id} name={a.name} meta={`${a.status} · ${a.tools.length} tools`} icon={<Sparkles size={14} />} color={colorFor(a.name)} onClick={() => nav(`/agents/${a.id}`)} />)}
          </div>
        </Item>
        <Item>
          <Header title="Workflows" onAll={() => nav('/workflows')} />
          <div className="clay px-3 py-1">
            {workflows.length === 0 && <EmptyRow text="No workflows yet." action="Build one" onClick={() => nav('/workflows')} />}
            {workflows.slice(0, 3).map((w) => <RowLink key={w.id} name={w.name} meta={`${w.status} · v${w.version}`} icon={<Workflow size={14} />} color={colorFor(w.name)} onClick={() => nav(`/workflows/${w.id}`)} />)}
          </div>
        </Item>
      </Stagger>

      <Rise delay={0.3}><div className="mt-10 text-[12px] muted px-1 flex items-center gap-1.5"><Globe size={12} /> Built-in tools: web search, deep research, read web pages, calculator, JavaScript sandbox, knowledge search, documents, email drafts and approvals.</div></Rise>
    </Page>
  )
}

const Header = ({ title, onAll }: { title: string; onAll?: () => void }) => (<div className="flex items-center justify-between mb-2 px-1"><h2 className="text-[13px] font-semibold">{title}</h2>{onAll && <button onClick={onAll} className="text-[12px] font-medium muted hover:text-[var(--text)]">View all</button>}</div>)
const EmptyRow = ({ text, action, onClick }: { text: string; action: string; onClick: () => void }) => (<div className="row"><span className="flex-1 text-[13px] muted">{text}</span><Button size="sm" onClick={onClick}>{action}</Button></div>)
const RowLink = ({ name, meta, icon, color, onClick }: { name: string; meta: string; icon: React.ReactNode; color: string; onClick: () => void }) => (
  <button onClick={onClick} className="row hover w-full text-left"><Tile color={color} size={30} radius={9}>{icon}</Tile><div className="flex-1 min-w-0"><div className="text-[13px] font-medium truncate">{name}</div><div className="text-[11.5px] muted truncate capitalize">{meta}</div></div><ChevronRight size={15} className="muted" /></button>
)

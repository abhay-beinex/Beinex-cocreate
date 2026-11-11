// Home v2: an inbox and a pulse. Start anything in one line, see what needs you, and what happened lately.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowUp, Sparkles, Workflow, BookOpen, Check, ChevronRight, ShieldCheck, ListChecks, MessageSquare, ThumbsUp, ThumbsDown, RotateCw, Loader2, AlertTriangle, Clock } from 'lucide-react'
import { useApp, useUser, can } from '@/store/app'
import { roleLabel, type Run } from '@/lib/data'
import { resumeRun, rerunFrom } from '@/lib/runner'
import { Button, Tile, colorFor, cx, Chip } from '@/components/ui'
import { AgentAvatar } from '@/components/AgentAvatar'
import { AbilityWells } from '@/components/AgentBits'
import { Page, Rise } from '@/components/motion'
import { currentHoliday, holidayById } from '@/lib/holidays'

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' }
type Intent = 'ask' | 'agent' | 'workflow'

export default function Home() {
  const user = useUser()!
  const nav = useNavigate()
  const { agents, workflows, runs, libraries, customTools, decideRun, spentToday, caps, seasonal, holidayPreview } = useApp()
  const holiday = seasonal ? (holidayPreview ? holidayById(holidayPreview) : currentHoliday()) : undefined
  const [q, setQ] = useState('')
  const [intent, setIntent] = useState<Intent>('ask')
  const [tab, setTab] = useState<'agents' | 'workflows' | 'runs'>('agents')
  const admin = can(user, 'admin')
  const approver = can(user, 'approve')
  const builder = can(user, 'build')

  const waiting = runs.filter((r) => r.status === 'waiting' && (!r.approver || r.approver === user.id || admin))
  const failed = runs.filter((r) => r.status === 'failed' && r.kind !== 'chat').slice(0, 3)
  const running = runs.filter((r) => r.status === 'running')
  const needs = waiting.length + failed.length + running.length
  const hasDocs = libraries.some((l) => l.docs.length > 0)
  const empty = agents.length === 0 && workflows.length === 0
  const setup = [
    { done: agents.length > 0, label: 'Create an agent', desc: 'Describe it; the assistant drafts the rest', icon: Sparkles, to: '/agents/new', color: '#0ea5e9' },
    { done: hasDocs, label: 'Add knowledge', desc: 'Documents agents can cite', icon: BookOpen, to: '/knowledge', color: '#8b5cf6' },
    { done: workflows.length > 0, label: 'Build a workflow', desc: 'Chain steps with a human gate', icon: Workflow, to: '/workflows', color: '#10b981' },
  ]
  const go = () => {
    const t = q.trim(); if (!t) return
    if (intent === 'ask' || !builder) nav(`/chat?q=${encodeURIComponent(t)}`)
    else if (intent === 'agent') nav(`/agents/new?purpose=${encodeURIComponent(t)}`)
    else nav(`/workflows/new?template=blank&build=${encodeURIComponent(t)}`)
  }
  const placeholder = { ask: 'Ask anything. The assistant can search the web, read pages, calculate and run code…', agent: 'Describe the agent: who it helps, what it must do, what it must never do…', workflow: 'Describe the workflow step by step: research X, check Y, ask Z to approve…' }[intent]
  const days = useMemo(() => { const out: { day: string; label: string; ok: number; bad: number }[] = []; for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const key = d.toISOString().slice(0, 10); out.push({ day: key, label: d.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2), ok: 0, bad: 0 }) } for (const r of runs) { const e = out.find((x) => r.started.startsWith(x.day)); if (e) { if (r.status === 'failed' || r.status === 'rejected') e.bad++; else e.ok++ } } return out }, [runs])
  const max = Math.max(1, ...days.map((d) => d.ok + d.bad))
  const total14 = days.reduce((a, d) => a + d.ok + d.bad, 0)
  const failed14 = days.reduce((a, d) => a + d.bad, 0)
  const decided = runs.filter((r) => r.decidedBy).length
  const spent = spentToday(user.id)
  const decide = async (r: Run, d: 'approved' | 'rejected') => { decideRun(r.id, d); if (d === 'approved' && r.kind !== 'chat' && r.cursor) await resumeRun(r.id) }
  const retry = (r: Run) => { const i = r.steps.findIndex((s) => s.status === 'failed'); rerunFrom(r.id, Math.max(0, i), (id) => nav(`/runs?open=${id}`)) }
  const hour = new Date().getHours()
  const sky = hour < 11 ? ['#ffd59e', '#04bbf2'] : hour < 17 ? ['#04bbf2', '#0074d9'] : ['#6d5cff', '#0074d9']

  return (
    <Page className="max-w-[1040px] mx-auto pt-10 pb-16 px-4 relative">
      <motion.div aria-hidden className="absolute -top-6 right-0 w-[240px] h-[240px] rounded-full pointer-events-none" style={{ background: `radial-gradient(circle at 40% 40%, ${sky[0]}55, ${sky[1]}22 55%, transparent 72%)`, filter: 'blur(14px)' }} animate={{ scale: [1, 1.08, 1], x: [0, -10, 0] }} transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }} />
      <Rise>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[11.5px] font-semibold muted mb-1.5">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · {roleLabel[user.role]}</div>
            <h1 className="display text-[30px] font-bold leading-tight">{holiday ? <>{holiday.greeting}, {user.name.split(' ')[0]} <span role="img" aria-label={holiday.name} className="inline-block align-[-2px] ml-1">{holiday.emoji}</span></> : <>{greeting()}, {user.name.split(' ')[0]}</>}</h1>
            <p className="muted mt-1.5 text-[14px]">{needs > 0 ? [waiting.length > 0 ? `${waiting.length} waiting for your sign-off` : '', failed.length > 0 ? `${failed.length} failed` : '', running.length > 0 ? `${running.length} running` : ''].filter(Boolean).join(' · ') + '.' : empty ? 'Start by describing an agent or a workflow below.' : 'Nothing needs you right now. Ask anything, or build something.'}</p>
          </div>
        </div>
      </Rise>

      {/* ---- region 1: start line ---- */}
      <Rise delay={0.06}>
        <div className="clay p-2 mt-6">
          <div className="flex items-center gap-1.5 px-1.5 pt-1.5">
            {([['ask', 'Ask', MessageSquare], ['agent', 'Build an agent', Sparkles], ['workflow', 'Build a workflow', Workflow]] as const).filter(([k]) => k === 'ask' || builder).map(([k, l, I]) => <button key={k} onClick={() => setIntent(k)} className={cx('chip !h-8 !px-3 hover:text-[var(--text)]', intent === k && 'chip-accent')}><I size={12} /> {l}</button>)}
          </div>
          <textarea value={q} onChange={(e) => setQ(e.target.value)} rows={2} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go() } }} placeholder={placeholder} aria-label={placeholder} className="w-full bg-transparent outline-0 resize-none text-[14.5px] px-3 pt-3 placeholder:text-[var(--muted)]" />
          <div className="flex items-center gap-1.5 px-1.5 pb-1 flex-wrap">
            {(intent === 'ask' ? ['Research the latest on EU AI regulation', 'Summarise https://en.wikipedia.org/wiki/Abu_Dhabi', 'What is 18% of 42,500?'] : intent === 'agent' ? ['Answer IT questions from our handbook and escalate the rest', 'Turn meeting notes into owners, actions and dates'] : ['Every Monday research a competitor and notify me if prices moved', 'For each item in a list look up recent news and build one table']).map((s) => <button key={s} onClick={() => { setQ(s) }} className="chip hover:text-[var(--text)]">{s}</button>)}
            <div className="flex-1" />
            <motion.button whileTap={{ scale: 0.9 }} onClick={go} disabled={!q.trim()} className="btn btn-primary btn-icon !rounded-full !w-9 !h-9" title={intent === 'ask' ? 'Ask' : 'Start'} aria-label={intent === 'ask' ? 'Ask' : 'Start'}><ArrowUp size={16} /></motion.button>
          </div>
        </div>
      </Rise>

      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-4 mt-6 items-start">
        {/* ---- region 2: needs you ---- */}
        <Rise delay={0.12}>
          <div className="flex items-center justify-between mb-2 px-1"><h2 className="text-[13px] font-semibold">{empty && needs === 0 ? 'Get started' : 'Needs you'}</h2>{needs > 0 && <button onClick={() => nav(waiting.length ? '/runs?tab=approvals' : '/runs')} className="text-[12px] font-medium muted hover:text-[var(--text)]">Open Runs</button>}</div>
          <div className="clay p-2">
            {needs === 0 && empty && builder && setup.map((s) => (
              <button key={s.label} onClick={() => nav(s.to)} className={cx('w-full text-left flex items-center gap-3 p-2.5 rounded-[14px] hover:bg-[var(--clay-dark)]', s.done && 'opacity-60')}>
                <Tile color={s.done ? '#10b981' : s.color} size={36}>{s.done ? <Check size={16} /> : <s.icon size={16} />}</Tile>
                <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">{s.label}</span><span className="block text-[11.5px] muted truncate">{s.desc}</span></span>
                {!s.done && <ChevronRight size={15} className="muted" />}
              </button>
            ))}
            {needs === 0 && !(empty && builder) && <div className="px-3 py-8 text-center text-[12.5px] muted">Nothing waiting. Approvals, failed runs and running workflows show up here.</div>}
            {running.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-[14px]">
                <Tile color="#0ea5e9" size={36}><Loader2 size={16} className="animate-spin" /></Tile>
                <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold truncate">{r.workflow}</div><div className="text-[11.5px] muted truncate">{r.id} · step {r.steps.length + 1} · {r.summary}</div><div className="h-1 rounded-full bg-[var(--clay-dark)] mt-1.5 overflow-hidden"><motion.div className="h-full bg-[var(--accent)]" animate={{ width: ['20%', '80%', '20%'] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }} /></div></div>
                <Button size="sm" onClick={() => nav(`/runs?open=${r.id}`)}>Watch</Button>
              </div>
            ))}
            {waiting.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-[14px] hover:bg-[var(--clay-dark)]">
                <Tile color="#f59e0b" size={36}><ShieldCheck size={16} /></Tile>
                <button onClick={() => nav(`/runs?open=${r.id}`)} className="flex-1 min-w-0 text-left"><div className="text-[13px] font-semibold truncate">{r.summary ?? r.workflow}</div><div className="text-[11.5px] muted truncate">{r.workflow} · {r.id} · waiting since {r.started.slice(5)}</div></button>
                {approver ? <div className="flex gap-1.5 shrink-0"><Button size="sm" variant="primary" onClick={() => decide(r, 'approved')} title="Approve and sign"><ThumbsUp size={12} /> Approve</Button><Button size="sm" onClick={() => decide(r, 'rejected')} title="Reject"><ThumbsDown size={12} /></Button></div> : <Button size="sm" onClick={() => nav(`/runs?open=${r.id}`)}>Open</Button>}
              </div>
            ))}
            {failed.map((r) => {
              const f = r.steps.find((s) => s.status === 'failed'); return (
                <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-[14px] hover:bg-[var(--clay-dark)]">
                  <Tile color="#e5484d" size={36}><AlertTriangle size={16} /></Tile>
                  <button onClick={() => nav(`/runs?open=${r.id}`)} className="flex-1 min-w-0 text-left"><div className="text-[13px] font-semibold truncate">Failed at {f?.name ?? 'a step'} · {r.workflow}</div><div className="text-[11.5px] muted truncate">{r.id} · {(f?.output ?? '').replace(/^Error:\s*/, '').slice(0, 90)}</div></button>
                  {builder && workflows.some((w) => w.id === r.workflowId) && <Button size="sm" onClick={() => retry(r)} title="Start again from the failed step with the earlier results kept"><RotateCw size={12} /> Run again</Button>}
                </div>
              )
            })}
          </div>
        </Rise>

        {/* ---- region 3: pulse ---- */}
        <Rise delay={0.16}>
          <div className="flex items-center justify-between mb-2 px-1"><h2 className="text-[13px] font-semibold">Last 14 days</h2><span className="text-[12px] muted">${spent.toFixed(2)} of ${caps.user} today</span></div>
          <div className="clay p-4">
            <div className="relative flex items-end gap-1 h-[52px]" role="img" aria-label={`${total14} runs in the last 14 days, ${failed14} failed`}>
              {total14 === 0 && <div className="absolute inset-0 grid place-items-center text-[12px] muted">No runs yet</div>}
              {days.map((d) => { const h = (d.ok + d.bad) / max; return <div key={d.day} className="flex-1 flex flex-col justify-end gap-px h-full" title={`${d.day}: ${d.ok + d.bad} run${d.ok + d.bad === 1 ? '' : 's'}${d.bad ? `, ${d.bad} failed` : ''}`}>{d.bad > 0 && <div className="rounded-[2px] bg-[var(--danger)] opacity-80" style={{ height: `${Math.max(3, (d.bad / (d.ok + d.bad)) * h * 100)}%` }} />}<div className={cx('rounded-[2px]', d.ok + d.bad ? 'bg-[var(--accent)]' : 'bg-[var(--clay-dark)]')} style={{ height: d.ok + d.bad ? `${Math.max(4, (d.ok / (d.ok + d.bad)) * h * 100)}%` : '3px', opacity: d.ok + d.bad ? 0.85 : 1 }} /></div> })}
            </div>
            <div className="flex items-center gap-1.5 mt-3 flex-wrap"><Chip>{total14} run{total14 === 1 ? '' : 's'}</Chip><Chip tone={failed14 ? 'danger' : undefined}>{failed14} failed</Chip><Chip>{decided} decided</Chip><Chip><Clock size={11} /> {workflows.filter((w) => w.status === 'live' && w.triggerType !== 'manual').length} automated</Chip></div>
            <div className="seg mt-4"><button className={cx(tab === 'agents' && 'on')} onClick={() => setTab('agents')}>Agents · {agents.length}</button><button className={cx(tab === 'workflows' && 'on')} onClick={() => setTab('workflows')}>Workflows · {workflows.length}</button><button className={cx(tab === 'runs' && 'on')} onClick={() => setTab('runs')}>Recent runs</button></div>
            <div className="mt-2 -mx-1">
              {tab === 'agents' && (agents.length === 0 ? <EmptyRow text="No agents yet." action={builder ? 'Create one' : undefined} onClick={() => nav('/agents/new')} /> : agents.slice(0, 5).map((a) => <button key={a.id} onClick={() => nav(`/agents/${a.id}`)} className="row hover w-full text-left !py-2.5"><AgentAvatar name={a.name} icon={a.icon} color={a.color} size={30} radius={9} /><div className="flex-1 min-w-0"><div className="text-[13px] font-medium truncate">{a.name}</div><div className="text-[11.5px] muted truncate">{a.status === 'live' ? 'Live' : 'Draft'} · {a.description || 'No description'}</div></div><AbilityWells tools={a.tools} custom={customTools} max={4} size={20} /></button>))}
              {tab === 'workflows' && (workflows.length === 0 ? <EmptyRow text="No workflows yet." action={builder ? 'Build one' : undefined} onClick={() => nav('/workflows')} /> : workflows.slice(0, 5).map((w) => <button key={w.id} onClick={() => nav(`/workflows/${w.id}`)} className="row hover w-full text-left !py-2.5"><Tile color={colorFor(w.name)} size={30} radius={9}><Workflow size={14} /></Tile><div className="flex-1 min-w-0"><div className="text-[13px] font-medium truncate">{w.name}</div><div className="text-[11.5px] muted truncate">{w.status === 'live' ? 'Live' : w.status === 'paused' ? 'Paused' : 'Draft'} · {w.triggerType === 'schedule' ? `Every ${w.schedule?.every} at ${w.schedule?.at}` : w.triggerType === 'manual' ? 'By hand' : w.triggerType === 'link' ? 'By link' : w.triggerType === 'watch' ? 'When a page changes' : 'When a document is added'} · {runs.filter((r) => r.workflowId === w.id).length} runs</div></div><ChevronRight size={15} className="muted" /></button>))}
              {tab === 'runs' && (runs.length === 0 ? <EmptyRow text="No runs yet." /> : runs.slice(0, 5).map((r) => <button key={r.id} onClick={() => nav(`/runs?open=${r.id}`)} className="row hover w-full text-left !py-2.5"><Tile color={r.status === 'waiting' ? '#f59e0b' : r.status === 'failed' || r.status === 'rejected' ? '#e5484d' : r.status === 'running' ? '#0ea5e9' : '#10b981'} size={30} radius={9}><ListChecks size={14} /></Tile><div className="flex-1 min-w-0"><div className="text-[13px] font-medium truncate">{r.workflow}</div><div className="text-[11.5px] muted truncate">{r.id} · {r.started.slice(5)} · <span className="capitalize">{r.status}</span>{r.cost ? ` · $${r.cost.toFixed(3)}` : ''}</div></div><ChevronRight size={15} className="muted" /></button>))}
            </div>
          </div>
        </Rise>
      </div>
    </Page>
  )
}

const EmptyRow = ({ text, action, onClick }: { text: string; action?: string; onClick?: () => void }) => (<div className="row !py-3"><span className="flex-1 text-[13px] muted">{text}</span>{action && <Button size="sm" onClick={onClick}>{action}</Button>}</div>)

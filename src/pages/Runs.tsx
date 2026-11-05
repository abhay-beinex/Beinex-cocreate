import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Fingerprint, ShieldCheck, RotateCw, Workflow as WorkflowIcon } from 'lucide-react'
import { useApp, useUser, can } from '@/store/app'
import { resumeRun, isRunning } from '@/lib/runner'
import type { Run } from '@/lib/data'
import { Button, Chip, Drawer, Modal, PageHeader, Segmented, SearchBox, cx } from '@/components/ui'
import { Page, Stagger, Item } from '@/components/motion'
import { Md } from '@/components/Md'

const tone: Record<Run['status'], 'ok' | 'warn' | 'danger' | 'accent' | undefined> = { waiting: 'warn', approved: 'ok', completed: 'ok', rejected: 'danger', failed: 'danger', running: 'accent' }
const seal = (s: string) => Array.from(s).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 7).toString(16).padStart(8, '0').repeat(8).slice(0, 64)

export default function Runs() {
  const user = useUser()!
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const { runs, audit, decideRun, users } = useApp()
  const [tab, setTab] = useState<'runs' | 'approvals' | 'audit'>(params.get('tab') === 'approvals' ? 'approvals' : 'runs')
  const [status, setStatus] = useState<'all' | Run['status']>('all')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [gate, setGate] = useState<Run | null>(null)
  const approver = can(user, 'approve')
  const open = runs.find((r) => r.id === openId) ?? null

  useEffect(() => { const id = params.get('open'); if (id) { setOpenId(id); setParams({}, { replace: true }) } }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => runs.filter((r) => (tab === 'approvals' ? r.status === 'waiting' : status === 'all' || r.status === status) && (r.id + r.workflow + (r.summary ?? '')).toLowerCase().includes(q.toLowerCase())), [runs, tab, status, q])
  const waiting = runs.filter((r) => r.status === 'waiting').length
  const mine = (r: Run) => !r.approver || r.approver === user.id || user.role === 'admin'

  const decide = async (r: Run, d: 'approved' | 'rejected') => {
    decideRun(r.id, d); setGate(null)
    if (d === 'approved' && r.kind !== 'chat' && r.cursor) await resumeRun(r.id)
  }

  return (
    <Page className="max-w-[1080px] mx-auto pt-8 pb-16 px-4">
      <PageHeader title={tab === 'audit' ? 'Audit log' : tab === 'approvals' ? 'Approvals' : 'Runs'} subtitle={tab === 'audit' ? 'Every change, decision and sign-in.' : tab === 'approvals' ? 'Runs paused for a person to decide. Approving resumes the workflow.' : 'Every workflow run and gated chat action.'} />
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <Segmented value={tab} onChange={setTab} items={[{ id: 'runs', label: 'Runs' }, { id: 'approvals', label: <>Approvals{waiting > 0 && <span className="ml-1.5 inline-grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--warn)] text-white text-[10.5px]">{waiting}</span>}</> }, { id: 'audit', label: 'Audit log' }]} />
        {tab === 'runs' && <Segmented value={status} onChange={setStatus} items={[{ id: 'all', label: 'All' }, { id: 'running', label: 'Running' }, { id: 'waiting', label: 'Waiting' }, { id: 'completed', label: 'Completed' }, { id: 'approved', label: 'Approved' }, { id: 'rejected', label: 'Rejected' }, { id: 'failed', label: 'Failed' }]} />}
        {tab !== 'audit' && <SearchBox value={q} onChange={setQ} placeholder="Search runs" className="w-[220px]" />}
      </div>

      {tab !== 'audit' ? (
        <Stagger className="clay px-3 py-1" delay={0.04}>
          <div className="row text-[11px] font-semibold uppercase tracking-wider muted !py-2"><span className="w-[70px]">Run</span><span className="flex-1">Workflow</span><span className="w-[100px]">Status</span><span className="w-[150px]">Trigger</span><span className="w-[70px] text-right">Duration</span><span className="w-[60px] text-right">Cost</span></div>
          {list.length === 0 && <div className="py-10 text-center muted text-[13px]">{tab === 'approvals' ? 'Nothing waiting for approval.' : runs.length === 0 ? 'No runs yet. Run a workflow or use a gated tool in chat.' : 'No runs match.'}</div>}
          {list.map((r) => (
            <Item key={r.id}>
              <button onClick={() => setOpenId(r.id)} className="row hover w-full text-left">
                <span className="w-[70px] text-[13px] font-medium">{r.id}</span>
                <span className="flex-1 min-w-0"><span className="block text-[13px] truncate">{r.workflow}</span><span className="block text-[11.5px] muted truncate">{r.summary ?? r.started}</span></span>
                <span className="w-[100px]"><Chip tone={tone[r.status]} className="capitalize">{(r.status === 'waiting' || r.status === 'running') && <motion.span className={cx('w-1.5 h-1.5 rounded-full', r.status === 'running' ? 'bg-[var(--accent)]' : 'bg-[var(--warn)]')} animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.4 }} />}{r.status}</Chip></span>
                <span className="w-[150px] text-[12.5px] muted truncate">{r.trigger}</span>
                <span className="w-[70px] text-right text-[13px] tabular-nums">{r.duration}</span>
                <span className="w-[60px] text-right text-[12.5px] tabular-nums muted">${r.cost.toFixed(3)}</span>
              </button>
            </Item>
          ))}
        </Stagger>
      ) : (
        <Stagger className="clay px-3 py-1" delay={0.03}>
          {audit.length === 0 && <div className="py-10 text-center muted text-[13px]">No events yet.</div>}
          {audit.map((a) => (
            <Item key={a.id}>
              <div className="row"><span className="w-[130px] text-[12px] muted tabular-nums">{a.at}</span><span className="w-[160px] text-[13px] font-medium truncate">{a.actor}</span><span className="w-[180px] text-[13px]">{a.action}</span><span className="flex-1 text-[13px] truncate">{a.target}</span><span className="w-[200px] text-[12px] muted truncate">{a.detail}</span></div>
            </Item>
          ))}
        </Stagger>
      )}

      <Drawer open={!!open} onClose={() => setOpenId(null)} title={open ? `Run ${open.id}` : ''} width={560}>
        {open && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-2 flex-wrap"><Chip tone={tone[open.status]} className="capitalize">{open.status}</Chip><span className="text-[12.5px] muted">{open.trigger} · {open.started} · {open.duration} · ${open.cost.toFixed(3)}</span>{open.workflowId !== 'chat' && <button onClick={() => nav(`/workflows/${open.workflowId}`)} className="text-[12px] accent-ink inline-flex items-center gap-1 hover:underline"><WorkflowIcon size={12} /> {open.workflow}</button>}</div>
            {open.input && <div className="flat p-3 text-[12.5px]"><div className="text-[11px] font-semibold muted uppercase tracking-wider mb-1">Input</div><div className="whitespace-pre-wrap">{open.input}</div></div>}
            {open.status === 'waiting' && (approver && mine(open) ? <Button variant="primary" onClick={() => setGate(open)}><ShieldCheck size={14} /> Review and decide</Button> : <div className="flat p-3 text-[12.5px] muted">Waiting for {users.find((u) => u.id === open.approver)?.name ?? 'an approver'}. {approver ? 'This run is assigned to someone else.' : 'Your role cannot sign off.'}</div>)}
            {open.status === 'approved' && open.cursor && !isRunning(open.id) && <Button onClick={() => resumeRun(open.id)}><RotateCw size={14} /> Resume remaining steps</Button>}
            <div>
              <div className="text-[12px] font-semibold mb-2">Steps</div>
              <ol className="flat divide-y divide-[var(--line)]">
                {open.steps.map((s, i) => (
                  <li key={i} className="px-3 py-2.5">
                    <div className="flex items-center gap-3"><span className={cx('w-2 h-2 rounded-full', s.status === 'ok' ? 'bg-[var(--ok)]' : s.status === 'failed' ? 'bg-[var(--danger)]' : s.status === 'skipped' ? 'bg-[var(--muted)]' : 'bg-[var(--warn)]')} /><span className="flex-1 text-[13px] font-medium">{s.name}{s.branch && <span className="muted font-normal"> → {s.branch}</span>}</span><span className="text-[11.5px] muted">{s.model ? `${s.model} · ` : ''}{s.ms ? `${(s.ms / 1000).toFixed(1)}s` : s.status === 'waiting' ? 'pending' : ''}{s.cost ? ` · $${s.cost.toFixed(4)}` : ''}</span></div>
                    {s.output && <Md className="prose-chat text-[12px] muted mt-1.5 pl-5">{s.output}</Md>}
                  </li>
                ))}
                {open.status === 'running' && <li className="px-3 py-2.5 text-[12.5px] accent-ink flex items-center gap-2"><motion.span className="w-2 h-2 rounded-full bg-[var(--accent)]" animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1 }} /> Running next step…</li>}
              </ol>
            </div>
            {open.decidedBy && <div className="text-[12.5px]">Decided by <b>{open.decidedBy}</b></div>}
            <div><div className="text-[12px] font-semibold mb-1 flex items-center gap-1.5"><Fingerprint size={13} /> Audit seal</div><code className="text-[11px] break-all muted">{seal(open.id + open.status + (open.decidedBy ?? '') + open.steps.length)}</code></div>
          </div>
        )}
      </Drawer>

      <Modal open={!!gate} onClose={() => setGate(null)} title={`Decide on ${gate?.id ?? ''}`} width={640}>
        {gate && (
          <div className="flex flex-col gap-4">
            <div className="text-[13px]">{gate.summary}</div>
            {gate.steps.filter((s) => s.output && s.status === 'ok').slice(-2).map((s, i) => <div key={i} className="flat p-3 text-[12.5px] max-h-[260px] overflow-auto"><div className="font-semibold mb-1">{s.name}</div><Md className="prose-chat muted">{s.output!}</Md></div>)}
            <div className="text-[12px] muted">{gate.kind === 'chat' ? 'Approving records your decision; the action itself is carried out by a person.' : gate.cursor ? 'Approving signs the decision and resumes the remaining steps now.' : 'Approving signs the decision and completes the run.'} Rejecting stops it.</div>
            <div className="flex gap-2 justify-end"><Button onClick={() => decide(gate, 'rejected')}>Reject</Button><Button variant="primary" onClick={() => decide(gate, 'approved')}><Fingerprint size={14} /> Approve and sign</Button></div>
          </div>
        )}
      </Modal>
    </Page>
  )
}

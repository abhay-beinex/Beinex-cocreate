import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Md } from '@/components/Md'
import { Fingerprint, ShieldCheck } from 'lucide-react'
import { useApp, useUser, can } from '@/store/app'
import type { Run } from '@/lib/data'
import { Button, Chip, Drawer, Modal, PageHeader, Segmented, SearchBox, cx } from '@/components/ui'
import { Page, Stagger, Item } from '@/components/motion'

const tone: Record<Run['status'], 'ok' | 'warn' | 'danger' | 'accent' | undefined> = { waiting: 'warn', approved: 'ok', completed: 'ok', rejected: 'danger', failed: 'danger', running: 'accent' }
const seal = (s: string) => Array.from(s).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 7).toString(16).padStart(8, '0').repeat(8).slice(0, 64)

export default function Runs() {
  const user = useUser()!
  const [params, setParams] = useSearchParams()
  const { runs, audit, decideRun } = useApp()
  const [tab, setTab] = useState<'runs' | 'approvals' | 'audit'>(params.get('tab') === 'approvals' ? 'approvals' : 'runs')
  const [status, setStatus] = useState<'all' | Run['status']>('all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Run | null>(null)
  const [gate, setGate] = useState<Run | null>(null)
  const approver = can(user, 'approve')

  useEffect(() => { const id = params.get('open'); if (id) { const r = runs.find((x) => x.id === id); if (r) setOpen(r); setParams({}, { replace: true }) } }, [params]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setOpen(runs.find((r) => r.id === open.id) ?? null) }, [runs]) // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => runs.filter((r) => (tab === 'approvals' ? r.status === 'waiting' : status === 'all' || r.status === status) && (r.id + r.workflow + (r.summary ?? '')).toLowerCase().includes(q.toLowerCase())), [runs, tab, status, q])
  const waiting = runs.filter((r) => r.status === 'waiting').length

  return (
    <Page className="max-w-[1080px] mx-auto pt-8 pb-16 px-4">
      <PageHeader title={tab === 'audit' ? 'Audit log' : tab === 'approvals' ? 'Approvals' : 'Runs'} subtitle={tab === 'audit' ? 'Every change, decision and sign-in. Immutable.' : tab === 'approvals' ? 'Gated actions waiting for a human decision.' : 'Every execution and human decision, sealed for audit.'} />
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <Segmented value={tab} onChange={setTab} items={[{ id: 'runs', label: 'Runs' }, { id: 'approvals', label: <>Approvals{waiting > 0 && <span className="ml-1.5 inline-grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--warn)] text-white text-[10.5px]">{waiting}</span>}</> }, { id: 'audit', label: 'Audit log' }]} />
        {tab === 'runs' && <Segmented value={status} onChange={setStatus} items={[{ id: 'all', label: 'All' }, { id: 'waiting', label: 'Waiting' }, { id: 'approved', label: 'Approved' }, { id: 'rejected', label: 'Rejected' }, { id: 'failed', label: 'Failed' }]} />}
        {tab !== 'audit' && <SearchBox value={q} onChange={setQ} placeholder="Search runs" className="w-[220px]" />}
      </div>

      {tab !== 'audit' ? (
        <Stagger className="clay px-3 py-1" delay={0.04}>
          <div className="row text-[11px] font-semibold uppercase tracking-wider muted !py-2"><span className="w-[70px]">Run</span><span className="flex-1">Workflow</span><span className="w-[100px]">Status</span><span className="w-[150px]">Trigger</span><span className="w-[70px] text-right">Duration</span><span className="w-[60px] text-right">Cost</span></div>
          {list.length === 0 && <div className="py-10 text-center muted text-[13px]">{tab === 'approvals' ? 'Nothing waiting for approval.' : 'No runs match.'}</div>}
          {list.map((r) => (
            <Item key={r.id}>
              <button onClick={() => setOpen(r)} className="row hover w-full text-left">
                <span className="w-[70px] text-[13px] font-medium">{r.id}</span>
                <span className="flex-1 min-w-0"><span className="block text-[13px] truncate">{r.workflow}</span><span className="block text-[11.5px] muted truncate">{r.summary ?? r.started}</span></span>
                <span className="w-[100px]"><Chip tone={tone[r.status]} className="capitalize">{r.status === 'waiting' && <motion.span className="w-1.5 h-1.5 rounded-full bg-[var(--warn)]" animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.4 }} />}{r.status}</Chip></span>
                <span className="w-[150px] text-[12.5px] muted truncate">{r.trigger}</span>
                <span className="w-[70px] text-right text-[13px] tabular-nums">{r.duration}</span>
                <span className="w-[60px] text-right text-[12.5px] tabular-nums muted">${r.cost.toFixed(3)}</span>
              </button>
            </Item>
          ))}
        </Stagger>
      ) : (
        <Stagger className="clay px-3 py-1" delay={0.03}>
          {audit.map((a) => (
            <Item key={a.id}>
              <div className="row">
                <span className="w-[130px] text-[12px] muted tabular-nums">{a.at}</span>
                <span className="w-[170px] text-[13px] font-medium truncate">{a.actor}</span>
                <span className="w-[160px] text-[13px]">{a.action}</span>
                <span className="flex-1 text-[13px] truncate">{a.target}</span>
                <span className="w-[220px] text-[12px] muted truncate">{a.detail}</span>
              </div>
            </Item>
          ))}
        </Stagger>
      )}

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? `Run ${open.id}` : ''} width={540}>
        {open && (
          <div className="flex flex-col gap-5">
            <div className="text-[13px] muted">{open.workflow} · {open.trigger} · {open.started} · {open.duration} · ${open.cost.toFixed(3)}</div>
            {open.summary && <div className="text-[13px]">{open.summary}</div>}
            {open.status === 'waiting' && (approver ? <Button variant="primary" onClick={() => setGate(open)}><ShieldCheck size={14} /> Review and decide</Button> : <div className="flat p-3 text-[12.5px] muted">Waiting for an approver. Your role cannot sign off.</div>)}
            <div>
              <div className="text-[12px] font-semibold mb-2">Trace</div>
              <ol className="flat divide-y divide-[var(--line)]">
                {open.steps.map((s, i) => (
                  <li key={i} className="px-3 py-2.5">
                    <div className="flex items-center gap-3"><span className={cx('w-2 h-2 rounded-full', s.status === 'ok' ? 'bg-[var(--ok)]' : s.status === 'failed' ? 'bg-[var(--danger)]' : s.status === 'skipped' ? 'bg-[var(--muted)]' : 'bg-[var(--warn)]')} /><span className="flex-1 text-[13px] font-medium">{s.name}</span><span className="text-[11.5px] muted">{s.model ? `${s.model} · ` : ''}{s.ms ? `${(s.ms / 1000).toFixed(1)}s` : s.status === 'waiting' ? 'pending' : s.status}{s.tokens ? ` · ${s.tokens.toLocaleString()} tok` : ''}</span></div>
                    {s.output && <Md className="prose-chat text-[12px] muted mt-1.5 pl-5">{s.output}</Md>}
                  </li>
                ))}
              </ol>
            </div>
            {open.decidedBy && <div className="text-[12.5px]">Decided by <b>{open.decidedBy}</b></div>}
            <div><div className="text-[12px] font-semibold mb-1 flex items-center gap-1.5"><Fingerprint size={13} /> Audit seal (SHA-256)</div><code className="text-[11px] break-all muted">{seal(open.id + open.status + (open.decidedBy ?? ''))}</code></div>
          </div>
        )}
      </Drawer>

      <Modal open={!!gate} onClose={() => setGate(null)} title={`Approve ${gate?.id ?? ''}`} width={640}>
        {gate && (
          <div className="flex flex-col gap-4">
            <div className="text-[13px]">{gate.summary}</div>
            {gate.steps.filter((s) => s.output && s.status === 'ok').map((s, i) => <div key={i} className="flat p-3 text-[12.5px]"><div className="font-semibold mb-1">{s.name}</div><Md className="prose-chat muted">{s.output!}</Md></div>)}
            <div className="text-[12px] muted">Approving signs the decision with your account and seals the run. Rejecting halts the transaction.</div>
            <div className="flex gap-2 justify-end">
              <Button onClick={() => { decideRun(gate.id, 'rejected'); setGate(null) }}>Reject</Button>
              <Button variant="primary" onClick={() => { decideRun(gate.id, 'approved'); setGate(null) }}><Fingerprint size={14} /> Approve and sign</Button>
            </div>
          </div>
        )}
      </Modal>
    </Page>
  )
}

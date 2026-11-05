import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Workflow as WorkflowIcon, Zap, Clock, Play } from 'lucide-react'
import { useApp, useUser, can } from '@/store/app'
import { workflowTemplates } from '@/lib/data'
import { startRun } from '@/lib/runner'
import { Button, Dot, Empty, Field, Modal, PageHeader, SearchBox, Textarea, Tile, colorFor } from '@/components/ui'
import { Page, Stagger, Item } from '@/components/motion'

export default function Workflows() {
  const nav = useNavigate()
  const user = useUser()!
  const { workflows, runs } = useApp()
  const [q, setQ] = useState('')
  const [pick, setPick] = useState(false)
  const [runFor, setRunFor] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [starting, setStarting] = useState(false)
  const list = workflows.filter((w) => w.name.toLowerCase().includes(q.toLowerCase()))
  const editable = can(user, 'build')

  const run = async () => { const w = workflows.find((x) => x.id === runFor); if (!w || !input.trim()) return; setStarting(true); const r = await startRun(w, input.trim(), 'Manual'); setStarting(false); setRunFor(null); setInput(''); nav(`/runs?open=${r.id}`) }

  return (
    <Page className="max-w-[1080px] mx-auto pt-8 pb-16 px-4">
      <PageHeader title="Workflows" subtitle="Chain agents, conditions, actions and approvals. Run them by hand or on a schedule." actions={editable && <Button variant="primary" onClick={() => setPick(true)}><Plus size={15} /> New workflow</Button>} />
      {workflows.length === 0 ? (
        <div className="clay"><Empty title="No workflows yet" body="Start from a template such as Research and draft, or Monitor and alert, then run it with an input. Steps that need a person pause the run until they decide." action={editable && <Button variant="primary" onClick={() => setPick(true)}><Plus size={14} /> New workflow</Button>} /></div>
      ) : (
        <>
          <SearchBox value={q} onChange={setQ} placeholder="Search workflows" className="w-[280px] mb-5" />
          <Stagger className="clay px-3 py-1" delay={0.05}>
            <div className="row text-[11px] font-semibold uppercase tracking-wider muted !py-2"><span className="w-[34px]" /><span className="flex-1">Name</span><span className="w-[190px]">Trigger</span><span className="w-[70px] text-right">Runs</span><span className="w-[90px] text-right">Waiting</span><span className="w-[90px]" /></div>
            {list.map((w) => {
              const wr = runs.filter((r) => r.workflowId === w.id)
              return (
                <Item key={w.id}>
                  <div className="row hover">
                    <button onClick={() => nav(`/workflows/${w.id}`)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <Tile color={colorFor(w.name)} size={34}><WorkflowIcon size={15} /></Tile>
                      <div className="flex-1 min-w-0"><div className="text-[13.5px] font-medium flex items-center gap-2">{w.name}<Dot tone={w.status === 'live' ? 'ok' : w.status === 'paused' ? 'warn' : 'muted'} /><span className="text-[11px] muted font-normal capitalize">{w.status} · v{w.version}</span></div><div className="text-[12px] muted truncate">{w.description || `${w.nodes.length} steps`}</div></div>
                    </button>
                    <span className="w-[190px] text-[12.5px] muted inline-flex items-center gap-1.5 truncate">{w.triggerType === 'schedule' ? <><Clock size={12} /> Every {w.schedule?.every} at {w.schedule?.at}</> : <><Zap size={12} /> Manual</>}</span>
                    <span className="w-[70px] text-right text-[13px] tabular-nums">{wr.length}</span>
                    <span className="w-[90px] text-right text-[13px] tabular-nums">{wr.filter((r) => r.status === 'waiting').length || '—'}</span>
                    <span className="w-[90px] text-right"><Button size="sm" onClick={() => { setRunFor(w.id); setInput(w.schedule?.input ?? '') }}><Play size={12} /> Run</Button></span>
                  </div>
                </Item>
              )
            })}
          </Stagger>
        </>
      )}
      <Modal open={pick} onClose={() => setPick(false)} title="New workflow" width={560}>
        <div className="flex flex-col gap-2">{workflowTemplates.map((t) => <button key={t.id} onClick={() => nav(`/workflows/new?template=${t.id}`)} className="flat p-4 text-left hover:bg-[var(--surface)]"><div className="text-[13.5px] font-semibold flex items-center gap-2">{t.name}{t.triggerType === 'schedule' && <span className="chip"><Clock size={11} /> scheduled</span>}</div><div className="text-[12px] muted">{t.desc}</div></button>)}</div>
      </Modal>
      <Modal open={!!runFor} onClose={() => setRunFor(null)} title={`Run ${workflows.find((w) => w.id === runFor)?.name ?? ''}`} width={520}>
        <div className="flex flex-col gap-4">
          <Field label="Input" hint="Becomes the first message of the run."><Textarea rows={4} value={input} onChange={(e) => setInput(e.target.value)} autoFocus placeholder="What should this run work on?" /></Field>
          <div className="flex justify-end"><Button variant="primary" onClick={run} disabled={!input.trim() || starting}><Play size={13} /> {starting ? 'Starting…' : 'Run now'}</Button></div>
        </div>
      </Modal>
    </Page>
  )
}

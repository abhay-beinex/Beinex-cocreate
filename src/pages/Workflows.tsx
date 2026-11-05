import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, Workflow as WorkflowIcon, Zap } from 'lucide-react'
import { useApp } from '@/store/app'
import { workflowTemplates } from '@/lib/data'
import { Button, Dot, Modal, PageHeader, SearchBox, Tile, colorFor } from '@/components/ui'
import { Page, Stagger, Item } from '@/components/motion'

const spark = (seed: number) => Array.from({ length: 14 }, (_, i) => 30 + Math.abs(Math.sin(seed * 3 + i * 1.3)) * 60)

export default function Workflows() {
  const nav = useNavigate()
  const { workflows } = useApp()
  const [q, setQ] = useState('')
  const [pick, setPick] = useState(false)
  const list = workflows.filter((w) => w.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <Page className="max-w-[1080px] mx-auto pt-8 pb-16 px-4">
      <PageHeader title="Workflows" subtitle="Multi-step processes with human approval built in." actions={<Button variant="primary" onClick={() => setPick(true)}><Plus size={15} /> New workflow</Button>} />
      <SearchBox value={q} onChange={setQ} placeholder="Search workflows" className="w-[280px] mb-5" />
      <Stagger className="clay px-3 py-1" delay={0.05}>
        <div className="row text-[11px] font-semibold uppercase tracking-wider muted !py-2"><span className="w-[34px]" /><span className="flex-1">Name</span><span className="w-[200px]">Trigger</span><span className="w-[110px]">Last 14 days</span><span className="w-[80px] text-right">Runs / wk</span><span className="w-[100px] text-right">Straight-through</span></div>
        {list.map((w, i) => {
          const pts = w.runsWeek ? spark(i + 1) : []
          return (
            <Item key={w.id}>
              <button onClick={() => nav(`/workflows/${w.id}`)} className="row hover w-full text-left">
                <Tile color={colorFor(w.name)} size={34}><WorkflowIcon size={15} /></Tile>
                <div className="flex-1 min-w-0"><div className="text-[13.5px] font-medium flex items-center gap-2">{w.name}<Dot tone={w.status === 'live' ? 'ok' : w.status === 'paused' ? 'warn' : 'muted'} /><span className="text-[11px] muted font-normal">v{w.version}</span></div><div className="text-[12px] muted truncate">{w.description}</div></div>
                <span className="w-[200px] text-[12.5px] muted inline-flex items-center gap-1.5 truncate"><Zap size={12} /> {w.trigger}</span>
                <span className="w-[110px] h-7">{pts.length > 0 && <svg viewBox="0 0 140 30" className="w-[100px] h-7"><motion.polyline fill="none" stroke={colorFor(w.name)} strokeWidth="2" strokeLinecap="round" points={pts.map((p, j) => `${j * 10},${30 - p * 0.3}`).join(' ')} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, delay: 0.3 + i * 0.1 }} /></svg>}</span>
                <span className="w-[80px] text-right text-[13px] tabular-nums">{w.runsWeek.toLocaleString()}</span>
                <span className="w-[100px] text-right text-[13px] tabular-nums">{w.straightThrough ? `${w.straightThrough}%` : '—'}</span>
              </button>
            </Item>
          )
        })}
      </Stagger>
      <Modal open={pick} onClose={() => setPick(false)} title="New workflow" width={520}>
        <div className="flex flex-col gap-2">
          {workflowTemplates.map((t) => <button key={t.id} onClick={() => nav(`/workflows/new?template=${t.id}`)} className="flat p-4 text-left hover:bg-[var(--surface)]"><div className="text-[13.5px] font-semibold">{t.name}</div><div className="text-[12px] muted">{t.desc}</div></button>)}
        </div>
      </Modal>
    </Page>
  )
}

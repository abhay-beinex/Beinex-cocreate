// "By link" trigger: opening /run/:workflowId starts a run of a published workflow. Other tools and bookmarks can use it.
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Link2, Loader2, CheckCircle2, AlertTriangle, Hourglass, Play } from 'lucide-react'
import { useApp, useUser } from '@/store/app'
import { startRun } from '@/lib/runner'
import { Button, Tile } from '@/components/ui'
import { Page } from '@/components/motion'

export default function RunLink() {
  const { workflowId } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const user = useUser()
  const canRun = user?.role !== 'auditor'
  const { workflows, runs, apiKey } = useApp()
  const wf = workflows.find((w) => w.id === workflowId)
  const [runId, setRunId] = useState<string | null>(null)
  const once = useRef(false)
  const input = params.get('input') || wf?.schedule?.input || 'Started by link'
  const ok = !!wf && wf.status === 'live' && wf.triggerType === 'link'
  useEffect(() => { if (ok && canRun && !once.current && apiKey) { once.current = true; startRun(wf!, input, 'By link', (id) => setRunId(id)) } }, [ok, canRun, apiKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const run = runId ? runs.find((r) => r.id === runId) : undefined
  return (
    <Page className="h-full grid place-items-center p-6">
      <div className="clay p-8 max-w-[460px] w-full flex flex-col items-center text-center gap-3">
        <Tile color="#64748b" size={44} radius={14}><Link2 size={20} /></Tile>
        {!wf ? <><div className="display text-[18px] font-bold">No workflow at this link</div><div className="text-[13px] muted">It may have been deleted.</div></>
          : !canRun ? <><div className="display text-[18px] font-bold">{wf.name}</div><div className="text-[13px] muted flex items-center gap-1.5"><AlertTriangle size={14} className="text-[var(--warn)]" /> Your role is read-only and cannot start workflow runs.</div><Button size="sm" onClick={() => nav(`/workflows/${wf.id}`)}>Open the workflow</Button></>
            : !ok ? <><div className="display text-[18px] font-bold">{wf.name}</div><div className="text-[13px] muted flex items-center gap-1.5"><AlertTriangle size={14} className="text-[var(--warn)]" /> {wf.status !== 'live' ? 'This workflow is not published.' : 'This workflow does not start by link.'}</div><Button size="sm" onClick={() => nav(`/workflows/${wf.id}`)}>Open the workflow</Button></>
              : !apiKey ? <><div className="display text-[18px] font-bold">{wf.name}</div><div className="text-[13px] text-[var(--warn)]">Models are not available right now, so the run could not start.</div></>
                : <>
                  <div className="display text-[18px] font-bold">{wf.name}</div>
                  <div className="text-[13px] muted">Started by link with: <span className="text-[var(--text)]">{input.slice(0, 160)}</span></div>
                  {run ? <div className="text-[13px] flex items-center gap-1.5">{run.status === 'running' ? <Loader2 size={14} className="animate-spin accent-ink" /> : run.status === 'waiting' ? <Hourglass size={14} className="text-[var(--warn)]" /> : run.status === 'failed' || run.status === 'rejected' ? <AlertTriangle size={14} className="text-[var(--danger)]" /> : <CheckCircle2 size={14} className="text-[var(--ok)]" />} {run.id} · {run.status === 'waiting' ? 'waiting for approval' : run.status} · {run.steps.length} step{run.steps.length === 1 ? '' : 's'}</div> : <div className="text-[13px] flex items-center gap-1.5"><Loader2 size={14} className="animate-spin accent-ink" /> Starting…</div>}
                  <div className="flex gap-2 mt-2">{run && <Button size="sm" variant="primary" onClick={() => nav(`/runs?open=${run.id}`)}><Play size={12} /> Open the run</Button>}<Button size="sm" onClick={() => nav(`/workflows/${wf.id}`)}>Open the workflow</Button></div>
                </>}
      </div>
    </Page>
  )
}

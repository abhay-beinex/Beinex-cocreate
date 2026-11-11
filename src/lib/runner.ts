// Wires the workflow engine to the store: start runs, resume after approval, re-run from a step, try one step,
// and fire triggers (schedules, page watches, document events) while the app is open.
import { useApp, profileModels } from '@/store/app'
import { execute, newRun, isDue, watchDue, textHash, varsAfter, runStepOnce, type EngineCtx } from './engine'
import { runTool } from './tools'
import type { Run, RunStep, Workflow } from './data'

const running = new Set<string>()

const ctx = (): EngineCtx => {
  const s = useApp.getState()
  return {
    key: s.apiKey, models: profileModels(s), agents: s.agents, councils: s.councils, libraries: s.libraries, custom: s.customTools, users: s.users, workflows: s.workflows,
    canSpend: () => useApp.getState().canSpend(), onSpend: (c) => useApp.getState().recordSpend(c),
    onSaveDocument: (d) => useApp.getState().addDoc('outputs', d),
    onNotify: (n) => useApp.getState().notify(n),
    onUpdate: (run) => useApp.getState().updateRun(run.id, run),
    runChild: (wf, input, parent) => startRun(wf, input, `Called by ${parent.id}`, undefined, { parentRunId: parent.id }),
  }
}

export async function startRun(wf: Workflow, input: string, trigger = 'Manual', onStart?: (id: string) => void, extra: Partial<Run> = {}): Promise<Run> {
  const s = useApp.getState()
  const run = { ...newRun(wf, input, trigger, s.currentUserId ?? 'system'), ...extra }
  run.id = s.addRun(run); onStart?.(run.id)
  s.markWorkflowRan(wf.id)
  running.add(run.id)
  try { return await execute(run, wf, ctx()) } finally { running.delete(run.id) }
}

export async function resumeRun(runId: string): Promise<Run | undefined> {
  const s = useApp.getState()
  const run = s.runs.find((r) => r.id === runId); const wf = run && s.workflows.find((w) => w.id === run.workflowId)
  if (!run || !wf || running.has(runId)) return run
  if (!run.cursor) { s.updateRun(runId, { finished: run.finished ?? new Date().toISOString().slice(0, 16).replace('T', ' ') }); return run }
  running.add(runId)
  try { return await execute({ ...run, status: 'running' }, wf, ctx()) } finally { running.delete(runId) }
}

/** Start a new run that keeps the first `stepIndex` steps of an earlier run and continues from that step with the same variables. */
export async function rerunFrom(runId: string, stepIndex: number, onStart?: (id: string) => void): Promise<Run | undefined> {
  const s = useApp.getState()
  const prev = s.runs.find((r) => r.id === runId); const wf = prev && s.workflows.find((w) => w.id === prev.workflowId)
  if (!prev || !wf) return undefined
  const from = prev.steps[stepIndex]
  const nodeId = from?.nodeId && wf.nodes.some((n) => n.id === from.nodeId) ? from.nodeId : undefined
  const kept: RunStep[] = prev.steps.slice(0, stepIndex).map((st) => ({ ...st }))
  const vars = varsAfter(prev, stepIndex)
  const run: Run = { ...newRun(wf, prev.input ?? '', `Again from step ${stepIndex + 1} of ${prev.id}`, s.currentUserId ?? 'system'), steps: kept, vars, cost: kept.reduce((a, x) => a + (x.cost ?? 0), 0), rerunOf: { runId, step: stepIndex },
    context: `Input:\n${prev.input ?? ''}` + kept.filter((x) => x.key && x.status === 'ok' && x.output).map((x) => `\n\n[${x.name}]\n${vars[x.key!] ?? ''}`).join(''), cursor: nodeId ?? null }
  run.id = s.addRun(run); onStart?.(run.id)
  running.add(run.id)
  try { return await execute(run, wf, ctx()) } finally { running.delete(run.id) }
}

/** Run one step on its own with sample variables (the builder's "Try this step"). */
export const tryStep = (wf: Workflow, nodeId: string, vars: Record<string, string>) => runStepOnce(wf, nodeId, vars, ctx())

export const isRunning = (id: string) => running.has(id)

/** Runs left as "running" by a reload or a closed tab cannot continue; mark them failed so they can be run again from the last step. */
export function reconcileRuns() {
  const s = useApp.getState()
  for (const r of s.runs) {
    if (r.status !== 'running' || running.has(r.id)) continue
    const steps = [...r.steps, { name: 'Interrupted', ms: 0, status: 'failed' as const, output: 'The page was reloaded or closed while this run was in progress, so it could not continue. Use "Again from here" on the last finished step to resume.' }]
    s.updateRun(r.id, { status: 'failed', cursor: null, finished: new Date().toISOString().slice(0, 16).replace('T', ' '), steps })
    s.notify({ title: `Run interrupted: ${r.workflow}`, body: `${r.id} stopped when the page was reloaded. You can run it again from the last step.`, link: `/runs?open=${r.id}`, kind: 'run' })
  }
}

const scheduleProblem = (wf: Workflow) => {
  const s = useApp.getState()
  if (!s.apiKey) return 'Models are not available, so the run could not start.'
  if (!s.canSpend()) return 'The daily spend cap is reached, so the run could not start.'
  return null
}

/** Called every minute by the shell. Fires due schedules and page watches while the app is open. */
export async function tickSchedules() {
  const s = useApp.getState()
  if (s.schedulesPaused || !s.currentUserId) return
  for (const wf of s.workflows) {
    if (isDue(wf)) {
      const problem = scheduleProblem(wf)
      if (problem) { s.markWorkflowRan(wf.id); s.notify({ title: `Schedule problem: ${wf.name}`, body: problem, link: `/workflows/${wf.id}`, kind: 'schedule' }); continue }
      await startRun(wf, wf.schedule?.input || 'Scheduled run', `Schedule · every ${wf.schedule?.every} at ${wf.schedule?.at}`)
    }
    if (watchDue(wf)) await checkWatch(wf)
  }
}

/** Fetch the watched page; start the workflow when its text changed since the last check. */
export async function checkWatch(wf: Workflow, force = false): Promise<'changed' | 'same' | 'first' | 'error'> {
  const s = useApp.getState()
  if (!wf.watch?.url) return 'error'
  const text = await runTool('read_url', JSON.stringify({ url: wf.watch.url }), { key: s.apiKey, models: { fast: s.defaultModel, reasoning: s.defaultModel }, libraries: [] })
  if (/^Could not|^Provide a full|^Tool error/.test(text)) { s.patchWorkflow(wf.id, { watch: { ...wf.watch, lastCheckedAt: Date.now() } }); s.notify({ title: `Schedule problem: ${wf.name}`, body: `The watched page could not be read: ${text.slice(0, 120)}`, link: `/workflows/${wf.id}`, kind: 'schedule' }); return 'error' }
  const hash = textHash(text.replace(/\d{1,2}:\d{2}(:\d{2})?/g, '').slice(0, 40000))
  const first = !wf.watch.lastHash
  s.patchWorkflow(wf.id, { watch: { ...wf.watch, lastHash: hash, lastCheckedAt: Date.now() } })
  if (first && !force) return 'first'
  if (hash === wf.watch.lastHash && !force) return 'same'
  const problem = scheduleProblem(wf)
  if (problem) { s.notify({ title: `Schedule problem: ${wf.name}`, body: problem, link: `/workflows/${wf.id}`, kind: 'schedule' }); return 'error' }
  await startRun(wf, `${wf.watch.input || 'The watched page changed.'}\n\nPage: ${wf.watch.url}\n\nPage text:\n${text.slice(0, 8000)}`, `Page changed · ${new URL(wf.watch.url).hostname}`)
  return 'changed'
}

let seenDocs: Set<string> | null = null
/** Watches the knowledge libraries; a newly added document starts every live workflow that waits for one. Returns an unsubscribe. */
export function watchDocuments() {
  const ids = (libs: { id: string; docs: { id: string }[] }[]) => new Set(libs.flatMap((l) => l.docs.map((d) => `${l.id}:${d.id}`)))
  seenDocs = ids(useApp.getState().libraries)
  const recent = new Map<string, number>()
  return useApp.subscribe((state, prev) => {
    if (state.libraries === prev.libraries || !seenDocs) return
    const now = ids(state.libraries)
    for (const lib of state.libraries) for (const doc of lib.docs) {
      const k = `${lib.id}:${doc.id}`; if (seenDocs.has(k)) continue
      for (const wf of state.workflows) {
        if (wf.triggerType !== 'event' || wf.status !== 'live' || wf.event?.kind !== 'document_added') continue
        if (wf.event.libraryId ? wf.event.libraryId !== lib.id : lib.id === 'outputs') continue
        if (Date.now() - (recent.get(wf.id) ?? 0) < 30_000) continue
        recent.set(wf.id, Date.now())
        const problem = scheduleProblem(wf)
        if (problem) { state.notify({ title: `Schedule problem: ${wf.name}`, body: problem, link: `/workflows/${wf.id}`, kind: 'schedule' }); continue }
        startRun(wf, `A document was added to ${lib.name}: "${doc.title}"\n\n${doc.content.slice(0, 8000)}`, `Document added · ${lib.name}`)
      }
    }
    seenDocs = now
  })
}

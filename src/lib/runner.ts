// Wires the workflow engine to the store: start runs, resume after approval, and fire schedules.
import { useApp, profileModels } from '@/store/app'
import { execute, newRun, isDue, type EngineCtx } from './engine'
import type { Run, Workflow } from './data'

const running = new Set<string>()

const ctx = (): EngineCtx => {
  const s = useApp.getState()
  return {
    key: s.apiKey, models: profileModels(s), agents: s.agents, councils: s.councils, libraries: s.libraries, custom: s.customTools, users: s.users,
    canSpend: () => useApp.getState().canSpend(), onSpend: (c) => useApp.getState().recordSpend(c),
    onSaveDocument: (d) => useApp.getState().addDoc('outputs', d),
    onNotify: (n) => useApp.getState().notify(n),
    onUpdate: (run) => useApp.getState().updateRun(run.id, run),
  }
}

export async function startRun(wf: Workflow, input: string, trigger = 'Manual', onStart?: (id: string) => void): Promise<Run> {
  const s = useApp.getState()
  const run = newRun(wf, input, trigger, s.currentUserId ?? 'system')
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

export const isRunning = (id: string) => running.has(id)

/** Called every minute by the shell. Fires due schedules while the app is open. */
export async function tickSchedules() {
  const s = useApp.getState()
  if (s.schedulesPaused || !s.currentUserId) return
  for (const wf of s.workflows) {
    if (isDue(wf)) {
      await startRun(wf, wf.schedule?.input || 'Scheduled run', `Schedule · every ${wf.schedule?.every} at ${wf.schedule?.at}`)
      useApp.getState().notify({ title: `Scheduled run finished: ${wf.name}`, link: '/runs', kind: 'schedule' })
    }
  }
}

// Workflow engine: executes a workflow graph step by step, branches on conditions, pauses at human gates and resumes after a decision.
import { runAgentTurn } from './agentRun'
import { streamChat } from './openrouter'
import type { Workflow, WfNode, Run, RunStep, Agent, Council, Library, CustomTool, User } from './data'

export type EngineCtx = {
  key: string
  models: { fast: string; balanced: string; reasoning: string }
  agents: Agent[]
  councils: Council[]
  libraries: Library[]
  custom: CustomTool[]
  users: User[]
  canSpend: () => boolean
  onSpend: (cost: number) => void
  onSaveDocument: (d: { title: string; content: string }) => void
  onNotify: (n: { title: string; body?: string; link?: string; kind: 'run' | 'approval' | 'schedule' | 'info' }) => void
  onUpdate: (run: Run) => void
}

const DEFAULT_STEP_TOOLS = ['web_search', 'read_url', 'calculate', 'run_javascript', 'current_datetime', 'search_knowledge', 'save_document']
const now = () => new Date().toISOString().slice(0, 16).replace('T', ' ')
const short = (m?: string) => (m ?? '').split('/')[1] ?? m

export const startNode = (wf: Workflow) => wf.nodes.find((n) => !wf.edges.some((e) => e.target === n.id)) ?? wf.nodes[0]
const nextOf = (wf: Workflow, id: string, branch?: 'yes' | 'no') => {
  const out = wf.edges.filter((e) => e.source === id)
  if (branch) { const hit = out.find((e) => (e.label ?? '').toLowerCase().startsWith(branch)); if (hit) return hit.target; if (branch === 'no') return undefined }
  return out[0]?.target
}

export function newRun(wf: Workflow, input: string, trigger: string, startedBy: string): Run {
  return { id: 'pending', kind: 'workflow', workflowId: wf.id, workflow: wf.name, trigger, status: 'running', started: now(), duration: '0s', cost: 0, steps: [], summary: input.slice(0, 120), input, context: `Input:\n${input}`, cursor: startNode(wf)?.id ?? null, startedBy }
}

async function collect(gen: AsyncGenerator<any>, onSave?: (d: { title: string; content: string }) => void): Promise<{ text: string; cost: number; error?: string; gated: string[] }> {
  let text = ''; let cost = 0; let error: string | undefined; const gated: string[] = []
  for await (const ev of gen) {
    if (ev.type === 'text') text += ev.text
    else if (ev.type === 'done') cost += ev.usage?.cost ?? 0
    else if (ev.type === 'error') error = ev.message
    else if (ev.type === 'gated') gated.push(`${ev.tool}: ${JSON.stringify(ev.args).slice(0, 200)}`)
    else if (ev.type === 'saved') onSave?.({ title: ev.title, content: ev.content })
  }
  return { text, cost, error, gated }
}

/** Execute from run.cursor until the run completes, fails or waits at a human gate. Mutates and returns the run. */
export async function execute(run: Run, wf: Workflow, ctx: EngineCtx): Promise<Run> {
  const t0 = Date.now() - (parseInt(run.duration) || 0) * 1000
  const nodes = new Map(wf.nodes.map((n) => [n.id, n]))
  let cursor: string | null = run.cursor ?? startNode(wf)?.id ?? null
  run.status = 'running'; ctx.onUpdate({ ...run })
  let guard = 0
  while (cursor && guard++ < 50) {
    const node = nodes.get(cursor); if (!node) break
    const d = node.data
    const s0 = Date.now()
    const step: RunStep = { name: d.label, brick: d.brick, ms: 0, status: 'ok' }
    let branch: 'yes' | 'no' | undefined
    try {
      if (d.brick === 'trigger') {
        step.output = `Started with:\n${run.input ?? ''}`
      } else if (d.brick === 'agent' || d.brick === 'council' || d.brick === 'tool' || d.brick === 'logic') {
        if (!ctx.key) { step.status = 'failed'; step.output = 'Models are not available right now. Contact your administrator.'; }
        else if (!ctx.canSpend()) { step.status = 'failed'; step.output = 'Daily spend cap reached for this user. Raise the cap under Settings › Governance or try tomorrow.' }
        else if (d.brick === 'agent') {
          const a = ctx.agents.find((x) => x.id === d.agentId)
          const r = await collect(runAgentTurn({ key: ctx.key, model: a?.model ?? d.model ?? ctx.models.balanced, models: ctx.models, custom: ctx.custom, autonomy: a?.autonomy ?? wf.autonomy,
            instructions: (a?.instructions ?? 'You are a capable assistant working inside an automated workflow.') + (d.prompt ? `\n\nStep instructions: ${d.prompt}` : '') + '\n\nYou receive the workflow context so far. Produce the output for this step only. Be complete but concise.',
            tools: a?.tools ?? DEFAULT_STEP_TOOLS, libraries: ctx.libraries.filter((l) => (a ? a.knowledge.includes(l.id) : l.id === 'company')), history: [{ role: 'user', content: run.context ?? '' }], maxRounds: 6 }), ctx.onSaveDocument)
          ctx.onSpend(r.cost); step.cost = r.cost; step.model = short(a?.model ?? d.model)
          if (r.error) { step.status = 'failed'; step.output = `Error: ${r.error}` } else { step.output = r.text + (r.gated.length ? `\n\nQueued for approval: ${r.gated.join('; ')}` : ''); run.context += `\n\n[${d.label}]\n${r.text}` }
        } else if (d.brick === 'council') {
          const c = ctx.councils.find((x) => x.id === d.councilId)
          if (!c) { step.status = 'failed'; step.output = 'No council selected for this step.' }
          else {
            const findings: string[] = []
            for (const id of c.members) {
              const a = ctx.agents.find((x) => x.id === id); if (!a) continue
              const r = await collect(runAgentTurn({ key: ctx.key, model: a.model, models: ctx.models, custom: ctx.custom, autonomy: 1, instructions: a.instructions + '\n\nYou are a member of a council. Give your findings on the case in under 120 words with a clear position (Approve / Reject / Need more info).', tools: a.tools, libraries: ctx.libraries.filter((l) => a.knowledge.includes(l.id)), history: [{ role: 'user', content: run.context ?? '' }], maxRounds: 4 }))
              ctx.onSpend(r.cost); step.cost = (step.cost ?? 0) + r.cost; findings.push(`${a.name}:\n${r.text}`)
            }
            const modeHint = { consensus: 'Seek consensus; note any dissent.', debate: 'Cross-examine each finding, surface contradictions, then conclude.', quorum: 'Count positions; a majority decides, note the vote.' }[c.mode]
            let syn = ''
            for await (const ev of streamChat({ key: ctx.key, model: c.model, messages: [{ role: 'system', content: `You synthesise a council's findings into one recommendation for the human gatekeeper. ${modeHint} Output: Recommendation (one line), Confidence (0-100%), Key reasons (3 bullets), Dissent (if any). Under 150 words.` }, { role: 'user', content: `${run.context}\n\nFindings:\n${findings.join('\n\n')}` }] })) { if (ev.type === 'delta') syn += ev.text; if (ev.type === 'usage') { ctx.onSpend(ev.usage.cost ?? 0); step.cost = (step.cost ?? 0) + (ev.usage.cost ?? 0) } }
            step.model = short(c.model); step.output = `${findings.map((f) => `**${f.split(':\n')[0]}**\n${f.split(':\n').slice(1).join(':\n')}`).join('\n\n')}\n\n**Council recommendation**\n${syn}`
            run.context += `\n\n[${d.label}]\n${syn}`
          }
        } else if (d.brick === 'logic') {
          let ans = ''
          const latest = [...run.steps].reverse().find((s) => (s.brick === 'agent' || s.brick === 'council') && s.output)?.output ?? run.input ?? ''
          for await (const ev of streamChat({ key: ctx.key, model: ctx.models.balanced, temperature: 0, max_tokens: 120, messages: [{ role: 'system', content: 'You evaluate a plain-language condition for a workflow. Judge it mainly on the LATEST OUTPUT; use the earlier context only for background. Reply with one short sentence of reasoning, then a final line that is exactly "VERDICT: yes" or "VERDICT: no".' }, { role: 'user', content: `Earlier context (background):\n${(run.context ?? '').slice(-3000)}\n\nLATEST OUTPUT:\n${latest.slice(0, 6000)}\n\nCondition: ${d.sub || d.label}` }] })) { if (ev.type === 'delta') ans += ev.text; if (ev.type === 'usage') { ctx.onSpend(ev.usage.cost ?? 0); step.cost = ev.usage.cost } }
          const verdict = ans.match(/VERDICT:\s*(yes|no)/i)?.[1] ?? (/\byes\b/i.test(ans.split('\n').pop() ?? '') ? 'yes' : 'no')
          branch = verdict.toLowerCase() === 'yes' ? 'yes' : 'no'
          step.branch = branch; step.model = short(ctx.models.balanced); step.output = `Condition "${d.sub || d.label}" → **${branch}**\n\n${ans.replace(/VERDICT:.*$/i, '').trim()}`
        } else if (d.brick === 'tool') {
          const tool = d.tool ?? 'save_document'
          const r = await collect(runAgentTurn({ key: ctx.key, model: ctx.models.fast, models: ctx.models, custom: ctx.custom, autonomy: 2, instructions: `You must call the tool "${tool}" exactly once with arguments derived from the workflow context, then reply with one line confirming what you did.${d.prompt ? ` Guidance: ${d.prompt}` : ''}`, tools: [tool], libraries: ctx.libraries, history: [{ role: 'user', content: run.context ?? '' }], maxRounds: 2 }), ctx.onSaveDocument)
          ctx.onSpend(r.cost); step.cost = r.cost; step.model = short(ctx.models.fast)
          if (r.error) { step.status = 'failed'; step.output = `Error: ${r.error}` } else step.output = r.text + (r.gated.length ? `\n\nQueued for approval: ${r.gated.join('; ')}` : '')
        }
      } else if (d.brick === 'human') {
        const approver = ctx.users.find((u) => u.id === d.approver)
        step.status = 'waiting'; step.output = `Waiting for ${approver?.name ?? 'an approver'} to decide.`
        step.ms = Date.now() - s0; run.steps.push(step)
        run.status = 'waiting'; run.approver = d.approver; run.cursor = nextOf(wf, node.id) ?? null; run.duration = `${Math.round((Date.now() - t0) / 1000)}s`
        ctx.onUpdate({ ...run }); ctx.onNotify({ title: `Approval needed: ${wf.name}`, body: run.summary, link: `/runs?open=${run.id}`, kind: 'approval' })
        return run
      } else if (d.brick === 'notify') {
        const last = [...run.steps].reverse().find((s) => s.brick === 'agent' || s.brick === 'council')
        ctx.onNotify({ title: `${wf.name}: ${d.label}`, body: (last?.output ?? run.summary ?? '').slice(0, 300), link: `/runs?open=${run.id}`, kind: 'run' })
        step.output = 'In-app notification sent.'
      }
    } catch (e: any) { step.status = 'failed'; step.output = `Error: ${e?.message ?? e}` }
    step.ms = Date.now() - s0
    run.steps.push(step); run.cost += step.cost ?? 0; run.duration = `${Math.round((Date.now() - t0) / 1000)}s`
    if (step.status === 'failed') { run.status = 'failed'; run.cursor = null; run.finished = now(); ctx.onUpdate({ ...run }); ctx.onNotify({ title: `Run failed: ${wf.name}`, body: step.output?.slice(0, 200), link: `/runs?open=${run.id}`, kind: 'run' }); return run }
    const nxt = nextOf(wf, node.id, branch); cursor = nxt ?? null
    run.cursor = cursor; ctx.onUpdate({ ...run })
  }
  run.status = run.steps.some((s) => s.status === 'waiting') ? 'approved' : 'completed'
  run.cursor = null; run.finished = now(); run.duration = `${Math.round((Date.now() - t0) / 1000)}s`
  ctx.onUpdate({ ...run })
  return run
}

export const summarise = (run: Run) => [...run.steps].reverse().find((s) => (s.brick === 'agent' || s.brick === 'council') && s.output)?.output ?? run.summary ?? ''

export const isDue = (wf: Workflow, at = Date.now()) => {
  if (wf.triggerType !== 'schedule' || !wf.schedule || wf.status !== 'live') return false
  const [hh, mm] = wf.schedule.at.split(':').map(Number)
  const d = new Date(at)
  const last = wf.lastRunAt ?? 0
  if (wf.schedule.every === 'hour') return at - last >= 3600_000 && d.getMinutes() >= (mm || 0)
  const fire = new Date(d); fire.setHours(hh || 0, mm || 0, 0, 0)
  if (wf.schedule.every === 'week' && d.getDay() !== 1) return false
  return at >= fire.getTime() && last < fire.getTime()
}

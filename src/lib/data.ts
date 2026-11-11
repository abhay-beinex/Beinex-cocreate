// Workspace model and starter templates for Beinex Co-Create. The workspace starts empty; templates help people build.
export const BRAND = { name: 'Co-Create', company: 'Beinex', full: 'Beinex Co-Create' }

export const DEFAULT_MODEL = 'anthropic/claude-sonnet-5.5'
export const MODEL_PROFILES = [
  { id: 'fast', name: 'Fast', purpose: 'Quick replies, actions and lookups', model: 'anthropic/claude-haiku-5.5' },
  { id: 'balanced', name: 'Balanced', purpose: 'Most agents, conditions and the assistant', model: 'anthropic/claude-sonnet-5.5' },
  { id: 'reasoning', name: 'Deep', purpose: 'Research and hard analysis', model: 'anthropic/claude-opus-5.5' },
] as const
export type ProfileId = (typeof MODEL_PROFILES)[number]['id']

export type Role = 'builder' | 'approver' | 'security' | 'auditor' | 'admin'
export type User = { id: string; name: string; email: string; password: string; initials: string; role: Role; title: string; status: 'active' | 'disabled'; lastActive: string; createdAt: string }

export const roleLabel: Record<Role, string> = { builder: 'Builder', approver: 'Approver', security: 'Security', auditor: 'Auditor', admin: 'Admin' }
export const roleDesc: Record<Role, string> = {
  builder: 'Creates agents, workflows and knowledge. Cannot approve.',
  approver: 'Signs off on gated actions and can also build.',
  security: 'Pauses schedules and sets spend caps. Can approve.',
  auditor: 'Read-only access to runs and the audit log.',
  admin: 'Everything, including users.',
}

export const DEMO_USER: User = { id: 'demo', name: 'Spencer', email: 'demo@beinex.com', password: 'cocreate', initials: 'S', role: 'admin', title: 'Pilot administrator', status: 'active', lastActive: 'Never', createdAt: '2026-11-05' }

export type Autonomy = 1 | 2 | 3
export type AgentSnapshot = { version: number; at: string; by: string; data: Omit<Agent, 'history'> }
/** A test case for an agent: a prompt and what a good answer must do, judged by a model. */
export type AgentTest = { id: string; prompt: string; expect: string; last?: { pass: boolean; reason: string; output: string; at: string; cost: number; ms: number } }
export type Agent = {
  id: string; name: string; description: string; instructions: string; model: string; tools: string[]; knowledge: string[]
  autonomy: Autonomy; status: 'live' | 'draft'; version: number; samplePrompts: string[]; updatedAt: string; createdBy: string; history?: AgentSnapshot[]; icon?: string; color?: string; tones?: string[]; testedAt?: string
  tests?: AgentTest[]
}

export const GOVERNED = 'You never take an external action yourself: drafts, emails and approvals go to a person. If you are unsure or information is missing, say so and ask rather than guessing.'

export const agentTemplates: { id: string; name: string; description: string; instructions: string; tools: string[]; samplePrompts: string[]; model?: string; icon?: string; color?: string }[] = [
  {
    id: 'research', icon: 'search', color: '#0ea5e9', name: 'Research Assistant', description: 'Searches the web, reads sources and writes sourced briefs.', model: 'anthropic/claude-sonnet-5.5',
    instructions: `You are a research assistant. For any question, search the web, open the most relevant pages, and answer with a short brief: key findings as bullets, then sources as links. Prefer primary sources and recent material. Say when sources disagree. ${GOVERNED}`,
    tools: ['web_search', 'deep_research', 'read_url', 'save_document', 'current_datetime'], samplePrompts: ['What changed in the EU AI Act this quarter?', 'Compare the top three vector databases for enterprise use', 'Summarise the latest guidance on prompt injection defences']
  },
  {
    id: 'writer', icon: 'pen', color: '#8b5cf6', name: 'Writing Assistant', description: 'Drafts emails, memos and documents in the company voice.', model: 'anthropic/claude-sonnet-5.5',
    instructions: `You are a writing assistant. Draft clear, concise business writing. Check the attached knowledge for tone, templates and facts before writing. Offer a short version and a long version when useful. Emails are created as drafts for a person to send. ${GOVERNED}`,
    tools: ['search_knowledge', 'draft_email', 'save_document'], samplePrompts: ['Draft a memo announcing the new expense policy', 'Rewrite this paragraph to be friendlier', 'Write a follow-up email after a vendor meeting']
  },
  {
    id: 'analyst', icon: 'chart', color: '#10b981', name: 'Data Analyst', description: 'Runs calculations and small scripts over pasted data.', model: 'anthropic/claude-sonnet-5.5',
    instructions: `You are a data analyst. When given numbers or tables, use the calculator or run JavaScript to compute answers rather than estimating. Show the method briefly, then the result. Flag data quality issues. ${GOVERNED}`,
    tools: ['calculate', 'run_javascript', 'read_url', 'save_document'], samplePrompts: ['What is the compound growth from 1.2M to 3.4M over 4 years?', 'Here is a CSV, find the top 5 rows by revenue', 'Convert these quarterly figures into a yearly summary']
  },
  {
    id: 'support', icon: 'support', color: '#f59e0b', name: 'Support Agent', description: 'Answers questions from the knowledge base and escalates when unsure.', model: 'anthropic/claude-haiku-5.5',
    instructions: `You are a support agent. Answer only from the attached knowledge; cite the document title. If the answer is not in the knowledge, say so and request approval to escalate to a person. Be warm and brief. ${GOVERNED}`,
    tools: ['search_knowledge', 'request_approval', 'draft_email'], samplePrompts: ['How do I request access to the VPN?', 'What is the travel reimbursement limit?', 'Who approves overtime?']
  },
  {
    id: 'monitor', icon: 'globe', color: '#14b8a6', name: 'Web Monitor', description: 'Checks pages or topics on a schedule and reports what changed.', model: 'anthropic/claude-haiku-5.5',
    instructions: `You monitor the web for changes on a topic or page. Search or read the given sources, compare with the previous summary if provided, and report only what is new or changed, with links. ${GOVERNED}`,
    tools: ['web_search', 'read_url', 'current_datetime', 'request_approval'], samplePrompts: ['Any new announcements from the Dubai Chamber this week?', 'Has the pricing page at example.com changed?']
  },
]

export type Council = { id: string; name: string; description: string; members: string[]; mode: 'consensus' | 'debate' | 'quorum'; gatekeeper: string; status: 'live' | 'draft'; model: string }
export const councilTemplates: Omit<Council, 'id' | 'status' | 'members'>[] = [
  { name: 'Review Board', description: 'Several specialist agents review a proposal from different angles before a person decides.', mode: 'consensus', gatekeeper: 'demo', model: 'anthropic/claude-opus-5.5' },
  { name: 'Red Team', description: 'Agents argue for and against a decision and surface the risks.', mode: 'debate', gatekeeper: 'demo', model: 'anthropic/claude-opus-5.5' },
  { name: 'Quality Gate', description: 'A majority vote on whether a draft is ready to publish.', mode: 'quorum', gatekeeper: 'demo', model: 'anthropic/claude-opus-5.5' },
]

export type RunStep = {
  name: string; nodeId?: string; brick?: Brick; model?: string; ms: number; tokens?: number; cost?: number; status: 'ok' | 'waiting' | 'failed' | 'skipped'; output?: string; branch?: string
  /** Variable name the output was stored under, e.g. research → {{research}} */
  key?: string
  /** Extra variables set by this step (e.g. Set variables step) */
  vars?: Record<string, string>
  /** Set for steps that ran inside a loop iteration or a parallel branch, e.g. "Item 2 of 5" or "Branch: Pricing" */
  lane?: string
  /** 1-based attempt number when the step was retried */
  attempt?: number
  /** The step failed but the workflow was set to continue */
  continued?: boolean
  /** Number of items a loop processed or branches a split ran */
  count?: number
}
export type Run = {
  id: string; workflowId: string; workflow: string; trigger: string; status: 'waiting' | 'approved' | 'rejected' | 'failed' | 'running' | 'completed'
  started: string; finished?: string; duration: string; cost: number; steps: RunStep[]; summary?: string; decidedBy?: string
  input?: string; context?: string; cursor?: string | null; approver?: string; startedBy?: string; kind?: 'workflow' | 'chat'
  /** Named outputs of the run so far, usable as {{name}} in later steps */
  vars?: Record<string, string>
  parentRunId?: string
  /** Set when this run was started again from a step of an earlier run */
  rerunOf?: { runId: string; step: number }
}

export type Brick = 'trigger' | 'agent' | 'council' | 'logic' | 'human' | 'tool' | 'notify' | 'loop' | 'parallel' | 'code' | 'http' | 'flow' | 'wait' | 'set' | 'extract' | 'classify'
export type RuleOp = 'contains' | 'not_contains' | 'equals' | 'not_equals' | 'empty' | 'not_empty' | 'gt' | 'lt' | 'matches'
export type StepData = {
  brick: Brick; label: string; sub?: string; prompt?: string; model?: string; agentId?: string; councilId?: string; tool?: string; approver?: string; retries?: number; timeout?: number; costCap?: number
  /** Variable name for this step's output; defaults to a slug of the label */
  key?: string
  /** Optional input template. When set, the step sees this instead of everything so far. Supports {{variables}}. */
  input?: string
  onError?: 'stop' | 'continue'
  /** Condition: judged by a model from plain language, or a deterministic rule */
  mode?: 'ai' | 'rule'
  rule?: { left: string; op: RuleOp; right: string }
  /** Loop: a template that resolves to a list (JSON array or one item per line). Empty = extract a list from the latest result. */
  items?: string
  maxItems?: number
  /** Code step */
  code?: string
  /** HTTP step */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; url?: string; headers?: string; body?: string
  /** Call-a-workflow step */
  workflowId?: string
  /** Wait step: seconds */
  wait?: number
  /** Set variables step */
  assign?: { key: string; value: string }[]
  /** Extract fields step */
  fields?: { name: string; description: string }[]
  /** Route by category step */
  categories?: string[]
}
export type WfNode = { id: string; type: 'step'; position: { x: number; y: number }; data: StepData }
export type WfEdge = { id: string; source: string; target: string; label?: string }
export type Schedule = { every: 'hour' | 'day' | 'week'; at: string; day?: number; input: string }
export type TriggerType = 'manual' | 'schedule' | 'link' | 'watch' | 'event'
export type Watch = { url: string; every: number; lastHash?: string; lastCheckedAt?: number; input: string }
export type EventTrigger = { kind: 'document_added'; libraryId?: string }
export type Workflow = {
  id: string; name: string; description: string; status: 'live' | 'draft' | 'paused'; version: number; triggerType: TriggerType; schedule?: Schedule; watch?: Watch; event?: EventTrigger; lastRunAt?: number
  autonomy: Autonomy; nodes: WfNode[]; edges: WfEdge[]; updatedAt: string; createdBy: string
}

const n = (id: string, brick: Brick, label: string, sub: string, x: number, y: number, extra: Partial<StepData> = {}): WfNode => ({ id, type: 'step', position: { x, y }, data: { brick, label, sub, retries: 1, timeout: 120, costCap: 0.05, model: DEFAULT_MODEL, ...extra } })
const e = (id: string, source: string, target: string, label?: string): WfEdge => ({ id, source, target, label })

export const workflowTemplates: { id: string; name: string; desc: string; triggerType: TriggerType; schedule?: Schedule; nodes: WfNode[]; edges: WfEdge[] }[] = [
  {
    id: 'research-draft', name: 'Research and draft', desc: 'Research a topic, draft a brief, a person reviews it, then it is saved to Knowledge', triggerType: 'manual',
    nodes: [n('t', 'trigger', 'Topic submitted', 'Run with a topic', 40, 160), n('a', 'agent', 'Research', 'Search and read sources', 320, 160, { prompt: 'Research the topic thoroughly and list key findings with sources.' }), n('b', 'agent', 'Draft', 'Write the document', 600, 160, { prompt: 'Turn the findings into a clear one-page brief in markdown.', input: 'Topic: {{input}}\n\nFindings:\n{{research}}' }), n('h', 'human', 'Review', 'A person approves the draft', 880, 160), n('s', 'tool', 'Save to Knowledge', 'save_document', 1160, 160, { tool: 'save_document', input: 'Save this document. Title it after the topic "{{input}}".\n\n{{draft}}' })],
    edges: [e('e1', 't', 'a'), e('e2', 'a', 'b'), e('e3', 'b', 'h'), e('e4', 'h', 's')]
  },
  {
    id: 'monitor', name: 'Monitor and alert', desc: 'Check a topic on a schedule and notify only when something changed', triggerType: 'schedule', schedule: { every: 'day', at: '08:00', input: 'Check for news about: (your topic)' },
    nodes: [n('t', 'trigger', 'Every day 08:00', 'Schedule', 40, 160), n('a', 'agent', 'Check', 'Search or read sources', 320, 160, { prompt: 'Check the sources and report what is new in the last 24 hours. If nothing is new, say exactly: NOTHING NEW.' }), n('l', 'logic', 'Anything new?', 'The check found at least one new item', 600, 160, { mode: 'rule', rule: { left: '{{check}}', op: 'not_contains', right: 'NOTHING NEW' } }), n('x', 'notify', 'Notify', 'In-app notification', 880, 60)],
    edges: [e('e1', 't', 'a'), e('e2', 'a', 'l'), e('e3', 'l', 'x', 'yes')]
  },
  {
    id: 'compare', name: 'Compare in parallel', desc: 'Three angles researched at the same time, then combined into one comparison', triggerType: 'manual',
    nodes: [n('t', 'trigger', 'Subject submitted', 'Run with a subject', 40, 220), n('p', 'parallel', 'Split', 'Run three angles at once', 320, 220), n('a1', 'agent', 'Strengths', 'Research strengths', 600, 80, { prompt: 'Research the strengths and advantages of the subject. Five bullets with sources.', input: 'Subject: {{input}}' }), n('a2', 'agent', 'Risks', 'Research risks', 600, 220, { prompt: 'Research the risks, criticisms and weaknesses of the subject. Five bullets with sources.', input: 'Subject: {{input}}' }), n('a3', 'agent', 'Alternatives', 'Research alternatives', 600, 360, { prompt: 'Find the three strongest alternatives to the subject and how they compare. Bullets with sources.', input: 'Subject: {{input}}' }), n('m', 'agent', 'Combine', 'Write the comparison', 880, 220, { prompt: 'Combine the three angles into one balanced comparison with a short recommendation.', input: 'Subject: {{input}}\n\nStrengths:\n{{strengths}}\n\nRisks:\n{{risks}}\n\nAlternatives:\n{{alternatives}}' })],
    edges: [e('e1', 't', 'p'), e('e2', 'p', 'a1'), e('e3', 'p', 'a2'), e('e4', 'p', 'a3'), e('e5', 'a1', 'm'), e('e6', 'a2', 'm'), e('e7', 'a3', 'm')]
  },
  {
    id: 'foreach', name: 'Process a list', desc: 'Split the input into items, handle each one, then summarise the results', triggerType: 'manual',
    nodes: [n('t', 'trigger', 'List submitted', 'Run with a list, one item per line', 40, 160), n('l', 'loop', 'For each item', 'Repeat the next step per item', 320, 160, { items: '{{input}}', maxItems: 10 }), n('a', 'agent', 'Look up', 'One item at a time', 600, 60, { prompt: 'Give a two-sentence factual summary of this item with one source.', input: 'Item {{index}}: {{item}}' }), n('s', 'agent', 'Summary table', 'Combine the results', 600, 260, { prompt: 'Turn the results into a markdown table with one row per item.', input: '{{for_each_item}}' })],
    edges: [e('e1', 't', 'l'), e('e2', 'l', 'a', 'each'), e('e3', 'l', 's', 'done')]
  },
  { id: 'standard', name: 'Agent with approval', desc: 'An agent does the work, then a person signs off', triggerType: 'manual', nodes: [n('t', 'trigger', 'Start', 'Run with an input', 40, 160), n('a', 'agent', 'Agent', 'Pick an agent', 320, 160), n('h', 'human', 'Approval', 'Assign an approver', 600, 160)], edges: [e('e1', 't', 'a'), e('e2', 'a', 'h')] },
  { id: 'blank', name: 'Blank', desc: 'Start from an empty canvas', triggerType: 'manual', nodes: [], edges: [] },
]

export type Doc = { id: string; title: string; content: string; updatedAt: string; addedBy: string; source?: string }
export type Library = { id: string; name: string; desc: string; docs: Doc[] }
export const seedLibraries: Library[] = [
  { id: 'company', name: 'Company knowledge', desc: 'Policies, guides and reference material agents can cite', docs: [] },
  { id: 'outputs', name: 'Agent outputs', desc: 'Documents agents and workflows save', docs: [] },
]

export type CustomTool = { id: string; name: string; label: string; description: string; method: 'GET' | 'POST'; url: string; headers: string; body: string; params: { name: string; description: string }[]; createdBy: string; connector?: string }
export type Notification = { id: string; at: string; title: string; body?: string; link?: string; read: boolean; kind: 'approval' | 'run' | 'schedule' | 'info' }
export type SpendEntry = { userId: string; day: string; cost: number }
export type AuditEvent = { id: string; at: string; actor: string; action: string; target: string; detail?: string }

/** A chat thread: several per agent, each with its own messages (stored under chats[id]). */
export type Thread = { id: string; agentId: string; title: string; createdAt: number; updatedAt: number; model?: string }

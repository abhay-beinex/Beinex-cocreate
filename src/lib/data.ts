// Workspace model and starter templates for Beinex Co-Create. The workspace starts empty; templates help people build.
export const BRAND = { name: 'Co-Create', company: 'Beinex', full: 'Beinex Co-Create' }

export const DEFAULT_MODEL = 'anthropic/claude-sonnet-5.5'
export const MODEL_PROFILES = [
  { id: 'fast', name: 'Fast', purpose: 'Quick replies, drafting, classification', model: 'anthropic/claude-haiku-5.5' },
  { id: 'balanced', name: 'Balanced', purpose: 'Everyday agent work with tools', model: 'anthropic/claude-sonnet-5.5' },
  { id: 'reasoning', name: 'Reasoning', purpose: 'Hard analysis, research synthesis, council decisions', model: 'anthropic/claude-opus-5.5' },
] as const

export type Role = 'builder' | 'approver' | 'security' | 'auditor' | 'admin'
export type User = { id: string; name: string; email: string; initials: string; role: Role; title: string; department: string; status: 'active' | 'invited' | 'disabled'; lastActive: string }

export const roleLabel: Record<Role, string> = { builder: 'Builder', approver: 'Approver', security: 'Security', auditor: 'Auditor', admin: 'Admin' }
export const roleDesc: Record<Role, string> = {
  builder: 'Creates agents, workflows and knowledge. Cannot approve.',
  approver: 'Signs off on gated actions.',
  security: 'Controls watchers, emergency pause and model access.',
  auditor: 'Read-only access to runs and the audit log.',
  admin: 'Manages users, keys and workspace settings.',
}

export const seedUsers: User[] = [
  { id: 'mariam', name: 'Mariam Khalid', email: 'mariam.khalid@beinex.com', initials: 'MK', role: 'builder', title: 'Operations Lead', department: 'Operations', status: 'active', lastActive: 'Now' },
  { id: 'fatima', name: 'Fatima Al Mansoori', email: 'fatima.almansoori@beinex.com', initials: 'FA', role: 'approver', title: 'Director', department: 'Operations', status: 'active', lastActive: '2h ago' },
  { id: 'omar', name: 'Omar Haddad', email: 'omar.haddad@beinex.com', initials: 'OH', role: 'security', title: 'Head of Information Security', department: 'IT Security', status: 'active', lastActive: 'Yesterday' },
  { id: 'faisal', name: 'Dr. Faisal Al Nuaimi', email: 'faisal.alnuaimi@beinex.com', initials: 'FN', role: 'auditor', title: 'Internal Audit', department: 'Audit', status: 'active', lastActive: '3 days ago' },
  { id: 'admin', name: 'Pilot Admin', email: 'admin@beinex.com', initials: 'PA', role: 'admin', title: 'Platform Administrator', department: 'IT', status: 'active', lastActive: 'Now' },
]

export type Autonomy = 1 | 2 | 3
export type Agent = {
  id: string; name: string; description: string; instructions: string; model: string; tools: string[]; knowledge: string[]
  autonomy: Autonomy; status: 'live' | 'draft'; version: number; samplePrompts: string[]; watchers: string[]; updatedAt: string; createdBy: string
}

export const GOVERNED = 'You never take an external action yourself: drafts, emails and approvals go to a human. If you are unsure or information is missing, say so and ask rather than guessing.'

export const agentTemplates: { id: string; name: string; description: string; instructions: string; tools: string[]; samplePrompts: string[]; model?: string }[] = [
  { id: 'research', name: 'Research Assistant', description: 'Searches the web, reads sources and writes sourced briefs.', model: 'anthropic/claude-sonnet-5.5',
    instructions: `You are a research assistant. For any question, search the web, open the most relevant pages, and answer with a short brief: key findings as bullets, then sources as links. Prefer primary sources and recent material. Say when sources disagree. ${GOVERNED}`,
    tools: ['web_search', 'deep_research', 'read_url', 'save_document', 'current_datetime'], samplePrompts: ['What changed in the EU AI Act this quarter?', 'Compare the top three vector databases for enterprise use', 'Summarise the latest guidance on prompt injection defences'] },
  { id: 'writer', name: 'Writing Assistant', description: 'Drafts emails, memos and documents in the company voice.', model: 'anthropic/claude-sonnet-5.5',
    instructions: `You are a writing assistant. Draft clear, concise business writing. Check the attached knowledge for tone, templates and facts before writing. Offer a short version and a long version when useful. Emails are created as drafts for a person to send. ${GOVERNED}`,
    tools: ['search_knowledge', 'draft_email', 'save_document'], samplePrompts: ['Draft a memo announcing the new expense policy', 'Rewrite this paragraph to be friendlier', 'Write a follow-up email after a vendor meeting'] },
  { id: 'analyst', name: 'Data Analyst', description: 'Runs calculations and small scripts over pasted data.', model: 'anthropic/claude-sonnet-5.5',
    instructions: `You are a data analyst. When given numbers or tables, use the calculator or run JavaScript to compute answers rather than estimating. Show the method briefly, then the result. Flag data quality issues. ${GOVERNED}`,
    tools: ['calculate', 'run_javascript', 'read_url', 'save_document'], samplePrompts: ['What is the compound growth from 1.2M to 3.4M over 4 years?', 'Here is a CSV, find the top 5 rows by revenue', 'Convert these quarterly figures into a yearly summary'] },
  { id: 'support', name: 'Support Agent', description: 'Answers questions from the knowledge base and escalates when unsure.', model: 'anthropic/claude-haiku-5.5',
    instructions: `You are a support agent. Answer only from the attached knowledge; cite the document title. If the answer is not in the knowledge, say so and request approval to escalate to a person. Be warm and brief. ${GOVERNED}`,
    tools: ['search_knowledge', 'request_approval', 'draft_email'], samplePrompts: ['How do I request access to the VPN?', 'What is the travel reimbursement limit?', 'Who approves overtime?'] },
  { id: 'monitor', name: 'Web Monitor', description: 'Checks pages or topics on a schedule and reports what changed.', model: 'anthropic/claude-haiku-5.5',
    instructions: `You monitor the web for changes on a topic or page. Search or read the given sources, compare with the previous summary if provided, and report only what is new or changed, with links. ${GOVERNED}`,
    tools: ['web_search', 'read_url', 'current_datetime', 'request_approval'], samplePrompts: ['Any new announcements from OpenRouter this week?', 'Has the pricing page at example.com changed?'] },
]

export type Council = { id: string; name: string; description: string; members: string[]; mode: 'consensus' | 'debate' | 'quorum'; gatekeeper: string; status: 'live' | 'draft'; model: string }
export const councilTemplates: Omit<Council, 'id' | 'status' | 'members'>[] = [
  { name: 'Review Board', description: 'Several specialist agents review a proposal from different angles before a person decides.', mode: 'consensus', gatekeeper: 'fatima', model: 'anthropic/claude-opus-5.5' },
  { name: 'Red Team', description: 'Agents argue for and against a decision and surface the risks.', mode: 'debate', gatekeeper: 'omar', model: 'anthropic/claude-opus-5.5' },
  { name: 'Quality Gate', description: 'A majority vote on whether a draft is ready to publish.', mode: 'quorum', gatekeeper: 'fatima', model: 'anthropic/claude-opus-5.5' },
]

export type Suggestion = { id: string; kind: 'risk' | 'approval' | 'saving' | 'info'; title: string; body: string; evidence: string[]; source: string; confidence?: number; savingHours?: number; status: 'open' | 'approval' | 'history'; primary: string; when: string; link?: string }
export type Watcher = { id: string; name: string; owner: string; status: 'active' | 'paused'; findingsToday: number; cap: number; used: number }

export type RunStep = { name: string; model?: string; ms: number; tokens?: number; status: 'ok' | 'waiting' | 'failed' | 'skipped'; output?: string }
export type Run = { id: string; workflowId: string; workflow: string; trigger: string; status: 'waiting' | 'approved' | 'rejected' | 'failed' | 'running' | 'completed'; started: string; duration: string; cost: number; steps: RunStep[]; summary?: string; decidedBy?: string }

export type Brick = 'trigger' | 'agent' | 'council' | 'logic' | 'human' | 'tool' | 'notify'
export type StepData = { brick: Brick; label: string; sub?: string; prompt?: string; model?: string; agentId?: string; councilId?: string; retries?: number; timeout?: number; costCap?: number }
export type WfNode = { id: string; type: 'step'; position: { x: number; y: number }; data: StepData }
export type WfEdge = { id: string; source: string; target: string; label?: string }
export type Workflow = { id: string; name: string; description: string; status: 'live' | 'draft' | 'paused'; version: number; trigger: string; autonomy: Autonomy; nodes: WfNode[]; edges: WfEdge[]; runsWeek: number; straightThrough: number; updatedAt: string; createdBy: string }

const n = (id: string, brick: Brick, label: string, sub: string, x: number, y: number, extra: Partial<StepData> = {}): WfNode => ({ id, type: 'step', position: { x, y }, data: { brick, label, sub, retries: 1, timeout: 60, costCap: 0.05, model: DEFAULT_MODEL, ...extra } })

export const workflowTemplates: { id: string; name: string; desc: string; trigger: string; nodes: WfNode[]; edges: WfEdge[] }[] = [
  { id: 'research-draft', name: 'Research and draft', desc: 'Research a topic, draft a document, a person reviews it', trigger: 'Manual · topic', nodes: [n('t', 'trigger', 'Topic submitted', 'Manual or form', 40, 160), n('a', 'agent', 'Research', 'Search and read sources', 320, 160, { prompt: 'Research the topic thoroughly and list key findings with sources.' }), n('b', 'agent', 'Draft', 'Write the document', 600, 160, { prompt: 'Turn the findings into a clear one-page brief.' }), n('h', 'human', 'Review', 'A person approves the draft', 880, 160)], edges: [{ id: 'e1', source: 't', target: 'a' }, { id: 'e2', source: 'a', target: 'b' }, { id: 'e3', source: 'b', target: 'h' }] },
  { id: 'monitor', name: 'Monitor and alert', desc: 'Check something on a schedule and notify when a condition is met', trigger: 'Schedule · daily 08:00', nodes: [n('t', 'trigger', 'Daily 08:00', 'Schedule', 40, 160), n('a', 'agent', 'Check', 'Search or read sources', 320, 160, { prompt: 'Check the sources and report what changed since yesterday.' }), n('l', 'logic', 'Anything new?', 'changes found', 600, 160), n('x', 'notify', 'Notify', 'Teams · email', 880, 160)], edges: [{ id: 'e1', source: 't', target: 'a' }, { id: 'e2', source: 'a', target: 'l' }, { id: 'e3', source: 'l', target: 'x', label: 'yes' }] },
  { id: 'standard', name: 'Agent with approval', desc: 'Trigger → Agent → Human approval', trigger: 'Manual', nodes: [n('t', 'trigger', 'Trigger', 'Choose a source', 40, 160), n('a', 'agent', 'Agent', 'Pick an agent', 320, 160), n('h', 'human', 'Approval', 'Assign an approver', 600, 160)], edges: [{ id: 'e1', source: 't', target: 'a' }, { id: 'e2', source: 'a', target: 'h' }] },
  { id: 'council', name: 'Council review', desc: 'Trigger → Council → Gatekeeper', trigger: 'Manual', nodes: [n('t', 'trigger', 'Trigger', 'Choose a source', 40, 160), n('c', 'council', 'Council', 'Pick a council', 320, 160), n('h', 'human', 'Gatekeeper', 'Final decision', 600, 160)], edges: [{ id: 'e1', source: 't', target: 'c' }, { id: 'e2', source: 'c', target: 'h' }] },
  { id: 'blank', name: 'Blank', desc: 'Start from an empty canvas', trigger: 'Manual', nodes: [], edges: [] },
]

export type Doc = { id: string; title: string; content: string; updatedAt: string; addedBy: string }
export type Library = { id: string; name: string; desc: string; docs: Doc[] }
export const seedLibraries: Library[] = [
  { id: 'company', name: 'Company knowledge', desc: 'Policies, guides and reference material agents can cite', docs: [] },
  { id: 'outputs', name: 'Agent outputs', desc: 'Documents agents save with the save_document tool', docs: [] },
]

export type AuditEvent = { id: string; at: string; actor: string; action: string; target: string; detail?: string }

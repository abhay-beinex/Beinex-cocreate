// Seed data for the Beinex Co-Create pilot workspace.
export const BRAND = { name: 'Co-Create', company: 'Beinex', full: 'Beinex Co-Create' }

export const DEFAULT_MODEL = 'anthropic/claude-sonnet-5.5'
export const MODEL_PROFILES = [
  { id: 'verify', name: 'Verify', purpose: 'Document extraction, matching and compliance checks', model: 'anthropic/claude-sonnet-5.5', min: 95 },
  { id: 'decide', name: 'Decide', purpose: 'Risk scoring, routing and council synthesis', model: 'anthropic/claude-opus-5.5', min: 90 },
  { id: 'draft', name: 'Draft', purpose: 'Replies, summaries and everyday Q&A', model: 'anthropic/claude-haiku-5.5', min: 85 },
] as const

export type Role = 'builder' | 'approver' | 'security' | 'auditor' | 'admin'
export type User = {
  id: string
  name: string
  email: string
  initials: string
  role: Role
  title: string
  department: string
  status: 'active' | 'invited' | 'disabled'
  lastActive: string
}

export const roleLabel: Record<Role, string> = { builder: 'Builder', approver: 'Approver', security: 'Security', auditor: 'Auditor', admin: 'Admin' }
export const roleDesc: Record<Role, string> = {
  builder: 'Creates agents and workflows. Cannot approve.',
  approver: 'Signs off on gated actions.',
  security: 'Controls watchers, emergency pause and model access.',
  auditor: 'Read-only access to runs and audit logs.',
  admin: 'Manages users, keys and workspace settings.',
}

export const seedUsers: User[] = [
  { id: 'mariam', name: 'Mariam Khalid', email: 'mariam.khalid@beinex.com', initials: 'MK', role: 'builder', title: 'Finance Operations Lead', department: 'Finance', status: 'active', lastActive: 'Now' },
  { id: 'fatima', name: 'Fatima Al Mansoori', email: 'fatima.almansoori@beinex.com', initials: 'FA', role: 'approver', title: 'Director of Finance', department: 'Finance', status: 'active', lastActive: '2h ago' },
  { id: 'omar', name: 'Omar Haddad', email: 'omar.haddad@beinex.com', initials: 'OH', role: 'security', title: 'Head of Information Security', department: 'IT Security', status: 'active', lastActive: 'Yesterday' },
  { id: 'faisal', name: 'Dr. Faisal Al Nuaimi', email: 'faisal.alnuaimi@beinex.com', initials: 'FN', role: 'auditor', title: 'Director of Internal Audit', department: 'Audit', status: 'active', lastActive: '3 days ago' },
  { id: 'admin', name: 'Pilot Admin', email: 'admin@beinex.com', initials: 'PA', role: 'admin', title: 'Platform Administrator', department: 'IT', status: 'active', lastActive: 'Now' },
]

export type Autonomy = 1 | 2 | 3

export type Agent = {
  id: string
  name: string
  description: string
  instructions: string
  model: string
  tools: string[]
  knowledge: string[]
  autonomy: Autonomy
  status: 'live' | 'draft'
  version: number
  samplePrompts: string[]
  watchers: string[]
  updatedAt: string
  createdBy: string
}

export const seedAgents: Agent[] = [
  {
    id: 'invoice-checker', name: 'Invoice Checker',
    description: 'Extracts invoice fields, checks them against the purchase order and VAT rules, and flags duplicates.',
    instructions: 'You are Invoice Checker for Beinex Finance. When given an invoice number or invoice text, use the tools to look up the invoice, its purchase order and the supplier. Compare amounts, PO reference, VAT (5% in the UAE) and the supplier TRN. Flag duplicates, missing TRN, expired contracts and anything above AED 50,000. You never post to the ledger; you recommend. Reply in concise markdown with a Risk line (Low / Medium / High) and a Recommendation line. If data is missing or you are unsure, say so and escalate to a human.',
    model: 'anthropic/claude-sonnet-5.5', tools: ['lookup_invoice', 'lookup_purchase_order', 'lookup_supplier', 'find_duplicates'], knowledge: ['finance-policies'],
    autonomy: 2, status: 'live', version: 7, samplePrompts: ['Check INV-20931 against its PO', 'Is INV-20931 a duplicate?', 'List invoices above AED 50,000 this week'], watchers: ['Fire when an invoice above AED 50,000 arrives', 'Fire when the same amount appears twice in 7 days'], updatedAt: '2026-11-03', createdBy: 'mariam',
  },
  {
    id: 'posting-recommender', name: 'Posting Recommender',
    description: 'Suggests the GL account, cost centre and tax code for an approved invoice.',
    instructions: 'You recommend general-ledger postings for approved invoices. Use lookup_invoice and chart_of_accounts. Propose GL account, cost centre, tax code and a one-line justification with a confidence score. Never execute a posting; a human approves. If unsure, say so and escalate.',
    model: 'anthropic/claude-sonnet-5.5', tools: ['lookup_invoice', 'chart_of_accounts', 'queue_ledger_posting'], knowledge: ['finance-policies'],
    autonomy: 2, status: 'live', version: 3, samplePrompts: ['Recommend a posting for INV-20887', 'Which cost centre for marketing events?'], watchers: [], updatedAt: '2026-10-28', createdBy: 'mariam',
  },
  {
    id: 'supplier-reply', name: 'Supplier Reply Drafter',
    description: 'Drafts courteous, accurate replies to supplier invoice-status questions for a human to send.',
    instructions: 'Draft replies to supplier emails about invoice status. Use lookup_invoice to get the real status; never invent dates. Be courteous and short. Include invoice number, status and next expected step. Produce the draft with draft_email so a human can send it. If the invoice cannot be found, say so and escalate.',
    model: 'anthropic/claude-haiku-5.5', tools: ['lookup_invoice', 'lookup_supplier', 'draft_email'], knowledge: [],
    autonomy: 2, status: 'draft', version: 1, samplePrompts: ['Reply to Al Futtaim asking about INV-20874', 'Draft a status update for INV-20902'], watchers: [], updatedAt: '2026-11-04', createdBy: 'mariam',
  },
  {
    id: 'contract-watch', name: 'Contract Expiry Watcher',
    description: 'Reads supplier contracts and trade licences and flags expiries and renewal gaps.',
    instructions: 'Review supplier contracts and trade licences using lookup_supplier and list_suppliers. Identify expiry dates and days remaining. Produce a table of supplier, document, expiry date, days remaining and recommended action. Escalate anything expiring within 30 days.',
    model: 'anthropic/claude-sonnet-5.5', tools: ['list_suppliers', 'lookup_supplier'], knowledge: ['supplier-registry'],
    autonomy: 1, status: 'live', version: 2, samplePrompts: ['Which trade licences expire in 30 days?', 'Summarise renewal terms for Emirates Steel'], watchers: ['Fire when a licence is within 30 days of expiry'], updatedAt: '2026-10-21', createdBy: 'mariam',
  },
]

export type Council = {
  id: string
  name: string
  description: string
  members: string[]
  mode: 'consensus' | 'debate' | 'quorum'
  gatekeeper: string
  status: 'live' | 'draft'
  model: string
}

export const councilTemplates: Omit<Council, 'id' | 'status'>[] = [
  { name: 'Procurement Council', description: 'Evaluates emergency purchase requisitions and award exceptions.', members: ['invoice-checker', 'contract-watch', 'posting-recommender'], mode: 'consensus', gatekeeper: 'fatima', model: 'anthropic/claude-opus-5.5' },
  { name: 'Legal & Compliance', description: 'Reviews contract clauses, licence status and regulatory exposure.', members: ['contract-watch', 'invoice-checker'], mode: 'debate', gatekeeper: 'omar', model: 'anthropic/claude-opus-5.5' },
  { name: 'Finance & Ledger Gate', description: 'Second opinion on high-value postings before the ledger.', members: ['invoice-checker', 'posting-recommender'], mode: 'quorum', gatekeeper: 'fatima', model: 'anthropic/claude-opus-5.5' },
  { name: 'Vendor Risk & Award', description: 'Scores supplier risk before awarding or renewing.', members: ['contract-watch', 'invoice-checker'], mode: 'consensus', gatekeeper: 'fatima', model: 'anthropic/claude-opus-5.5' },
  { name: 'HR Exceptions', description: 'Reviews policy exceptions and escalations.', members: ['supplier-reply'], mode: 'quorum', gatekeeper: 'faisal', model: 'anthropic/claude-opus-5.5' },
]

export const seedCouncils: Council[] = [
  { id: 'procurement-council', status: 'live', ...councilTemplates[0] },
  { id: 'finance-gate', status: 'live', ...councilTemplates[2] },
]

export type Suggestion = {
  id: string
  kind: 'risk' | 'approval' | 'saving' | 'info'
  title: string
  body: string
  evidence: string[]
  source: string
  confidence?: number
  savingHours?: number
  status: 'open' | 'approval' | 'history'
  primary: string
  when: string
  link?: string
}

export const seedSuggestions: Suggestion[] = [
  { id: 's1', kind: 'risk', status: 'open', when: '08:12', title: 'Possible duplicate invoice from Al Futtaim Logistics', body: 'INV-20931 matches INV-20874 on amount (AED 52,300), PO-4471 and a 3-day window. Payment is on hold pending review.', evidence: ['Same PO-4471', 'Amount AED 52,300 × 2'], source: 'Invoice Checker · duplicate watcher', confidence: 94, primary: 'Review', link: '/chat/invoice-checker?q=Is%20INV-20931%20a%20duplicate%3F' },
  { id: 's2', kind: 'approval', status: 'approval', when: '07:40', title: 'AED 52,300 posting waiting for Finance approval', body: 'Run R-1288 passed all checks. One medium risk (above AED 50k). Backup approver Omar Haddad. Recommended: Approve.', evidence: ['PO match 100%', 'VAT 5% correct'], source: 'Invoice Approval Flow v7', confidence: 91, primary: 'Open', link: '/runs?open=R-1288' },
  { id: 's3', kind: 'saving', status: 'open', when: 'Yesterday', title: 'Repeated manual work: supplier status replies', body: 'You answered 23 "invoice status" emails by hand this month. A governed reply workflow is drafted; every reply still needs your send-off.', evidence: ['23 similar emails', 'Avg 11 min each'], source: 'Co-Create Assistant', savingHours: 4.5, primary: 'Open draft', link: '/workflows/wf2' },
  { id: 's4', kind: 'info', status: 'open', when: 'Yesterday', title: 'Trade licence for Gulf Print Co. expires in 12 days', body: 'No renewal document on file. Two open POs depend on this supplier.', evidence: ['Expiry 17 Nov 2026', '2 open POs'], source: 'Contract Expiry Watcher', primary: 'Draft request', link: '/chat/supplier-reply?q=Draft%20a%20licence%20renewal%20request%20to%20Gulf%20Print%20Co.' },
  { id: 's5', kind: 'risk', status: 'open', when: 'Mon', title: 'Supplier TRN missing on 3 invoices', body: 'Three invoices from new suppliers lack a Tax Registration Number and cannot be posted until it is captured.', evidence: ['INV-20902, 20917, 20925'], source: 'Invoice Checker', confidence: 99, primary: 'Review', link: '/chat/invoice-checker?q=Which%20invoices%20are%20missing%20a%20TRN%3F' },
  { id: 's6', kind: 'saving', status: 'history', when: 'Last week', title: 'Retry optimiser applied to Invoice Approval Flow', body: 'Step retries lowered from 3 to 1 on the SAP posting step. Estimated run cost down 28%.', evidence: ['−28% cost'], source: 'Workflow Builder', primary: 'View', link: '/workflows/wf1' },
]

export type Watcher = { id: string; name: string; owner: string; status: 'active' | 'paused'; findingsToday: number; cap: number; used: number }
export const seedWatchers: Watcher[] = [
  { id: 'w1', name: 'Duplicate invoice detector', owner: 'Invoice Checker', status: 'active', findingsToday: 2, cap: 10, used: 4 },
  { id: 'w2', name: 'Above AED 50k gate', owner: 'Invoice Approval Flow', status: 'active', findingsToday: 1, cap: 10, used: 1 },
  { id: 'w3', name: 'Trade licence expiry (30d)', owner: 'Contract Expiry Watcher', status: 'active', findingsToday: 1, cap: 5, used: 1 },
  { id: 'w4', name: 'Approval stalled > 4h', owner: 'Invoice Approval Flow', status: 'active', findingsToday: 1, cap: 5, used: 1 },
  { id: 'w5', name: 'Supplier reply backlog', owner: 'Supplier Reply Drafter', status: 'paused', findingsToday: 0, cap: 5, used: 0 },
]

export type RunStep = { name: string; model?: string; ms: number; tokens?: number; status: 'ok' | 'waiting' | 'failed' | 'skipped'; output?: string }
export type Run = {
  id: string
  workflowId: string
  workflow: string
  trigger: string
  status: 'waiting' | 'approved' | 'rejected' | 'failed' | 'running' | 'completed'
  started: string
  duration: string
  cost: number
  steps: RunStep[]
  summary?: string
  decidedBy?: string
}

export const seedRuns: Run[] = [
  { id: 'R-1288', workflowId: 'wf1', workflow: 'Invoice Approval Flow', trigger: 'Email · ap-inbox', status: 'waiting', started: '2026-11-05 07:38', duration: '4h 12m', cost: 0.018, summary: 'INV-20931 · Al Futtaim Logistics · AED 52,300 · above threshold', steps: [
    { name: 'Email received', ms: 420, status: 'ok' }, { name: 'Invoice Checker', model: 'Verify', ms: 3100, tokens: 2140, status: 'ok', output: 'PO match 100%. VAT correct. Amount above AED 50,000. Possible duplicate of INV-20874 cleared by supplier. Risk: Medium.' },
    { name: 'Finance approval', ms: 0, status: 'waiting' }, { name: 'Post to SAP', ms: 0, status: 'waiting' } ] },
  { id: 'R-1287', workflowId: 'wf1', workflow: 'Invoice Approval Flow', trigger: 'Email · ap-inbox', status: 'approved', started: '2026-11-05 07:21', duration: '6m 40s', cost: 0.012, decidedBy: 'Fatima Al Mansoori', summary: 'INV-20929 · Emirates Steel · AED 18,400', steps: [
    { name: 'Email received', ms: 380, status: 'ok' }, { name: 'Invoice Checker', model: 'Verify', ms: 2800, tokens: 1890, status: 'ok' }, { name: 'Finance approval', ms: 360000, status: 'ok' }, { name: 'Post to SAP', ms: 910, status: 'ok' } ] },
  { id: 'R-1286', workflowId: 'wf2', workflow: 'Supplier Status Reply', trigger: 'Email · supplier', status: 'approved', started: '2026-11-04 16:02', duration: '2m 10s', cost: 0.004, decidedBy: 'Mariam Khalid', summary: 'Reply to Gulf Print Co. about INV-20902', steps: [
    { name: 'Email received', ms: 300, status: 'ok' }, { name: 'Reply Drafter', model: 'Draft', ms: 1900, tokens: 760, status: 'ok' }, { name: 'Send-off', ms: 120000, status: 'ok' } ] },
  { id: 'R-1285', workflowId: 'wf1', workflow: 'Invoice Approval Flow', trigger: 'Email · ap-inbox', status: 'rejected', started: '2026-11-04 14:48', duration: '18m', cost: 0.011, decidedBy: 'Fatima Al Mansoori', summary: 'INV-20925 · missing TRN', steps: [
    { name: 'Email received', ms: 410, status: 'ok' }, { name: 'Invoice Checker', model: 'Verify', ms: 3300, tokens: 2300, status: 'ok' }, { name: 'Finance approval', ms: 1000000, status: 'ok' } ] },
  { id: 'R-1284', workflowId: 'wf3', workflow: 'Contract Expiry Sweep', trigger: 'Schedule · daily 06:00', status: 'failed', started: '2026-11-04 06:00', duration: '41s', cost: 0.006, summary: 'Registry fetch timed out on step 2', steps: [
    { name: 'Registry fetch', ms: 2400, status: 'ok' }, { name: 'Contract Expiry Watcher', model: 'Verify', ms: 38000, tokens: 5100, status: 'failed' } ] },
  { id: 'R-1283', workflowId: 'wf1', workflow: 'Invoice Approval Flow', trigger: 'Email · ap-inbox', status: 'approved', started: '2026-11-04 11:12', duration: '5m 02s', cost: 0.010, decidedBy: 'Fatima Al Mansoori', summary: 'INV-20921 · DP World · AED 7,900', steps: [
    { name: 'Email received', ms: 350, status: 'ok' }, { name: 'Invoice Checker', model: 'Verify', ms: 2600, tokens: 1700, status: 'ok' }, { name: 'Finance approval', ms: 280000, status: 'ok' }, { name: 'Post to SAP', ms: 880, status: 'ok' } ] },
]

export type Brick = 'trigger' | 'agent' | 'council' | 'logic' | 'human' | 'tool' | 'notify'
export type StepData = { brick: Brick; label: string; sub?: string; prompt?: string; model?: string; agentId?: string; councilId?: string; retries?: number; timeout?: number; costCap?: number }
export type WfNode = { id: string; type: 'step'; position: { x: number; y: number }; data: StepData }
export type WfEdge = { id: string; source: string; target: string; label?: string }
export type Workflow = {
  id: string
  name: string
  description: string
  status: 'live' | 'draft' | 'paused'
  version: number
  trigger: string
  autonomy: Autonomy
  nodes: WfNode[]
  edges: WfEdge[]
  runsWeek: number
  straightThrough: number
  updatedAt: string
  createdBy: string
}

const n = (id: string, brick: Brick, label: string, sub: string, x: number, y: number, extra: Partial<StepData> = {}): WfNode => ({ id, type: 'step', position: { x, y }, data: { brick, label, sub, retries: 1, timeout: 60, costCap: 0.05, model: DEFAULT_MODEL, ...extra } })

export const seedWorkflows: Workflow[] = [
  { id: 'wf1', name: 'Invoice Approval Flow', description: 'Email → Invoice Checker → Finance approval → SAP posting', status: 'live', version: 7, trigger: 'Email · ap-inbox@beinex.com', autonomy: 2, runsWeek: 812, straightThrough: 87, updatedAt: '2026-11-01', createdBy: 'mariam',
    nodes: [n('t', 'trigger', 'Email received', 'ap-inbox@beinex.com', 40, 160), n('a', 'agent', 'Invoice Checker', 'Extract and verify', 320, 160, { agentId: 'invoice-checker' }), n('l', 'logic', 'Above AED 50k?', 'amount > 50000', 600, 160), n('h', 'human', 'Finance approval', 'Fatima · backup Omar', 880, 60), n('p', 'tool', 'Post to SAP', 'General ledger', 1160, 160), n('x', 'notify', 'Audit & notify', 'Seal run · Teams', 1440, 160)],
    edges: [{ id: 'e1', source: 't', target: 'a' }, { id: 'e2', source: 'a', target: 'l' }, { id: 'e3', source: 'l', target: 'h', label: 'yes' }, { id: 'e4', source: 'l', target: 'p', label: 'no' }, { id: 'e5', source: 'h', target: 'p' }, { id: 'e6', source: 'p', target: 'x' }] },
  { id: 'wf2', name: 'Supplier Status Reply', description: 'Supplier email → Reply Drafter → human send-off', status: 'draft', version: 1, trigger: 'Email · supplier domain', autonomy: 1, runsWeek: 0, straightThrough: 0, updatedAt: '2026-11-04', createdBy: 'mariam',
    nodes: [n('t', 'trigger', 'Supplier email', 'Any supplier domain', 40, 160), n('a', 'agent', 'Reply Drafter', 'Draft a status reply', 320, 160, { agentId: 'supplier-reply' }), n('h', 'human', 'Send-off', 'Mariam reviews and sends', 600, 160)],
    edges: [{ id: 'e1', source: 't', target: 'a' }, { id: 'e2', source: 'a', target: 'h' }] },
  { id: 'wf3', name: 'Contract Expiry Sweep', description: 'Daily sweep of licences and contracts; drafts renewal requests', status: 'live', version: 2, trigger: 'Schedule · daily 06:00', autonomy: 1, runsWeek: 7, straightThrough: 71, updatedAt: '2026-10-21', createdBy: 'mariam',
    nodes: [n('t', 'trigger', 'Daily 06:00', 'Schedule', 40, 160), n('a', 'agent', 'Contract Expiry Watcher', 'Scan registry', 320, 160, { agentId: 'contract-watch' }), n('l', 'logic', 'Expiring < 30d?', 'days_remaining < 30', 600, 160), n('x', 'notify', 'Notify owner', 'Teams · Pulse', 880, 160)],
    edges: [{ id: 'e1', source: 't', target: 'a' }, { id: 'e2', source: 'a', target: 'l' }, { id: 'e3', source: 'l', target: 'x', label: 'yes' }] },
  { id: 'wf4', name: 'Procurement Council Review', description: 'Emergency PR → Procurement Council → gatekeeper decision', status: 'paused', version: 3, trigger: 'Form · emergency PR', autonomy: 2, runsWeek: 12, straightThrough: 0, updatedAt: '2026-10-15', createdBy: 'fatima',
    nodes: [n('t', 'trigger', 'Form submitted', 'Emergency PR', 40, 160), n('c', 'council', 'Procurement Council', '3 members · consensus', 320, 160, { councilId: 'procurement-council', model: 'anthropic/claude-opus-5.5' }), n('h', 'human', 'Gatekeeper', 'Fatima decides', 600, 160)],
    edges: [{ id: 'e1', source: 't', target: 'c' }, { id: 'e2', source: 'c', target: 'h' }] },
]

export const workflowTemplates: { id: string; name: string; desc: string; nodes: WfNode[]; edges: WfEdge[] }[] = [
  { id: 'standard', name: 'Standard', desc: 'Trigger → Agent → Human approval', nodes: [n('t', 'trigger', 'Trigger', 'Choose a source', 40, 160), n('a', 'agent', 'Agent', 'Pick an agent', 320, 160), n('h', 'human', 'Approval', 'Assign an approver', 600, 160)], edges: [{ id: 'e1', source: 't', target: 'a' }, { id: 'e2', source: 'a', target: 'h' }] },
  { id: 'council', name: 'Council review', desc: 'Trigger → Council → Gatekeeper', nodes: [n('t', 'trigger', 'Trigger', 'Choose a source', 40, 160), n('c', 'council', 'Council', 'Pick a council', 320, 160), n('h', 'human', 'Gatekeeper', 'Final decision', 600, 160)], edges: [{ id: 'e1', source: 't', target: 'c' }, { id: 'e2', source: 'c', target: 'h' }] },
  { id: 'blank', name: 'Blank', desc: 'Start from an empty canvas', nodes: [], edges: [] },
]

export type Doc = { id: string; title: string; content: string; updatedAt: string; addedBy: string }
export type Library = { id: string; name: string; desc: string; docs: Doc[] }

export const seedLibraries: Library[] = [
  { id: 'finance-policies', name: 'Finance policies', desc: 'Posting rules, thresholds and the approval matrix', docs: [
    { id: 'd1', title: 'Approval thresholds', addedBy: 'fatima', updatedAt: '2026-10-02', content: 'Invoices above AED 50,000 require Director of Finance approval. Invoices above AED 250,000 require the Finance & Ledger Gate council plus Director approval. Backup approver for all Finance gates is the Head of Information Security.' },
    { id: 'd2', title: 'VAT handling', addedBy: 'fatima', updatedAt: '2026-09-18', content: 'Standard UAE VAT is 5%. Every supplier invoice must carry a valid 15-digit Tax Registration Number (TRN) starting with 100. Invoices without a TRN cannot be posted. Zero-rated exports require the export declaration reference.' },
    { id: 'd3', title: 'Duplicate invoice rule', addedBy: 'mariam', updatedAt: '2026-10-20', content: 'Two invoices from the same supplier with the same amount and the same PO within 14 days are treated as possible duplicates and held. The supplier must confirm cancellation in writing before the second invoice is released.' },
  ] },
  { id: 'supplier-registry', name: 'Supplier registry', desc: 'Suppliers, TRNs, licences and contracts', docs: [
    { id: 'd4', title: 'Registry notes', addedBy: 'mariam', updatedAt: '2026-11-01', content: 'Supplier onboarding requires trade licence, TRN certificate and bank letter. Licences are checked 30 days before expiry. Suppliers with an expired licence are blocked from new POs.' },
  ] },
  { id: 'vat-guidance', name: 'UAE VAT & FTA guidance', desc: 'Official guidance and internal interpretations', docs: [
    { id: 'd5', title: 'Filing calendar', addedBy: 'faisal', updatedAt: '2026-10-05', content: 'Quarterly VAT returns are due on the 28th of the month following the quarter end. Q3 2026 return is due 28 November 2026. Late filing penalty is AED 1,000 for the first offence.' },
  ] },
]

export const deadlines = [
  { id: 'dl1', name: 'UAE FTA VAT return · Q3', due: '28 Nov 2026', days: 23 },
  { id: 'dl2', name: 'Gulf Print Co. trade licence', due: '17 Nov 2026', days: 12 },
  { id: 'dl3', name: 'Emirates Steel framework renewal', due: '05 Dec 2026', days: 30 },
]

export type AuditEvent = { id: string; at: string; actor: string; action: string; target: string; detail?: string }
export const seedAudit: AuditEvent[] = [
  { id: 'a1', at: '2026-11-05 07:41', actor: 'Fatima Al Mansoori', action: 'Approved', target: 'R-1287', detail: 'Signed to SAP · seal 3f9a…c21e' },
  { id: 'a2', at: '2026-11-04 17:30', actor: 'Mariam Khalid', action: 'Published', target: 'Invoice Approval Flow v7', detail: 'Retries lowered on SAP step' },
  { id: 'a3', at: '2026-11-04 14:52', actor: 'Fatima Al Mansoori', action: 'Rejected', target: 'R-1285', detail: 'Missing TRN' },
  { id: 'a4', at: '2026-11-03 09:10', actor: 'Omar Haddad', action: 'Paused watcher', target: 'Supplier reply backlog' },
  { id: 'a5', at: '2026-11-03 08:55', actor: 'Pilot Admin', action: 'Invited user', target: 'faisal.alnuaimi@beinex.com' },
]

// --- business records used by tools ---
export const invoices = [
  { id: 'INV-20931', supplier: 'Al Futtaim Logistics', amount: 52300, currency: 'AED', vat: 2615, trn: '100234567800003', po: 'PO-4471', date: '2026-11-03', status: 'On hold · duplicate review', due: '2026-12-03' },
  { id: 'INV-20874', supplier: 'Al Futtaim Logistics', amount: 52300, currency: 'AED', vat: 2615, trn: '100234567800003', po: 'PO-4471', date: '2026-10-31', status: 'Cancelled by supplier', due: '2026-11-30' },
  { id: 'INV-20929', supplier: 'Emirates Steel', amount: 18400, currency: 'AED', vat: 920, trn: '100987654300002', po: 'PO-4468', date: '2026-11-04', status: 'Approved · posted', due: '2026-12-04' },
  { id: 'INV-20921', supplier: 'DP World', amount: 7900, currency: 'AED', vat: 395, trn: '100555666700001', po: 'PO-4460', date: '2026-11-02', status: 'Approved · posted', due: '2026-12-02' },
  { id: 'INV-20902', supplier: 'Gulf Print Co.', amount: 3200, currency: 'AED', vat: 160, trn: '', po: 'PO-4452', date: '2026-10-28', status: 'Blocked · TRN missing', due: '2026-11-27' },
  { id: 'INV-20917', supplier: 'Nova Facilities', amount: 11250, currency: 'AED', vat: 562.5, trn: '', po: 'PO-4458', date: '2026-10-30', status: 'Blocked · TRN missing', due: '2026-11-29' },
  { id: 'INV-20925', supplier: 'Desert Tech Supplies', amount: 4600, currency: 'AED', vat: 230, trn: '', po: 'PO-4462', date: '2026-11-01', status: 'Rejected · TRN missing', due: '2026-12-01' },
  { id: 'INV-20887', supplier: 'Majid Events', amount: 12400, currency: 'AED', vat: 620, trn: '100111222300004', po: 'PO-4455', date: '2026-10-29', status: 'Approved · awaiting posting', due: '2026-11-28' },
]
export const purchaseOrders = [
  { id: 'PO-4471', supplier: 'Al Futtaim Logistics', amount: 52300, currency: 'AED', description: 'Q4 freight and customs handling', goodsReceived: true, costCentre: 'CC-310 Logistics' },
  { id: 'PO-4468', supplier: 'Emirates Steel', amount: 18400, currency: 'AED', description: 'Structural steel, warehouse B', goodsReceived: true, costCentre: 'CC-120 Facilities' },
  { id: 'PO-4460', supplier: 'DP World', amount: 7900, currency: 'AED', description: 'Port handling fees October', goodsReceived: true, costCentre: 'CC-310 Logistics' },
  { id: 'PO-4452', supplier: 'Gulf Print Co.', amount: 3200, currency: 'AED', description: 'Annual report printing', goodsReceived: true, costCentre: 'CC-210 Marketing' },
  { id: 'PO-4458', supplier: 'Nova Facilities', amount: 11250, currency: 'AED', description: 'HVAC maintenance Q4', goodsReceived: false, costCentre: 'CC-120 Facilities' },
  { id: 'PO-4462', supplier: 'Desert Tech Supplies', amount: 4600, currency: 'AED', description: 'Laptop accessories', goodsReceived: true, costCentre: 'CC-400 IT' },
  { id: 'PO-4455', supplier: 'Majid Events', amount: 12400, currency: 'AED', description: 'Town hall event November', goodsReceived: true, costCentre: 'CC-210 Marketing' },
]
export const suppliers = [
  { name: 'Al Futtaim Logistics', email: 'ap@alfuttaimlogistics.ae', trn: '100234567800003', licenceExpiry: '2027-03-14', contractExpiry: '2027-06-30', onboarded: '2021-04-02', risk: 'Low', openPOs: 3 },
  { name: 'Emirates Steel', email: 'receivables@emiratessteel.com', trn: '100987654300002', licenceExpiry: '2027-01-20', contractExpiry: '2026-12-05', onboarded: '2019-09-11', risk: 'Low', openPOs: 1 },
  { name: 'DP World', email: 'billing@dpworld.com', trn: '100555666700001', licenceExpiry: '2027-08-01', contractExpiry: '2027-08-01', onboarded: '2018-02-14', risk: 'Low', openPOs: 2 },
  { name: 'Gulf Print Co.', email: 'accounts@gulfprint.ae', trn: '', licenceExpiry: '2026-11-17', contractExpiry: '2027-02-28', onboarded: '2026-10-10', risk: 'Medium', openPOs: 2 },
  { name: 'Nova Facilities', email: 'finance@novafacilities.ae', trn: '', licenceExpiry: '2027-05-30', contractExpiry: '2027-05-30', onboarded: '2026-10-22', risk: 'Medium', openPOs: 1 },
  { name: 'Desert Tech Supplies', email: 'sales@deserttech.ae', trn: '', licenceExpiry: '2027-02-10', contractExpiry: '2027-02-10', onboarded: '2026-10-25', risk: 'Medium', openPOs: 0 },
  { name: 'Majid Events', email: 'accounts@majidevents.ae', trn: '100111222300004', licenceExpiry: '2027-04-18', contractExpiry: '2027-04-18', onboarded: '2023-06-01', risk: 'Low', openPOs: 1 },
]
export const chartOfAccounts = [
  { account: '6100', name: 'Freight & logistics', costCentres: ['CC-310'], taxCode: 'VAT-5' },
  { account: '6200', name: 'Facilities & maintenance', costCentres: ['CC-120'], taxCode: 'VAT-5' },
  { account: '6300', name: 'Marketing & events', costCentres: ['CC-210'], taxCode: 'VAT-5' },
  { account: '6400', name: 'IT equipment & accessories', costCentres: ['CC-400'], taxCode: 'VAT-5' },
  { account: '6500', name: 'Professional services', costCentres: ['CC-100', 'CC-210'], taxCode: 'VAT-5' },
]

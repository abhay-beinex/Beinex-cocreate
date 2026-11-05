// Built-in tools agents can call. Read tools run instantly over the pilot data; write tools are gated and only queue work for a human.
import { invoices, purchaseOrders, suppliers, chartOfAccounts, type Library } from './data'
import type { ToolDef } from './openrouter'

export type ToolMeta = { name: string; label: string; desc: string; write: boolean; category: 'Finance' | 'Suppliers' | 'Knowledge' | 'Actions' }

export const TOOLS: ToolMeta[] = [
  { name: 'lookup_invoice', label: 'Invoice lookup', desc: 'Find an invoice by number or supplier', write: false, category: 'Finance' },
  { name: 'lookup_purchase_order', label: 'Purchase order lookup', desc: 'Find a PO and goods receipt status', write: false, category: 'Finance' },
  { name: 'find_duplicates', label: 'Duplicate finder', desc: 'Find invoices with the same amount and PO', write: false, category: 'Finance' },
  { name: 'chart_of_accounts', label: 'Chart of accounts', desc: 'GL accounts, cost centres and tax codes', write: false, category: 'Finance' },
  { name: 'lookup_supplier', label: 'Supplier lookup', desc: 'TRN, licence and contract expiry for a supplier', write: false, category: 'Suppliers' },
  { name: 'list_suppliers', label: 'Supplier list', desc: 'All suppliers with expiry dates and risk', write: false, category: 'Suppliers' },
  { name: 'search_knowledge', label: 'Knowledge search', desc: 'Search the libraries attached to the agent', write: false, category: 'Knowledge' },
  { name: 'draft_email', label: 'Draft email', desc: 'Create an email draft for a human to send', write: true, category: 'Actions' },
  { name: 'queue_ledger_posting', label: 'Queue ledger posting', desc: 'Queue a GL posting for approval', write: true, category: 'Actions' },
]

export const toolDefs = (names: string[]): ToolDef[] => names.map((n) => DEFS[n]).filter(Boolean)

const DEFS: Record<string, ToolDef> = {
  lookup_invoice: { type: 'function', function: { name: 'lookup_invoice', description: 'Look up invoices by invoice number (e.g. INV-20931) or supplier name. Returns amount, VAT, TRN, PO, date, status and the supplier contact email.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Invoice number or supplier name' } }, required: ['query'] } } },
  lookup_purchase_order: { type: 'function', function: { name: 'lookup_purchase_order', description: 'Look up a purchase order by number (e.g. PO-4471).', parameters: { type: 'object', properties: { po: { type: 'string' } }, required: ['po'] } } },
  find_duplicates: { type: 'function', function: { name: 'find_duplicates', description: 'Find other invoices that share the same supplier, amount and PO as the given invoice within 14 days.', parameters: { type: 'object', properties: { invoice: { type: 'string' } }, required: ['invoice'] } } },
  chart_of_accounts: { type: 'function', function: { name: 'chart_of_accounts', description: 'List GL accounts with their cost centres and tax codes. Optionally filter by keyword.', parameters: { type: 'object', properties: { keyword: { type: 'string' } } } } },
  lookup_supplier: { type: 'function', function: { name: 'lookup_supplier', description: 'Get a supplier record: TRN, licence expiry, contract expiry, risk and open POs.', parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } } },
  list_suppliers: { type: 'function', function: { name: 'list_suppliers', description: 'List all suppliers with licence and contract expiry dates and days remaining.', parameters: { type: 'object', properties: { expiring_within_days: { type: 'number', description: 'Only suppliers with a document expiring within this many days' } } } } },
  search_knowledge: { type: 'function', function: { name: 'search_knowledge', description: 'Search the policy and knowledge documents attached to this agent.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
  draft_email: { type: 'function', function: { name: 'draft_email', description: 'Create an email draft for a human to review and send. Never sends.', parameters: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['to', 'subject', 'body'] } } },
  queue_ledger_posting: { type: 'function', function: { name: 'queue_ledger_posting', description: 'Queue a general-ledger posting for human approval. Never posts directly.', parameters: { type: 'object', properties: { invoice: { type: 'string' }, account: { type: 'string' }, cost_centre: { type: 'string' }, tax_code: { type: 'string' }, amount: { type: 'number' }, justification: { type: 'string' } }, required: ['invoice', 'account', 'cost_centre', 'amount'] } } },
}

const daysUntil = (iso: string) => Math.round((new Date(iso).getTime() - Date.now()) / 86400000)

export type ToolContext = { libraries: Library[]; onGatedAction?: (a: { tool: string; args: Record<string, unknown> }) => void }

export function runTool(name: string, rawArgs: string, ctx: ToolContext): string {
  let args: any = {}
  try { args = JSON.parse(rawArgs || '{}') } catch { /* ignore */ }
  const q = String(args.query ?? args.name ?? args.invoice ?? args.po ?? '').toLowerCase()
  switch (name) {
    case 'lookup_invoice': {
      const hits = invoices.filter((i) => i.id.toLowerCase().includes(q) || i.supplier.toLowerCase().includes(q)).map((i) => ({ ...i, supplierEmail: suppliers.find((s) => s.name === i.supplier)?.email }))
      return hits.length ? JSON.stringify(hits) : `No invoice matches "${args.query}".`
    }
    case 'lookup_purchase_order': {
      const po = purchaseOrders.find((p) => p.id.toLowerCase() === q)
      return po ? JSON.stringify(po) : `No purchase order "${args.po}".`
    }
    case 'find_duplicates': {
      const inv = invoices.find((i) => i.id.toLowerCase() === q)
      if (!inv) return `No invoice "${args.invoice}".`
      const dups = invoices.filter((i) => i.id !== inv.id && i.supplier === inv.supplier && i.amount === inv.amount && i.po === inv.po && Math.abs(new Date(i.date).getTime() - new Date(inv.date).getTime()) <= 14 * 86400000)
      return dups.length ? JSON.stringify({ invoice: inv, possibleDuplicates: dups }) : 'No duplicates found.'
    }
    case 'chart_of_accounts': {
      const k = String(args.keyword ?? '').toLowerCase()
      return JSON.stringify(chartOfAccounts.filter((a) => !k || a.name.toLowerCase().includes(k) || a.costCentres.join(' ').toLowerCase().includes(k)))
    }
    case 'lookup_supplier': {
      const s = suppliers.find((x) => x.name.toLowerCase().includes(q))
      return s ? JSON.stringify({ ...s, licenceDaysRemaining: daysUntil(s.licenceExpiry), contractDaysRemaining: daysUntil(s.contractExpiry) }) : `No supplier matches "${args.name}".`
    }
    case 'list_suppliers': {
      const within = Number(args.expiring_within_days ?? 99999)
      const rows = suppliers.map((s) => ({ ...s, licenceDaysRemaining: daysUntil(s.licenceExpiry), contractDaysRemaining: daysUntil(s.contractExpiry) })).filter((s) => Math.min(s.licenceDaysRemaining, s.contractDaysRemaining) <= within)
      return JSON.stringify(rows)
    }
    case 'search_knowledge': {
      const words = String(args.query ?? '').toLowerCase().split(/\W+/).filter((w) => w.length > 2)
      const hits = ctx.libraries.flatMap((l) => l.docs.map((d) => ({ library: l.name, title: d.title, content: d.content, score: words.filter((w) => (d.title + ' ' + d.content).toLowerCase().includes(w)).length }))).filter((h) => h.score > 0).sort((a, b) => b.score - a.score).slice(0, 4)
      return hits.length ? JSON.stringify(hits.map(({ score, ...h }) => h)) : 'No matching documents in the attached libraries.'
    }
    case 'draft_email': {
      ctx.onGatedAction?.({ tool: name, args })
      return JSON.stringify({ status: 'draft_created', note: 'Draft saved to Outlook. A human must review and send it.', to: args.to, subject: args.subject })
    }
    case 'queue_ledger_posting': {
      ctx.onGatedAction?.({ tool: name, args })
      return JSON.stringify({ status: 'queued_for_approval', note: 'Posting queued. The Director of Finance must approve before anything reaches SAP.', ...args })
    }
    default:
      return `Unknown tool ${name}.`
  }
}

// Shared chat thread + composer used by Chat and the agent preview. Runs agents with tools.
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUp, Square, Sparkles, Wrench, Check, ShieldCheck, KeyRound } from 'lucide-react'
import { useApp, useUser, profileModels, type ChatMsg } from '@/store/app'
import { runAgentTurn } from '@/lib/agentRun'
import { TOOLS } from '@/lib/tools'
import type { Autonomy } from '@/lib/data'
import { Avatar, Tile, cx } from './ui'
import { Md } from './Md'

export type AgentLike = { id: string; name: string; description: string; instructions: string; model: string; tools: string[]; knowledge: string[]; samplePrompts: string[]; autonomy?: Autonomy }

export function useAgentChat(agent: AgentLike, storeKey?: string) {
  const s = useApp()
  const [local, setLocal] = useState<ChatMsg[]>([])
  const msgs = storeKey ? s.chats[storeKey] ?? [] : local
  const save = (m: ChatMsg[]) => (storeKey ? s.setChat(storeKey, m) : setLocal(m))
  const [busy, setBusy] = useState(false)
  const abort = useRef<AbortController | null>(null)

  const send = async (text: string, model?: string) => {
    const content = text.trim(); if (!content || busy) return
    const user: ChatMsg = { id: crypto.randomUUID(), role: 'user', content, at: Date.now() }
    const asst: ChatMsg = { id: crypto.randomUUID(), role: 'assistant', content: '', tools: [], at: Date.now() }
    const history = [...msgs, user]
    save([...history, asst])
    if (!s.apiKey) { save([...history, { ...asst, error: true, content: 'Models are not available right now. Please contact your administrator.' }]); return }
    if (!s.canSpend()) { save([...history, { ...asst, error: true, content: 'Your daily spend cap is reached. Ask an admin to raise it under Settings › Governance.' }]); return }
    setBusy(true); abort.current = new AbortController()
    const cur = { ...asst }
    const update = () => save([...history, { ...cur }])
    const mdl = model ?? agent.model
    try {
      for await (const ev of runAgentTurn({ key: s.apiKey, model: mdl, models: profileModels(s), custom: s.customTools, autonomy: agent.autonomy, instructions: agent.instructions, tools: agent.tools, libraries: s.libraries.filter((l) => agent.knowledge.includes(l.id)), history: history.map((m) => ({ role: m.role, content: m.content })), signal: abort.current.signal })) {
        if (ev.type === 'text') cur.content += ev.text
        else if (ev.type === 'tool_start') cur.tools = [...(cur.tools ?? []), { name: ev.name, args: ev.args }]
        else if (ev.type === 'tool_end') cur.tools = (cur.tools ?? []).map((t) => (t.name === ev.name && !t.result ? { ...t, result: ev.result } : t))
        else if (ev.type === 'gated') {
          const label = ev.tool === 'draft_email' ? `Email draft to ${ev.args.to ?? ''}: ${ev.args.subject ?? ''}` : `Approval requested: ${ev.args.action ?? ''}`
          s.logAudit('Queued for approval', ev.tool, label.slice(0, 120))
          const id = s.addRun({ id: 'pending', kind: 'chat', workflowId: 'chat', workflow: `Chat · ${agent.name}`, trigger: 'Chat · gated action', status: 'waiting', started: new Date().toISOString().slice(0, 16).replace('T', ' '), duration: '—', cost: 0, summary: label, cursor: null,
            steps: [{ name: agent.name, model: mdl.split('/')[1], ms: 0, status: 'ok', output: ev.tool === 'draft_email' ? `**To:** ${ev.args.to}\n\n**Subject:** ${ev.args.subject}\n\n${ev.args.body}` : `**Action:** ${ev.args.action}\n\n${ev.args.reason ?? ''}` }, { name: ev.tool === 'draft_email' ? 'Send-off (person)' : 'Approval (person)', ms: 0, status: 'waiting' }] })
          s.notify({ title: `Approval needed: ${agent.name}`, body: label, link: `/runs?open=${id}`, kind: 'approval' })
        }
        else if (ev.type === 'saved') s.addDoc('outputs', { title: ev.title, content: ev.content })
        else if (ev.type === 'done') s.recordSpend(ev.usage?.cost ?? 0)
        else if (ev.type === 'error') { cur.content += (cur.content ? '\n\n' : '') + `Error: ${ev.message}`; cur.error = true }
        update()
      }
    } catch (e: any) { if (e?.name !== 'AbortError') { cur.content += `\n\nError: ${e.message}`; cur.error = true; update() } }
    finally { setBusy(false); abort.current = null }
  }
  return { msgs, send, busy, stop: () => abort.current?.abort(), clear: () => save([]) }
}

export function Thread({ msgs, agent, compact, onPrompt }: { msgs: ChatMsg[]; agent: AgentLike; compact?: boolean; onPrompt?: (p: string) => void }) {
  const bottom = useRef<HTMLDivElement>(null)
  const apiKey = useApp((s) => s.apiKey)
  const user = useUser()
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs.length, msgs[msgs.length - 1]?.content.length, msgs[msgs.length - 1]?.tools?.length])

  return (
    <div className={cx('flex flex-col gap-5', compact ? 'px-4 py-4' : 'max-w-[720px] mx-auto px-5 py-6')}>
      {msgs.length === 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cx('text-center', compact ? 'pt-10' : 'pt-16')}>
          <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}><Tile color="#10385b" size={44} radius={14} className="mx-auto mb-4"><Sparkles size={20} /></Tile></motion.div>
          <h2 className="display text-[18px] font-bold">{compact ? 'Try it' : 'How can I help?'}</h2>
          {!compact && <p className="muted text-[12.5px] mt-1">{agent.description}</p>}
          {!apiKey && <div className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--warn)]"><KeyRound size={13} /> Models are not available right now. Contact your administrator.</div>}
          {onPrompt && <div className="flex flex-wrap justify-center gap-2 mt-5">{agent.samplePrompts.map((p) => <button key={p} onClick={() => onPrompt(p)} className="btn btn-sm !font-medium">{p}</button>)}</div>}
        </motion.div>
      )}
      <AnimatePresence initial={false}>
        {msgs.map((m) => (
          <motion.div key={m.id} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.3 }} className={cx('flex gap-3', m.role === 'user' && 'justify-end')}>
            {m.role === 'assistant' && <Tile color="#10385b" size={28} radius={9} className="mt-0.5"><Sparkles size={13} /></Tile>}
            <div className={cx('min-w-0 text-[13.5px] leading-relaxed', m.role === 'user' ? 'max-w-[75%] px-4 py-2.5 rounded-[18px] rounded-br-[6px] bg-[var(--surface-2)] border hairline whitespace-pre-wrap' : 'flex-1 pt-1', m.error && 'text-[var(--danger)]')}>
              {m.role === 'assistant' && (m.tools?.length ?? 0) > 0 && <div className="flex flex-col gap-1.5 mb-2">{m.tools!.map((t, i) => <ToolCard key={i} name={t.name} args={t.args} result={t.result} compact={compact} />)}</div>}
              {m.role === 'assistant' ? (m.content ? <Md>{m.content}</Md> : !m.tools?.length || m.tools.every((t) => t.result) ? <Typing /> : null) : m.content}
            </div>
            {m.role === 'user' && <Avatar initials={user?.initials ?? 'You'} size={28} className="mt-0.5" />}
          </motion.div>
        ))}
      </AnimatePresence>
      <div ref={bottom} />
    </div>
  )
}

function summarise(name: string, args: string, result?: string) {
  let a: any = {}; try { a = JSON.parse(args) } catch { /* ignore */ }
  const q = a.query ?? a.topic ?? a.url ?? a.expression ?? a.city ?? a.title ?? a.subject ?? a.action ?? ''
  const base = { web_search: `Searched the web · ${q}`, deep_research: `Researched · ${q}`, read_url: `Read ${q}`, calculate: `Calculated ${q}`, run_javascript: 'Ran code', current_datetime: 'Checked the date', search_knowledge: `Searched your knowledge · ${q}`, save_document: `Saved "${q}"`, draft_email: `Drafted email · ${q}`, request_approval: `Asked for approval · ${q}` }[name] ?? `${name} · ${q}`
  if (!result) return `${base}…`
  if (name === 'search_knowledge') { try { const r = JSON.parse(result); if (Array.isArray(r)) return `${base} · ${r.length} result${r.length === 1 ? '' : 's'}` } catch { /* ignore */ } }
  if (name === 'draft_email' || name === 'request_approval') return `${base} · waiting for a person`
  return base
}

function ToolCard({ name, args, result, compact }: { name: string; args: string; result?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const custom = useApp((s) => s.customTools.find((t) => t.name === name))
  const meta = TOOLS.find((t) => t.name === name)
  const gated = meta?.write
  if (compact) return (
    <button onClick={() => setOpen((o) => !o)} className="text-left">
      <span className={cx('inline-flex items-center gap-2 text-[12px] px-2.5 h-7 rounded-[9px] pressed', gated ? 'text-[var(--warn)]' : 'muted')}>{gated ? <ShieldCheck size={12} /> : <Wrench size={12} />}<span className="truncate max-w-[320px]">{summarise(name, args, result)}</span>{!result && <motion.span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1 }} />}</span>
      {open && result && <pre className="mt-1.5 text-[11px] muted whitespace-pre-wrap max-h-40 overflow-auto flat p-2">{result.slice(0, 2000)}</pre>}
    </button>
  )
  return (
    <motion.div layout initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flat overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 px-3 h-9 text-[12px] text-left">
        <span className={cx('w-5 h-5 rounded-[6px] grid place-items-center', gated ? 'bg-[color-mix(in_srgb,var(--warn)_18%,transparent)] text-[var(--warn)]' : 'bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] accent-ink')}>{gated ? <ShieldCheck size={12} /> : <Wrench size={12} />}</span>
        <span className="font-medium truncate flex-1">{custom ? `${custom.label} · ${(() => { try { return Object.values(JSON.parse(args)).join(', ').slice(0, 80) } catch { return '' } })()}` : summarise(name, args, result)}</span>
        {result ? <Check size={13} className="text-[var(--ok)]" /> : <motion.span className="w-2 h-2 rounded-full bg-[var(--accent)]" animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1 }} />}
      </button>
      {open && (name === 'draft_email' ? <div className="px-3 pb-3 text-[12px] whitespace-pre-wrap max-h-60 overflow-auto">{(() => { try { const a = JSON.parse(args); return `To: ${a.to}\nSubject: ${a.subject}\n\n${a.body}` } catch { return args } })()}</div> : <pre className="px-3 pb-3 text-[11px] muted whitespace-pre-wrap max-h-48 overflow-auto">{result ?? 'Running…'}</pre>)}
      {gated && result && <div className="px-3 pb-2 text-[11px] text-[var(--warn)] font-medium">Queued under Runs › Approvals. Nothing was sent or done.</div>}
    </motion.div>
  )
}

export const Typing = () => (
  <span className="inline-flex gap-1 items-center h-5">{[0, 0.15, 0.3].map((d) => <motion.i key={d} className="w-1.5 h-1.5 rounded-full bg-[var(--muted)] block" animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: d }} />)}</span>
)

export function Composer({ onSend, busy, onStop, placeholder, right }: { onSend: (t: string) => void; busy: boolean; onStop: () => void; placeholder: string; right?: React.ReactNode }) {
  const [v, setV] = useState('')
  const submit = () => { if (v.trim()) { onSend(v); setV('') } }
  return (
    <div className="flat p-1.5 pl-4 flex items-end gap-2">
      <textarea value={v} onChange={(e) => setV(e.target.value)} rows={1} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }} placeholder={placeholder} className="flex-1 bg-transparent outline-0 resize-none text-[13.5px] py-2.5 max-h-40 scroll" />
      {right}
      {busy ? <button onClick={onStop} className="btn btn-icon !rounded-full !w-9 !h-9"><Square size={14} /></button>
        : <motion.button whileTap={{ scale: 0.9 }} onClick={submit} disabled={!v.trim()} className="btn btn-primary btn-icon !rounded-full !w-9 !h-9"><ArrowUp size={16} /></motion.button>}
    </div>
  )
}

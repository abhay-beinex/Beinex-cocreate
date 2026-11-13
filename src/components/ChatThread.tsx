// Shared chat thread + composer used by Chat and the agent preview. Runs agents with tools; answers carry actions and sources.
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUp, Square, Sparkles, Wrench, Check, ShieldCheck, KeyRound, Copy, FilePlus, Workflow as WorkflowIcon, Paperclip, X, Link2 } from 'lucide-react'
import { useApp, useUser, profileModels, type ChatMsg } from '@/store/app'
import { runAgentTurn } from '@/lib/agentRun'
import { readFileText } from '@/lib/files'
import { TOOLS } from '@/lib/tools'
import type { Autonomy } from '@/lib/data'
import { Avatar, Tile, cx } from './ui'
import { AgentAvatar } from './AgentAvatar'
import { Md } from './Md'

export type AgentLike = { id: string; name: string; description: string; instructions: string; model: string; tools: string[]; knowledge: string[]; samplePrompts: string[]; autonomy?: Autonomy; icon?: string; color?: string }
export type Attachment = { name: string; text: string }

export function useAgentChat(agent: AgentLike, storeKey?: string) {
  const s = useApp()
  const [local, setLocal] = useState<ChatMsg[]>([])
  const msgs = storeKey ? s.chats[storeKey] ?? [] : local
  const save = (m: ChatMsg[]) => (storeKey ? s.setChat(storeKey, m) : setLocal(m))
  const [busy, setBusy] = useState(false)
  const abort = useRef<AbortController | null>(null)

  const send = async (text: string, model?: string, files: Attachment[] = []) => {
    const shown = text.trim(); if ((!shown && !files.length) || busy) return
    const content = shown + files.map((f) => `\n\nAttached file "${f.name}":\n\`\`\`\n${f.text.slice(0, 60_000)}\n\`\`\``).join('')
    const user: ChatMsg = { id: crypto.randomUUID(), role: 'user', content, display: files.length ? shown || `Attached ${files.map((f) => f.name).join(', ')}` : undefined, files: files.map((f) => f.name), at: Date.now() }
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
      const apiHistory = history.map((m) => ({
        role: m.role,
        content: m.role === 'assistant' && m.tools?.some((t) => t.result)
          ? `${m.content}${m.tools.filter((t) => t.result).map((t) => `\n\n[Tool ${t.name}(${t.args}) result:\n${t.result!.slice(0, 4000)}]`).join('')}`
          : m.content,
      }))
      for await (const ev of runAgentTurn({ key: s.apiKey, model: mdl, models: profileModels(s), custom: s.customTools, autonomy: agent.autonomy, instructions: agent.instructions, tools: agent.tools, libraries: s.libraries.filter((l) => agent.knowledge.includes(l.id)), history: apiHistory, signal: abort.current.signal })) {
        if (ev.type === 'text') cur.content += ev.text
        else if (ev.type === 'tool_start') cur.tools = [...(cur.tools ?? []), { id: ev.id, name: ev.name, args: ev.args }]
        else if (ev.type === 'tool_end') cur.tools = (cur.tools ?? []).map((t) => ((t.id ? t.id === ev.id : t.name === ev.name && !t.result) ? { ...t, result: ev.result } : t))
        else if (ev.type === 'gated') {
          const label = ev.tool === 'draft_email' ? `Email draft to ${ev.args.to ?? ''}: ${ev.args.subject ?? ''}` : `Approval requested: ${ev.args.action ?? ''}`
          s.logAudit('Queued for approval', ev.tool, label.slice(0, 120))
          const id = s.addRun({
            id: 'pending', kind: 'chat', workflowId: 'chat', workflow: `Chat · ${agent.name}`, trigger: 'Chat · gated action', status: 'waiting', started: new Date().toISOString().slice(0, 16).replace('T', ' '), duration: '0s', cost: 0, summary: label, cursor: null, startedBy: s.currentUserId ?? 'system',
            steps: [{ name: agent.name, model: mdl.split('/')[1], ms: 0, status: 'ok', output: ev.tool === 'draft_email' ? `**To:** ${ev.args.to}\n\n**Subject:** ${ev.args.subject}\n\n${ev.args.body}` : `**Action:** ${ev.args.action}\n\n${ev.args.reason ?? ''}` }, { name: ev.tool === 'draft_email' ? 'Send-off (person)' : 'Approval (person)', ms: 0, status: 'waiting' }]
          })
          const revIdx = [...(cur.tools ?? [])].reverse().findIndex((t) => t.name === ev.tool && !t.runId)
          if (revIdx >= 0 && cur.tools) {
            const realIdx = cur.tools.length - 1 - revIdx
            cur.tools = cur.tools.map((t, i) => (i === realIdx ? { ...t, runId: id } : t))
          }
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

const urlsIn = (s: string) => Array.from(new Set((s.match(/https?:\/\/[^\s)\]>"']+/g) ?? []).map((u) => u.replace(/[.,;:]+$/, ''))))

export function Thread({ msgs, agent, compact, onPrompt, onAction, emptyExtra }: { msgs: ChatMsg[]; agent: AgentLike; compact?: boolean; onPrompt?: (p: string) => void; onAction?: (a: 'save' | 'workflow', m: ChatMsg, question?: string) => void; emptyExtra?: React.ReactNode }) {
  const bottom = useRef<HTMLDivElement>(null)
  const apiKey = useApp((s) => s.apiKey)
  const user = useUser()
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs.length, msgs[msgs.length - 1]?.content.length, msgs[msgs.length - 1]?.tools?.length])

  return (
    <div className={cx('flex flex-col gap-5', compact ? 'px-4 py-4' : 'max-w-[760px] mx-auto px-5 py-6')}>
      {msgs.length === 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cx('text-center', compact ? 'pt-10' : 'pt-14')}>
          <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>{agent.id === 'assistant' ? <Tile color="#10385b" size={48} radius={15} className="mx-auto mb-4"><Sparkles size={22} /></Tile> : <AgentAvatar name={agent.name} icon={agent.icon} color={agent.color} size={48} className="mx-auto mb-4" />}</motion.div>
          <h2 className="display text-[20px] font-bold">{compact ? 'Try it' : agent.id === 'assistant' ? 'How can I help?' : agent.name}</h2>
          {!compact && <p className="muted text-[13px] mt-1 max-w-[460px] mx-auto">{agent.description}</p>}
          {!apiKey && <div className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--warn)]"><KeyRound size={13} /> Models are not available right now. Contact your administrator.</div>}
          {onPrompt && agent.samplePrompts.length > 0 && <div className="flex flex-wrap justify-center gap-2 mt-6">{agent.samplePrompts.slice(0, 4).map((p) => <button key={p} onClick={() => onPrompt(p)} className="btn btn-sm !font-medium !h-9 max-w-[340px] !justify-start"><span className="truncate">{p}</span></button>)}</div>}
          {emptyExtra}
        </motion.div>
      )}
      <AnimatePresence initial={false}>
        {msgs.map((m, i) => {
          const question = m.role === 'assistant' ? [...msgs.slice(0, i)].reverse().find((x) => x.role === 'user') : undefined
          const sources = m.role === 'assistant' && m.content && !compact ? urlsIn(m.content).slice(0, 6) : []
          const done = m.role === 'assistant' && !!m.content && (!m.tools?.length || m.tools.every((t) => t.result))
          return (
            <motion.div key={m.id} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.3 }} className={cx('flex gap-3 group', m.role === 'user' && 'justify-end')}>
              {m.role === 'assistant' && (agent.id === 'assistant' || compact ? <Tile color="#10385b" size={28} radius={9} className="mt-0.5"><Sparkles size={13} /></Tile> : <AgentAvatar name={agent.name} icon={agent.icon} color={agent.color} size={28} radius={9} className="mt-0.5" />)}
              <div className={cx('min-w-0 text-[13.5px] leading-relaxed', m.role === 'user' ? 'max-w-[75%] px-4 py-2.5 rounded-[18px] rounded-br-[6px] bg-[var(--surface-2)] border hairline whitespace-pre-wrap' : 'flex-1 pt-1', m.error && 'text-[var(--danger)]')}>
                {m.role === 'assistant' && (m.tools?.length ?? 0) > 0 && <div className="flex flex-col gap-1.5 mb-2">{m.tools!.map((t, j) => <ToolCard key={t.id ?? j} name={t.name} args={t.args} result={t.result} runId={t.runId} compact={compact} />)}</div>}
                {m.role === 'assistant' ? (m.content ? <Md>{m.content}</Md> : !m.tools?.length || m.tools.every((t) => t.result) ? <Typing /> : null) : (m.display ?? m.content)}
                {m.role === 'user' && m.files && m.files.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{m.files.map((f) => <span key={f} className="chip !h-6 !text-[11px]"><Paperclip size={10} /> {f}</span>)}</div>}
                {sources.length > 0 && <div className="flex flex-wrap gap-1.5 mt-3">{sources.map((u) => { let host = u; try { host = new URL(u).hostname.replace(/^www\./, '') } catch { /* keep */ } return <a key={u} href={u} target="_blank" rel="noreferrer" className="chip !h-6 !text-[11px] hover:text-[var(--text)] max-w-[220px]"><Link2 size={10} /><span className="truncate">{host}</span></a> })}</div>}
                {done && !compact && !m.error && (
                  <div className="flex items-center gap-1 mt-2 -ml-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <Action icon={Copy} label="Copy" onClick={() => navigator.clipboard?.writeText(m.content)} />
                    {onAction && <Action icon={FilePlus} label="Save as document" onClick={() => onAction('save', m, question?.display ?? question?.content)} />}
                    {onAction && <Action icon={WorkflowIcon} label="Turn into a workflow" onClick={() => onAction('workflow', m, question?.display ?? question?.content)} />}
                  </div>
                )}
              </div>
              {m.role === 'user' && <Avatar initials={user?.initials ?? 'You'} size={28} className="mt-0.5" />}
            </motion.div>
          )
        })}
      </AnimatePresence>
      <div ref={bottom} />
    </div>
  )
}

function Action({ icon: I, label, onClick }: { icon: typeof Copy; label: string; onClick: () => void }) {
  const [did, setDid] = useState(false)
  return <button onClick={() => { onClick(); setDid(true); setTimeout(() => setDid(false), 1500) }} className="h-7 px-2 rounded-[8px] text-[11.5px] font-medium muted hover:text-[var(--text)] hover:bg-[var(--clay-dark)] inline-flex items-center gap-1.5" title={label}>{did ? <Check size={12} className="text-[var(--ok)]" /> : <I size={12} />} {did && label === 'Copy' ? 'Copied' : label}</button>
}

function summarise(name: string, args: string, result?: string, runStatus?: string) {
  let a: any = {}; try { a = JSON.parse(args) } catch { /* ignore */ }
  const q = a.query ?? a.topic ?? a.url ?? a.expression ?? a.city ?? a.title ?? a.subject ?? a.action ?? ''
  const base = { web_search: `Searched the web · ${q}`, deep_research: `Researched · ${q}`, read_url: `Read ${q}`, calculate: `Calculated ${q}`, run_javascript: 'Ran code', current_datetime: 'Checked the date', search_knowledge: `Searched your knowledge · ${q}`, save_document: `Saved "${q}"`, draft_email: `Drafted email · ${q}`, request_approval: `Asked for approval · ${q}` }[name] ?? `${name} · ${q}`
  if (!result) return `${base}…`
  if (name === 'search_knowledge') { try { const r = JSON.parse(result); if (Array.isArray(r)) return `${base} · ${r.length} result${r.length === 1 ? '' : 's'}` } catch { /* ignore */ } }
  if (name === 'draft_email' || name === 'request_approval') {
    if (runStatus === 'approved' || runStatus === 'completed') return `${base} · approved`
    if (runStatus === 'rejected') return `${base} · rejected`
    return `${base} · waiting for a person`
  }
  return base
}

function ToolCard({ name, args, result, runId, compact }: { name: string; args: string; result?: string; runId?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const custom = useApp((s) => s.customTools.find((t) => t.name === name))
  const meta = TOOLS.find((t) => t.name === name)
  const gated = meta?.write
  const linkedRun = useApp((s) => {
    if (runId) return s.runs.find((r) => r.id === runId)
    if (!gated) return undefined
    let key = ''
    try { const a = JSON.parse(args); key = String(a.subject ?? a.action ?? '').slice(0, 60) } catch { /* ignore */ }
    return key ? s.runs.find((r) => r.kind === 'chat' && (r.summary ?? '').includes(key)) : undefined
  })
  const runStatus = linkedRun?.status
  const label = custom ? `${custom.label} · ${(() => { try { return Object.values(JSON.parse(args)).join(', ').slice(0, 80) } catch { return '' } })()}` : summarise(name, args, result, runStatus)
  const gateTone = runStatus === 'approved' || runStatus === 'completed' ? 'text-[var(--ok)]' : runStatus === 'rejected' ? 'text-[var(--danger)]' : 'text-[var(--warn)]'
  if (compact) return (
    <button onClick={() => setOpen((o) => !o)} className="text-left">
      <span className={cx('inline-flex items-center gap-2 text-[12px] px-2.5 h-7 rounded-[9px] pressed', gated ? gateTone : 'muted')}>{gated ? <ShieldCheck size={12} /> : <Wrench size={12} />}<span className="truncate max-w-[320px]">{label}</span>{!result && <motion.span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1 }} />}</span>
      {open && result && <pre className="mt-1.5 text-[11px] muted whitespace-pre-wrap max-h-40 overflow-auto flat p-2">{result.slice(0, 2000)}</pre>}
    </button>
  )
  return (
    <motion.div layout initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flat overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 px-3 h-9 text-[12px] text-left">
        <span className={cx('w-5 h-5 rounded-[6px] grid place-items-center', gated ? (runStatus === 'approved' || runStatus === 'completed' ? 'bg-[color-mix(in_srgb,var(--ok)_18%,transparent)] text-[var(--ok)]' : runStatus === 'rejected' ? 'bg-[color-mix(in_srgb,var(--danger)_18%,transparent)] text-[var(--danger)]' : 'bg-[color-mix(in_srgb,var(--warn)_18%,transparent)] text-[var(--warn)]') : 'bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] accent-ink')}>{gated ? <ShieldCheck size={12} /> : <Wrench size={12} />}</span>
        <span className="font-medium truncate flex-1">{label}</span>
        {result ? (gated && runStatus === 'rejected' ? <X size={13} className="text-[var(--danger)]" /> : <Check size={13} className="text-[var(--ok)]" />) : <motion.span className="w-2 h-2 rounded-full bg-[var(--accent)]" animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1 }} />}
      </button>
      {open && (name === 'draft_email' ? <div className="px-3 pb-3 text-[12px] whitespace-pre-wrap max-h-60 overflow-auto">{(() => { try { const a = JSON.parse(args); return `To: ${a.to}\nSubject: ${a.subject}\n\n${a.body}` } catch { return args } })()}</div> : <pre className="px-3 pb-3 text-[11px] muted whitespace-pre-wrap max-h-48 overflow-auto">{result ?? 'Running…'}</pre>)}
      {gated && result && (
        runStatus === 'approved' || runStatus === 'completed' ? (
          <div className="px-3 pb-2 text-[11px] text-[var(--ok)] font-medium">Approved and signed by {linkedRun?.decidedBy ?? 'an approver'}{linkedRun ? ` (${linkedRun.id})` : ''}.</div>
        ) : runStatus === 'rejected' ? (
          <div className="px-3 pb-2 text-[11px] text-[var(--danger)] font-medium">Rejected by {linkedRun?.decidedBy ?? 'an approver'}{linkedRun ? ` (${linkedRun.id})` : ''}.</div>
        ) : (
          <div className="px-3 pb-2 text-[11px] text-[var(--warn)] font-medium">Queued under Runs › Approvals{linkedRun ? ` (${linkedRun.id})` : ''}. Nothing was sent or done.</div>
        )
      )}
    </motion.div>
  )
}

export const Typing = () => (
  <span className="inline-flex gap-1 items-center h-5">{[0, 0.15, 0.3].map((d) => <motion.i key={d} className="w-1.5 h-1.5 rounded-full bg-[var(--muted)] block" animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: d }} />)}</span>
)

export function Composer({ onSend, busy, onStop, placeholder, left, right, attach }: { onSend: (t: string, files: Attachment[]) => void; busy: boolean; onStop: () => void; placeholder: string; left?: React.ReactNode; right?: React.ReactNode; attach?: boolean }) {
  const [v, setV] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [reading, setReading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  const submit = () => { if (!reading && (v.trim() || files.length)) { onSend(v, files); setV(''); setFiles([]); if (ta.current) ta.current.style.height = 'auto' } }
  const pick = async (list: FileList | null) => {
    if (!list) return
    setReading(true)
    const out: Attachment[] = []
    try {
      for (const f of Array.from(list)) {
        try {
          const text = await readFileText(f, { maxTextBytes: 1_500_000, maxPdfBytes: 10_000_000 })
          out.push({ name: f.name, text })
        } catch (err: any) {
          useApp.getState().flashMsg(err?.message ?? `Could not read ${f.name}.`, 'danger')
        }
      }
      if (out.length) setFiles((x) => [...x, ...out])
    } finally {
      setReading(false)
    }
  }
  const total = useMemo(() => files.reduce((a, f) => a + f.text.length, 0), [files])
  return (
    <div className="flat p-1.5 pl-2 flex flex-col gap-1 focus-within:border-[var(--accent)] transition-colors">
      {(files.length > 0 || reading) && <div className="flex flex-wrap items-center gap-1.5 px-1 pt-1">{files.map((f, idx) => <span key={`${f.name}-${idx}`} className="chip !h-6 !text-[11px]"><Paperclip size={10} /> {f.name} <span className="muted">· {Math.max(1, Math.round(f.text.length / 1000))}k</span><button onClick={() => setFiles((x) => x.filter((_, i) => i !== idx))} className="ml-0.5 hover:text-[var(--danger)]" aria-label={`Remove ${f.name}`}><X size={10} /></button></span>)}{reading && <span className="text-[11px] muted">Reading file…</span>}{total > 60_000 && <span className="text-[11px] text-[var(--warn)]">Only the first 60k characters of each file are sent.</span>}</div>}
      <div className="flex items-end gap-1.5">
        {left}
        <textarea ref={ta} value={v} onChange={(e) => { setV(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px` }} rows={1} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }} placeholder={placeholder} aria-label="Message" className="flex-1 bg-transparent outline-0 resize-none text-[13.5px] py-2.5 px-1.5 max-h-[180px] scroll" />
        {attach && <><button onClick={() => fileRef.current?.click()} disabled={reading} className="btn btn-ghost btn-sm btn-icon !h-9 !w-9" title="Attach a PDF or text file (.pdf, .txt, .md, .csv, .json)" aria-label="Attach a file"><Paperclip size={15} /></button><input ref={fileRef} type="file" multiple accept=".pdf,.txt,.md,.csv,.json,.html,.htm,application/pdf,text/*" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = '' }} /></>}
        {right}
        {busy ? <button onClick={onStop} className="btn btn-icon !rounded-full !w-9 !h-9" title="Stop" aria-label="Stop"><Square size={14} /></button>
          : <motion.button whileTap={{ scale: 0.9 }} onClick={submit} disabled={reading || (!v.trim() && !files.length)} className="btn btn-primary btn-icon !rounded-full !w-9 !h-9" title="Send" aria-label="Send"><ArrowUp size={16} /></motion.button>}
      </div>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useBlocker } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Sparkles, ArrowUp, Trash2, Lock, ChevronDown, ChevronRight, RotateCcw, Download, Upload, History, Copy, MessageSquare, Zap, Scale, Brain, Check, X, Globe, BookOpen, Send, Code2, Workflow as WorkflowIcon } from 'lucide-react'
import { useApp, useUser, can } from '@/store/app'
import { BRAND, MODEL_PROFILES, type Agent, type Autonomy } from '@/lib/data'
import { streamChat, listModels } from '@/lib/openrouter'
import { TOOLS } from '@/lib/tools'
import { Button, Chip, Confirm, Field, Input, Textarea, Select, Segmented, Toggle, cx } from '@/components/ui'
import { Page } from '@/components/motion'
import { Thread, Composer, useAgentChat } from '@/components/ChatThread'
import { AgentAvatar, AvatarPicker } from '@/components/AgentAvatar'

const download = (name: string, data: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = name; a.click() }
const ASSISTANT_NAME = `${BRAND.name} Assistant`
const catIcon = { Web: Globe, Reasoning: Brain, Knowledge: BookOpen, Actions: Send, Custom: Code2 } as const
const profileIcon = { fast: Zap, balanced: Scale, reasoning: Brain } as const

const Section = ({ n, title, hint, children, right }: { n: number; title: string; hint?: string; children: React.ReactNode; right?: React.ReactNode }) => (
  <section className="flat p-5">
    <div className="flex items-start gap-3 mb-4">
      <span className="w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold bg-[var(--clay-dark)] muted shrink-0 mt-0.5">{n}</span>
      <div className="flex-1 min-w-0"><div className="text-[13.5px] font-semibold">{title}</div>{hint && <div className="text-[12px] muted mt-0.5">{hint}</div>}</div>
      {right}
    </div>
    {children}
  </section>
)

export default function AgentEditor() {
  const { agentId } = useParams()
  const nav = useNavigate()
  const user = useUser()!
  const store = useApp()
  const { agents, workflows, upsertAgent, rollbackAgent, deleteAgent, apiKey, defaultModel, models, setModels, libraries, customTools, profiles } = store
  const stored = agents.find((a) => a.id === agentId)
  const [draft, setDraft] = useState<Agent | undefined>(stored)
  const [advanced, setAdvanced] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [assist, setAssist] = useState<{ open: boolean; input: string; busy: boolean; log: { role: 'user' | 'assistant'; text: string }[] }>({ open: false, input: '', busy: false, log: [] })
  const [confirm, setConfirm] = useState<null | { kind: 'delete' } | { kind: 'rollback'; version: number } | { kind: 'publish' } | { kind: 'unpublish' }>(null)
  const [toast, setToast] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const editable = can(user, 'build')

  useEffect(() => { if (stored && (!draft || (stored.version > (draft?.version ?? 0)))) setDraft(stored) }, [stored]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!models.length && apiKey) listModels(apiKey).then(setModels).catch(() => {}) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2400); return () => clearTimeout(t) }, [toast])
  const chat = useAgentChat(draft ?? { id: '', name: '', description: '', instructions: '', model: '', tools: [], knowledge: [], samplePrompts: [] })
  useEffect(() => { if (draft && draft.autonomy === 3 && draft.tools.some((t) => TOOLS.find((x) => x.name === t)?.write)) setDraft({ ...draft, autonomy: 2 }) }, [draft])

  const dirty = !!draft && !!stored && JSON.stringify({ ...draft, history: undefined }) !== JSON.stringify({ ...stored, history: undefined })
  const blocker = useBlocker(dirty)
  useEffect(() => { const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h) }, [dirty])
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (dirty && editable) save() } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) })

  const issues = useMemo(() => {
    if (!draft) return []
    const out: string[] = []
    if (!draft.name.trim() || draft.name === 'New agent') out.push('Give the agent a real name.')
    if (!draft.description) out.push('Add a one-line description so people know when to use this agent.')
    if (draft.instructions.trim().length < 80) out.push('Instructions are short. Say what the agent is for, how it answers, and what it must not do.')
    if (!/unsure|ask|missing|uncertain|escalat/i.test(draft.instructions)) out.push('Say what the agent should do when it is unsure or information is missing.')
    if (draft.tools.includes('search_knowledge') && draft.knowledge.length === 0) out.push('Knowledge search is on but no library is attached.')
    if (draft.tools.length === 0) out.push('No tools: the agent can only answer from its instructions and knowledge.')
    if (draft.autonomy === 1 && draft.tools.some((t) => TOOLS.find((x) => x.name === t)?.write)) out.push('At "Notify only" the gated tools (email, approval) are switched off at runtime.')
    if (draft.samplePrompts.length === 0) out.push('Add two or three sample prompts; they appear as suggestions in Chat.')
    return out
  }, [draft])

  if (!draft) return <div className="muted p-8">Agent not found.</div>
  const set = (p: Partial<Agent>) => setDraft((d) => (d ? { ...d, ...p } : d))
  const hasWrite = draft.tools.some((t) => TOOLS.find((x) => x.name === t)?.write)
  const usedBy = workflows.filter((w) => w.nodes.some((n) => n.data.agentId === draft.id))
  function save(status?: Agent['status']) {
    if (!draft) return
    const n = { ...draft, status: status ?? draft.status, version: dirty || status ? draft.version + 1 : draft.version, updatedAt: new Date().toISOString().slice(0, 10) }
    upsertAgent(n, status === 'live' ? 'Published agent' : status === 'draft' ? 'Unpublished agent' : undefined); setDraft(n)
    setToast(status === 'live' ? 'Published. The agent is available in Chat and workflows.' : status === 'draft' ? 'Unpublished. Saved as a draft.' : `Saved as v${n.version}.`)
  }
  const modelName = (id: string) => models.find((m) => m.id === id)?.name ?? id
  const toolModels = models.filter((m) => m.supported_parameters?.includes('tools'))

  const runAssist = async (text: string) => {
    const q = text.trim(); if (!q || assist.busy || !apiKey) return
    setAssist((a) => ({ ...a, busy: true, input: '', log: [...a.log, { role: 'user', text: q }] }))
    const sys = `You are ${ASSISTANT_NAME}, helping a person design an AI agent on a governed platform. Current agent card as JSON:\n${JSON.stringify({ name: draft.name, description: draft.description, instructions: draft.instructions, tools: draft.tools, samplePrompts: draft.samplePrompts, autonomy: draft.autonomy })}\nAvailable tools: ${[...TOOLS.map((t) => `${t.name} (${t.desc})`), ...customTools.map((t) => `${t.name} (${t.description})`)].join('; ')}.\nApply the person's request. Reply ONLY with JSON: {"patch": {any of name, description, instructions, tools, samplePrompts, autonomy that should change}, "note": "one or two sentences on what you changed and why"}. Keep instructions complete (not a diff), in second person, and keep the governed tone: recommend, never execute; ask when unsure.`
    let acc = ''
    try {
      for await (const ev of streamChat({ key: apiKey, model: defaultModel, messages: [{ role: 'system', content: sys }, { role: 'user', content: q }], temperature: 0.3 })) { if (ev.type === 'delta') acc += ev.text; if (ev.type === 'usage') store.recordSpend(ev.usage.cost ?? 0) }
      const j = JSON.parse(acc.replace(/^```json?|```$/g, '').trim())
      const p = j.patch ?? {}
      const patch: Partial<Agent> = {}
      if (typeof p.name === 'string') patch.name = p.name
      if (typeof p.description === 'string') patch.description = p.description
      if (typeof p.instructions === 'string') patch.instructions = p.instructions
      if (Array.isArray(p.tools)) patch.tools = p.tools.filter((t: string) => TOOLS.some((x) => x.name === t) || customTools.some((x) => x.name === t))
      if (Array.isArray(p.samplePrompts)) patch.samplePrompts = p.samplePrompts.filter((s: unknown) => typeof s === 'string')
      if ([1, 2, 3].includes(p.autonomy)) patch.autonomy = p.autonomy
      set(patch)
      setAssist((a) => ({ ...a, busy: false, log: [...a.log, { role: 'assistant', text: (j.note ?? 'Updated.') + (Object.keys(patch).length ? ` (changed: ${Object.keys(patch).join(', ')})` : '') }] }))
    } catch { setAssist((a) => ({ ...a, busy: false, log: [...a.log, { role: 'assistant', text: acc.slice(0, 300) || 'I could not apply that. Try rephrasing.' }] })) }
  }
  const importJson = (f: File) => { const r = new FileReader(); r.onload = () => { try { const j = JSON.parse(String(r.result)); set({ name: j.name ?? draft.name, description: j.description ?? draft.description, instructions: j.instructions ?? draft.instructions, model: j.model ?? draft.model, tools: Array.isArray(j.tools) ? j.tools : draft.tools, knowledge: Array.isArray(j.knowledge) ? j.knowledge : draft.knowledge, autonomy: j.autonomy ?? draft.autonomy, samplePrompts: Array.isArray(j.samplePrompts) ? j.samplePrompts : draft.samplePrompts, icon: j.icon ?? draft.icon, color: j.color ?? draft.color }); setToast('Imported. Review and save.') } catch { setToast('That file is not a valid agent export.') } }; r.readAsText(f) }
  const duplicate = () => { const id = `agent-${Date.now().toString(36)}`; upsertAgent({ ...draft, id, name: `${draft.name} (copy)`, status: 'draft', version: 1, history: undefined, createdBy: user.id, updatedAt: new Date().toISOString().slice(0, 10) }); nav(`/agents/${id}`) }

  const cats = ['Web', 'Reasoning', 'Knowledge', 'Actions'] as const
  const toolRows = [...TOOLS.map((t) => ({ name: t.name, label: t.label, desc: t.desc, write: t.write, cat: t.category as keyof typeof catIcon })), ...customTools.map((t) => ({ name: t.name, label: t.label, desc: t.description, write: false, cat: 'Custom' as const }))]
  const previewPrompts = draft.samplePrompts.length ? draft.samplePrompts : ['Introduce yourself in two lines', 'What can you help me with?', 'What would you not do?']

  return (
    <Page className="h-full flex flex-col gap-3">
      <header className="clay h-14 px-3 flex items-center gap-2 shrink-0 relative">
        <button onClick={() => nav('/agents')} className="btn btn-ghost btn-icon" title="Back to agents"><ArrowLeft size={16} /></button>
        <div className="relative">
          <button onClick={() => editable && setAvatarOpen((o) => !o)} title="Change icon and colour" className="rounded-[10px] hover:ring-2 ring-[var(--accent)] transition-all"><AgentAvatar name={draft.name} icon={draft.icon} color={draft.color} size={34} radius={10} /></button>
          <AnimatePresence>{avatarOpen && <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute top-full mt-2 left-0 glass rounded-[16px] p-4 z-30 w-[320px]"><AvatarPicker icon={draft.icon} color={draft.color} onChange={(p) => set(p)} /><div className="flex justify-end mt-3"><Button size="sm" onClick={() => setAvatarOpen(false)}>Done</Button></div></motion.div>}</AnimatePresence>
        </div>
        <div className="flex flex-col leading-tight min-w-0">
          <input value={draft.name} onChange={(e) => set({ name: e.target.value })} disabled={!editable} placeholder="Agent name" className="font-semibold text-[14px] bg-transparent outline-0 w-[300px]" />
          <span className="text-[11px] muted truncate">{draft.status === 'live' ? 'Live' : 'Draft'} · v{draft.version}{draft.updatedAt ? ` · updated ${draft.updatedAt}` : ''}{usedBy.length ? ` · used in ${usedBy.length} workflow${usedBy.length === 1 ? '' : 's'}` : ''}{dirty ? ' · unsaved changes' : ''}</span>
        </div>
        <div className="flex-1" />
        <AnimatePresence>{toast && <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[12px] font-medium text-[var(--ok)] flex items-center gap-1"><Check size={13} /> {toast}</motion.span>}</AnimatePresence>
        <Button size="sm" onClick={() => nav(`/chat/${draft.id}`)}><MessageSquare size={13} /> {draft.status === 'live' ? 'Open in Chat' : 'Preview in Chat'}</Button>
        {editable && <Button onClick={() => save()} disabled={!dirty}>Save</Button>}
        {editable && (draft.status === 'draft' ? <Button variant="primary" onClick={() => (issues.length ? setConfirm({ kind: 'publish' }) : save('live'))}>Publish</Button> : <Button onClick={() => setConfirm({ kind: 'unpublish' })}><RotateCcw size={13} /> Unpublish</Button>)}
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_minmax(380px,0.8fr)] gap-3">
        <div className="clay scroll" onClick={() => avatarOpen && setAvatarOpen(false)}>
          <fieldset disabled={!editable} className="max-w-[680px] mx-auto px-6 py-6 flex flex-col gap-4 disabled:opacity-80">
            <div className="clay-sm p-3">
              <button type="button" onClick={() => setAssist((a) => ({ ...a, open: !a.open }))} className="w-full flex items-center gap-3 text-left">
                <span className="w-8 h-8 rounded-[10px] grid place-items-center text-white shrink-0" style={{ background: 'linear-gradient(145deg,#1a4a73,#10385b)' }}><Sparkles size={15} /></span>
                <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold">{ASSISTANT_NAME}</div><div className="text-[11.5px] muted truncate">{apiKey ? 'Describe a change and the card updates: instructions, tools, sample prompts, name.' : 'Not available right now.'}</div></div>
                {apiKey && (assist.open ? <ChevronDown size={16} className="muted" /> : <ChevronRight size={16} className="muted" />)}
              </button>
              <AnimatePresence>
                {assist.open && apiKey && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="mt-3 flex flex-col gap-2">
                      {assist.log.length === 0 && <div className="flex flex-wrap gap-1.5">{['Make the instructions more specific and structured', 'Add an escalation rule for uncertainty', 'Write three sample prompts', 'Pick the tools this agent needs', 'Make the tone warmer and shorter'].map((s) => <button key={s} type="button" onClick={() => runAssist(s)} className="chip hover:text-[var(--text)]">{s}</button>)}</div>}
                      {assist.log.map((m, i) => <div key={i} className={cx('text-[12.5px] px-3 py-2 rounded-[12px] max-w-[92%]', m.role === 'user' ? 'self-end bg-[var(--surface-2)] border hairline' : 'self-start muted')}>{m.text}</div>)}
                      {assist.busy && <div className="text-[12px] muted px-1">Working…</div>}
                      <div className="flat p-1.5 pl-3 flex items-center gap-2">
                        <input value={assist.input} onChange={(e) => setAssist((a) => ({ ...a, input: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && runAssist(assist.input)} placeholder="e.g. only answer questions about HR policy and refuse everything else" className="flex-1 bg-transparent outline-0 text-[13px]" />
                        <button type="button" onClick={() => runAssist(assist.input)} disabled={assist.busy || !assist.input.trim()} className="btn btn-primary btn-sm btn-icon !rounded-full"><ArrowUp size={14} /></button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Section n={1} title="What it does" hint="A clear description helps people and the assistant pick this agent.">
              <Input value={draft.description} onChange={(e) => set({ description: e.target.value })} placeholder="e.g. Answers HR policy questions from the handbook and escalates exceptions" />
            </Section>
            <Section n={2} title="Instructions" hint="The system prompt. Say what the agent is for, how it answers, and what it must not do." right={<span className="text-[11px] muted tabular-nums">{draft.instructions.length} chars</span>}>
              <Textarea rows={12} value={draft.instructions} onChange={(e) => set({ instructions: e.target.value })} className="!leading-relaxed" />
            </Section>
            <Section n={3} title="Model" hint="Pick a profile for a sensible default, or choose any model from the catalog.">
              <div className="flex gap-2 mb-3">
                {MODEL_PROFILES.map((p) => { const id = profiles.find((x) => x.id === p.id)?.model ?? p.model; const I = profileIcon[p.id]; const on = draft.model === id; return (
                  <button type="button" key={p.id} onClick={() => set({ model: id })} className={cx('flex-1 flat p-3 text-left flex items-center gap-2.5 transition-all', on && 'border-[var(--accent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)]')}>
                    <span className={cx('w-8 h-8 rounded-[9px] grid place-items-center', on ? 'bg-[var(--accent)] text-white' : 'bg-[var(--clay-dark)] muted')}><I size={14} /></span>
                    <span className="min-w-0"><span className="block text-[12.5px] font-semibold">{p.name}</span><span className="block text-[11px] muted truncate">{modelName(id)}</span></span>
                    {on && <Check size={14} className="ml-auto accent-ink shrink-0" />}
                  </button>
                ) })}
              </div>
              {toolModels.length ? <Select value={draft.model} onChange={(e) => set({ model: e.target.value })}>{!toolModels.some((m) => m.id === draft.model) && <option value={draft.model}>{modelName(draft.model)}</option>}{toolModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select> : <Input value={draft.model} onChange={(e) => set({ model: e.target.value })} placeholder="provider/model" />}
            </Section>
            <Section n={4} title="Tools" hint="What the agent can do beyond talking. Locked tools take external actions and always wait for a person." right={<Chip>{draft.tools.length} on</Chip>}>
              <div className="flex flex-col gap-3">
                {[...cats, ...(customTools.length ? (['Custom'] as const) : [])].map((c) => { const I = catIcon[c]; const rows = toolRows.filter((t) => t.cat === c); return (
                  <div key={c}>
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider muted mb-1.5"><I size={12} /> {c}</div>
                    <div className="flat divide-y divide-[var(--line)]">
                      {rows.map((t) => { const on = draft.tools.includes(t.name); return (
                        <label key={t.name} className="flex items-center gap-3 px-3 h-11 cursor-pointer">
                          <div className="flex-1 min-w-0"><div className="text-[13px] font-medium flex items-center gap-1.5">{t.label} {t.write && <Lock size={11} className="muted" />}</div><div className="text-[11.5px] muted truncate">{t.desc}</div></div>
                          <Toggle checked={on} onChange={(v) => set({ tools: v ? [...draft.tools, t.name] : draft.tools.filter((x) => x !== t.name) })} />
                        </label>
                      ) })}
                    </div>
                  </div>
                ) })}
              </div>
            </Section>
            <Section n={5} title="Knowledge" hint="Attached libraries are given to the agent and searched by the knowledge tool." right={<Chip>{draft.knowledge.length} attached</Chip>}>
              <div className="flat divide-y divide-[var(--line)]">
                {libraries.map((l) => <label key={l.id} className="flex items-center gap-3 px-3 h-11 cursor-pointer"><div className="flex-1 min-w-0"><div className="text-[13px] font-medium">{l.name}</div><div className="text-[11.5px] muted">{l.docs.length} document{l.docs.length === 1 ? '' : 's'}</div></div><Toggle checked={draft.knowledge.includes(l.id)} onChange={(v) => set({ knowledge: v ? [...draft.knowledge, l.id] : draft.knowledge.filter((x) => x !== l.id) })} /></label>)}
              </div>
            </Section>
            <Section n={6} title="Autonomy" hint={['Notify only: gated tools are switched off; the agent can only inform.', 'Draft for approval: gated actions are queued for a person.', hasWrite ? 'Locked: this agent has gated tools, so it cannot act on its own.' : 'Act within limits: no gated tools, so nothing needs approval.'][draft.autonomy - 1]}>
              <Segmented value={String(draft.autonomy) as '1' | '2' | '3'} onChange={(v) => set({ autonomy: Number(v) as Autonomy })} items={[{ id: '1', label: 'Notify only' }, { id: '2', label: 'Draft for approval' }, { id: '3', label: hasWrite ? 'Act (locked)' : 'Act within limits' }]} />
            </Section>
            <Section n={7} title="Sample prompts" hint="Shown as suggestions in Chat and in the preview. One per line.">
              <Textarea rows={3} value={draft.samplePrompts.join('\n')} onChange={(e) => set({ samplePrompts: e.target.value.split('\n').filter(Boolean) })} placeholder={'What is our parental leave policy?\nSummarise the latest expense rules'} />
            </Section>

            {issues.length > 0 && <div className="flat p-4"><div className="text-[12px] font-semibold mb-2">Before you publish</div><ul className="flex flex-col gap-1">{issues.map((i) => <li key={i} className="text-[12px] muted flex gap-2"><span className="w-1 h-1 rounded-full bg-[var(--warn)] mt-2 shrink-0" />{i}</li>)}</ul></div>}

            <div>
              <button type="button" onClick={() => setAdvanced((a) => !a)} className="text-[12px] font-semibold inline-flex items-center gap-1 muted hover:text-[var(--text)]">{advanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Versions, usage, export and more</button>
              {advanced && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex flex-col gap-5">
                  <Field label="Used in workflows">
                    <div className="flat divide-y divide-[var(--line)]">
                      {usedBy.length === 0 && <div className="px-3 py-3 text-[12px] muted">Not used in any workflow yet. Add an Agent step in a workflow and pick this agent.</div>}
                      {usedBy.map((w) => <button type="button" key={w.id} onClick={() => nav(`/workflows/${w.id}`)} className="w-full flex items-center gap-3 px-3 h-10 text-[12.5px] hover:bg-[var(--surface)] text-left"><WorkflowIcon size={13} className="muted" /><span className="flex-1">{w.name}</span><span className="muted capitalize">{w.status}</span></button>)}
                    </div>
                  </Field>
                  <Field label="Version history" hint="Every save creates a version. Roll back restores an earlier one as a new version.">
                    <div className="flat divide-y divide-[var(--line)]">
                      <div className="flex items-center gap-3 px-3 h-10 text-[12.5px]"><History size={13} className="muted" /><span className="flex-1">v{draft.version} · current</span></div>
                      {(draft.history ?? []).length === 0 && <div className="px-3 py-3 text-[12px] muted">No earlier versions yet.</div>}
                      {(draft.history ?? []).map((h) => <div key={h.version} className="flex items-center gap-3 px-3 h-10 text-[12.5px]"><History size={13} className="muted" /><span className="flex-1">v{h.version} · {h.at} · {h.by}</span><Button size="sm" onClick={() => setConfirm({ kind: 'rollback', version: h.version })}>Roll back</Button></div>)}
                    </div>
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => download(`${draft.name.replace(/\s+/g, '-').toLowerCase()}.agent.json`, JSON.stringify({ name: draft.name, description: draft.description, instructions: draft.instructions, model: draft.model, tools: draft.tools, knowledge: draft.knowledge, autonomy: draft.autonomy, samplePrompts: draft.samplePrompts, icon: draft.icon, color: draft.color }, null, 2))}><Download size={13} /> Export JSON</Button>
                    <Button size="sm" onClick={() => fileRef.current?.click()}><Upload size={13} /> Import JSON</Button>
                    <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = '' }} />
                    <Button size="sm" onClick={duplicate}><Copy size={13} /> Duplicate</Button>
                    <div className="flex-1" />
                    <button type="button" onClick={() => setConfirm({ kind: 'delete' })} className="text-[12px] font-medium text-[var(--danger)] inline-flex items-center gap-1.5 hover:underline"><Trash2 size={13} /> Delete agent</button>
                  </div>
                </motion.div>
              )}
            </div>
          </fieldset>
        </div>

        <section className="clay flex flex-col min-h-0">
          <div className="h-12 px-5 flex items-center gap-2 border-b hairline text-[13px]">
            <span className="font-semibold">Preview</span><span className="muted">{modelName(draft.model)}</span>
            {dirty && <Chip tone="warn">testing unsaved changes</Chip>}
            <div className="flex-1" />
            {chat.msgs.length > 0 && <button className="text-[12px] muted hover:text-[var(--text)] inline-flex items-center gap-1" onClick={chat.clear}><X size={12} /> Reset</button>}
          </div>
          <div className="flex-1 scroll">
            {chat.msgs.length === 0 ? (
              <div className="px-6 pt-14 text-center">
                <AgentAvatar name={draft.name} icon={draft.icon} color={draft.color} size={48} className="mx-auto mb-4" />
                <h2 className="display text-[18px] font-bold">Test {draft.name || 'your agent'}</h2>
                <p className="muted text-[12.5px] mt-1 max-w-[300px] mx-auto">Talk to it exactly as a user would. Tool calls show inline. Changes on the left apply straight away.</p>
                <div className="flex flex-col items-center gap-2 mt-6">{previewPrompts.slice(0, 3).map((p) => <button key={p} onClick={() => chat.send(p)} className="btn btn-sm !font-medium max-w-full truncate">{p}</button>)}</div>
                {!apiKey && <div className="text-[12px] text-[var(--warn)] mt-6">Models are not available right now. Contact your administrator.</div>}
              </div>
            ) : <Thread msgs={chat.msgs} agent={draft} compact />}
          </div>
          <div className="p-3"><Composer onSend={(t) => chat.send(t)} busy={chat.busy} onStop={chat.stop} placeholder={`Message ${draft.name || 'agent'}…`} /></div>
        </section>
      </div>

      <Confirm open={confirm?.kind === 'delete'} onClose={() => setConfirm(null)} title={`Delete ${draft.name}?`} danger confirmLabel="Delete" body={usedBy.length ? `This agent is used in ${usedBy.length} workflow${usedBy.length === 1 ? '' : 's'}; those steps will need a new agent. Chat history and versions are removed.` : 'Chat history and versions are removed. This cannot be undone.'} onConfirm={() => { deleteAgent(draft.id); nav('/agents') }} />
      <Confirm open={confirm?.kind === 'rollback'} onClose={() => setConfirm(null)} title={`Roll back to v${confirm?.kind === 'rollback' ? confirm.version : ''}?`} confirmLabel="Roll back" body="The earlier version becomes a new version. Nothing is lost; you can roll forward again." onConfirm={() => confirm?.kind === 'rollback' && rollbackAgent(draft.id, confirm.version)} />
      <Confirm open={confirm?.kind === 'unpublish'} onClose={() => setConfirm(null)} title="Unpublish this agent?" confirmLabel="Unpublish" body={usedBy.length ? `It is used in ${usedBy.length} workflow${usedBy.length === 1 ? '' : 's'}. Those steps keep working, but the agent disappears from Chat for others.` : 'It disappears from Chat for others. You can publish again any time.'} onConfirm={() => save('draft')} />
      <Confirm open={confirm?.kind === 'publish'} onClose={() => setConfirm(null)} title="Publish with open items?" confirmLabel="Publish anyway" onConfirm={() => save('live')} body={<div><div className="mb-2">The checklist still has suggestions:</div><ul className="flex flex-col gap-1">{issues.map((i) => <li key={i} className="flex gap-2"><span className="w-1 h-1 rounded-full bg-[var(--warn)] mt-2 shrink-0" />{i}</li>)}</ul></div>} />
      <Confirm open={blocker.state === 'blocked'} onClose={() => blocker.state === 'blocked' && blocker.reset()} title="Leave without saving?" danger confirmLabel="Discard changes" body="You have unsaved changes to this agent." onConfirm={() => blocker.state === 'blocked' && blocker.proceed()} />
    </Page>
  )
}

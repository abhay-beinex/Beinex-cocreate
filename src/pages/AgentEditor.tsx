import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Sparkles, ArrowUp, Trash2, Lock, ChevronDown, ChevronRight, Wand2, RotateCcw, Download, Upload, History, Copy } from 'lucide-react'
import { useApp, useUser, can } from '@/store/app'
import type { Agent, Autonomy } from '@/lib/data'
import { streamChat } from '@/lib/openrouter'
import { TOOLS } from '@/lib/tools'
import { Button, Chip, Field, Input, Textarea, Select, Segmented, Toggle, Tile, colorFor, cx } from '@/components/ui'
import { Page } from '@/components/motion'
import { Thread, Composer, useAgentChat } from '@/components/ChatThread'

const download = (name: string, data: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = name; a.click() }

export default function AgentEditor() {
  const { agentId } = useParams()
  const nav = useNavigate()
  const user = useUser()!
  const { agents, upsertAgent, rollbackAgent, deleteAgent, apiKey, defaultModel, models, libraries, customTools } = useApp()
  const stored = agents.find((a) => a.id === agentId)
  const [draft, setDraft] = useState<Agent | undefined>(stored)
  const [advanced, setAdvanced] = useState(false)
  const [refineOpen, setRefineOpen] = useState(false)
  const [refine, setRefine] = useState('')
  const [refining, setRefining] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const editable = can(user, 'build')

  useEffect(() => { if (stored && (!draft || stored.version !== draft.version && JSON.stringify(stored) !== JSON.stringify(draft) && stored.version > (draft?.version ?? 0))) setDraft(stored) }, [stored]) // eslint-disable-line react-hooks/exhaustive-deps
  const chat = useAgentChat(draft ?? { id: '', name: '', description: '', instructions: '', model: '', tools: [], knowledge: [], samplePrompts: [] })
  useEffect(() => { if (draft && draft.autonomy === 3 && draft.tools.some((t) => TOOLS.find((x) => x.name === t)?.write)) setDraft({ ...draft, autonomy: 2 }) }, [draft])

  const issues = useMemo(() => {
    if (!draft) return []
    const out: string[] = []
    if (!/unsure|ask|missing|uncertain|escalat/i.test(draft.instructions)) out.push('Say what the agent should do when it is unsure or information is missing.')
    if (draft.tools.includes('search_knowledge') && draft.knowledge.length === 0) out.push('Knowledge search is on but no library is attached.')
    if (!draft.description) out.push('Add a one-line description so people know when to use this agent.')
    if (draft.tools.length === 0) out.push('No tools: the agent can only answer from its instructions and knowledge.')
    if (draft.autonomy === 1 && draft.tools.some((t) => TOOLS.find((x) => x.name === t)?.write)) out.push('At "Notify only" the gated tools (email, approval) are switched off at runtime.')
    return out
  }, [draft])

  if (!draft) return <div className="muted p-8">Agent not found.</div>
  const set = (p: Partial<Agent>) => setDraft((d) => (d ? { ...d, ...p } : d))
  const hasWrite = draft.tools.some((t) => TOOLS.find((x) => x.name === t)?.write)
  const dirty = JSON.stringify({ ...draft, history: undefined }) !== JSON.stringify({ ...stored, history: undefined })
  const save = (status?: Agent['status']) => { const n = { ...draft, status: status ?? draft.status, version: dirty || status ? draft.version + 1 : draft.version, updatedAt: new Date().toISOString().slice(0, 10) }; upsertAgent(n, status === 'live' ? 'Published agent' : status === 'draft' ? 'Unpublished agent' : undefined); setDraft(n) }

  const runRefine = async () => {
    const text = refine.trim(); if (!text || refining || !apiKey) return
    setRefining(true)
    let acc = ''
    for await (const ev of streamChat({ key: apiKey, model: defaultModel, messages: [{ role: 'system', content: `Rewrite this AI agent's system instructions to apply the user's request. Keep the governed tone (recommend, never execute; escalate when unsure). Current instructions:\n${draft.instructions}\nReply with the full updated instructions only.` }, { role: 'user', content: text }], temperature: 0.2 })) if (ev.type === 'delta') acc += ev.text
    if (acc.trim()) set({ instructions: acc.trim() })
    setRefining(false); setRefine(''); setRefineOpen(false)
  }
  const importJson = (f: File) => { const r = new FileReader(); r.onload = () => { try { const j = JSON.parse(String(r.result)); set({ name: j.name ?? draft.name, description: j.description ?? draft.description, instructions: j.instructions ?? draft.instructions, model: j.model ?? draft.model, tools: Array.isArray(j.tools) ? j.tools : draft.tools, knowledge: Array.isArray(j.knowledge) ? j.knowledge : draft.knowledge, autonomy: j.autonomy ?? draft.autonomy, samplePrompts: Array.isArray(j.samplePrompts) ? j.samplePrompts : draft.samplePrompts }) } catch { alert('That file is not a valid agent export.') } }; r.readAsText(f) }
  const duplicate = () => { const id = `agent-${Date.now().toString(36)}`; upsertAgent({ ...draft, id, name: `${draft.name} (copy)`, status: 'draft', version: 1, history: undefined, createdBy: user.id, updatedAt: new Date().toISOString().slice(0, 10) }); nav(`/agents/${id}`) }

  const cats = ['Web', 'Reasoning', 'Knowledge', 'Actions'] as const
  const toolRow = (name: string, label: string, desc: string, write: boolean, cat: string) => {
    const on = draft.tools.includes(name)
    return (
      <div key={name} className="flex items-center gap-3 px-3 h-12">
        <div className="flex-1 min-w-0"><div className="text-[13px] font-medium flex items-center gap-1.5">{label} {write && <Lock size={11} className="muted" />}</div><div className="text-[11.5px] muted truncate">{desc}</div></div>
        <span className="text-[10.5px] muted w-[70px]">{cat}</span>
        <Toggle checked={on} onChange={(v) => set({ tools: v ? [...draft.tools, name] : draft.tools.filter((x) => x !== name) })} />
      </div>
    )
  }

  return (
    <Page className="h-full flex flex-col gap-3">
      <header className="clay h-14 px-3 flex items-center gap-2 shrink-0">
        <button onClick={() => nav('/agents')} className="btn btn-ghost btn-icon"><ArrowLeft size={16} /></button>
        <Tile color={colorFor(draft.name)} size={30} radius={9}><Sparkles size={14} /></Tile>
        <input value={draft.name} onChange={(e) => set({ name: e.target.value })} disabled={!editable} className="font-semibold text-[14px] bg-transparent outline-0 w-[260px]" />
        <Chip tone={draft.status === 'live' ? 'ok' : undefined}>{draft.status === 'live' ? 'Live' : 'Draft'} · v{draft.version}</Chip>
        <div className="flex-1" />
        {dirty && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[12px] muted">Unsaved changes</motion.span>}
        {editable && <Button onClick={() => save()} disabled={!dirty}>Save</Button>}
        {editable && (draft.status === 'draft' ? <Button variant="primary" onClick={() => save('live')}>Publish</Button> : <Button onClick={() => save('draft')}><RotateCcw size={13} /> Unpublish</Button>)}
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)] gap-3">
        <section className="clay scroll">
          <fieldset disabled={!editable} className="max-w-[640px] mx-auto px-6 py-6 flex flex-col gap-6 disabled:opacity-80">
            <Field label="Description"><Input value={draft.description} onChange={(e) => set({ description: e.target.value })} placeholder="What does this agent do, in one line?" /></Field>

            <Field label="Instructions" action={editable && apiKey && <button onClick={() => setRefineOpen((o) => !o)} className="text-[12px] font-medium accent-ink inline-flex items-center gap-1 hover:underline"><Wand2 size={12} /> Refine with AI</button>}>
              {refineOpen && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flat p-1.5 pl-3 flex items-center gap-2 mb-2 overflow-hidden">
                  <input autoFocus value={refine} onChange={(e) => setRefine(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runRefine()} placeholder="e.g. always answer in British English and cite sources" className="flex-1 bg-transparent outline-0 text-[13px]" />
                  <button onClick={runRefine} disabled={refining || !refine.trim()} className="btn btn-primary btn-sm btn-icon !rounded-full">{refining ? '…' : <ArrowUp size={14} />}</button>
                </motion.div>
              )}
              <Textarea rows={11} value={draft.instructions} onChange={(e) => set({ instructions: e.target.value })} />
              {issues.length > 0 && <ul className="mt-2 flex flex-col gap-1">{issues.map((i) => <li key={i} className="text-[12px] muted flex gap-2"><span className="w-1 h-1 rounded-full bg-[var(--warn)] mt-2 shrink-0" />{i}</li>)}</ul>}
            </Field>

            <Field label="Model">
              {models.length ? <Select value={draft.model} onChange={(e) => set({ model: e.target.value })}>{!models.some((m) => m.id === draft.model) && <option value={draft.model}>{draft.model}</option>}{models.filter((m) => m.supported_parameters?.includes('tools')).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select> : <Input value={draft.model} onChange={(e) => set({ model: e.target.value })} placeholder="provider/model" />}
            </Field>

            <Field label="Tools" hint="Tools with a lock take external actions and are always queued for a person.">
              <div className="flat divide-y divide-[var(--line)]">
                {cats.map((c) => TOOLS.filter((t) => t.category === c).map((t) => toolRow(t.name, t.label, t.desc, t.write, t.category)))}
                {customTools.map((t) => toolRow(t.name, t.label, t.description, false, 'Custom'))}
              </div>
            </Field>

            <Field label="Knowledge" hint="Attached libraries are given to the agent and searched by the knowledge tool.">
              <div className="flat divide-y divide-[var(--line)]">
                {libraries.map((l) => <div key={l.id} className="flex items-center gap-3 px-3 h-11"><div className="flex-1 min-w-0"><div className="text-[13px] font-medium">{l.name}</div><div className="text-[11.5px] muted">{l.docs.length} documents</div></div><Toggle checked={draft.knowledge.includes(l.id)} onChange={(v) => set({ knowledge: v ? [...draft.knowledge, l.id] : draft.knowledge.filter((x) => x !== l.id) })} /></div>)}
              </div>
            </Field>

            <Field label="Autonomy" hint={['Notify only: gated tools are switched off; the agent can only inform.', 'Draft for approval: gated actions are queued for a person.', hasWrite ? 'Locked: this agent has gated tools.' : 'Act within limits: no gated tools, so nothing needs approval.'][draft.autonomy - 1]}>
              <Segmented value={String(draft.autonomy) as '1' | '2' | '3'} onChange={(v) => set({ autonomy: Number(v) as Autonomy })} items={[{ id: '1', label: 'Notify only' }, { id: '2', label: 'Draft for approval' }, { id: '3', label: hasWrite ? 'Act (locked)' : 'Act within limits' }]} />
            </Field>

            <div>
              <button type="button" onClick={() => setAdvanced((a) => !a)} className="text-[12px] font-semibold inline-flex items-center gap-1 muted hover:text-[var(--text)]">{advanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Advanced</button>
              {advanced && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex flex-col gap-5">
                  <Field label="Sample prompts" hint="One per line. Shown as suggestions in Chat."><Textarea rows={3} value={draft.samplePrompts.join('\n')} onChange={(e) => set({ samplePrompts: e.target.value.split('\n').filter(Boolean) })} /></Field>
                  <Field label="Version history" hint="Every save creates a version. Roll back restores an earlier one as a new version.">
                    <div className="flat divide-y divide-[var(--line)]">
                      <div className="flex items-center gap-3 px-3 h-10 text-[12.5px]"><History size={13} className="muted" /><span className="flex-1">v{draft.version} · current</span></div>
                      {(draft.history ?? []).length === 0 && <div className="px-3 py-3 text-[12px] muted">No earlier versions yet.</div>}
                      {(draft.history ?? []).map((h) => <div key={h.version} className="flex items-center gap-3 px-3 h-10 text-[12.5px]"><History size={13} className="muted" /><span className="flex-1">v{h.version} · {h.at} · {h.by}</span><Button size="sm" onClick={() => { if (confirm(`Roll back to v${h.version}?`)) rollbackAgent(draft.id, h.version) }}>Roll back</Button></div>)}
                    </div>
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => download(`${draft.name.replace(/\s+/g, '-').toLowerCase()}.agent.json`, JSON.stringify({ name: draft.name, description: draft.description, instructions: draft.instructions, model: draft.model, tools: draft.tools, knowledge: draft.knowledge, autonomy: draft.autonomy, samplePrompts: draft.samplePrompts }, null, 2))}><Download size={13} /> Export JSON</Button>
                    <Button size="sm" onClick={() => fileRef.current?.click()}><Upload size={13} /> Import JSON</Button>
                    <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = '' }} />
                    <Button size="sm" onClick={duplicate}><Copy size={13} /> Duplicate</Button>
                    <div className="flex-1" />
                    <button type="button" onClick={() => { if (confirm('Delete this agent?')) { deleteAgent(draft.id); nav('/agents') } }} className="text-[12px] font-medium text-[var(--danger)] inline-flex items-center gap-1.5 hover:underline"><Trash2 size={13} /> Delete agent</button>
                  </div>
                </motion.div>
              )}
            </div>
          </fieldset>
        </section>

        <section className="clay flex flex-col min-h-0">
          <div className="h-12 px-5 flex items-center border-b hairline text-[13px] font-semibold">Preview <span className="muted font-normal ml-2">{draft.model.split('/')[1] ?? draft.model}{dirty ? ' · unsaved draft' : ''}</span><div className="flex-1" />{chat.msgs.length > 0 && <button className="text-[12px] muted hover:text-[var(--text)]" onClick={chat.clear}>Reset</button>}</div>
          <div className="flex-1 scroll"><Thread msgs={chat.msgs} agent={draft} compact onPrompt={(p) => chat.send(p)} /></div>
          <div className="p-3"><Composer onSend={(t) => chat.send(t)} busy={chat.busy} onStop={chat.stop} placeholder="Message…" /></div>
        </section>
      </div>
    </Page>
  )
}

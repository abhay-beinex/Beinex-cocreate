import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Sparkles, ArrowUp, Trash2, Lock, ChevronDown, ChevronRight, Wand2, RotateCcw, Plus, X, History } from 'lucide-react'
import { useApp, useUser, can } from '@/store/app'
import type { Agent, Autonomy } from '@/lib/data'
import { streamChat } from '@/lib/openrouter'
import { TOOLS } from '@/lib/tools'
import { Button, Chip, Field, Input, Textarea, Select, Segmented, Toggle, Tile, colorFor, cx } from '@/components/ui'
import { Page } from '@/components/motion'
import { Thread, Composer, useAgentChat } from '@/components/ChatThread'

export default function AgentEditor() {
  const { agentId } = useParams()
  const nav = useNavigate()
  const user = useUser()!
  const { agents, upsertAgent, deleteAgent, apiKey, defaultModel, models, libraries } = useApp()
  const stored = agents.find((a) => a.id === agentId)
  const [draft, setDraft] = useState<Agent | undefined>(stored)
  const [advanced, setAdvanced] = useState(false)
  const [refineOpen, setRefineOpen] = useState(false)
  const [refine, setRefine] = useState('')
  const [refining, setRefining] = useState(false)
  const [newWatcher, setNewWatcher] = useState('')
  const editable = can(user, 'build')

  useEffect(() => { if (stored && !draft) setDraft(stored) }, [stored, draft])
  const chat = useAgentChat(draft ?? { id: '', name: '', description: '', instructions: '', model: '', tools: [], knowledge: [], samplePrompts: [] })
  useEffect(() => { if (draft && draft.autonomy === 3 && draft.tools.some((t) => TOOLS.find((x) => x.name === t)?.write)) setDraft({ ...draft, autonomy: 2 }) }, [draft])

  const issues = useMemo(() => {
    if (!draft) return []
    const out: string[] = []
    if (!/unsure|ask|missing|uncertain|escalat/i.test(draft.instructions)) out.push('Say what the agent should do when it is unsure or information is missing.')
    if (draft.tools.includes('search_knowledge') && draft.knowledge.length === 0) out.push('Knowledge search is on but no library is attached.')
    if (!draft.description) out.push('Add a one-line description so people know when to use this agent.')
    if (draft.tools.length === 0) out.push('No tools: the agent can only answer from its instructions and knowledge.')
    return out
  }, [draft])

  if (!draft) return <div className="muted p-8">Agent not found.</div>
  const set = (p: Partial<Agent>) => setDraft((d) => (d ? { ...d, ...p } : d))
  const hasWrite = draft.tools.some((t) => TOOLS.find((x) => x.name === t)?.write)
  const dirty = JSON.stringify(draft) !== JSON.stringify(stored)
  const save = (status?: Agent['status']) => { const n = { ...draft, status: status ?? draft.status, version: dirty || status ? draft.version + 1 : draft.version, updatedAt: new Date().toISOString().slice(0, 10) }; upsertAgent(n); setDraft(n) }

  const runRefine = async () => {
    const text = refine.trim(); if (!text || refining) return
    if (!apiKey) { nav('/settings?tab=openrouter'); return }
    setRefining(true)
    let acc = ''
    for await (const ev of streamChat({ key: apiKey, model: defaultModel, messages: [{ role: 'system', content: `Rewrite this AI agent's system instructions to apply the user's request. Keep the governed tone (recommend, never execute; escalate when unsure). Current instructions:\n${draft.instructions}\nReply with the full updated instructions only.` }, { role: 'user', content: text }], temperature: 0.2 })) if (ev.type === 'delta') acc += ev.text
    if (acc.trim()) set({ instructions: acc.trim() })
    setRefining(false); setRefine(''); setRefineOpen(false)
  }

  const cats = ['Web', 'Reasoning', 'Knowledge', 'Actions'] as const

  return (
    <Page className="h-full flex flex-col gap-3">
      <header className="clay h-14 px-3 flex items-center gap-2 shrink-0">
        <button onClick={() => nav('/agents')} className="btn btn-ghost btn-icon"><ArrowLeft size={16} /></button>
        <Tile color={colorFor(draft.name)} size={30} radius={9}><Sparkles size={14} /></Tile>
        <input value={draft.name} onChange={(e) => set({ name: e.target.value })} disabled={!editable} className="font-semibold text-[14px] bg-transparent outline-0 w-[260px]" />
        <Chip tone={draft.status === 'live' ? 'ok' : undefined}>{draft.status === 'live' ? 'Live' : 'Draft'} · v{draft.version}</Chip>
        <div className="flex-1" />
        {dirty && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[12px] muted">Unsaved</motion.span>}
        {editable && <Button onClick={() => save()} disabled={!dirty}>Save</Button>}
        {editable && (draft.status === 'draft' ? <Button variant="primary" onClick={() => save('live')}>Publish</Button> : <Button onClick={() => save('draft')}><RotateCcw size={13} /> Unpublish</Button>)}
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)] gap-3">
        <section className="clay scroll">
          <fieldset disabled={!editable} className="max-w-[640px] mx-auto px-6 py-6 flex flex-col gap-6 disabled:opacity-80">
            <Field label="Description"><Input value={draft.description} onChange={(e) => set({ description: e.target.value })} placeholder="What does this agent do, in one line?" /></Field>

            <Field label="Instructions" action={editable && <button onClick={() => setRefineOpen((o) => !o)} className="text-[12px] font-medium accent-ink inline-flex items-center gap-1 hover:underline"><Wand2 size={12} /> Refine with AI</button>}>
              {refineOpen && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flat p-1.5 pl-3 flex items-center gap-2 mb-2 overflow-hidden">
                  <input autoFocus value={refine} onChange={(e) => setRefine(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runRefine()} placeholder={apiKey ? 'e.g. always answer in British English and cite sources' : 'Connect an OpenRouter key first'} className="flex-1 bg-transparent outline-0 text-[13px]" />
                  <button onClick={runRefine} disabled={refining || !refine.trim()} className="btn btn-primary btn-sm btn-icon !rounded-full">{refining ? '…' : <ArrowUp size={14} />}</button>
                </motion.div>
              )}
              <Textarea rows={11} value={draft.instructions} onChange={(e) => set({ instructions: e.target.value })} />
              {issues.length > 0 && <ul className="mt-2 flex flex-col gap-1">{issues.map((i) => <li key={i} className="text-[12px] muted flex gap-2"><span className="w-1 h-1 rounded-full bg-[var(--warn)] mt-2 shrink-0" />{i}</li>)}</ul>}
            </Field>

            <Field label="Model">
              {models.length ? <Select value={draft.model} onChange={(e) => set({ model: e.target.value })}>{!models.some((m) => m.id === draft.model) && <option value={draft.model}>{draft.model}</option>}{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select> : <Input value={draft.model} onChange={(e) => set({ model: e.target.value })} placeholder="provider/model" />}
            </Field>

            <Field label="Tools" hint="Tools with a lock write to external systems and are always queued for approval.">
              <div className="flat divide-y divide-[var(--line)]">
                {cats.map((c) => TOOLS.filter((t) => t.category === c).map((t) => {
                  const on = draft.tools.includes(t.name)
                  return (
                    <div key={t.name} className="flex items-center gap-3 px-3 h-12">
                      <div className="flex-1 min-w-0"><div className="text-[13px] font-medium flex items-center gap-1.5">{t.label} {t.write && <Lock size={11} className="muted" />}</div><div className="text-[11.5px] muted">{t.desc}</div></div>
                      <span className="text-[10.5px] muted w-[70px]">{t.category}</span>
                      <Toggle checked={on} onChange={(v) => set({ tools: v ? [...draft.tools, t.name] : draft.tools.filter((x) => x !== t.name) })} />
                    </div>
                  )
                }))}
              </div>
            </Field>

            <Field label="Knowledge" hint="Attached libraries are available to the agent and to the knowledge search tool.">
              <div className="flat divide-y divide-[var(--line)]">
                {libraries.map((l) => <div key={l.id} className="flex items-center gap-3 px-3 h-11"><div className="flex-1 min-w-0"><div className="text-[13px] font-medium">{l.name}</div><div className="text-[11.5px] muted">{l.docs.length} documents</div></div><Toggle checked={draft.knowledge.includes(l.id)} onChange={(v) => set({ knowledge: v ? [...draft.knowledge, l.id] : draft.knowledge.filter((x) => x !== l.id) })} /></div>)}
              </div>
            </Field>

            <Field label="Autonomy" hint={hasWrite ? 'This agent has write tools, so Level 3 is locked.' : undefined}>
              <Segmented value={String(draft.autonomy) as '1' | '2' | '3'} onChange={(v) => set({ autonomy: Number(v) as Autonomy })} items={[{ id: '1', label: 'Notify only' }, { id: '2', label: 'Draft for approval' }, { id: '3', label: hasWrite ? 'Act (locked)' : 'Act within limits' }]} />
            </Field>

            <Field label="Watchers" hint="Background monitors that surface findings on Home. They never change external systems.">
              <div className="flat divide-y divide-[var(--line)]">
                {draft.watchers.map((w) => <div key={w} className="flex items-center gap-3 px-3 h-11 text-[13px]"><span className="flex-1">{w}</span><Button size="sm" variant="ghost" onClick={() => alert('Watchers are evaluated when the agent runs on a schedule. Scheduled runs arrive with the production roll-out.')}><History size={12} /> Test 30 days</Button><button onClick={() => set({ watchers: draft.watchers.filter((x) => x !== w) })} className="muted hover:text-[var(--danger)]"><X size={14} /></button></div>)}
                <div className="flex items-center gap-2 px-3 h-11"><input value={newWatcher} onChange={(e) => setNewWatcher(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newWatcher.trim()) { set({ watchers: [...draft.watchers, newWatcher.trim()] }); setNewWatcher('') } }} placeholder="Fire when…" className="flex-1 bg-transparent outline-0 text-[13px]" /><button onClick={() => { if (newWatcher.trim()) { set({ watchers: [...draft.watchers, newWatcher.trim()] }); setNewWatcher('') } }} className="btn btn-ghost btn-sm btn-icon"><Plus size={14} /></button></div>
              </div>
            </Field>

            <div>
              <button onClick={() => setAdvanced((a) => !a)} className="text-[12px] font-semibold inline-flex items-center gap-1 muted hover:text-[var(--text)]">{advanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Advanced</button>
              {advanced && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex flex-col gap-5">
                  <Field label="Sample prompts" hint="One per line. Shown as suggestions in Chat."><Textarea rows={3} value={draft.samplePrompts.join('\n')} onChange={(e) => set({ samplePrompts: e.target.value.split('\n').filter(Boolean) })} /></Field>
                  <Field label="MCP manifest" hint="Read-only. Expose this agent to Copilot Studio or any MCP host.">
                    <pre className="flat p-3 text-[11.5px] overflow-auto">{JSON.stringify({ name: draft.id, version: `${draft.version}.0.0`, description: draft.description, autonomy: draft.autonomy, approval_required: draft.autonomy <= 2, model: draft.model, tools: draft.tools.map((t) => ({ name: t, gated: !!TOOLS.find((x) => x.name === t)?.write })), knowledge: draft.knowledge }, null, 2)}</pre>
                  </Field>
                  {editable && <button onClick={() => { if (confirm('Delete this agent?')) { deleteAgent(draft.id); nav('/agents') } }} className="text-[12px] font-medium text-[var(--danger)] inline-flex items-center gap-1.5 hover:underline"><Trash2 size={13} /> Delete agent</button>}
                </motion.div>
              )}
            </div>
          </fieldset>
        </section>

        <section className="clay flex flex-col min-h-0">
          <div className="h-12 px-5 flex items-center border-b hairline text-[13px] font-semibold">Preview <span className="muted font-normal ml-2">{draft.model.split('/')[1] ?? draft.model}</span><div className="flex-1" />{chat.msgs.length > 0 && <button className="text-[12px] muted hover:text-[var(--text)]" onClick={chat.clear}>Reset</button>}</div>
          <div className="flex-1 scroll"><Thread msgs={chat.msgs} agent={draft} compact onPrompt={(p) => chat.send(p)} /></div>
          <div className="p-3"><Composer onSend={(t) => chat.send(t)} busy={chat.busy} onStop={chat.stop} placeholder="Message…" /></div>
        </section>
      </div>
    </Page>
  )
}

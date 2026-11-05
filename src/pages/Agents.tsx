import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, Sparkles, Users, Play, Trash2, Workflow as WorkflowIcon, Check, Wand2 } from 'lucide-react'
import { useApp, useUser, profileModels } from '@/store/app'
import { agentTemplates, councilTemplates, roleLabel, GOVERNED, type Agent, type Council } from '@/lib/data'
import { runAgentTurn } from '@/lib/agentRun'
import { streamChat } from '@/lib/openrouter'
import { TOOLS } from '@/lib/tools'
import { Button, Dot, Drawer, Empty, Field, Input, Modal, PageHeader, SearchBox, Segmented, Select, Textarea, Tile, Toggle, colorFor, cx } from '@/components/ui'
import { Page, Stagger, Item, Hover } from '@/components/motion'
import { Md } from '@/components/Md'

export default function Agents() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const user = useUser()!
  const store = useApp()
  const { agents, councils, users, upsertAgent, upsertCouncil, deleteCouncil, defaultModel, profiles, apiKey, customTools } = store
  const [tab, setTab] = useState<'agents' | 'councils'>((params.get('tab') as 'councils') === 'councils' ? 'councils' : 'agents')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | 'live' | 'draft'>('all')
  const [creating, setCreating] = useState(false)
  const [desc, setDesc] = useState('')
  const [generating, setGenerating] = useState(false)
  const [templates, setTemplates] = useState(false)
  const [open, setOpen] = useState<Council | null>(null)

  useEffect(() => {
    const id = params.get('open'); if (id) { const c = councils.find((x) => x.id === id); if (c) { setTab('councils'); setOpen(c) } }
    if (params.get('new')) setCreating(true)
    if (id || params.get('new')) setParams({}, { replace: true })
  }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  const newId = () => `agent-${Date.now().toString(36)}`
  const createFromTemplate = (t?: typeof agentTemplates[number]) => {
    const a: Agent = { id: newId(), name: t?.name ?? 'New agent', description: t?.description ?? '', instructions: t?.instructions ?? `You are a helpful assistant. ${GOVERNED}`, model: t?.model ?? defaultModel, tools: t?.tools ?? [], knowledge: t?.tools.includes('search_knowledge') ? ['company'] : [], autonomy: 2, status: 'draft', version: 1, samplePrompts: t?.samplePrompts ?? [], updatedAt: new Date().toISOString().slice(0, 10), createdBy: user.id }
    upsertAgent(a); setCreating(false); nav(`/agents/${a.id}`)
  }
  const generate = async () => {
    const text = desc.trim(); if (!text) return
    if (!apiKey) { createFromTemplate(); return }
    setGenerating(true)
    const sys = `You design AI agents for a governed enterprise platform. Available tools: ${[...TOOLS.map((t) => `${t.name} (${t.desc})`), ...customTools.map((t) => `${t.name} (${t.description})`)].join('; ')}. Given a description, reply ONLY with JSON: {"name": "...", "description": "one line", "instructions": "a complete system prompt in second person, 80-200 words, ending with: ${GOVERNED}", "tools": ["tool_name", ...], "samplePrompts": ["...", "...", "..."]}. Choose only tools that are needed.`
    let acc = ''
    for await (const ev of streamChat({ key: apiKey, model: defaultModel, messages: [{ role: 'system', content: sys }, { role: 'user', content: text }], temperature: 0.3 })) if (ev.type === 'delta') acc += ev.text
    try {
      const j = JSON.parse(acc.replace(/^```json?|```$/g, '').trim())
      const tools = (j.tools ?? []).filter((t: string) => TOOLS.some((x) => x.name === t) || customTools.some((x) => x.name === t))
      createFromTemplate({ id: 'gen', name: j.name ?? 'New agent', description: j.description ?? '', instructions: j.instructions ?? '', tools, samplePrompts: j.samplePrompts ?? [], model: defaultModel })
    } catch { createFromTemplate({ id: 'gen', name: 'New agent', description: text.slice(0, 80), instructions: `${text}\n\n${GOVERNED}`, tools: ['web_search', 'search_knowledge'], samplePrompts: [], model: defaultModel }) }
    setGenerating(false)
  }
  const createCouncil = (t?: typeof councilTemplates[number]) => {
    const c: Council = { id: `council-${Date.now().toString(36)}`, status: 'draft', name: t?.name ?? 'New council', description: t?.description ?? '', members: agents.slice(0, 3).map((a) => a.id), mode: t?.mode ?? 'consensus', gatekeeper: users.find((u) => u.role === 'approver' || u.role === 'admin')?.id ?? user.id, model: t?.model ?? profiles.find((p) => p.id === 'reasoning')?.model ?? defaultModel }
    upsertCouncil(c); setTemplates(false); setOpen(c)
  }

  const list = agents.filter((a) => (status === 'all' || a.status === status) && (a.name + a.description).toLowerCase().includes(q.toLowerCase()))
  const clist = councils.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <Page className="max-w-[1080px] mx-auto pt-8 pb-16 px-4">
      <PageHeader title={tab === 'agents' ? 'Agents' : 'Councils'} subtitle={tab === 'agents' ? 'Assistants with their own instructions, tools, knowledge and model.' : 'Groups of agents that deliberate on hard cases before a person decides.'}
        actions={tab === 'agents' ? <Button variant="primary" onClick={() => setCreating(true)}><Plus size={15} /> New agent</Button> : <Button variant="primary" onClick={() => setTemplates(true)} disabled={agents.length === 0} title={agents.length === 0 ? 'Create agents first' : undefined}><Plus size={15} /> New council</Button>} />
      <div className="flex items-center gap-3 mb-5">
        <Segmented value={tab} onChange={setTab} items={[{ id: 'agents', label: `Agents · ${agents.length}` }, { id: 'councils', label: `Councils · ${councils.length}` }]} />
        <SearchBox value={q} onChange={setQ} placeholder="Search" className="w-[240px]" />
        {tab === 'agents' && <Segmented value={status} onChange={setStatus} items={[{ id: 'all', label: 'All' }, { id: 'live', label: 'Live' }, { id: 'draft', label: 'Drafts' }]} />}
      </div>

      {tab === 'agents' ? (
        agents.length === 0 ? (
          <div className="clay"><Empty title="No agents yet" body="Describe what you need in a sentence, or start from a template. Agents get real tools: web search, research, code, documents and approvals." action={<Button variant="primary" onClick={() => setCreating(true)}><Wand2 size={14} /> Create your first agent</Button>} /></div>
        ) : (
          <Stagger className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" delay={0.06}>
            {list.map((a) => (
              <Item key={a.id}>
                <Hover onClick={() => nav(`/agents/${a.id}`)} className="clay p-5 cursor-pointer flex flex-col gap-3 min-h-[172px] relative overflow-hidden group">
                  <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: `radial-gradient(circle, ${colorFor(a.name)}33, transparent 70%)` }} />
                  <Tile color={colorFor(a.name)} size={38} radius={12}><Sparkles size={17} /></Tile>
                  <div><div className="font-semibold text-[14px]">{a.name}</div><p className="text-[12.5px] muted leading-relaxed mt-1 line-clamp-2">{a.description || 'No description yet.'}</p></div>
                  <div className="mt-auto flex items-center gap-2 text-[12px] muted"><Dot tone={a.status === 'live' ? 'ok' : 'muted'} /><span className="capitalize">{a.status}</span><span>·</span><span>{a.tools.length} tools</span><span>·</span><span className="truncate">{a.model.split('/')[1] ?? a.model}</span></div>
                </Hover>
              </Item>
            ))}
          </Stagger>
        )
      ) : (
        clist.length === 0 ? <div className="clay"><Empty title="No councils yet" body="A council runs several agents on the same case and synthesises a recommendation for a gatekeeper." action={agents.length > 0 ? <Button variant="primary" onClick={() => setTemplates(true)}><Plus size={14} /> New council</Button> : <Button onClick={() => setTab('agents')}>Create agents first</Button>} /></div> : (
          <Stagger className="grid sm:grid-cols-2 gap-4" delay={0.06}>
            {clist.map((c) => (
              <Item key={c.id}>
                <Hover onClick={() => setOpen(c)} className="clay p-5 cursor-pointer flex gap-4">
                  <Tile color={colorFor(c.name)} size={42} radius={13}><Users size={18} /></Tile>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[14px] flex items-center gap-2">{c.name}<Dot tone={c.status === 'live' ? 'ok' : 'muted'} /></div>
                    <p className="text-[12.5px] muted mt-0.5 line-clamp-2">{c.description}</p>
                    <div className="flex items-center gap-2 mt-3 text-[12px] muted">
                      <div className="flex -space-x-1.5">{c.members.map((m) => <span key={m} className="w-5 h-5 rounded-full border-2 border-[var(--surface)] grid place-items-center text-[9px] font-bold text-white" style={{ background: colorFor(agents.find((a) => a.id === m)?.name ?? m) }}>{(agents.find((a) => a.id === m)?.name ?? '?')[0]}</span>)}</div>
                      <span>{c.members.length} members · {c.mode}</span><span>·</span><span>Gatekeeper {users.find((u) => u.id === c.gatekeeper)?.name.split(' ')[0]}</span>
                    </div>
                  </div>
                </Hover>
              </Item>
            ))}
          </Stagger>
        )
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="New agent" width={620}>
        <div className="flex flex-col gap-5">
          <div>
            <div className="text-[12px] font-semibold mb-1.5 flex items-center gap-1.5"><Wand2 size={13} className="accent-ink" /> Describe what it should do</div>
            <Textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. An agent that monitors our competitors' pricing pages weekly and drafts a short update for the sales team" />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11.5px] muted">{apiKey ? 'The model writes the instructions and picks the tools. You can edit everything after.' : 'Model access is not configured; a blank agent is created instead.'}</span>
              <Button variant="primary" size="sm" onClick={generate} disabled={!desc.trim() || generating}>{generating ? 'Designing…' : 'Create'}</Button>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[11px] muted"><span className="flex-1 h-px bg-[var(--line)]" />or start from a template<span className="flex-1 h-px bg-[var(--line)]" /></div>
          <div className="grid sm:grid-cols-2 gap-2">
            {agentTemplates.map((t) => (
              <button key={t.id} onClick={() => createFromTemplate(t)} className="flat p-3 text-left hover:bg-[var(--surface)] flex gap-3">
                <Tile color={colorFor(t.name)} size={30} radius={9}><Sparkles size={13} /></Tile>
                <span className="min-w-0"><span className="block text-[13px] font-semibold">{t.name}</span><span className="block text-[11.5px] muted line-clamp-2">{t.description}</span></span>
              </button>
            ))}
            <button onClick={() => createFromTemplate()} className="flat p-3 text-left hover:bg-[var(--surface)] flex gap-3"><Tile color="#64748b" size={30} radius={9}><Plus size={13} /></Tile><span><span className="block text-[13px] font-semibold">Blank</span><span className="block text-[11.5px] muted">Write everything yourself.</span></span></button>
          </div>
        </div>
      </Modal>

      <Modal open={templates} onClose={() => setTemplates(false)} title="New council" width={560}>
        <div className="flex flex-col gap-2">
          {councilTemplates.map((t) => <button key={t.name} onClick={() => createCouncil(t)} className="flat p-4 text-left hover:bg-[var(--surface)]"><div className="text-[13.5px] font-semibold">{t.name}</div><div className="text-[12px] muted">{t.description} · {t.mode}</div></button>)}
          <button onClick={() => createCouncil()} className="flat p-4 text-left hover:bg-[var(--surface)]"><div className="text-[13.5px] font-semibold">Blank council</div><div className="text-[12px] muted">Choose members and a deliberation mode yourself.</div></button>
        </div>
      </Modal>

      <CouncilDrawer council={open} onClose={() => setOpen(null)} onDelete={(id) => { deleteCouncil(id); setOpen(null) }} />
    </Page>
  )
}

function CouncilDrawer({ council, onClose, onDelete }: { council: Council | null; onClose: () => void; onDelete: (id: string) => void }) {
  const nav = useNavigate()
  const store = useApp()
  const { agents, users, upsertCouncil, apiKey, libraries, models, customTools } = store
  const [draft, setDraft] = useState<Council | null>(council)
  const [tab, setTab] = useState<'setup' | 'simulate'>('setup')
  const [caseText, setCaseText] = useState('Proposal: move our customer support knowledge base to a new vendor next quarter. Budget 40,000, migration in 6 weeks, two engineers.')
  const [findings, setFindings] = useState<{ agent: string; text: string }[]>([])
  const [synthesis, setSynthesis] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setDraft(council); setTab('setup'); setFindings([]); setSynthesis('') }, [council])
  if (!draft) return null
  const set = (p: Partial<Council>) => setDraft({ ...draft, ...p })
  const dirty = JSON.stringify(draft) !== JSON.stringify(council)

  const simulate = async () => {
    if (!apiKey) { setSynthesis('Model access is not configured.'); return }
    setBusy(true); setFindings([]); setSynthesis('')
    const out: { agent: string; text: string }[] = []
    for (const id of draft.members) {
      const a = agents.find((x) => x.id === id); if (!a) continue
      let text = ''
      for await (const ev of runAgentTurn({ key: apiKey, model: a.model, models: profileModels(store), custom: customTools, autonomy: 1, instructions: a.instructions + '\n\nYou are a member of a council. Give your findings on the case in under 120 words, with a clear position (Approve / Reject / Need more info). Use tools if they help.', tools: a.tools, libraries: libraries.filter((l) => a.knowledge.includes(l.id)), history: [{ role: 'user', content: caseText }], maxRounds: 4 })) {
        if (ev.type === 'text') { text += ev.text; setFindings([...out, { agent: a.name, text }]) }
      }
      out.push({ agent: a.name, text }); setFindings([...out])
    }
    const modeHint = { consensus: 'Seek consensus; note any dissent.', debate: 'Cross-examine each finding, surface contradictions, then conclude.', quorum: 'Count positions; a majority decides, note the vote.' }[draft.mode]
    let syn = ''
    for await (const ev of streamChat({ key: apiKey, model: draft.model, messages: [{ role: 'system', content: `You synthesise a council's findings into one recommendation for the human gatekeeper. ${modeHint} Output: Recommendation (one line), Confidence (0-100%), Key reasons (3 bullets), Dissent (if any). Under 150 words.` }, { role: 'user', content: `Case: ${caseText}\n\n${out.map((f) => `${f.agent}:\n${f.text}`).join('\n\n')}` }] })) {
      if (ev.type === 'delta') { syn += ev.text; setSynthesis(syn) }
      if (ev.type === 'usage') store.recordSpend(ev.usage.cost ?? 0)
      if (ev.type === 'error') setSynthesis(`Error: ${ev.message}`)
    }
    setBusy(false)
  }

  return (
    <Drawer open={!!council} onClose={onClose} title={draft.name} width={600}>
      <div className="flex items-center gap-2 mb-4">
        <Segmented value={tab} onChange={setTab} items={[{ id: 'setup', label: 'Setup' }, { id: 'simulate', label: 'Simulate' }]} />
        <div className="flex-1" />
        {dirty && <Button size="sm" variant="primary" onClick={() => upsertCouncil(draft)}><Check size={13} /> Save</Button>}
        {!dirty && draft.status === 'draft' && <Button size="sm" variant="primary" onClick={() => { const n = { ...draft, status: 'live' as const }; setDraft(n); upsertCouncil(n) }}>Publish</Button>}
      </div>
      {tab === 'setup' ? (
        <div className="flex flex-col gap-4">
          <Field label="Name"><Input value={draft.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Purpose"><Textarea rows={2} value={draft.description} onChange={(e) => set({ description: e.target.value })} /></Field>
          <Field label="Members">
            <div className="flat divide-y divide-[var(--line)]">
              {agents.map((a) => <div key={a.id} className="flex items-center gap-3 px-3 h-11"><Tile color={colorFor(a.name)} size={24} radius={7}><Sparkles size={11} /></Tile><span className="flex-1 text-[13px]">{a.name}</span><Toggle checked={draft.members.includes(a.id)} onChange={(v) => set({ members: v ? [...draft.members, a.id] : draft.members.filter((m) => m !== a.id) })} /></div>)}
            </div>
          </Field>
          <Field label="Deliberation mode"><Segmented value={draft.mode} onChange={(m) => set({ mode: m })} items={[{ id: 'consensus', label: 'Consensus' }, { id: 'debate', label: 'Debate' }, { id: 'quorum', label: 'Quorum vote' }]} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gatekeeper"><Select value={draft.gatekeeper} onChange={(e) => set({ gatekeeper: e.target.value })}>{users.filter((u) => u.role === 'approver' || u.role === 'security' || u.role === 'admin').map((u) => <option key={u.id} value={u.id}>{u.name} · {roleLabel[u.role]}</option>)}</Select></Field>
            <Field label="Synthesis model">{models.length ? <Select value={draft.model} onChange={(e) => set({ model: e.target.value })}>{!models.some((m) => m.id === draft.model) && <option value={draft.model}>{draft.model}</option>}{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select> : <Input value={draft.model} onChange={(e) => set({ model: e.target.value })} />}</Field>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Button size="sm" onClick={() => nav(`/workflows/new?template=council&council=${draft.id}`)}><WorkflowIcon size={13} /> Use in a workflow</Button>
            <div className="flex-1" />
            <button onClick={() => { if (confirm('Delete this council?')) onDelete(draft.id) }} className="text-[12px] font-medium text-[var(--danger)] inline-flex items-center gap-1 hover:underline"><Trash2 size={12} /> Delete</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="Case"><Textarea rows={4} value={caseText} onChange={(e) => setCaseText(e.target.value)} /></Field>
          <Button variant="primary" onClick={simulate} disabled={busy || !draft.members.length}><Play size={14} /> {busy ? 'Deliberating…' : 'Simulate deliberation'}</Button>
          {findings.map((f, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flat p-3">
              <div className="text-[12px] font-semibold mb-1 flex items-center gap-2"><Tile color={colorFor(f.agent)} size={20} radius={6}><Sparkles size={10} /></Tile>{f.agent}</div>
              <Md className="prose-chat text-[12.5px]">{f.text || '…'}</Md>
            </motion.div>
          ))}
          {synthesis && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="clay-sm p-4">
              <div className="text-[12px] font-semibold mb-1">Council recommendation · for {users.find((u) => u.id === draft.gatekeeper)?.name}</div>
              <Md className="prose-chat text-[13px]">{synthesis}</Md>
            </motion.div>
          )}
        </div>
      )}
    </Drawer>
  )
}

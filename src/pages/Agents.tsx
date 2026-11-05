import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Users, Play, Trash2, Workflow as WorkflowIcon, Check, Wand2, MessageSquare, Pencil, Copy, MoreHorizontal, LayoutGrid, List, Upload, ArrowRight, Sparkles, Eye } from 'lucide-react'
import { useApp, useUser, can, profileModels } from '@/store/app'
import { agentTemplates, councilTemplates, roleLabel, GOVERNED, type Agent, type Council } from '@/lib/data'
import { runAgentTurn } from '@/lib/agentRun'
import { streamChat, listModels } from '@/lib/openrouter'
import { TOOLS } from '@/lib/tools'
import { Button, Chip, Confirm, Dot, Drawer, Empty, Field, Input, Modal, PageHeader, SearchBox, Segmented, Select, Textarea, Tile, Toggle, colorFor, cx } from '@/components/ui'
import { Page, Stagger, Item } from '@/components/motion'
import { AgentAvatar } from '@/components/AgentAvatar'
import { Md } from '@/components/Md'

const since = (d: string) => { const days = Math.round((Date.now() - new Date(d).getTime()) / 86400000); return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 30 ? `${days} days ago` : d }

export default function Agents() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const user = useUser()!
  const store = useApp()
  const { agents, councils, users, workflows, upsertAgent, deleteAgent, upsertCouncil, deleteCouncil, defaultModel, profiles, apiKey, customTools, models, setModels } = store
  const [tab, setTab] = useState<'agents' | 'councils'>((params.get('tab') as 'councils') === 'councils' ? 'councils' : 'agents')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | 'live' | 'draft'>('all')
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('agents-view') as 'list') || 'grid')
  const [creating, setCreating] = useState(false)
  const [desc, setDesc] = useState('')
  const [designing, setDesigning] = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<Agent | null>(null)
  const [templates, setTemplates] = useState(false)
  const [open, setOpen] = useState<Council | null>(null)
  const editable = can(user, 'build')

  useEffect(() => {
    const id = params.get('open'); if (id) { const c = councils.find((x) => x.id === id); if (c) { setTab('councils'); setOpen(c) } }
    if (params.get('new')) setCreating(true)
    if (id || params.get('new')) setParams({}, { replace: true })
  }, [params]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { localStorage.setItem('agents-view', view) }, [view])
  useEffect(() => { if (!models.length && apiKey) listModels(apiKey).then(setModels).catch(() => {}) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const close = () => setMenu(null); window.addEventListener('click', close); return () => window.removeEventListener('click', close) }, [])

  const newId = () => `agent-${Date.now().toString(36)}`
  const createFromTemplate = (t?: Partial<typeof agentTemplates[number]>) => {
    const a: Agent = { id: newId(), name: t?.name ?? 'New agent', description: t?.description ?? '', instructions: t?.instructions ?? `You are a helpful assistant. ${GOVERNED}`, model: t?.model ?? defaultModel, tools: t?.tools ?? [], knowledge: t?.tools?.includes('search_knowledge') ? ['company'] : [], autonomy: 2, status: 'draft', version: 1, samplePrompts: t?.samplePrompts ?? [], updatedAt: new Date().toISOString().slice(0, 10), createdBy: user.id, icon: t?.icon, color: t?.color }
    upsertAgent(a); setCreating(false); setDesc(''); nav(`/agents/${a.id}`)
  }
  const generate = async () => {
    const text = desc.trim(); if (!text) return
    if (!apiKey) { createFromTemplate({ name: 'New agent', description: text.slice(0, 90), instructions: `${text}\n\n${GOVERNED}` }); return }
    setDesigning('Reading your description…')
    const sys = `You design AI agents for a governed enterprise platform. Available tools: ${[...TOOLS.map((t) => `${t.name} (${t.desc})`), ...customTools.map((t) => `${t.name} (${t.description})`)].join('; ')}. Icons: sparkles, bot, search, pen, chart, support, globe, shield, book, calculator, mail, briefcase, scale, idea, megaphone, wrench. Given a description, reply ONLY with JSON: {"name": "2-4 words", "description": "one line", "icon": "one icon id", "instructions": "a complete system prompt in second person, 120-250 words, covering purpose, how to answer, what to refuse, ending with: ${GOVERNED}", "tools": ["tool_name", ...], "samplePrompts": ["...", "...", "..."]}. Choose only the tools that are needed.`
    let acc = ''
    const t0 = Date.now()
    const tick = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); setDesigning(s < 4 ? 'Reading your description…' : s < 9 ? 'Writing the instructions…' : s < 14 ? 'Choosing tools and prompts…' : 'Almost there…') }, 1000)
    try {
      for await (const ev of streamChat({ key: apiKey, model: defaultModel, messages: [{ role: 'system', content: sys }, { role: 'user', content: text }], temperature: 0.3 })) { if (ev.type === 'delta') acc += ev.text; if (ev.type === 'usage') store.recordSpend(ev.usage.cost ?? 0) }
      const j = JSON.parse(acc.replace(/^```json?|```$/g, '').trim())
      const tools = (j.tools ?? []).filter((t: string) => TOOLS.some((x) => x.name === t) || customTools.some((x) => x.name === t))
      createFromTemplate({ name: j.name ?? 'New agent', description: j.description ?? '', instructions: j.instructions ?? '', tools, samplePrompts: Array.isArray(j.samplePrompts) ? j.samplePrompts : [], icon: typeof j.icon === 'string' ? j.icon : undefined })
    } catch { createFromTemplate({ name: 'New agent', description: text.slice(0, 90), instructions: `${text}\n\n${GOVERNED}`, tools: ['web_search', 'search_knowledge'] }) }
    finally { clearInterval(tick); setDesigning(null) }
  }
  const importFile = (f: File) => { f.text().then((s) => { try { const j = JSON.parse(s); createFromTemplate({ name: j.name, description: j.description, instructions: j.instructions, tools: Array.isArray(j.tools) ? j.tools : [], samplePrompts: Array.isArray(j.samplePrompts) ? j.samplePrompts : [], model: j.model, icon: j.icon, color: j.color }) } catch { alert('That file is not a valid agent export.') } }) }
  const duplicate = (a: Agent) => { const id = newId(); upsertAgent({ ...a, id, name: `${a.name} (copy)`, status: 'draft', version: 1, history: undefined, createdBy: user.id, updatedAt: new Date().toISOString().slice(0, 10) }); nav(`/agents/${id}`) }
  const createCouncil = (t?: typeof councilTemplates[number]) => {
    const c: Council = { id: `council-${Date.now().toString(36)}`, status: 'draft', name: t?.name ?? 'New council', description: t?.description ?? '', members: agents.slice(0, 3).map((a) => a.id), mode: t?.mode ?? 'consensus', gatekeeper: users.find((u) => u.role === 'approver' || u.role === 'admin')?.id ?? user.id, model: t?.model ?? profiles.find((p) => p.id === 'reasoning')?.model ?? defaultModel }
    upsertCouncil(c); setTemplates(false); setOpen(c)
  }
  const usedIn = (a: Agent) => workflows.filter((w) => w.nodes.some((n) => n.data.agentId === a.id)).length
  const modelName = (id: string) => models.find((m) => m.id === id)?.name ?? (id.split('/')[1] ?? id)

  const list = useMemo(() => agents.filter((a) => (status === 'all' || a.status === status) && (a.name + ' ' + a.description).toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [agents, status, q])
  const clist = councils.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))

  const AgentMenu = ({ a }: { a: Agent }) => (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setMenu(menu === a.id ? null : a.id)} className="btn btn-ghost btn-sm btn-icon" title="More"><MoreHorizontal size={15} /></button>
      <AnimatePresence>
        {menu === a.id && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute right-0 top-full mt-1 w-[190px] glass rounded-[14px] p-1.5 z-20 text-[13px]">
            <button onClick={() => nav(`/chat/${a.id}`)} className="w-full flex items-center gap-2 px-2 h-9 rounded-[9px] hover:bg-[var(--clay-dark)]"><MessageSquare size={14} /> {a.status === 'live' ? 'Chat' : 'Preview in Chat'}</button>
            <button onClick={() => nav(`/agents/${a.id}`)} className="w-full flex items-center gap-2 px-2 h-9 rounded-[9px] hover:bg-[var(--clay-dark)]"><Pencil size={14} /> Edit</button>
            {editable && <button onClick={() => duplicate(a)} className="w-full flex items-center gap-2 px-2 h-9 rounded-[9px] hover:bg-[var(--clay-dark)]"><Copy size={14} /> Duplicate</button>}
            {editable && <button onClick={() => { setMenu(null); upsertAgent({ ...a, status: a.status === 'live' ? 'draft' : 'live', version: a.version + 1 }, a.status === 'live' ? 'Unpublished agent' : 'Published agent') }} className="w-full flex items-center gap-2 px-2 h-9 rounded-[9px] hover:bg-[var(--clay-dark)]"><Eye size={14} /> {a.status === 'live' ? 'Unpublish' : 'Publish'}</button>}
            {editable && <button onClick={() => { setMenu(null); setToDelete(a) }} className="w-full flex items-center gap-2 px-2 h-9 rounded-[9px] hover:bg-[var(--clay-dark)] text-[var(--danger)]"><Trash2 size={14} /> Delete</button>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )

  return (
    <Page className="max-w-[1080px] mx-auto pt-8 pb-16 px-4">
      <PageHeader title={tab === 'agents' ? 'Agents' : 'Councils'} subtitle={tab === 'agents' ? `${agents.filter((a) => a.status === 'live').length} live · ${agents.filter((a) => a.status === 'draft').length} draft${agents.filter((a) => a.status === 'draft').length === 1 ? '' : 's'}` : 'Groups of agents that deliberate on hard cases before a person decides.'}
        actions={tab === 'agents' ? (editable && <Button variant="primary" onClick={() => setCreating(true)}><Plus size={15} /> New agent</Button>) : (editable && <Button variant="primary" onClick={() => setTemplates(true)} disabled={agents.length === 0} title={agents.length === 0 ? 'Create agents first' : undefined}><Plus size={15} /> New council</Button>)} />
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <Segmented value={tab} onChange={setTab} items={[{ id: 'agents', label: `Agents · ${agents.length}` }, { id: 'councils', label: `Councils · ${councils.length}` }]} />
        <SearchBox value={q} onChange={setQ} placeholder={tab === 'agents' ? 'Search agents' : 'Search councils'} className="w-[240px]" />
        {tab === 'agents' && <Segmented value={status} onChange={setStatus} items={[{ id: 'all', label: 'All' }, { id: 'live', label: 'Live' }, { id: 'draft', label: 'Drafts' }]} />}
        {tab === 'agents' && <div className="ml-auto seg"><button className={cx(view === 'grid' && 'on')} onClick={() => setView('grid')} title="Cards"><LayoutGrid size={14} /></button><button className={cx(view === 'list' && 'on')} onClick={() => setView('list')} title="List"><List size={14} /></button></div>}
      </div>

      {tab === 'agents' ? (
        agents.length === 0 ? (
          <div className="clay"><Empty title="No agents yet" body="Describe what you need in a sentence and the Co-Create Assistant designs it, or start from a template. Agents get real tools: web search, research, code, documents and approvals." action={editable && <Button variant="primary" onClick={() => setCreating(true)}><Wand2 size={14} /> Create your first agent</Button>} /></div>
        ) : list.length === 0 ? (
          <div className="clay"><Empty title="No agents match" body="Try a different search or filter." /></div>
        ) : view === 'grid' ? (
          <Stagger className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" delay={0.05}>
            {list.map((a) => { const u = usedIn(a); return (
              <Item key={a.id}>
                <motion.div whileHover={{ y: -3 }} onClick={() => nav(`/agents/${a.id}`)} className="clay p-5 cursor-pointer flex flex-col gap-3 min-h-[190px] relative overflow-hidden group">
                  <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: `radial-gradient(circle, ${a.color ?? colorFor(a.name)}33, transparent 70%)` }} />
                  <div className="flex items-start gap-3">
                    <AgentAvatar name={a.name} icon={a.icon} color={a.color} size={40} />
                    <div className="flex-1 min-w-0 pt-0.5"><div className="font-semibold text-[14px] truncate">{a.name}</div><div className="text-[11.5px] muted flex items-center gap-1.5"><Dot tone={a.status === 'live' ? 'ok' : 'muted'} /><span className="capitalize">{a.status}</span><span>· v{a.version}</span></div></div>
                    <AgentMenu a={a} />
                  </div>
                  <p className="text-[12.5px] muted leading-relaxed line-clamp-2">{a.description || 'No description yet.'}</p>
                  <div className="mt-auto flex items-center gap-2 text-[11.5px] muted flex-wrap"><Chip>{modelName(a.model)}</Chip><span>{a.tools.length} tool{a.tools.length === 1 ? '' : 's'}</span>{u > 0 && <span>· {u} workflow{u === 1 ? '' : 's'}</span>}<span className="ml-auto">{since(a.updatedAt)}</span></div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-4 right-4" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" onClick={() => nav(`/chat/${a.id}`)}><MessageSquare size={12} /> {a.status === 'live' ? 'Chat' : 'Preview'}</Button>
                  </div>
                </motion.div>
              </Item>
            ) })}
          </Stagger>
        ) : (
          <Stagger className="clay px-3 py-1" delay={0.04}>
            <div className="row text-[11px] font-semibold uppercase tracking-wider muted !py-2"><span className="w-[40px]" /><span className="flex-1">Agent</span><span className="w-[90px]">Status</span><span className="w-[170px]">Model</span><span className="w-[60px] text-right">Tools</span><span className="w-[90px] text-right">Used in</span><span className="w-[100px] text-right">Updated</span><span className="w-[40px]" /></div>
            {list.map((a) => { const u = usedIn(a); return (
              <Item key={a.id}>
                <div className="row hover cursor-pointer" onClick={() => nav(`/agents/${a.id}`)}>
                  <AgentAvatar name={a.name} icon={a.icon} color={a.color} size={32} />
                  <div className="flex-1 min-w-0"><div className="text-[13.5px] font-medium truncate">{a.name}</div><div className="text-[12px] muted truncate">{a.description || 'No description yet.'}</div></div>
                  <span className="w-[90px]"><Chip tone={a.status === 'live' ? 'ok' : undefined} className="capitalize">{a.status}</Chip></span>
                  <span className="w-[170px] text-[12.5px] muted truncate">{modelName(a.model)}</span>
                  <span className="w-[60px] text-right text-[13px] tabular-nums">{a.tools.length}</span>
                  <span className="w-[90px] text-right text-[12.5px] muted">{u ? `${u} workflow${u === 1 ? '' : 's'}` : '—'}</span>
                  <span className="w-[100px] text-right text-[12.5px] muted">{since(a.updatedAt)}</span>
                  <span className="w-[40px] text-right"><AgentMenu a={a} /></span>
                </div>
              </Item>
            ) })}
          </Stagger>
        )
      ) : (
        clist.length === 0 ? <div className="clay"><Empty title="No councils yet" body="A council runs several agents on the same case and synthesises a recommendation for a gatekeeper." action={agents.length > 0 ? (editable && <Button variant="primary" onClick={() => setTemplates(true)}><Plus size={14} /> New council</Button>) : <Button onClick={() => setTab('agents')}>Create agents first</Button>} /></div> : (
          <Stagger className="grid sm:grid-cols-2 gap-4" delay={0.06}>
            {clist.map((c) => (
              <Item key={c.id}>
                <motion.div whileHover={{ y: -3 }} onClick={() => setOpen(c)} className="clay p-5 cursor-pointer flex gap-4">
                  <Tile color={colorFor(c.name)} size={42} radius={13}><Users size={18} /></Tile>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[14px] flex items-center gap-2">{c.name}<Dot tone={c.status === 'live' ? 'ok' : 'muted'} /></div>
                    <p className="text-[12.5px] muted mt-0.5 line-clamp-2">{c.description}</p>
                    <div className="flex items-center gap-2 mt-3 text-[12px] muted">
                      <div className="flex -space-x-1.5">{c.members.map((m) => { const a = agents.find((x) => x.id === m); return <span key={m} className="rounded-full border-2 border-[var(--surface)]"><AgentAvatar name={a?.name ?? m} icon={a?.icon} color={a?.color} size={20} radius={10} /></span> })}</div>
                      <span>{c.members.length} members · {c.mode}</span><span>·</span><span>Gatekeeper {users.find((u) => u.id === c.gatekeeper)?.name.split(' ')[0]}</span>
                    </div>
                  </div>
                </motion.div>
              </Item>
            ))}
          </Stagger>
        )
      )}

      <Modal open={creating} onClose={() => !designing && setCreating(false)} title="New agent" width={760}>
        {designing ? (
          <div className="py-12 text-center">
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2.5, ease: 'linear' }} className="mx-auto mb-4 w-12 h-12 rounded-[14px] grid place-items-center" style={{ background: 'linear-gradient(145deg,#1a4a73,#10385b)' }}><Sparkles size={22} className="text-white" /></motion.div>
            <div className="display text-[16px] font-bold">Co-Create Assistant is designing your agent</div>
            <div className="text-[12.5px] muted mt-1">{designing}</div>
          </div>
        ) : (
          <div className="grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-6">
            <div className="min-w-0">
              <div className="text-[12px] font-semibold mb-1.5 flex items-center gap-1.5"><Wand2 size={13} className="accent-ink" /> Describe it</div>
              <Textarea rows={6} autoFocus value={desc} onChange={(e) => setDesc(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate() }} placeholder="e.g. An agent that answers employee questions about our HR policies from the handbook, in a friendly tone, and asks for approval before promising any exception" />
              <div className="flex flex-wrap gap-1.5 mt-2">{['Summarise competitor news every morning', 'Turn meeting notes into action items', 'Answer IT helpdesk questions from our docs'].map((s) => <button key={s} onClick={() => setDesc(s)} className="chip hover:text-[var(--text)]">{s}</button>)}</div>
              <div className="flex items-center justify-between mt-4 gap-3">
                <span className="text-[11.5px] muted">{apiKey ? 'The Co-Create Assistant writes the instructions, picks tools and suggests prompts. Everything stays editable.' : 'Models are not available right now; a blank agent with your text is created instead.'}</span>
                <Button variant="primary" onClick={generate} disabled={!desc.trim()}>Create <ArrowRight size={14} /></Button>
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-semibold mb-1.5">Or start from a template</div>
              <div className="flex flex-col gap-1.5">
                {agentTemplates.map((t) => (
                  <button key={t.id} onClick={() => createFromTemplate(t)} className="flat p-2.5 text-left hover:bg-[var(--surface)] flex gap-3 items-center">
                    <AgentAvatar name={t.name} icon={t.icon} color={t.color} size={32} />
                    <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">{t.name}</span><span className="block text-[11.5px] muted truncate">{t.description}</span></span>
                    <span className="text-[11px] muted shrink-0">{t.tools.length} tools</span>
                  </button>
                ))}
                <div className="flex gap-1.5 mt-1">
                  <button onClick={() => createFromTemplate()} className="flat p-2.5 text-left hover:bg-[var(--surface)] flex gap-2 items-center flex-1"><Tile color="#64748b" size={28} radius={8}><Plus size={13} /></Tile><span className="text-[12.5px] font-semibold">Blank</span></button>
                  <label className="flat p-2.5 text-left hover:bg-[var(--surface)] flex gap-2 items-center flex-1 cursor-pointer"><Tile color="#64748b" size={28} radius={8}><Upload size={13} /></Tile><span className="text-[12.5px] font-semibold">Import JSON</span><input type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = '' }} /></label>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Confirm open={!!toDelete} onClose={() => setToDelete(null)} title={`Delete ${toDelete?.name}?`} danger confirmLabel="Delete" onConfirm={() => toDelete && deleteAgent(toDelete.id)}
        body={toDelete && (usedIn(toDelete) > 0 ? `This agent is used by ${usedIn(toDelete)} workflow${usedIn(toDelete) === 1 ? '' : 's'}; those steps will need a new agent. Its chat history and versions are removed. This cannot be undone.` : 'Its chat history and versions are removed. This cannot be undone.')} />

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
  const [confirmDel, setConfirmDel] = useState(false)
  useEffect(() => { setDraft(council); setTab('setup'); setFindings([]); setSynthesis('') }, [council])
  if (!draft) return null
  const set = (p: Partial<Council>) => setDraft({ ...draft, ...p })
  const dirty = JSON.stringify(draft) !== JSON.stringify(council)

  const simulate = async () => {
    if (!apiKey) { setSynthesis('Models are not available right now.'); return }
    setBusy(true); setFindings([]); setSynthesis('')
    const out: { agent: string; text: string }[] = []
    for (const id of draft.members) {
      const a = agents.find((x) => x.id === id); if (!a) continue
      let text = ''
      for await (const ev of runAgentTurn({ key: apiKey, model: a.model, models: profileModels(store), custom: customTools, autonomy: 1, instructions: a.instructions + '\n\nYou are a member of a council. Give your findings on the case in under 120 words, with a clear position (Approve / Reject / Need more info). Use tools if they help.', tools: a.tools, libraries: libraries.filter((l) => a.knowledge.includes(l.id)), history: [{ role: 'user', content: caseText }], maxRounds: 4 })) {
        if (ev.type === 'text') { text += ev.text; setFindings([...out, { agent: a.name, text }]) }
        if (ev.type === 'done') store.recordSpend(ev.usage?.cost ?? 0)
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
              {agents.map((a) => <div key={a.id} className="flex items-center gap-3 px-3 h-11"><AgentAvatar name={a.name} icon={a.icon} color={a.color} size={24} /><span className="flex-1 text-[13px]">{a.name}{a.status === 'draft' && <span className="muted"> · draft</span>}</span><Toggle checked={draft.members.includes(a.id)} onChange={(v) => set({ members: v ? [...draft.members, a.id] : draft.members.filter((m) => m !== a.id) })} /></div>)}
            </div>
          </Field>
          <Field label="Deliberation mode"><Segmented value={draft.mode} onChange={(m) => set({ mode: m })} items={[{ id: 'consensus', label: 'Consensus' }, { id: 'debate', label: 'Debate' }, { id: 'quorum', label: 'Quorum vote' }]} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gatekeeper"><Select value={draft.gatekeeper} onChange={(e) => set({ gatekeeper: e.target.value })}>{users.filter((u) => u.role === 'approver' || u.role === 'security' || u.role === 'admin').map((u) => <option key={u.id} value={u.id}>{u.name} · {roleLabel[u.role]}</option>)}</Select></Field>
            <Field label="Synthesis model">{models.length ? <Select value={draft.model} onChange={(e) => set({ model: e.target.value })}>{!models.some((m) => m.id === draft.model) && <option value={draft.model}>{draft.model}</option>}{models.filter((m) => m.supported_parameters?.includes('tools')).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select> : <Input value={draft.model} onChange={(e) => set({ model: e.target.value })} />}</Field>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Button size="sm" onClick={() => nav(`/workflows/new?template=council&council=${draft.id}`)}><WorkflowIcon size={13} /> Use in a workflow</Button>
            <div className="flex-1" />
            <button onClick={() => setConfirmDel(true)} className="text-[12px] font-medium text-[var(--danger)] inline-flex items-center gap-1 hover:underline"><Trash2 size={12} /> Delete</button>
          </div>
          <Confirm open={confirmDel} onClose={() => setConfirmDel(false)} title={`Delete ${draft.name}?`} danger confirmLabel="Delete" body="Workflow steps that use this council will need a new one." onConfirm={() => onDelete(draft.id)} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="Case"><Textarea rows={4} value={caseText} onChange={(e) => setCaseText(e.target.value)} /></Field>
          <Button variant="primary" onClick={simulate} disabled={busy || !draft.members.length}><Play size={14} /> {busy ? 'Deliberating…' : 'Simulate deliberation'}</Button>
          {findings.map((f, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flat p-3">
              <div className="text-[12px] font-semibold mb-1 flex items-center gap-2">{(() => { const a = agents.find((x) => x.name === f.agent); return <AgentAvatar name={f.agent} icon={a?.icon} color={a?.color} size={20} radius={6} /> })()}{f.agent}</div>
              <Md className="prose-chat text-[12.5px]">{f.text || '…'}</Md>
            </motion.div>
          ))}
          {synthesis && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="clay-sm p-4"><div className="text-[12px] font-semibold mb-1">Council recommendation · for {users.find((u) => u.id === draft.gatekeeper)?.name}</div><Md className="prose-chat text-[13px]">{synthesis}</Md></motion.div>}
        </div>
      )}
    </Drawer>
  )
}

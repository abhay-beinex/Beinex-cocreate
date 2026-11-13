import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Users, Play, Trash2, Workflow as WorkflowIcon, Check, MessageSquare, Pencil, Copy, MoreHorizontal, LayoutGrid, List, Eye, CheckSquare, Square, ArrowUp, Search, PenLine, BarChart3, LifeBuoy, ListChecks, Sparkles } from 'lucide-react'
import { useApp, useUser, can, profileModels } from '@/store/app'
import { councilTemplates, roleLabel, type Agent, type Council } from '@/lib/data'
import { runAgentTurn } from '@/lib/agentRun'
import { streamChat, listModels } from '@/lib/openrouter'
import { Button, Chip, Confirm, Drawer, Empty, Field, Input, Modal, SearchBox, Segmented, Select, Textarea, Tile, Toggle, colorFor, cx } from '@/components/ui'
import { Page, Stagger, Item } from '@/components/motion'
import { AgentAvatar } from '@/components/AgentAvatar'
import { AgentCard, AbilityWells, ThinkingMeter } from '@/components/AgentBits'
import { Md } from '@/components/Md'

const since = (d: string) => { const days = Math.round((Date.now() - new Date(d).getTime()) / 86400000); return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 30 ? `${days} days ago` : d }
const starts = [{ label: 'Research', icon: Search, color: '#0ea5e9', tpl: 'research' }, { label: 'Writing', icon: PenLine, color: '#8b5cf6', tpl: 'writer' }, { label: 'Data', icon: BarChart3, color: '#10b981', tpl: 'analyst' }, { label: 'Support', icon: LifeBuoy, color: '#f59e0b', tpl: 'support' }, { label: 'Blank', icon: ListChecks, color: '#64748b', tpl: '' }]

export default function Agents() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const user = useUser()!
  const store = useApp()
  const { agents, councils, users, workflows, upsertAgent, deleteAgent, upsertCouncil, deleteCouncil, defaultModel, profiles, apiKey, customTools, models, setModels } = store
  const [tab, setTab] = useState<'all' | 'live' | 'draft' | 'councils'>((params.get('tab') as 'councils') === 'councils' ? 'councils' : 'all')
  const [q, setQ] = useState('')
  const [ask, setAsk] = useState('')
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('agents-view') as 'list') || 'grid')
  const [menu, setMenu] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [toDelete, setToDelete] = useState<Agent | null>(null)
  const [bulkDelete, setBulkDelete] = useState(false)
  const [templates, setTemplates] = useState(false)
  const [open, setOpen] = useState<Council | null>(null)
  const editable = can(user, 'build')

  useEffect(() => {
    const id = params.get('open'); if (id) { const c = councils.find((x) => x.id === id); if (c) { setTab('councils'); setOpen(c) } }
    if (params.get('new')) nav('/agents/new', { replace: true })
    if (id) setParams({}, { replace: true })
  }, [params]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { localStorage.setItem('agents-view', view) }, [view])
  useEffect(() => { if (!models.length && apiKey) listModels(apiKey).then(setModels).catch(() => { }) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const close = () => setMenu(null); window.addEventListener('click', close); return () => window.removeEventListener('click', close) }, [])

  const duplicate = (a: Agent) => { const id = `agent-${Date.now().toString(36)}`; upsertAgent({ ...a, id, name: `${a.name} (copy)`, status: 'draft', version: 1, history: undefined, createdBy: user.id, updatedAt: new Date().toISOString().slice(0, 10) }); nav(`/agents/${id}`) }
  const createCouncil = (t?: typeof councilTemplates[number]) => {
    const c: Council = { id: `council-${Date.now().toString(36)}`, status: 'draft', name: t?.name ?? 'New council', description: t?.description ?? '', members: agents.slice(0, 3).map((a) => a.id), mode: t?.mode ?? 'consensus', gatekeeper: users.find((u) => u.role === 'approver' || u.role === 'admin')?.id ?? user.id, model: t?.model ?? profiles.find((p) => p.id === 'reasoning')?.model ?? defaultModel }
    upsertCouncil(c); setTemplates(false); setOpen(c)
  }
  const usedIn = (a: Agent) => workflows.filter((w) => w.nodes.some((n) => n.data.agentId === a.id)).length
  const goAsk = () => { if (ask.trim()) nav(`/agents/new?purpose=${encodeURIComponent(ask.trim())}`) }

  const list = useMemo(() => agents.filter((a) => (tab === 'all' || tab === 'councils' || a.status === tab) && (a.name + ' ' + a.description).toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [agents, tab, q])
  const clist = councils.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))
  const live = agents.filter((a) => a.status === 'live').length

  const AgentMenu = ({ a }: { a: Agent }) => (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setMenu(menu === a.id ? null : a.id)} className="btn btn-ghost btn-sm btn-icon" title="More"><MoreHorizontal size={15} /></button>
      <AnimatePresence>
        {menu === a.id && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute right-0 top-full mt-1 w-[190px] pop rounded-[14px] p-1.5 z-40 text-[13px]">
            <button onClick={() => nav(`/chat/${a.id}`)} className="w-full flex items-center gap-2 px-2 h-9 rounded-[9px] hover:bg-[var(--clay-dark)]"><MessageSquare size={14} /> {a.status === 'live' ? 'Chat' : 'Try it'}</button>
            <button onClick={() => nav(`/agents/${a.id}`)} className="w-full flex items-center gap-2 px-2 h-9 rounded-[9px] hover:bg-[var(--clay-dark)]"><Pencil size={14} /> Open</button>
            {editable && <button onClick={() => duplicate(a)} className="w-full flex items-center gap-2 px-2 h-9 rounded-[9px] hover:bg-[var(--clay-dark)]"><Copy size={14} /> Duplicate</button>}
            {editable && <button onClick={() => { setMenu(null); upsertAgent({ ...a, status: a.status === 'live' ? 'draft' : 'live', version: a.version + 1 }, a.status === 'live' ? 'Unpublished agent' : 'Published agent') }} className="w-full flex items-center gap-2 px-2 h-9 rounded-[9px] hover:bg-[var(--clay-dark)]"><Eye size={14} /> {a.status === 'live' ? 'Unpublish' : 'Publish'}</button>}
            {editable && <button onClick={() => { setMenu(null); setToDelete(a) }} className="w-full flex items-center gap-2 px-2 h-9 rounded-[9px] hover:bg-[var(--clay-dark)] text-[var(--danger)]"><Trash2 size={14} /> Delete</button>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )

  return (
    <Page className="max-w-[1120px] mx-auto pt-7 pb-16 px-4">
      {editable && (
        <div className={cx('clay mb-5', agents.length === 0 ? 'p-8' : 'p-2.5 pl-5')}>
          {agents.length === 0 && <><div className="text-[12px] muted font-semibold">No agents yet</div><h1 className="display text-[26px] font-extrabold mt-1">What should your next agent do?</h1><div className="text-[13px] muted mt-1">Describe it in a sentence. The Co-Create Assistant drafts the name, abilities, instructions and tests; you review and create.</div></>}
          <div className={cx('flex items-center gap-2', agents.length === 0 ? 'mt-4 pressed rounded-[18px] p-2 pl-4' : '')}>
            {agents.length > 0 && <span className="text-[13px] font-semibold whitespace-nowrap hidden md:flex items-center gap-1.5"><Sparkles size={14} className="accent-ink" /> Next agent</span>}
            <input value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && goAsk()} placeholder={agents.length === 0 ? 'Answer IT questions from our handbook and escalate the rest' : 'Describe what it should do and the assistant drafts it…'} className="flex-1 bg-transparent outline-0 text-[14px] min-w-0 h-9" />
            <motion.button whileTap={{ scale: 0.9 }} onClick={goAsk} className="btn btn-primary btn-icon !rounded-full !w-9 !h-9" title="Start"><ArrowUp size={16} /></motion.button>
          </div>
          <div className={cx('flex flex-wrap gap-1.5', agents.length === 0 ? 'mt-4' : 'mt-2')}>
            {starts.map((s) => <button key={s.label} onClick={() => nav(s.tpl ? `/agents/new?template=${s.tpl}` : '/agents/new?mode=manual')} className="chip !h-8 !pl-1.5 hover:text-[var(--text)]"><span className="w-5 h-5 rounded-[6px] grid place-items-center text-white" style={{ background: s.color }}><s.icon size={11} /></span>{s.label}</button>)}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <Segmented value={tab === 'councils' ? 'councils' : 'agents'} onChange={(k) => { setTab(k === 'councils' ? 'councils' : 'all'); setSelected([]); setQ('') }} items={[{ id: 'agents', label: <><Users size={13} className="inline -mt-0.5 mr-1" />Agents <span className="muted">{agents.length}</span></> }, { id: 'councils', label: <><Users size={13} className="inline -mt-0.5 mr-1" />Councils <span className="muted">{councils.length}</span></> }]} />
        {tab !== 'councils' && <Segmented value={tab} onChange={setTab} items={[{ id: 'all', label: <>All <span className="muted">{agents.length}</span></> }, { id: 'live', label: <>Live <span className="muted">{live}</span></> }, { id: 'draft', label: <>Drafts <span className="muted">{agents.length - live}</span></> }]} />}
        <SearchBox value={q} onChange={setQ} placeholder={tab === 'councils' ? 'Search councils' : 'Search agents'} className="w-[220px]" />
        <div className="flex-1" />
        {tab !== 'councils' ? <div className="seg"><button className={cx(view === 'grid' && 'on')} onClick={() => setView('grid')} title="Cards"><LayoutGrid size={14} /></button><button className={cx(view === 'list' && 'on')} onClick={() => setView('list')} title="List"><List size={14} /></button></div>
          : editable ? <Button variant="primary" onClick={() => setTemplates(true)}><Plus size={15} /> New council</Button> : null}
      </div>

      <AnimatePresence>
        {tab !== 'councils' && selected.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-[14px] px-3 h-11 flex items-center gap-3 mb-4 text-[13px]">
            <span className="font-semibold">{selected.length} selected</span>
            <button onClick={() => setSelected(list.map((a) => a.id))} className="muted hover:text-[var(--text)]">Select all {list.length}</button>
            <button onClick={() => setSelected([])} className="muted hover:text-[var(--text)]">Clear</button>
            <div className="flex-1" />
            <Button size="sm" onClick={() => { selected.forEach((id) => { const a = agents.find((x) => x.id === id); if (a && a.status === 'draft') upsertAgent({ ...a, status: 'live', version: a.version + 1 }, 'Published agent') }); setSelected([]) }}><Eye size={13} /> Publish drafts</Button>
            <Button size="sm" className="!text-[var(--danger)]" onClick={() => setBulkDelete(true)}><Trash2 size={13} /> Delete</Button>
          </motion.div>
        )}
      </AnimatePresence>

      {tab !== 'councils' ? (
        agents.length === 0 ? null : list.length === 0 ? <div className="clay"><Empty title="No agents match" body="Try a different search or filter." /></div> : view === 'grid' ? (
          <Stagger className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" delay={0.05}>
            {list.map((a) => <Item key={a.id}><AgentCard a={a} custom={customTools} profiles={profiles} defaultModel={defaultModel} onOpen={() => nav(`/agents/${a.id}`)} onChat={() => nav(`/chat/${a.id}`)} usedIn={usedIn(a)} menu={<AgentMenu a={a} />} selectable={editable} selected={selected.includes(a.id)} onSelect={() => setSelected((s) => (s.includes(a.id) ? s.filter((x) => x !== a.id) : [...s, a.id]))} /></Item>)}
            {editable && <Item><button onClick={() => nav('/agents/new')} className="w-full h-full min-h-[196px] rounded-[24px] border-2 border-dashed border-[var(--line)] flex flex-col items-center justify-center gap-2 text-center hover:bg-[var(--clay-dark)] transition-colors"><span className="clay-sm w-11 h-11 rounded-[14px] grid place-items-center muted"><Plus size={18} /></span><span className="text-[13.5px] font-semibold">New agent</span><span className="text-[12px] muted px-6">Describe it and the assistant drafts the rest, or pick a template</span></button></Item>}
          </Stagger>
        ) : (
          <Stagger className="clay px-3 py-1" delay={0.04}>
            <div className="row text-[11px] font-semibold uppercase tracking-wider muted !py-2"><button onClick={() => setSelected(selected.length === list.length ? [] : list.map((a) => a.id))} className="w-[24px] grid place-items-center muted hover:text-[var(--text)]">{selected.length === list.length && list.length > 0 ? <CheckSquare size={15} /> : <Square size={15} />}</button><span className="w-[40px]" /><span className="flex-1">Agent</span><span className="w-[80px]">Status</span><span className="w-[180px]">Abilities</span><span className="w-[110px]">Thinking</span><span className="w-[90px] text-right">Used in</span><span className="w-[100px] text-right">Updated</span><span className="w-[40px]" /></div>
            {list.map((a) => {
              const u = usedIn(a); return (
                <Item key={a.id}>
                  <div className={cx('row hover cursor-pointer', selected.includes(a.id) && 'bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] rounded-[12px]')} onClick={() => nav(`/agents/${a.id}`)}>
                    <button onClick={(e) => { e.stopPropagation(); setSelected((s) => (s.includes(a.id) ? s.filter((x) => x !== a.id) : [...s, a.id])) }} className={cx('w-[24px] grid place-items-center', selected.includes(a.id) ? 'accent-ink' : 'muted hover:text-[var(--text)]')}>{selected.includes(a.id) ? <CheckSquare size={15} /> : <Square size={15} />}</button>
                    <AgentAvatar name={a.name} icon={a.icon} color={a.color} size={32} />
                    <div className="flex-1 min-w-0"><div className="text-[13.5px] font-medium truncate">{a.name}</div><div className="text-[12px] muted truncate">{a.description || 'No description yet.'}</div></div>
                    <span className="w-[80px]"><Chip tone={a.status === 'live' ? 'ok' : undefined}>{a.status === 'live' ? 'Live' : 'Draft'}</Chip></span>
                    <span className="w-[180px]"><AbilityWells tools={a.tools} custom={customTools} max={5} size={22} /></span>
                    <span className="w-[110px]"><ThinkingMeter model={a.model} profiles={profiles} defaultModel={defaultModel} /></span>
                    <span className="w-[90px] text-right text-[12.5px] muted">{u ? `${u} workflow${u === 1 ? '' : 's'}` : '—'}</span>
                    <span className="w-[100px] text-right text-[12.5px] muted">{since(a.updatedAt)}</span>
                    <span className="w-[40px] text-right"><AgentMenu a={a} /></span>
                  </div>
                </Item>
              )
            })}
          </Stagger>
        )
      ) : councils.length === 0 ? (
        <div className="clay p-8 md:p-10 flex flex-col md:flex-row items-start gap-8">
          <div className="flex-1 min-w-0">
            <span className="chip chip-accent">Multi-agent deliberation</span>
            <h2 className="display text-[22px] font-bold mt-3 leading-tight">Councils: several agents, one recommendation</h2>
            <p className="text-[13.5px] muted mt-2 leading-relaxed max-w-[520px]">A council gives one case to a handful of specialist agents, lets them deliberate by consensus, debate or vote, and hands a single recommendation to a person who decides.</p>
            <div className="flex flex-wrap gap-2 mt-5">
              {councilTemplates.map((t) => (
                <button key={t.name} onClick={() => editable && createCouncil(t)} disabled={!editable} className="flat px-3.5 py-2.5 min-w-[180px] text-left hover:bg-[var(--surface)] transition-colors">
                  <div className="text-[12.5px] font-semibold">{t.name}</div>
                  <div className="text-[11.5px] muted">{t.description}</div>
                </button>
              ))}
            </div>
            {editable && (
              <div className="mt-6">
                <Button variant="primary" onClick={() => setTemplates(true)}><Plus size={15} /> Create a council</Button>
              </div>
            )}
          </div>
          <div className="shrink-0 w-[200px] hidden md:flex flex-col items-center gap-3 self-center">
            <div className="flex -space-x-3">{['search', 'chart', 'shield'].map((ic, i) => <span key={ic} className="rounded-full border-[3px] border-[var(--surface)]"><AgentAvatar name={ic} icon={ic} color={['#0ea5e9', '#10b981', '#6366f1'][i]} size={44} radius={22} /></span>)}</div>
            <div className="w-px h-6 bg-[var(--line)]" />
            <Tile color="#10385b" size={44} radius={22}><Users size={18} /></Tile>
            <div className="w-px h-6 bg-[var(--line)]" />
            <div className="chip !h-7">Recommendation → a person decides</div>
          </div>
        </div>
      ) : clist.length === 0 ? (
        <div className="clay"><Empty title="No councils match" body="Try a different search." /></div>
      ) : (
        <Stagger className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" delay={0.05}>
          {clist.map((c) => {
            const members = c.members.map((id) => agents.find((a) => a.id === id)).filter((a): a is Agent => !!a)
            const gk = users.find((u) => u.id === c.gatekeeper)
            const usedCount = workflows.filter((w) => w.nodes.some((n) => n.data.councilId === c.id)).length
            return (
              <Item key={c.id}>
                <div onClick={() => setOpen(c)} className="clay p-5 flex flex-col gap-3 cursor-pointer hover:translate-y-[-2px] transition-transform min-h-[196px]">
                  <div className="flex items-start gap-3">
                    <Tile color={colorFor(c.name)} size={38} radius={12}><Users size={17} /></Tile>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[14.5px] truncate">{c.name}</div>
                      <div className="text-[11.5px] muted capitalize">{c.mode === 'quorum' ? 'Quorum vote' : c.mode}{gk ? ` · Gatekeeper: ${gk.name}` : ''}</div>
                    </div>
                    <Chip tone={c.status === 'live' ? 'ok' : undefined}>{c.status === 'live' ? 'Live' : 'Draft'}</Chip>
                  </div>
                  <p className="text-[12.5px] muted line-clamp-2 flex-1">{c.description || 'Specialist agents deliberate and hand one recommendation to a gatekeeper.'}</p>
                  <div className="flex items-center justify-between pt-2 border-t hairline">
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-2">
                        {members.slice(0, 4).map((m) => (
                          <span key={m.id} className="rounded-full border-2 border-[var(--surface)]" title={m.name}>
                            <AgentAvatar name={m.name} icon={m.icon} color={m.color} size={24} radius={12} />
                          </span>
                        ))}
                      </div>
                      <span className="text-[11.5px] muted">{members.length} {members.length === 1 ? 'agent' : 'agents'}{usedCount ? ` · ${usedCount} flow${usedCount === 1 ? '' : 's'}` : ''}</span>
                    </div>
                    <span className="text-[12px] font-medium accent-ink">Open</span>
                  </div>
                </div>
              </Item>
            )
          })}
          {editable && (
            <Item>
              <button onClick={() => setTemplates(true)} className="w-full h-full min-h-[196px] rounded-[24px] border-2 border-dashed border-[var(--line)] flex flex-col items-center justify-center gap-2 text-center hover:bg-[var(--clay-dark)] transition-colors">
                <span className="clay-sm w-11 h-11 rounded-[14px] grid place-items-center muted"><Plus size={18} /></span>
                <span className="text-[13.5px] font-semibold">New council</span>
                <span className="text-[12px] muted px-6">Pick a deliberation template or choose specialist agents yourself</span>
              </button>
            </Item>
          )}
        </Stagger>
      )}

      <Confirm open={!!toDelete} onClose={() => setToDelete(null)} title={`Delete ${toDelete?.name}?`} danger confirmLabel="Delete" onConfirm={() => toDelete && deleteAgent(toDelete.id)} body={toDelete && (usedIn(toDelete) > 0 ? `This agent is used by ${usedIn(toDelete)} workflow${usedIn(toDelete) === 1 ? '' : 's'}; those steps will need a new agent. Its chat history and versions are removed.` : 'Its chat history and versions are removed. This cannot be undone.')} />
      <Confirm open={bulkDelete} onClose={() => setBulkDelete(false)} title={`Delete ${selected.length} agent${selected.length === 1 ? '' : 's'}?`} danger confirmLabel="Delete" body="Their chat history and versions are removed. Workflow steps that use them will need a new agent." onConfirm={() => { selected.forEach((id) => deleteAgent(id)); setSelected([]) }} />
      <Modal open={templates} onClose={() => setTemplates(false)} title="New council" width={560}>
        <div className="flex flex-col gap-2">
          {councilTemplates.map((t) => <button key={t.name} onClick={() => createCouncil(t)} className="flat p-4 text-left hover:bg-[var(--surface)]"><div className="text-[13.5px] font-semibold">{t.name}</div><div className="text-[12px] muted">{t.description} · {t.mode}</div></button>)}
          <button onClick={() => createCouncil()} className="flat p-4 text-left hover:bg-[var(--surface)]"><div className="text-[13.5px] font-semibold">Blank council</div><div className="text-[12px] muted">Choose members and a deliberation mode yourself.</div></button>
        </div>
      </Modal>
      <CouncilDrawer council={open} editable={editable} onSave={(c) => { upsertCouncil(c); setOpen(c) }} onClose={() => setOpen(null)} onDelete={(id) => { deleteCouncil(id); setOpen(null) }} />
    </Page>
  )
}

function CouncilDrawer({ council, editable, onSave, onClose, onDelete }: { council: Council | null; editable: boolean; onSave: (c: Council) => void; onClose: () => void; onDelete: (id: string) => void }) {
  const nav = useNavigate()
  const store = useApp()
  const { agents, users, apiKey, libraries, models, customTools } = store
  const [draft, setDraft] = useState<Council | null>(council)
  const [tab, setTab] = useState<'setup' | 'simulate'>('setup')
  const [caseText, setCaseText] = useState('Proposal: move our customer support knowledge base to a new vendor next quarter. Budget 40,000, migration in 6 weeks, two engineers.')
  const [findings, setFindings] = useState<{ agent: string; text: string }[]>([])
  const [synthesis, setSynthesis] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  useEffect(() => { setDraft(council); setTab('setup'); setFindings([]); setSynthesis('') }, [council])
  if (!draft) return null
  const set = (p: Partial<Council>) => setDraft((d) => d && ({ ...d, ...p }))
  const dirty = JSON.stringify(draft) !== JSON.stringify(council)
  const validMembers = draft.members.filter((id) => agents.some((a) => a.id === id))
  const simulate = async () => {
    if (!apiKey) { setSynthesis('Models are not available right now.'); return }
    if (!caseText.trim()) { setSynthesis('Write a case for the council first.'); return }
    setBusy(true); setFindings([]); setSynthesis('')
    try {
      const out: { agent: string; text: string }[] = []
      for (const id of validMembers) {
        const a = agents.find((x) => x.id === id); if (!a) continue
        let text = ''
        for await (const ev of runAgentTurn({ key: apiKey, model: a.model, models: profileModels(store), custom: customTools, autonomy: 1, instructions: a.instructions + '\n\nYou are a member of a council. Give your findings on the case in under 120 words, with a clear position (Approve / Reject / Need more info). Use tools if they help.', tools: a.tools, libraries: libraries.filter((l) => a.knowledge.includes(l.id)), history: [{ role: 'user', content: caseText }], maxRounds: 4 })) {
          if (ev.type === 'text') { text += ev.text; setFindings([...out, { agent: a.name, text }]) }
          if (ev.type === 'done') store.recordSpend(ev.usage?.cost ?? 0)
          if (ev.type === 'error') { text += `${text ? '\n\n' : ''}(could not respond: ${ev.message})`; setFindings([...out, { agent: a.name, text }]) }
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
    } catch (e) { setSynthesis(`Error: ${e instanceof Error ? e.message : String(e)}`) }
    finally { setBusy(false) }
  }
  return (
    <Drawer open={!!council} onClose={onClose} title={draft.name} width={600}>
      <div className="flex items-center gap-2 mb-4">
        <Segmented value={tab} onChange={setTab} items={[{ id: 'setup', label: 'Setup' }, { id: 'simulate', label: 'Simulate' }]} />
        <div className="flex-1" />
        {editable && dirty && <Button size="sm" variant="primary" onClick={() => onSave(draft)}><Check size={13} /> Save</Button>}
        {editable && !dirty && draft.status === 'draft' && <Button size="sm" variant="primary" onClick={() => { const n = { ...draft, status: 'live' as const }; setDraft(n); onSave(n) }}>Publish</Button>}
      </div>
      {tab === 'setup' ? (
        <div className="flex flex-col gap-4">
          <Field label="Name"><Input value={draft.name} disabled={!editable} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Purpose"><Textarea rows={2} value={draft.description} disabled={!editable} onChange={(e) => set({ description: e.target.value })} /></Field>
          <Field label={`Members · ${draft.members.filter((id) => agents.some((a) => a.id === id)).length} selected`} hint={editable ? 'Switch agents on to add them to the council, then press Save.' : undefined}>
            {agents.length === 0 ? (
              <div className="flat p-4 text-[12.5px] muted flex items-center justify-between gap-3">
                <span>There are no agents yet. A council needs at least one agent to deliberate.</span>
                {editable && <Button size="sm" onClick={() => nav('/agents/new')}><Plus size={13} /> Create an agent</Button>}
              </div>
            ) : (
              <div className="flat divide-y divide-[var(--line)]">{agents.map((a) => <div key={a.id} className="flex items-center gap-3 px-3 h-11"><AgentAvatar name={a.name} icon={a.icon} color={a.color} size={24} /><span className="flex-1 text-[13px]">{a.name}{a.status === 'draft' && <span className="muted"> · draft</span>}</span><Toggle disabled={!editable} checked={draft.members.includes(a.id)} onChange={(v) => setDraft((d) => d && ({ ...d, members: v ? (d.members.includes(a.id) ? d.members : [...d.members, a.id]) : d.members.filter((m) => m !== a.id) }))} /></div>)}</div>
            )}
          </Field>
          <Field label="Deliberation mode"><Segmented value={draft.mode} onChange={(m) => editable && set({ mode: m })} items={[{ id: 'consensus', label: 'Consensus' }, { id: 'debate', label: 'Debate' }, { id: 'quorum', label: 'Quorum vote' }]} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gatekeeper"><Select value={draft.gatekeeper} disabled={!editable} onChange={(e) => set({ gatekeeper: e.target.value })}>{users.filter((u) => u.role === 'approver' || u.role === 'security' || u.role === 'admin' || u.id === draft.gatekeeper).map((u) => <option key={u.id} value={u.id}>{u.name} · {roleLabel[u.role]}</option>)}</Select></Field>
            <Field label="Synthesis model">{models.length ? <Select value={draft.model} disabled={!editable} onChange={(e) => set({ model: e.target.value })}>{!models.some((m) => m.id === draft.model) && <option value={draft.model}>{draft.model}</option>}{models.filter((m) => m.supported_parameters?.includes('tools')).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select> : <Input value={draft.model} disabled={!editable} onChange={(e) => set({ model: e.target.value })} />}</Field>
          </div>
          {editable && <div className="flex items-center gap-2 pt-2"><Button size="sm" onClick={() => nav(`/workflows/new?template=standard&council=${draft.id}`)}><WorkflowIcon size={13} /> Use in a workflow</Button><div className="flex-1" /><button onClick={() => setConfirmDel(true)} className="text-[12px] font-medium text-[var(--danger)] inline-flex items-center gap-1 hover:underline"><Trash2 size={12} /> Delete</button></div>}
          <Confirm open={confirmDel} onClose={() => setConfirmDel(false)} title={`Delete ${draft.name}?`} danger confirmLabel="Delete" body="Workflow steps that use this council will need a new one." onConfirm={() => onDelete(draft.id)} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="Case"><Textarea rows={4} value={caseText} onChange={(e) => setCaseText(e.target.value)} /></Field>
          <Button variant="primary" onClick={simulate} disabled={busy || !validMembers.length}><Play size={14} /> {busy ? 'Deliberating…' : 'Simulate deliberation'}</Button>
          {!validMembers.length && <div className="text-[12px] muted -mt-2">Add at least one member on the Setup tab first.</div>}
          {findings.map((f, i) => <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flat p-3"><div className="text-[12px] font-semibold mb-1 flex items-center gap-2">{(() => { const a = agents.find((x) => x.name === f.agent); return <AgentAvatar name={f.agent} icon={a?.icon} color={a?.color} size={20} radius={6} /> })()}{f.agent}</div><Md className="prose-chat text-[12.5px]">{f.text || '…'}</Md></motion.div>)}
          {synthesis && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="clay-sm p-4"><div className="text-[12px] font-semibold mb-1">Council recommendation · for {users.find((u) => u.id === draft.gatekeeper)?.name}</div><Md className="prose-chat text-[13px]">{synthesis}</Md></motion.div>}
        </div>
      )}
    </Drawer>
  )
}

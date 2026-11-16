// Agent page: Abilities / Behaviour / Knowledge / Instructions / Versions, readiness ring, Test drive.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useBlocker, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Sparkles, ArrowUp, Trash2, Lock, RotateCcw, Download, Upload, History, Copy, MessageSquare, Check, X, Workflow as WorkflowIcon, MoreHorizontal, Blocks, SlidersHorizontal, BookOpen, FileText, ChevronDown, ChevronRight, FlaskConical, Play, Loader2, Plus, Sparkles as SparklesIcon } from 'lucide-react'
import { useApp, useUser, can, profileModels } from '@/store/app'
import { BRAND, type Agent, type Autonomy, type AgentTest } from '@/lib/data'
import { runTest, draftTests } from '@/lib/evals'
import { parseJsonLoose } from '@/lib/json'
import { streamChat, listModels } from '@/lib/openrouter'
import { TOOLS } from '@/lib/tools'
import { abilities, THINKING, INDEPENDENCE, TONES, applyTonesToInstructions, readiness, thinkingOf } from '@/lib/agentVocab'
import { Button, Chip, Confirm, Input, Textarea, Select, cx } from '@/components/ui'
import { Page } from '@/components/motion'
import { Thread, Composer, useAgentChat } from '@/components/ChatThread'
import { AgentAvatar, AvatarPicker } from '@/components/AgentAvatar'
import { ReadinessRing, thinkingLabel } from '@/components/AgentBits'

const download = (name: string, data: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = name; a.click() }
const ASSISTANT_NAME = `${BRAND.name} Assistant`
type Tab = 'abilities' | 'behaviour' | 'knowledge' | 'instructions' | 'tests' | 'versions'
const TABS: { id: Tab; label: string; icon: typeof Blocks }[] = [{ id: 'abilities', label: 'Abilities', icon: Blocks }, { id: 'behaviour', label: 'Behaviour', icon: SlidersHorizontal }, { id: 'knowledge', label: 'Knowledge', icon: BookOpen }, { id: 'instructions', label: 'Instructions', icon: FileText }, { id: 'tests', label: 'Tests', icon: FlaskConical }, { id: 'versions', label: 'Versions', icon: History }]

export default function AgentEditor() {
  const { agentId } = useParams()
  const nav = useNavigate()
  const user = useUser()!
  const store = useApp()
  const { agents, workflows, upsertAgent, rollbackAgent, deleteAgent, touchAgentTested, apiKey, defaultModel, models, setModels, libraries, customTools, profiles } = store
  const stored = agents.find((a) => a.id === agentId)
  const [draft, setDraft] = useState<Agent | undefined>(stored)
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>((['abilities', 'behaviour', 'knowledge', 'instructions', 'tests', 'versions'] as Tab[]).includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'abilities')
  const [testing, setTesting] = useState<Set<string>>(new Set())
  const [writingTests, setWritingTests] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [exact, setExact] = useState(false)
  const [assist, setAssist] = useState<{ open: boolean; input: string; busy: boolean; log: { role: 'user' | 'assistant'; text: string }[] }>({ open: false, input: '', busy: false, log: [] })
  const [confirm, setConfirm] = useState<null | { kind: 'delete' } | { kind: 'rollback'; version: number } | { kind: 'publish' } | { kind: 'unpublish' }>(null)
  const [toast, setToast] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const editable = can(user, 'build')
  const abil = useMemo(() => abilities(customTools), [customTools])

  const navBypassRef = useRef(false)
  useEffect(() => { if (stored && (!draft || draft.id !== stored.id || stored.version > (draft?.version ?? 0))) setDraft(stored) }, [stored]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!models.length && apiKey) listModels(apiKey).then(setModels).catch(() => { }) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2600); return () => clearTimeout(t) }, [toast])
  const autoRan = useRef(false)
  useEffect(() => { if (params.get('run') === '1' && stored && apiKey && !autoRan.current) { autoRan.current = true; setParams({ tab: 'tests' }, { replace: true }); setTimeout(() => { (stored.tests ?? []).filter((x) => x.prompt.trim() && x.expect.trim()).reduce((p, t) => p.then(() => runOneRef.current(t)), Promise.resolve()) }, 50) } }, [params, stored, apiKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const runOneRef = useRef<(t: AgentTest) => Promise<void>>(async () => { })
  const chat = useAgentChat(draft ?? { id: '', name: '', description: '', instructions: '', model: '', tools: [], knowledge: [], samplePrompts: [] })
  useEffect(() => { if (draft && chat.msgs.length > 0 && !draft.testedAt) { touchAgentTested(draft.id); setDraft({ ...draft, testedAt: new Date().toISOString() }) } }, [chat.msgs.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const hasGated = !!draft && draft.tools.some((t) => TOOLS.find((x) => x.name === t)?.write)
  useEffect(() => { if (draft && hasGated && draft.autonomy === 3) setDraft({ ...draft, autonomy: 2 }) }, [hasGated]) // eslint-disable-line react-hooks/exhaustive-deps

  const stripAgent = (a: Agent) => JSON.stringify({ id: a.id, name: a.name, description: a.description, instructions: a.instructions, model: a.model, tools: a.tools, knowledge: a.knowledge, samplePrompts: a.samplePrompts, autonomy: a.autonomy, status: a.status, icon: a.icon ?? null, color: a.color ?? null, tones: a.tones ?? [], tests: a.tests ?? [] })
  const dirty = !!draft && !!stored && stripAgent(draft) !== stripAgent(stored)
  const blocker = useBlocker(() => !navBypassRef.current && dirty)
  useEffect(() => { const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h) }, [dirty])
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (dirty && editable) save() } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) })

  if (!draft) return <div className="muted p-8">Agent not found.</div>
  const set = (p: Partial<Agent>) => setDraft((d) => (d ? { ...d, ...p } : d))
  const ready = readiness(draft, { tested: !!draft.testedAt || chat.msgs.length > 0 })
  const usedBy = workflows.filter((w) => w.nodes.some((n) => n.data.agentId === draft.id))
  const thinking = thinkingOf(draft, profiles, defaultModel)
  const modelName = (id: string) => models.find((m) => m.id === id)?.name ?? id
  const toolModels = models.filter((m) => m.supported_parameters?.includes('tools'))
  function save(status?: Agent['status']) {
    if (!draft) return
    const n = { ...draft, status: status ?? draft.status, version: dirty || status ? draft.version + 1 : draft.version, updatedAt: new Date().toISOString().slice(0, 10) }
    upsertAgent(n, status === 'live' ? 'Published agent' : status === 'draft' ? 'Unpublished agent' : undefined); setDraft(n)
    setToast(status === 'live' ? 'Published. Available in Chat and workflows.' : status === 'draft' ? 'Unpublished. Saved as a draft.' : `Saved as v${n.version}.`)
  }
  const tests: AgentTest[] = draft.tests ?? []
  const saveTests = (next: AgentTest[]) => { set({ tests: next }); store.setAgentTests(draft.id, next) }
  const evalCtx = () => ({ key: apiKey, models: profileModels(store), custom: customTools, libraries, onSpend: (c: number) => store.recordSpend(c) })
  const runOne = async (t: AgentTest) => {
    if (!apiKey || testing.has(t.id)) return
    setTesting((x) => new Set([...x, t.id]))
    try { const last = await runTest(draft, t, evalCtx()); const cur = useApp.getState().agents.find((a) => a.id === draft.id)?.tests ?? draft.tests ?? []; const next = (cur.some((x) => x.id === t.id) ? cur : [...cur, t]).map((x) => (x.id === t.id ? { ...x, last } : x)); store.setAgentTests(draft.id, next); setDraft((d) => (d ? { ...d, tests: (d.tests ?? []).map((x) => (x.id === t.id ? { ...x, last } : x)) } : d)) }
    finally { setTesting((x) => { const n = new Set(x); n.delete(t.id); return n }) }
  }
  runOneRef.current = runOne
  const runAll = async () => { for (const t of tests.filter((x) => x.prompt.trim() && x.expect.trim())) await runOne(t) }
  const writeTests = async () => {
    if (!apiKey) return
    setWritingTests(true)
    try { const drafted = await draftTests(draft, evalCtx()); saveTests([...tests, ...drafted.map((t, i) => ({ id: `t${Date.now().toString(36)}${i}`, ...t }))]) } catch { setToast('Could not write tests. Try again.') }
    finally { setWritingTests(false) }
  }
  const runAssist = async (text: string) => {
    const q = text.trim(); if (!q || assist.busy || !apiKey) return
    setAssist((a) => ({ ...a, busy: true, input: '', log: [...a.log, { role: 'user', text: q }], open: true }))
    const sys = `You are ${ASSISTANT_NAME}, helping a person design an AI agent on a governed platform. Current agent card as JSON:\n${JSON.stringify({ name: draft.name, description: draft.description, instructions: draft.instructions, tools: draft.tools, samplePrompts: draft.samplePrompts, autonomy: draft.autonomy, tones: draft.tones ?? [] })}\nAvailable abilities (tool ids): ${abil.map((a) => `${a.id} (${a.label})`).join('; ')}.\nApply the person's request. Reply ONLY with JSON: {"patch": {any of name, description, instructions, tools, samplePrompts, autonomy that should change}, "note": "one or two sentences on what you changed and why"}. Keep instructions complete (not a diff), in second person, and keep the governed tone: recommend, never execute; ask when unsure.`
    let acc = ''
    try {
      for await (const ev of streamChat({ key: apiKey, model: defaultModel, messages: [{ role: 'system', content: sys }, { role: 'user', content: q }], temperature: 0.3 })) { if (ev.type === 'delta') acc += ev.text; if (ev.type === 'usage') store.recordSpend(ev.usage.cost ?? 0) }
      const j = parseJsonLoose(acc)
      const p = j.patch ?? {}; const patch: Partial<Agent> = {}
      if (typeof p.name === 'string') patch.name = p.name
      if (typeof p.description === 'string') patch.description = p.description
      if (typeof p.instructions === 'string') patch.instructions = p.instructions
      if (Array.isArray(p.tools)) patch.tools = p.tools.filter((t: string) => abil.some((a) => a.id === t))
      if (Array.isArray(p.samplePrompts)) patch.samplePrompts = p.samplePrompts.filter((s: unknown) => typeof s === 'string')
      if ([1, 2, 3].includes(p.autonomy)) patch.autonomy = p.autonomy
      set(patch)
      setAssist((a) => ({ ...a, busy: false, log: [...a.log, { role: 'assistant', text: (j.note ?? 'Updated.') + (Object.keys(patch).length ? ` (changed: ${Object.keys(patch).join(', ')})` : '') }] }))
    } catch { setAssist((a) => ({ ...a, busy: false, log: [...a.log, { role: 'assistant', text: acc.slice(0, 300) || 'I could not apply that. Try rephrasing.' }] })) }
  }
  const fixForMe = () => { const missing = ready.items.filter((i) => !i.ok && i.fixable).map((i) => i.label); setTab('instructions'); runAssist(`Fix these readiness items without changing the agent's purpose: ${missing.join('; ')}. Keep everything else as it is.`) }
  const importJson = (f: File) => { const r = new FileReader(); r.onload = () => { try { const j = JSON.parse(String(r.result)); set({ name: j.name ?? draft.name, description: j.description ?? draft.description, instructions: j.instructions ?? draft.instructions, model: j.model ?? draft.model, tools: Array.isArray(j.tools) ? j.tools : draft.tools, knowledge: Array.isArray(j.knowledge) ? j.knowledge : draft.knowledge, autonomy: j.autonomy ?? draft.autonomy, samplePrompts: Array.isArray(j.samplePrompts) ? j.samplePrompts : draft.samplePrompts, icon: j.icon ?? draft.icon, color: j.color ?? draft.color }); setToast('Imported. Review and save.') } catch { setToast('That file is not a valid agent export.') } }; r.readAsText(f) }
  const duplicate = () => {
    const id = `agent-${Date.now().toString(36)}`
    navBypassRef.current = true
    upsertAgent({ ...draft, id, name: `${draft.name} (copy)`, status: 'draft', version: 1, history: undefined, testedAt: undefined, createdBy: user.id, updatedAt: new Date().toISOString().slice(0, 10) })
    nav(`/agents/${id}`)
    setTimeout(() => { navBypassRef.current = false }, 0)
  }
  const toggleTone = (t: string) => { const tones = new Set(draft.tones ?? []); tones.has(t) ? tones.delete(t) : tones.add(t); set({ tones: [...tones], instructions: applyTonesToInstructions(draft.instructions, [...tones]) }) }
  const cats = ['Web', 'Reasoning', 'Knowledge', 'Actions', 'Custom'] as const
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
          <input value={draft.name} onChange={(e) => set({ name: e.target.value })} disabled={!editable} placeholder="Agent name" className="display font-bold text-[15px] bg-transparent outline-0 w-[300px]" />
          <span className="text-[11px] muted truncate">{draft.status === 'live' ? 'Live' : 'Draft'} · v{draft.version}{usedBy.length ? ` · used in ${usedBy.length} workflow${usedBy.length === 1 ? '' : 's'}` : ''}{dirty ? ' · unsaved changes' : ''}</span>
        </div>
        <div className="flex-1" />
        <AnimatePresence>{toast && <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[12px] font-medium text-[var(--ok)] flex items-center gap-1"><Check size={13} /> {toast}</motion.span>}</AnimatePresence>
        <Button size="sm" onClick={() => nav(`/chat/${draft.id}`)}><MessageSquare size={13} /> {draft.status === 'live' ? 'Open in Chat' : 'Try in Chat'}</Button>
        {editable && <Button onClick={() => save()} disabled={!dirty}>Save</Button>}
        {editable && (draft.status === 'draft' ? <Button variant="primary" onClick={() => (ready.score < ready.total ? setConfirm({ kind: 'publish' }) : save('live'))}>Publish</Button> : <Button onClick={() => setConfirm({ kind: 'unpublish' })}><RotateCcw size={13} /> Unpublish</Button>)}
        <div className="relative">
          <button onClick={() => setMoreOpen((o) => !o)} className="btn btn-ghost btn-icon" title="More actions"><MoreHorizontal size={16} /></button>
          <AnimatePresence>{moreOpen && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute right-0 top-full mt-1 w-[200px] glass rounded-[14px] p-1.5 z-30 text-[13px]" onClick={() => setMoreOpen(false)}>
              {editable && <button onClick={duplicate} className="w-full flex items-center gap-2 px-2 h-9 rounded-[9px] hover:bg-[var(--clay-dark)]"><Copy size={14} /> Duplicate</button>}
              <button onClick={() => download(`${draft.name.replace(/\s+/g, '-').toLowerCase()}.agent.json`, JSON.stringify({ name: draft.name, description: draft.description, instructions: draft.instructions, model: draft.model, tools: draft.tools, knowledge: draft.knowledge, autonomy: draft.autonomy, samplePrompts: draft.samplePrompts, icon: draft.icon, color: draft.color, tones: draft.tones }, null, 2))} className="w-full flex items-center gap-2 px-2 h-9 rounded-[9px] hover:bg-[var(--clay-dark)]"><Download size={14} /> Export JSON</button>
              {editable && <button onClick={() => fileRef.current?.click()} className="w-full flex items-center gap-2 px-2 h-9 rounded-[9px] hover:bg-[var(--clay-dark)]"><Upload size={14} /> Import JSON</button>}
              {editable && <button onClick={() => setConfirm({ kind: 'delete' })} className="w-full flex items-center gap-2 px-2 h-9 rounded-[9px] hover:bg-[var(--clay-dark)] text-[var(--danger)]"><Trash2 size={14} /> Delete agent</button>}
            </motion.div>
          )}</AnimatePresence>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = '' }} />
        </div>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_minmax(380px,0.8fr)] gap-3" onClick={() => { if (avatarOpen) setAvatarOpen(false); if (moreOpen) setMoreOpen(false) }}>
        <div className="clay flex flex-col min-h-0">
          <div className="px-4 pt-3 flex items-center gap-1 border-b hairline pb-3">
            {TABS.map((t) => <button key={t.id} onClick={() => setTab(t.id)} className={cx('h-9 px-3 rounded-[10px] text-[12.5px] font-semibold inline-flex items-center gap-1.5', tab === t.id ? 'bg-[var(--surface-2)] shadow-[0_1px_2px_rgba(16,24,40,.06)]' : 'muted hover:text-[var(--text)]')}><t.icon size={14} /> {t.label}</button>)}
          </div>
          <fieldset disabled={!editable} className="flex-1 min-h-0 scroll px-6 py-5 flex flex-col gap-5 disabled:opacity-80">
            {draft.status === 'draft' && (
              <div className="flat p-4 flex items-center gap-4">
                <ReadinessRing score={ready.score} total={ready.total} />
                <div className="flex-1 min-w-0"><div className="text-[13.5px] font-semibold">{ready.score === ready.total ? 'Ready to publish' : ready.score >= ready.total - 2 ? 'Almost ready to publish' : 'Getting there'}</div><div className="text-[12px] muted truncate">{ready.items.filter((i) => !i.ok).map((i) => i.label).slice(0, 2).join(' · ') || 'Everything on the checklist is done.'}</div></div>
                {apiKey && ready.items.some((i) => !i.ok && i.fixable) && <Button size="sm" onClick={fixForMe} disabled={assist.busy}><Sparkles size={13} /> Fix for me</Button>}
                {ready.score === ready.total && <Button size="sm" variant="primary" onClick={() => save('live')}>Publish</Button>}
              </div>
            )}

            {tab === 'abilities' && <>
              <div><h2 className="display text-[18px] font-bold">What can it do?</h2><div className="text-[12.5px] muted">Tap to switch abilities on. A lock means it always asks a person first.</div></div>
              {cats.filter((c) => abil.some((a) => a.category === c)).map((c) => (
                <div key={c}><div className="text-[11px] font-semibold uppercase tracking-wider muted mb-2">{c === 'Custom' ? 'Your APIs' : c}</div>
                  <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">{abil.filter((a) => a.category === c).map((a) => {
                    const on = draft.tools.includes(a.id); const I = a.icon; return (
                      <button type="button" key={a.id} aria-pressed={on} aria-label={`${a.label}: ${on ? 'on' : 'off'}`} onClick={() => set({ tools: on ? draft.tools.filter((t) => t !== a.id) : [...draft.tools, a.id] })} className={cx('flat p-3 text-left flex items-center gap-3 relative transition-all', on && 'border-[var(--accent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]')}>
                        <span className={cx('w-9 h-9 rounded-[10px] grid place-items-center shrink-0', on ? 'bg-[var(--accent)] text-white' : 'pressed muted')}><I size={16} /></span>
                        <span className="min-w-0"><span className="block text-[13px] font-semibold">{a.label}</span><span className="block text-[11px] muted">{a.sub}</span></span>
                        {a.gated && <Lock size={11} className="absolute top-2.5 right-2.5 text-[var(--warn)]" />}
                        {on && <Check size={14} className="ml-auto accent-ink shrink-0" />}
                      </button>
                    )
                  })}</div></div>
              ))}
              <div className="text-[12px] muted">Need an ability that is not here? Add your own API under <button type="button" onClick={() => nav('/tools')} className="accent-ink font-medium hover:underline">Tools</button>.</div>
            </>}

            {tab === 'behaviour' && <>
              <div><h2 className="display text-[18px] font-bold">How should it work?</h2><div className="text-[12.5px] muted">Thinking depth sets the model. Independence sets what it may do alone.</div></div>
              <div><div className="text-[12px] font-semibold mb-2">Thinking</div>
                <div className="grid grid-cols-3 gap-2">{THINKING.map((t) => { const id = profiles.find((p) => p.id === t.id)?.model ?? defaultModel; const on = draft.model === id; const I = t.icon; return <button type="button" key={t.id} onClick={() => set({ model: id })} className={cx('flat p-4 text-left flex flex-col gap-2', on && 'border-[var(--accent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]')}><span className="flex items-end gap-1 h-5">{[8, 13, 18].map((h, i) => <i key={i} className={cx('block w-1.5 rounded-[2px]', i < t.level ? (on ? 'bg-[var(--accent)]' : 'bg-[var(--muted)]') : 'bg-[var(--clay-dark)]')} style={{ height: h }} />)}</span><span className="text-[13.5px] font-semibold flex items-center gap-1.5"><I size={13} /> {t.label}</span><span className="text-[11.5px] muted">{t.desc}</span><span className="text-[10.5px] muted truncate">{modelName(id)}</span></button> })}</div>
                <button type="button" onClick={() => setExact((e) => !e)} className="mt-2 text-[12px] muted hover:text-[var(--text)] inline-flex items-center gap-1">{exact ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {thinking ? 'Choose an exact model instead' : `Using a specific model: ${modelName(draft.model)}`}</button>
                {(exact || !thinking) && (toolModels.length ? <Select value={draft.model} onChange={(e) => set({ model: e.target.value })} className="mt-2">{!toolModels.some((m) => m.id === draft.model) && <option value={draft.model}>{modelName(draft.model)}</option>}{toolModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select> : <Input value={draft.model} onChange={(e) => set({ model: e.target.value })} className="mt-2" />)}
              </div>
              <div><div className="text-[12px] font-semibold mb-2">Independence</div>
                <div className="grid grid-cols-3 gap-2">{INDEPENDENCE.map((o) => { const locked = o.level === 3 && hasGated; const on = draft.autonomy === o.level; const I = o.icon; return <button type="button" key={o.level} disabled={locked} onClick={() => set({ autonomy: o.level as Autonomy })} className={cx('flat p-4 text-left flex flex-col gap-2 disabled:opacity-50', on && 'border-[var(--accent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]')}><span className={cx('w-10 h-10 rounded-[12px] grid place-items-center', on ? 'bg-[var(--accent)] text-white' : 'pressed muted')}><I size={17} /></span><span className="text-[13.5px] font-semibold">{o.label}{locked && <Lock size={11} className="inline ml-1.5 muted" />}</span><span className="text-[11.5px] muted">{locked ? 'Not available with abilities that ask a person.' : o.desc}</span></button> })}</div>
              </div>
              <div><div className="text-[12px] font-semibold mb-2">Personality <span className="muted font-normal">· updates the "How you answer" line in the instructions</span></div><div className="flex flex-wrap gap-2">{TONES.map((t) => { const on = (draft.tones ?? []).includes(t); return <button type="button" key={t} onClick={() => toggleTone(t)} className={cx('chip !h-9 !px-3 hover:text-[var(--text)]', on && 'chip-accent')}>{on && <Check size={12} />}{t}</button> })}</div></div>
            </>}

            {tab === 'knowledge' && <>
              <div><h2 className="display text-[18px] font-bold">Knowledge</h2><div className="text-[12.5px] muted">Libraries this agent can search and cite.</div></div>
              <div className="flat divide-y divide-[var(--line)]">
                {libraries.map((l) => { const on = draft.knowledge.includes(l.id); return <label key={l.id} className="flex items-center gap-3 px-3 h-12 cursor-pointer"><span className={cx('w-8 h-8 rounded-[9px] grid place-items-center', on ? 'bg-[var(--accent)] text-white' : 'pressed muted')}><BookOpen size={14} /></span><span className="flex-1 min-w-0"><span className="block text-[13px] font-medium">{l.name}</span><span className="block text-[11.5px] muted">{l.docs.length} document{l.docs.length === 1 ? '' : 's'}</span></span><input type="checkbox" className="accent-[var(--accent)] w-4 h-4" checked={on} onChange={(e) => set({ knowledge: e.target.checked ? [...draft.knowledge, l.id] : draft.knowledge.filter((x) => x !== l.id), tools: e.target.checked && !draft.tools.includes('search_knowledge') ? [...draft.tools, 'search_knowledge'] : draft.tools })} /></label> })}
              </div>
              <div className="text-[12px] muted">Add documents under <button type="button" onClick={() => nav('/knowledge')} className="accent-ink font-medium hover:underline">Knowledge</button>. Attaching a library switches on the "Your knowledge" ability.</div>
            </>}

            {tab === 'instructions' && <>
              <div className="clay-sm p-3">
                <button type="button" onClick={() => setAssist((a) => ({ ...a, open: !a.open }))} className="w-full flex items-center gap-3 text-left">
                  <span className="w-8 h-8 rounded-[10px] grid place-items-center text-white shrink-0" style={{ background: 'linear-gradient(145deg,#1a4a73,#10385b)' }}><Sparkles size={15} /></span>
                  <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold">{ASSISTANT_NAME}</div><div className="text-[11.5px] muted truncate">{apiKey ? 'Describe a change and the card updates: instructions, abilities, sample prompts, name.' : 'Not available right now.'}</div></div>
                  {apiKey && (assist.open ? <ChevronDown size={16} className="muted" /> : <ChevronRight size={16} className="muted" />)}
                </button>
                <AnimatePresence>{assist.open && apiKey && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden"><div className="mt-3 flex flex-col gap-2">
                    {assist.log.length === 0 && <div className="flex flex-wrap gap-1.5">{['Make the instructions more specific and structured', 'Add an escalation rule for uncertainty', 'Write three sample prompts', 'Make the tone warmer and shorter'].map((s) => <button key={s} type="button" onClick={() => runAssist(s)} className="chip hover:text-[var(--text)]">{s}</button>)}</div>}
                    {assist.log.map((m, i) => <div key={i} className={cx('text-[12.5px] px-3 py-2 rounded-[12px] max-w-[92%]', m.role === 'user' ? 'self-end bg-[var(--surface-2)] border hairline' : 'self-start muted')}>{m.text}</div>)}
                    {assist.busy && <div className="text-[12px] muted px-1">Working…</div>}
                    <div className="flat p-1.5 pl-3 flex items-center gap-2"><input value={assist.input} onChange={(e) => setAssist((a) => ({ ...a, input: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && runAssist(assist.input)} placeholder="e.g. only answer questions about HR policy and refuse everything else" className="flex-1 bg-transparent outline-0 text-[13px]" /><button type="button" onClick={() => runAssist(assist.input)} disabled={assist.busy || !assist.input.trim()} className="btn btn-primary btn-sm btn-icon !rounded-full"><ArrowUp size={14} /></button></div>
                  </div></motion.div>
                )}</AnimatePresence>
              </div>
              <div><div className="text-[12px] font-semibold mb-1.5">What it does <span className="muted font-normal">· one line, shown on the card</span></div><Input value={draft.description} onChange={(e) => set({ description: e.target.value })} placeholder="e.g. Answers HR policy questions from the handbook and escalates exceptions" /></div>
              <div><div className="flex items-center justify-between mb-1.5"><div className="text-[12px] font-semibold">Instructions <span className="muted font-normal">· the system prompt</span></div><span className="text-[11px] muted tabular-nums">{draft.instructions.length} chars</span></div><Textarea rows={14} value={draft.instructions} onChange={(e) => set({ instructions: e.target.value })} className="!leading-relaxed" /></div>
              <div><div className="text-[12px] font-semibold mb-1.5">Sample prompts <span className="muted font-normal">· one per line, shown in Chat</span></div><Textarea rows={3} value={draft.samplePrompts.join('\n')} onChange={(e) => set({ samplePrompts: e.target.value.split('\n').filter(Boolean) })} placeholder={'What is our parental leave policy?\nSummarise the latest expense rules'} /></div>
            </>}

            {tab === 'tests' && <>
              <div className="flex items-start justify-between gap-3"><div><h2 className="display text-[18px] font-bold">Tests</h2><div className="text-[12.5px] muted">Each test is a prompt and what a good answer must do. The agent answers for real, then a model judges it.</div></div>
                <div className="flex gap-2 shrink-0">{apiKey && <Button size="sm" onClick={writeTests} disabled={writingTests}>{writingTests ? <Loader2 size={13} className="animate-spin" /> : <SparklesIcon size={13} />} Write tests for me</Button>}<Button size="sm" variant="primary" onClick={runAll} disabled={!apiKey || testing.size > 0 || !tests.some((t) => t.prompt.trim() && t.expect.trim())}>{testing.size > 0 ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Run all</Button></div></div>
              {tests.length > 0 && (() => { const ran = tests.filter((t) => t.last); const passed = ran.filter((t) => t.last!.pass).length; return <div className="flat p-3 flex items-center gap-3 text-[12.5px]"><span className={cx('w-2.5 h-2.5 rounded-full', ran.length === 0 ? 'bg-[var(--muted)]' : passed === ran.length ? 'bg-[var(--ok)]' : 'bg-[var(--danger)]')} /><span className="font-semibold">{ran.length === 0 ? 'Not run yet' : `${passed} of ${ran.length} passed`}</span><span className="muted">{ran.length ? `· last run ${ran[ran.length - 1].last!.at} · $${ran.reduce((a, t) => a + (t.last?.cost ?? 0), 0).toFixed(3)}` : `· ${tests.length} test${tests.length === 1 ? '' : 's'}`}</span></div> })()}
              <div className="flex flex-col gap-2">
                {tests.map((t) => {
                  const busy = testing.has(t.id); const r = t.last; return (
                    <div key={t.id} className={cx('flat p-3 flex flex-col gap-2', r && !busy && (r.pass ? 'border-[color-mix(in_srgb,var(--ok)_40%,var(--line))]' : 'border-[color-mix(in_srgb,var(--danger)_40%,var(--line))]'))}>
                      <div className="grid sm:grid-cols-2 gap-2">
                        <div><div className="text-[11px] font-semibold muted mb-1">Prompt</div><Textarea rows={2} value={t.prompt} onChange={(e) => set({ tests: tests.map((x) => (x.id === t.id ? { ...x, prompt: e.target.value } : x)) })} placeholder="What a user would ask" /></div>
                        <div><div className="text-[11px] font-semibold muted mb-1">A good answer must…</div><Textarea rows={2} value={t.expect} onChange={(e) => set({ tests: tests.map((x) => (x.id === t.id ? { ...x, expect: e.target.value } : x)) })} placeholder="e.g. cite the handbook and offer to escalate" /></div>
                      </div>
                      <div className="flex items-center gap-2 text-[12px]">
                        {busy ? <span className="inline-flex items-center gap-1.5 muted"><Loader2 size={12} className="animate-spin" /> Running…</span> : r ? <span className={cx('inline-flex items-center gap-1.5 font-semibold', r.pass ? 'text-[var(--ok)]' : 'text-[var(--danger)]')}>{r.pass ? <Check size={13} /> : <X size={13} />} {r.pass ? 'Pass' : 'Fail'}<span className="muted font-normal">· {r.reason}</span></span> : <span className="muted">Not run yet</span>}
                        <div className="flex-1" />
                        {r && !busy && <details className="text-[11.5px]"><summary className="cursor-pointer muted hover:text-[var(--text)]">Answer · {(r.ms / 1000).toFixed(1)}s · ${r.cost.toFixed(4)}</summary><div className="flat p-2 mt-1 max-h-[200px] overflow-auto whitespace-pre-wrap muted">{r.output}</div></details>}
                        <Button type="button" size="sm" onClick={() => runOne(t)} disabled={!apiKey || busy || !t.prompt.trim() || !t.expect.trim()}><Play size={12} /> Run</Button>
                        <button type="button" onClick={() => saveTests(tests.filter((x) => x.id !== t.id))} className="btn btn-ghost btn-sm btn-icon" title="Remove test" aria-label="Remove test"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  )
                })}
                <button type="button" onClick={() => saveTests([...tests, { id: `t${Date.now().toString(36)}`, prompt: '', expect: '' }])} className="flat p-3 text-[12.5px] font-medium muted hover:text-[var(--text)] inline-flex items-center gap-1.5 justify-center border-dashed"><Plus size={13} /> Add a test</button>
              </div>
            </>}
            {tab === 'versions' && <>
              <div><h2 className="display text-[18px] font-bold">Versions</h2><div className="text-[12.5px] muted">Every save is a version. Restore any time; the earlier version becomes a new one.</div></div>
              <div className="flat divide-y divide-[var(--line)]">
                <div className="flex items-center gap-3 px-3 h-12 text-[12.5px]"><span className="pressed w-9 h-9 rounded-[10px] grid place-items-center font-bold text-[11px]">v{draft.version}</span><span className="flex-1 font-medium">Current{draft.updatedAt ? ` · ${draft.updatedAt}` : ''}</span></div>
                {(draft.history ?? []).length === 0 && <div className="px-3 py-4 text-[12px] muted">No earlier versions yet.</div>}
                {(draft.history ?? []).map((h) => <div key={h.version} className="flex items-center gap-3 px-3 h-12 text-[12.5px]"><span className="pressed w-9 h-9 rounded-[10px] grid place-items-center font-bold text-[11px] muted">v{h.version}</span><span className="flex-1 min-w-0"><span className="block font-medium truncate">{h.data.name}{h.data.status === 'live' ? ' · was live' : ''}</span><span className="block text-[11.5px] muted">{h.at} · {h.by}</span></span><Button size="sm" onClick={() => setConfirm({ kind: 'rollback', version: h.version })}>Restore</Button></div>)}
              </div>
              <div><div className="text-[12px] font-semibold mb-1.5">Used in workflows</div><div className="flat divide-y divide-[var(--line)]">{usedBy.length === 0 && <div className="px-3 py-3 text-[12px] muted">Not used in any workflow yet.</div>}{usedBy.map((w) => <button type="button" key={w.id} onClick={() => nav(`/workflows/${w.id}`)} className="w-full flex items-center gap-3 px-3 h-10 text-[12.5px] hover:bg-[var(--surface)] text-left"><WorkflowIcon size={13} className="muted" /><span className="flex-1">{w.name}</span><span className="muted capitalize">{w.status}</span></button>)}</div></div>
            </>}
          </fieldset>
        </div>

        <section className="clay flex flex-col min-h-0">
          <div className="h-12 px-5 flex items-center gap-2 border-b hairline text-[13px]"><span className="font-semibold">Test drive</span><Chip>{thinkingLabel(draft.model, profiles, defaultModel)}</Chip>{dirty && <Chip tone="warn">unsaved changes</Chip>}<div className="flex-1" />{chat.msgs.length > 0 && <button className="text-[12px] muted hover:text-[var(--text)] inline-flex items-center gap-1" onClick={chat.clear}><X size={12} /> Reset</button>}</div>
          <div className="flex-1 scroll">
            {chat.msgs.length === 0 ? (
              <div className="px-6 pt-14 text-center">
                <AgentAvatar name={draft.name} icon={draft.icon} color={draft.color} size={48} className="mx-auto mb-4" />
                <h2 className="display text-[18px] font-bold">Test {draft.name || 'your agent'}</h2>
                <p className="muted text-[12.5px] mt-1 max-w-[300px] mx-auto">Talk to it as a user would. Ability calls show inline. Changes on the left apply straight away.</p>
                <div className="flex flex-col items-center gap-2 mt-6">{previewPrompts.slice(0, 3).map((p) => <button key={p} onClick={() => chat.send(p)} className="btn btn-sm !font-medium max-w-full truncate">{p}</button>)}</div>
                {!apiKey && <div className="text-[12px] text-[var(--warn)] mt-6">Models are not available right now.</div>}
              </div>
            ) : <Thread msgs={chat.msgs} agent={draft} compact />}
          </div>
          <div className="p-3"><Composer onSend={(t) => chat.send(t)} busy={chat.busy} onStop={chat.stop} placeholder={`Message ${draft.name || 'agent'}…`} /></div>
        </section>
      </div>

      <Confirm open={confirm?.kind === 'delete'} onClose={() => setConfirm(null)} title={`Delete ${draft.name}?`} danger confirmLabel="Delete" body={usedBy.length ? `This agent is used in ${usedBy.length} workflow${usedBy.length === 1 ? '' : 's'}; those steps will need a new agent. Chat history and versions are removed.` : 'Chat history and versions are removed. This cannot be undone.'} onConfirm={() => { deleteAgent(draft.id); nav('/agents') }} />
      <Confirm open={confirm?.kind === 'rollback'} onClose={() => setConfirm(null)} title={`Restore v${confirm?.kind === 'rollback' ? confirm.version : ''}?`} confirmLabel="Restore" body="The earlier version becomes a new version. Nothing is lost." onConfirm={() => confirm?.kind === 'rollback' && rollbackAgent(draft.id, confirm.version)} />
      <Confirm open={confirm?.kind === 'unpublish'} onClose={() => setConfirm(null)} title="Unpublish this agent?" confirmLabel="Unpublish" body={usedBy.length ? `It is used in ${usedBy.length} workflow${usedBy.length === 1 ? '' : 's'}. Those steps keep working, but the agent disappears from Chat for others.` : 'It disappears from Chat for others. You can publish again any time.'} onConfirm={() => save('draft')} />
      <Confirm open={confirm?.kind === 'publish'} onClose={() => setConfirm(null)} title={`Publish at ${ready.score} of ${ready.total}?`} confirmLabel="Publish anyway" onConfirm={() => save('live')} body={<div><div className="mb-2">Still open:</div><ul className="flex flex-col gap-1">{ready.items.filter((i) => !i.ok).map((i) => <li key={i.id} className="flex gap-2"><span className="w-1 h-1 rounded-full bg-[var(--warn)] mt-2 shrink-0" />{i.label}</li>)}</ul></div>} />
      <Confirm open={blocker.state === 'blocked'} onClose={() => blocker.state === 'blocked' && blocker.reset()} title="Leave without saving?" danger confirmLabel="Discard changes" body="You have unsaved changes to this agent." onConfirm={() => blocker.state === 'blocked' && blocker.proceed()} />
    </Page>
  )
}

// Studio v2: brief first. Describe the agent, the Co-Create Assistant drafts everything, review on one page, create.
import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams, useBlocker } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, Lock, Sparkles, FileText, CornerDownRight, Upload, Loader2, FlaskConical, Pencil, Play, ChevronDown, ChevronRight } from 'lucide-react'
import { useApp, useUser, can } from '@/store/app'
import { agentTemplates, GOVERNED, type Agent, type Autonomy, type AgentTest } from '@/lib/data'
import { streamChat } from '@/lib/openrouter'
import { parseJsonLoose } from '@/lib/json'
import { abilities, THINKING, INDEPENDENCE, TONES, toneLine, applyTonesToInstructions, readiness, type ThinkingId } from '@/lib/agentVocab'
import { Button, Confirm, Input, Textarea, cx } from '@/components/ui'
import { Page } from '@/components/motion'
import { AgentAvatar, AGENT_ICONS, AGENT_COLORS, type AgentIcon } from '@/components/AgentAvatar'
import { AbilityWells, ReadinessRing } from '@/components/AgentBits'

export function composeInstructions(s: { name: string; purpose: string; tones: string[]; autonomy: Autonomy; tools: string[] }) {
  const lines = [`You are ${s.name.trim() ? `${s.name.trim()}, ` : ''}an assistant. ${s.purpose.trim() || 'Help people with their questions.'}`]
  const tl = toneLine(s.tones); if (tl) lines.push(`\nHow you answer: ${tl}.`)
  if (s.tools.length) lines.push(`\nUse your abilities (${s.tools.join(', ')}) to answer with real information rather than guessing.`)
  lines.push(`\nWhen unsure or when information is missing: say what is missing and ask a clarifying question.`)
  if (s.autonomy === 1) lines.push(`\nYou only inform. You never draft emails or request actions on your own.`)
  lines.push(`\n${GOVERNED}`)
  return lines.join('\n')
}

const BRIEFS = ['Answer IT helpdesk questions from our handbook. Escalate anything it cannot answer, and never promise hardware.', 'Summarise competitor news every morning and flag price changes with sources.', 'Turn pasted meeting notes into owners, actions and dates, and draft the follow-up email for me to send.', 'Check numbers and small datasets people paste in, show the method, and flag data quality issues.']
type Draft = { name: string; description: string; icon: AgentIcon; color: string; tools: Set<string>; knowledge: Set<string>; thinking: ThinkingId; autonomy: Autonomy; tones: Set<string>; instructions: string; samplePrompts: string[]; tests: { prompt: string; expect: string }[] }

export default function AgentStudio() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const user = useUser()!
  const store = useApp()
  const { upsertAgent, defaultModel, apiKey, customTools, libraries, profiles } = store
  const abil = useMemo(() => abilities(customTools), [customTools])
  const tpl = agentTemplates.find((t) => t.id === params.get('template'))
  const modelFor = (id: ThinkingId) => profiles.find((p) => p.id === id)?.model ?? defaultModel
  const thinkingFor = (model?: string): ThinkingId => (profiles.find((p) => p.model === model)?.id as ThinkingId) ?? 'balanced'

  const [stage, setStage] = useState<'brief' | 'review'>(tpl || params.get('mode') === 'manual' ? 'review' : 'brief')
  const [purpose, setPurpose] = useState(params.get('purpose') ?? '')
  const [drafting, setDrafting] = useState<string | null>(null)
  const [draftError, setDraftError] = useState('')
  const [d, setD] = useState<Draft>({ name: tpl?.name ?? '', description: tpl?.description ?? '', icon: (tpl?.icon as AgentIcon) ?? 'sparkles', color: tpl?.color ?? AGENT_COLORS[0], tools: new Set(tpl?.tools ?? []), knowledge: new Set(tpl?.tools.includes('search_knowledge') ? ['company'] : []), thinking: thinkingFor(tpl?.model), autonomy: 2, tones: new Set(['Friendly', 'Concise', 'Asks before guessing']), instructions: tpl?.instructions ?? '', samplePrompts: tpl?.samplePrompts ?? [], tests: [] })
  const [edited, setEdited] = useState(!!tpl)
  const [showInstr, setShowInstr] = useState(false)
  const [created, setCreated] = useState(false)
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }))
  const toggle = (k: 'tools' | 'knowledge' | 'tones', v: string) => setD((x) => { const n = new Set(x[k]); n.has(v) ? n.delete(v) : n.add(v); if (k === 'knowledge' && n.size && !x.tools.has('search_knowledge')) { const t = new Set(x.tools); t.add('search_knowledge'); return { ...x, [k]: n, tools: t } } if (k === 'tones' && x.instructions) return { ...x, tones: n, instructions: applyTonesToInstructions(x.instructions, [...n]) }; return { ...x, [k]: n } })
  const touched = !created && (purpose.trim().length > 0 || d.name.trim().length > 0 || d.tools.size > 0)
  const blocker = useBlocker(touched)
  useEffect(() => { const h = (e: BeforeUnloadEvent) => { if (touched) { e.preventDefault(); e.returnValue = '' } }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h) }, [touched])
  const hasGated = [...d.tools].some((t) => abil.find((a) => a.id === t)?.gated)
  const composed = useMemo(() => composeInstructions({ name: d.name, purpose, tones: [...d.tones], autonomy: d.autonomy, tools: [...d.tools] }), [d.name, purpose, d.tones, d.autonomy, d.tools])
  const instructions = d.instructions || composed
  useEffect(() => { if (hasGated && d.autonomy === 3) set({ autonomy: 2 }) }, [hasGated]) // eslint-disable-line react-hooks/exhaustive-deps
  const preview: Agent = useMemo(() => ({ id: 'new', name: d.name || 'New agent', description: d.description || purpose, instructions, model: modelFor(d.thinking), tools: [...d.tools], knowledge: [...d.knowledge], autonomy: d.autonomy, status: 'draft', version: 1, samplePrompts: d.samplePrompts, updatedAt: '', createdBy: user.id, icon: d.icon, color: d.color, tones: [...d.tones], tests: d.tests.map((t, i) => ({ id: String(i), ...t })) }), [d, purpose, instructions]) // eslint-disable-line react-hooks/exhaustive-deps
  const ready = readiness(preview)
  if (!can(user, 'build')) return <Navigate to="/agents" replace />

  const applyTemplate = (t: typeof agentTemplates[number]) => { setPurpose(t.description); set({ description: t.description, name: t.name, icon: (t.icon as AgentIcon) ?? 'sparkles', color: t.color ?? AGENT_COLORS[0], tools: new Set(t.tools), knowledge: new Set(t.tools.includes('search_knowledge') ? ['company'] : []), thinking: thinkingFor(t.model), instructions: t.instructions, samplePrompts: t.samplePrompts, tests: [] }); setEdited(true); setStage('review') }
  const importFile = (f: File) => { f.text().then((t) => { try { const j = JSON.parse(t); setPurpose(j.description ?? ''); set({ name: j.name ?? '', description: j.description ?? '', instructions: j.instructions ?? '', tools: new Set(Array.isArray(j.tools) ? j.tools : []), knowledge: new Set(Array.isArray(j.knowledge) ? j.knowledge : []), samplePrompts: Array.isArray(j.samplePrompts) ? j.samplePrompts : [], icon: j.icon ?? 'sparkles', color: j.color ?? AGENT_COLORS[0], autonomy: j.autonomy ?? 2, thinking: thinkingFor(j.model), tests: Array.isArray(j.tests) ? j.tests : [] }); setEdited(true); setStage('review') } catch { store.flashMsg('That file is not a valid agent export.', 'danger') } }) }

  const draft = async () => {
    if (!apiKey || purpose.trim().length < 10) return
    setDraftError(''); setDrafting('Reading the brief…')
    const steps = ['Choosing abilities…', 'Writing the instructions…', 'Adding sample prompts and tests…']
    const timer = setInterval(() => setDrafting((s) => { const i = steps.indexOf(s ?? ''); return steps[Math.min(steps.length - 1, i + 1)] }), 2200)
    const sys = `You design AI agents for a governed enterprise platform. From a brief, draft the complete agent. Abilities available (ids): ${abil.map((a) => `${a.id} (${a.label}${a.gated ? ', asks a person' : ''})`).join('; ')}. Knowledge libraries: ${libraries.map((l) => `${l.id} (${l.name})`).join('; ')}. Thinking levels: fast (quick lookups), balanced (most agents), reasoning (research and hard analysis). Independence: 1 = only informs, 2 = drafts actions for a person to approve, 3 = acts on read-only abilities alone (not allowed when any ability asks a person). Personality tags: ${TONES.join(', ')}.
Reply ONLY with JSON: {"name":"2-4 words","description":"one line","icon":"one of ${Object.keys(AGENT_ICONS).join(', ')}","color":"one of ${AGENT_COLORS.join(', ')}","tools":["ability ids"],"knowledge":["library ids, only when it should search them"],"thinking":"fast|balanced|reasoning","autonomy":1|2|3,"tones":["2-3 personality tags"],"instructions":"complete system prompt in second person, 150-250 words: purpose, how to answer, what to refuse, how to use its abilities, what to do when unsure; end with: ${GOVERNED}","samplePrompts":["three realistic prompts"],"tests":[{"prompt":"a realistic, self-contained user prompt that includes any data the agent needs (numbers, quotes, text)","expect":"one sentence on what a good answer must do"} x3, one of them checking it refuses or escalates something out of scope]}`
    let acc = ''
    try {
      for await (const ev of streamChat({ key: apiKey, model: defaultModel, messages: [{ role: 'system', content: sys }, { role: 'user', content: `Brief: ${purpose}` }], temperature: 0.3 })) { if (ev.type === 'delta') acc += ev.text; if (ev.type === 'usage') store.recordSpend(ev.usage.cost ?? 0); if (ev.type === 'error') throw new Error(ev.message) }
      const j = parseJsonLoose(acc)
      const tools = new Set<string>((Array.isArray(j.tools) ? j.tools : []).filter((t: string) => abil.some((a) => a.id === t)))
      const knowledge = new Set<string>((Array.isArray(j.knowledge) ? j.knowledge : []).filter((k: string) => libraries.some((l) => l.id === k)))
      if (knowledge.size) tools.add('search_knowledge')
      const gated = [...tools].some((t) => abil.find((a) => a.id === t)?.gated)
      set({ name: typeof j.name === 'string' ? j.name.slice(0, 40) : d.name, description: typeof j.description === 'string' ? j.description.slice(0, 160) : purpose.slice(0, 160), icon: typeof j.icon === 'string' && j.icon in AGENT_ICONS ? j.icon : d.icon, color: AGENT_COLORS.includes(j.color) ? j.color : d.color, tools, knowledge, thinking: ['fast', 'balanced', 'reasoning'].includes(j.thinking) ? j.thinking : 'balanced', autonomy: ([1, 2, 3].includes(j.autonomy) ? (gated && j.autonomy === 3 ? 2 : j.autonomy) : 2) as Autonomy, tones: new Set((Array.isArray(j.tones) ? j.tones : []).filter((t: string) => (TONES as readonly string[]).includes(t))), instructions: typeof j.instructions === 'string' ? j.instructions : composed, samplePrompts: Array.isArray(j.samplePrompts) ? j.samplePrompts.filter((s: unknown) => typeof s === 'string').slice(0, 4) : [], tests: Array.isArray(j.tests) ? j.tests.filter((t: any) => typeof t?.prompt === 'string' && typeof t?.expect === 'string').slice(0, 4) : [] })
      setEdited(false); setStage('review')
    } catch (e: any) { setDraftError(e?.message?.includes('JSON') ? 'The draft came back in a shape I could not read. Try again, or build it step by step.' : `Could not draft the agent: ${e?.message ?? e}`) }
    finally { clearInterval(timer); setDrafting(null) }
  }
  const create = (test = false) => {
    const a: Agent = { id: `agent-${Date.now().toString(36)}`, name: d.name.trim() || 'New agent', description: (d.description || purpose).trim().slice(0, 160), instructions, model: modelFor(d.thinking), tools: [...d.tools], knowledge: [...d.knowledge], autonomy: hasGated && d.autonomy === 3 ? 2 : d.autonomy, status: 'draft', version: 1, samplePrompts: d.samplePrompts, updatedAt: new Date().toISOString().slice(0, 10), createdBy: user.id, icon: d.icon, color: d.color, tones: [...d.tones], tests: d.tests.map((t, i) => ({ id: `t${Date.now().toString(36)}${i}`, ...t })) }
    setCreated(true); upsertAgent(a); setTimeout(() => nav(`/agents/${a.id}${test ? '?tab=tests&run=1' : ''}`, { replace: true }), 0)
  }
  const cats = ['Web', 'Reasoning', 'Knowledge', 'Actions', 'Custom'] as const
  const canCreate = d.name.trim().length > 1

  return (
    <Page className="h-full flex flex-col gap-3">
      <header className="clay h-14 px-3 flex items-center gap-2 shrink-0">
        <button onClick={() => (stage === 'review' && !tpl ? setStage('brief') : nav('/agents'))} className="btn btn-ghost btn-icon" aria-label="Back"><ArrowLeft size={16} /></button>
        <span className="display font-bold text-[15px] mr-2">New agent</span>
        <div className="flex items-center gap-1">
          {(['brief', 'review'] as const).map((st, i) => <button key={st} onClick={() => i === 0 && setStage('brief')} className={cx('flex items-center gap-2 h-8 px-2.5 rounded-[10px] text-[12.5px] font-semibold', stage === st ? 'bg-[var(--surface-2)] shadow-[0_1px_2px_rgba(16,24,40,.06)]' : i === 0 ? 'accent-ink' : 'muted')}><span className={cx('w-5 h-5 rounded-full grid place-items-center text-[10.5px]', stage === st ? 'bg-[var(--accent)] text-white' : i === 0 ? 'bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]' : 'bg-[var(--clay-dark)]')}>{stage === 'review' && i === 0 ? <Check size={11} /> : i + 1}</span>{st === 'brief' ? 'Brief' : 'Review'}</button>)}
        </div>
        <div className="flex-1" />
        {stage === 'review' && <><span className="text-[12px] muted hidden md:block">Created as a draft. Publish from the agent page.</span><Button variant="ghost" onClick={() => create(true)} disabled={!canCreate || !apiKey} title="Create, then run its tests"><FlaskConical size={14} /> Create and test</Button><Button variant="primary" onClick={() => create()} disabled={!canCreate}><Check size={14} /> Create agent</Button></>}
      </header>

      <AnimatePresence mode="wait" initial={false}>
        {stage === 'brief' ? (
          <motion.section key="brief" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="clay flex-1 min-h-0 scroll">
            <div className="max-w-[680px] mx-auto px-6 py-12 flex flex-col items-center gap-6">
              <div className="text-center">
                <h2 className="display text-[26px] font-bold">What should this agent do?</h2>
                <div className="text-[13.5px] muted mt-1.5 max-w-[480px] mx-auto leading-relaxed">Who it helps, what it must do, what it must never do. One or two sentences is enough; the Co-Create Assistant drafts the name, abilities, instructions and tests.</div>
              </div>
              <div className="w-full">
                <div className={cx('clay-sm p-2 transition-shadow', drafting && 'opacity-70')}>
                  <textarea rows={4} autoFocus value={purpose} onChange={(e) => setPurpose(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) draft() }} disabled={!!drafting} placeholder="e.g. Answer IT helpdesk questions from our handbook. Escalate anything it can't answer, and never promise hardware." aria-label="Agent brief" className="w-full bg-transparent outline-0 resize-none text-[15px] leading-relaxed px-3 pt-3" />
                  <div className="flex items-center gap-2 px-2 pb-1 pt-1">
                    <span className="text-[11.5px] muted">{drafting ? <span className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin accent-ink" /> {drafting}</span> : apiKey ? 'Ctrl+Enter to draft' : 'Models are not available, so build it step by step.'}</span>
                    <div className="flex-1" />
                    <Button variant="ghost" size="sm" onClick={() => { setEdited(true); setStage('review') }} disabled={!!drafting}>Build step by step</Button>
                    <Button variant="primary" onClick={draft} disabled={purpose.trim().length < 10 || !apiKey || !!drafting}>{drafting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Draft the agent <ArrowRight size={14} /></Button>
                  </div>
                </div>
                {draftError && <div className="text-[12.5px] text-[var(--danger)] mt-2 px-1">{draftError}</div>}
                <div className="flex flex-wrap gap-1.5 mt-3 justify-center">{BRIEFS.map((t) => <button key={t} onClick={() => setPurpose(t)} className="chip hover:text-[var(--text)] !h-auto !py-1.5 !px-3 text-left max-w-[300px] !whitespace-normal !leading-snug"><CornerDownRight size={11} className="shrink-0 mt-0.5" /> <span>{t}</span></button>)}</div>
              </div>
              <div className="w-full pt-4 border-t hairline">
                <div className="flex items-center justify-between mb-3"><div><h3 className="display text-[15px] font-bold">Or start from a template</h3><div className="text-[12.5px] muted">Ready-made agents you can change on the review page.</div></div><label className="text-[12px] muted inline-flex items-center gap-1.5 cursor-pointer hover:text-[var(--text)]"><Upload size={12} /> Import JSON<input type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = '' }} /></label></div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{agentTemplates.map((t) => <button key={t.id} onClick={() => applyTemplate(t)} className="flat p-3 text-left hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--line))] hover:-translate-y-px transition-all flex gap-3 items-center"><AgentAvatar name={t.name} icon={t.icon} color={t.color} size={34} /><span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold truncate">{t.name}</span><span className="block text-[11.5px] muted truncate">{t.description}</span></span></button>)}</div>
              </div>
            </div>
          </motion.section>
        ) : (
          <motion.div key="review" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="flex-1 min-h-0 grid grid-cols-[300px_minmax(0,1fr)] gap-3">
            <aside className="clay p-4 flex flex-col gap-3 self-start">
              <div className="text-[10.5px] font-bold uppercase tracking-wider muted">Preview</div>
              <div className="flat p-4">
                <div className="flex items-start gap-3"><AgentAvatar name={d.name || 'Agent'} icon={d.icon} color={d.color} size={42} /><div className="min-w-0 pt-0.5"><div className="display font-bold text-[15px] truncate">{d.name || 'Untitled agent'}</div><div className="text-[11.5px] muted">Draft</div></div></div>
                <p className="text-[12.5px] muted leading-relaxed mt-3 line-clamp-3">{d.description || purpose || 'What it does appears here.'}</p>
                <div className="mt-3"><AbilityWells tools={[...d.tools]} custom={customTools} /></div>
              </div>
              <div className="flex flex-col gap-1.5 text-[12.5px]">
                {[[THINKING.find((t) => t.id === d.thinking)!.icon, `${THINKING.find((t) => t.id === d.thinking)!.label} thinking`], [INDEPENDENCE.find((i) => i.level === d.autonomy)!.icon, INDEPENDENCE.find((i) => i.level === d.autonomy)!.label], [Sparkles, [...d.tones].join(', ') || 'No tone set'], [FileText, d.knowledge.size ? `${d.knowledge.size} knowledge librar${d.knowledge.size === 1 ? 'y' : 'ies'}` : 'No knowledge attached'], [FlaskConical, d.tests.length ? `${d.tests.length} tests` : 'No tests yet']].map(([I, l], i) => { const Icon = I as typeof Sparkles; return <div key={i} className="flex items-center gap-2.5"><span className="pressed w-7 h-7 rounded-[8px] grid place-items-center muted"><Icon size={13} /></span><span className="truncate">{l as string}</span></div> })}
              </div>
              <div className="flat p-3 flex items-center gap-3"><ReadinessRing score={ready.score} total={ready.total} size={40} /><div className="min-w-0"><div className="text-[12.5px] font-semibold">{ready.score >= ready.total - 2 ? 'Nearly ready' : 'Getting there'}</div><div className="text-[11px] muted truncate">{ready.items.filter((i) => !i.ok).map((i) => i.label).slice(0, 1).join('') || 'Everything on the checklist is done.'}</div></div></div>
              {!edited && d.instructions && <div className="text-[11.5px] muted leading-snug flex items-start gap-1.5"><Sparkles size={12} className="accent-ink mt-0.5 shrink-0" /> Drafted by the Co-Create Assistant from your brief. Everything here is editable.</div>}
            </aside>

            <section className="clay scroll">
              <div className="max-w-[760px] mx-auto px-7 py-7 flex flex-col gap-7">
                <Section title="Identity" sub="This is how people find it in Chat and in workflows.">
                  <div className="grid sm:grid-cols-[1fr_1fr] gap-3">
                    <div><div className="text-[12px] font-semibold mb-1.5">Name</div><Input value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. IT Helpdesk" className="!text-[14px] !h-10" /></div>
                    <div><div className="text-[12px] font-semibold mb-1.5">What it does <span className="muted font-normal">· one line</span></div><Input value={d.description} onChange={(e) => set({ description: e.target.value })} placeholder="Shown on the card" className="!h-10" /></div>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex gap-1.5 flex-wrap">{AGENT_COLORS.map((c) => <button key={c} onClick={() => set({ color: c })} className={cx('w-7 h-7 rounded-full border-2 transition-transform', d.color === c ? 'border-[var(--text)] scale-110' : 'border-transparent')} style={{ background: c }} aria-label={`Colour ${c}`} />)}</div>
                    <div className="flex gap-1.5 flex-wrap">{(Object.keys(AGENT_ICONS) as AgentIcon[]).map((k) => { const I = AGENT_ICONS[k]; const on = d.icon === k; return <button key={k} onClick={() => set({ icon: k })} className={cx('w-8 h-8 rounded-[9px] grid place-items-center', on ? 'bg-[var(--accent)] text-white' : 'flat muted hover:text-[var(--text)]')} aria-label={k}><I size={15} /></button> })}</div>
                  </div>
                </Section>
                <Section title="Abilities" sub="Tap to switch abilities on. A lock means it always asks a person first.">
                  {cats.filter((c) => abil.some((a) => a.category === c)).map((c) => (
                    <div key={c}><div className="text-[11px] font-semibold uppercase tracking-wider muted mb-2">{c === 'Custom' ? 'Your APIs and connectors' : c}</div>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{abil.filter((a) => a.category === c).map((a) => {
                        const on = d.tools.has(a.id); const I = a.icon; return (
                          <button key={a.id} aria-pressed={on} aria-label={`${a.label}: ${on ? 'on' : 'off'}`} onClick={() => toggle('tools', a.id)} className={cx('flat p-2.5 text-left flex items-center gap-2.5 relative transition-all', on && 'border-[var(--accent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]')}>
                            <span className={cx('w-8 h-8 rounded-[9px] grid place-items-center shrink-0', on ? 'bg-[var(--accent)] text-white' : 'pressed muted')}><I size={15} /></span>
                            <span className="min-w-0"><span className="block text-[12.5px] font-semibold truncate">{a.label}</span><span className="block text-[11px] muted">{a.sub}</span></span>
                            {a.gated && <Lock size={11} className="absolute top-2 right-2 text-[var(--warn)]" />}
                          </button>
                        )
                      })}</div></div>
                  ))}
                  <div><div className="text-[11px] font-semibold uppercase tracking-wider muted mb-2">Knowledge</div><div className="flex flex-wrap gap-2">{libraries.map((l) => <button key={l.id} onClick={() => toggle('knowledge', l.id)} className={cx('chip !h-9 !px-3 hover:text-[var(--text)]', d.knowledge.has(l.id) && 'chip-accent')}>{d.knowledge.has(l.id) && <Check size={12} />}{l.name} · {l.docs.length}</button>)}</div></div>
                </Section>
                <Section title="Behaviour" sub="Thinking depth sets the model. Independence sets what it may do alone.">
                  <div className="grid grid-cols-3 gap-2">{THINKING.map((t) => { const on = d.thinking === t.id; const I = t.icon; return <button key={t.id} onClick={() => set({ thinking: t.id })} className={cx('flat p-3 text-left flex flex-col gap-1.5', on && 'border-[var(--accent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]')}><span className="text-[13px] font-semibold flex items-center gap-1.5"><I size={13} /> {t.label}</span><span className="text-[11.5px] muted">{t.desc}</span></button> })}</div>
                  <div className="grid grid-cols-3 gap-2">{INDEPENDENCE.map((o) => { const locked = o.level === 3 && hasGated; const on = d.autonomy === o.level; const I = o.icon; return <button key={o.level} disabled={locked} onClick={() => set({ autonomy: o.level })} className={cx('flat p-3 text-left flex flex-col gap-1.5 disabled:opacity-50', on && 'border-[var(--accent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]')}><span className="text-[13px] font-semibold flex items-center gap-1.5"><I size={13} /> {o.label}{locked && <Lock size={11} className="muted" />}</span><span className="text-[11.5px] muted">{locked ? 'Not with abilities that ask a person.' : o.desc}</span></button> })}</div>
                  <div className="flex flex-wrap gap-2">{TONES.map((t) => <button key={t} onClick={() => toggle('tones', t)} className={cx('chip !h-8 !px-3 hover:text-[var(--text)]', d.tones.has(t) && 'chip-accent')}>{d.tones.has(t) && <Check size={12} />}{t}</button>)}</div>
                </Section>
                <Section title="Instructions and prompts" sub={edited ? 'Edited by you.' : d.instructions ? 'Drafted from your brief.' : 'Composed from your choices until you write your own.'} action={<Button size="sm" variant="ghost" onClick={() => setShowInstr(!showInstr)}>{showInstr ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {showInstr ? 'Hide' : 'Edit'}</Button>}>
                  {!showInstr ? <div className="flat p-3 text-[12.5px] muted leading-relaxed line-clamp-4 whitespace-pre-wrap">{instructions}</div> : (
                    <>
                      <Textarea rows={12} value={instructions} onChange={(e) => { set({ instructions: e.target.value }); setEdited(true) }} className="!leading-relaxed" />
                      <div><div className="text-[12px] font-semibold mb-1">Sample prompts <span className="muted font-normal">· one per line, shown as openers in Chat</span></div><Textarea rows={3} value={d.samplePrompts.join('\n')} onChange={(e) => set({ samplePrompts: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} placeholder={'What is the parental leave policy?\nHow do I claim travel expenses?'} /></div>
                    </>
                  )}
                </Section>
                <Section title="Tests" sub="A prompt and what a good answer must do. Run them from the agent page; a model judges each answer." action={<Button size="sm" variant="ghost" onClick={() => set({ tests: [...d.tests, { prompt: '', expect: '' }] })}><Pencil size={13} /> Add a test</Button>}>
                  {d.tests.length === 0 && <div className="text-[12.5px] muted">No tests yet. {apiKey ? 'Drafting from a brief adds three; you can also add your own.' : 'Add your own.'}</div>}
                  {d.tests.map((t, i) => <div key={i} className="flat p-3 grid sm:grid-cols-2 gap-2"><div><div className="text-[11px] font-semibold muted mb-1">Prompt</div><Textarea rows={2} value={t.prompt} onChange={(e) => set({ tests: d.tests.map((x, j) => (j === i ? { ...x, prompt: e.target.value } : x)) })} /></div><div><div className="text-[11px] font-semibold muted mb-1 flex items-center justify-between">Expect<button onClick={() => set({ tests: d.tests.filter((_, j) => j !== i) })} className="hover:text-[var(--danger)]">Remove</button></div><Textarea rows={2} value={t.expect} onChange={(e) => set({ tests: d.tests.map((x, j) => (j === i ? { ...x, expect: e.target.value } : x)) })} /></div></div>)}
                </Section>
                <div className="flex items-center gap-2 pt-2 pb-6"><Button variant="primary" onClick={() => create()} disabled={!canCreate}><Check size={14} /> Create agent</Button><Button onClick={() => create(true)} disabled={!canCreate || !apiKey}><Play size={14} /> Create and run tests</Button><span className="text-[12px] muted">Created as a draft.</span></div>
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>
      <Confirm open={blocker.state === 'blocked'} onClose={() => blocker.state === 'blocked' && blocker.reset()} title="Leave without creating the agent?" danger confirmLabel="Discard" body="What you have filled in so far will be lost." onConfirm={() => blocker.state === 'blocked' && blocker.proceed()} />
    </Page>
  )
}

function Section({ title, sub, action, children }: { title: string; sub?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3"><div><h3 className="display text-[16px] font-bold">{title}</h3>{sub && <div className="text-[12.5px] muted mt-0.5">{sub}</div>}</div>{action}</div>
      {children}
    </div>
  )
}


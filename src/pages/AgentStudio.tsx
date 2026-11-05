// Studio: create an agent in four plain-language steps with a live preview card.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams, useBlocker } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, Lock, Sparkles, FileText, CornerDownRight, Upload, ChevronDown, ChevronUp } from 'lucide-react'
import { useApp, useUser } from '@/store/app'
import { agentTemplates, GOVERNED, type Agent, type Autonomy } from '@/lib/data'
import { streamChat } from '@/lib/openrouter'
import { abilities, THINKING, INDEPENDENCE, TONES, toneLine, type ThinkingId } from '@/lib/agentVocab'
import { Button, Confirm, Input, Textarea, cx } from '@/components/ui'
import { Page } from '@/components/motion'
import { AgentAvatar, AGENT_ICONS, AGENT_COLORS, type AgentIcon } from '@/components/AgentAvatar'
import { AbilityWells } from '@/components/AgentBits'

const STEPS = ['Purpose', 'Abilities', 'Behaviour', 'Look'] as const

export function composeInstructions(s: { name: string; purpose: string; tones: string[]; autonomy: Autonomy; tools: string[] }) {
  const lines = [`You are ${s.name.trim() ? `${s.name.trim()}, ` : ''}an assistant. ${s.purpose.trim() || 'Help people with their questions.'}`]
  const tl = toneLine(s.tones); if (tl) lines.push(`\nHow you answer: ${tl}.`)
  if (s.tools.length) lines.push(`\nUse your abilities (${s.tools.join(', ')}) to answer with real information rather than guessing.`)
  lines.push(`\nWhen unsure or when information is missing: say what is missing and ask a clarifying question.`)
  if (s.autonomy === 1) lines.push(`\nYou only inform. You never draft emails or request actions on your own.`)
  lines.push(`\n${GOVERNED}`)
  return lines.join('\n')
}

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

  const [step, setStep] = useState(0)
  const [s, setS] = useState({
    purpose: params.get('purpose') ?? tpl?.description ?? '', name: tpl?.name ?? '', icon: (tpl?.icon as AgentIcon) ?? 'sparkles', color: tpl?.color ?? AGENT_COLORS[0],
    tools: new Set<string>(tpl?.tools ?? []), knowledge: new Set<string>(tpl?.tools.includes('search_knowledge') ? ['company'] : []),
    thinking: thinkingFor(tpl?.model) as ThinkingId, autonomy: 2 as Autonomy, tones: new Set<string>(['Friendly', 'Concise', 'Asks before guessing']),
    instructions: tpl?.instructions ?? '', samplePrompts: tpl?.samplePrompts ?? [], description: tpl?.description ?? '', edited: false, showInstr: false,
  })
  const set = (p: Partial<typeof s>) => setS((x) => ({ ...x, ...p }))
  const toggle = (k: 'tools' | 'knowledge' | 'tones', v: string) => setS((x) => { const n = new Set(x[k]); n.has(v) ? n.delete(v) : n.add(v); if (k === 'knowledge' && n.size && !x.tools.has('search_knowledge')) { const t = new Set(x.tools); t.add('search_knowledge'); return { ...x, [k]: n, tools: t } } return { ...x, [k]: n } })
  const [writing, setWriting] = useState<string | null>(null)
  const [created, setCreated] = useState(false)
  const touched = !created && (s.purpose.trim().length > 0 || s.name.trim().length > 0 || s.tools.size > 0)
  const blocker = useBlocker(touched)
  useEffect(() => { const h = (e: BeforeUnloadEvent) => { if (touched) { e.preventDefault(); e.returnValue = '' } }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h) }, [touched])
  const hasGated = [...s.tools].some((t) => abil.find((a) => a.id === t)?.gated)
  const composed = useMemo(() => composeInstructions({ name: s.name, purpose: s.purpose, tones: [...s.tones], autonomy: s.autonomy, tools: [...s.tools] }), [s.name, s.purpose, s.tones, s.autonomy, s.tools])
  const instructions = s.instructions || composed
  useEffect(() => { if (hasGated && s.autonomy === 3) set({ autonomy: 2 }) }, [hasGated]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyTemplate = (t: typeof agentTemplates[number]) => set({ purpose: t.description, description: t.description, name: t.name, icon: (t.icon as AgentIcon) ?? 'sparkles', color: t.color ?? AGENT_COLORS[0], tools: new Set(t.tools), knowledge: new Set(t.tools.includes('search_knowledge') ? ['company'] : []), thinking: thinkingFor(t.model), instructions: t.instructions, samplePrompts: t.samplePrompts, edited: false })

  const writeWithAssistant = async () => {
    if (!apiKey) return
    setWriting('Writing the instructions…')
    const sys = `You design AI agents for a governed enterprise platform. Reply ONLY with JSON: {"name": "2-4 words (only if a name is not given)", "description": "one line", "icon": "one of sparkles, bot, search, pen, chart, support, globe, shield, book, calculator, mail, briefcase, scale, idea, megaphone, wrench", "instructions": "complete system prompt in second person, 120-250 words: purpose, how to answer, what to refuse, how to use its abilities, what to do when unsure; end with: ${GOVERNED}", "samplePrompts": ["...", "...", "..."]}.`
    const usr = `Purpose: ${s.purpose}\nName: ${s.name || '(choose one)'}\nAbilities: ${[...s.tools].map((t) => abil.find((a) => a.id === t)?.label ?? t).join(', ') || 'none'}\nPersonality: ${[...s.tones].join(', ') || 'neutral'}\nIndependence: ${INDEPENDENCE.find((i) => i.level === s.autonomy)?.label}`
    let acc = ''
    try {
      for await (const ev of streamChat({ key: apiKey, model: defaultModel, messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }], temperature: 0.3 })) { if (ev.type === 'delta') acc += ev.text; if (ev.type === 'usage') store.recordSpend(ev.usage.cost ?? 0) }
      const j = JSON.parse(acc.replace(/^```json?|```$/g, '').trim())
      set({ instructions: typeof j.instructions === 'string' ? j.instructions : composed, samplePrompts: Array.isArray(j.samplePrompts) ? j.samplePrompts : s.samplePrompts, description: typeof j.description === 'string' ? j.description : s.description, name: s.name || (typeof j.name === 'string' ? j.name : s.name), icon: s.icon === 'sparkles' && typeof j.icon === 'string' && j.icon in AGENT_ICONS ? j.icon : s.icon, edited: false, showInstr: true })
    } catch { set({ instructions: composed, showInstr: true }) }
    finally { setWriting(null) }
  }

  const create = () => {
    const a: Agent = { id: `agent-${Date.now().toString(36)}`, name: s.name.trim() || 'New agent', description: (s.description || s.purpose).trim().slice(0, 160), instructions, model: modelFor(s.thinking), tools: [...s.tools], knowledge: [...s.knowledge], autonomy: hasGated && s.autonomy === 3 ? 2 : s.autonomy, status: 'draft', version: 1, samplePrompts: s.samplePrompts, updatedAt: new Date().toISOString().slice(0, 10), createdBy: user.id, icon: s.icon, color: s.color, tones: [...s.tones] }
    setCreated(true); upsertAgent(a); setTimeout(() => nav(`/agents/${a.id}`, { replace: true }), 0)
  }
  const importFile = (f: File) => { f.text().then((t) => { try { const j = JSON.parse(t); set({ name: j.name ?? '', description: j.description ?? '', purpose: j.description ?? '', instructions: j.instructions ?? '', tools: new Set(Array.isArray(j.tools) ? j.tools : []), knowledge: new Set(Array.isArray(j.knowledge) ? j.knowledge : []), samplePrompts: Array.isArray(j.samplePrompts) ? j.samplePrompts : [], icon: j.icon ?? 'sparkles', color: j.color ?? AGENT_COLORS[0], autonomy: j.autonomy ?? 2, thinking: thinkingFor(j.model), edited: true, showInstr: true }); setStep(3) } catch { alert('That file is not a valid agent export.') } }) }

  const canNext = step === 0 ? s.purpose.trim().length > 10 : step === 3 ? s.name.trim().length > 1 : true
  const hint = ['Everything stays editable afterwards.', `${[...s.tools].filter((t) => abil.find((a) => a.id === t)?.gated).length} abilit${[...s.tools].filter((t) => abil.find((a) => a.id === t)?.gated).length === 1 ? 'y asks' : 'ies ask'} a person first.`, 'Thinking sets the model. Independence sets what it may do alone.', 'Created as a draft. Publish from the agent page.'][step]
  const cats = ['Web', 'Reasoning', 'Knowledge', 'Actions', 'Custom'] as const

  return (
    <Page className="h-full flex flex-col gap-3">
      <header className="clay h-14 px-3 flex items-center gap-2 shrink-0">
        <button onClick={() => nav('/agents')} className="btn btn-ghost btn-icon"><ArrowLeft size={16} /></button>
        <span className="display font-bold text-[15px] mr-3">New agent</span>
        <div className="flex items-center gap-1">
          {STEPS.map((st, i) => (
            <button key={st} onClick={() => i < step && setStep(i)} className={cx('flex items-center gap-2 h-8 px-2.5 rounded-[10px] text-[12.5px] font-semibold', i === step ? 'bg-[var(--surface-2)] shadow-[0_1px_2px_rgba(16,24,40,.06)]' : i < step ? 'accent-ink' : 'muted')}>
              <span className={cx('w-5 h-5 rounded-full grid place-items-center text-[10.5px]', i === step ? 'bg-[var(--accent)] text-white' : i < step ? 'bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]' : 'bg-[var(--clay-dark)]')}>{i < step ? <Check size={11} /> : i + 1}</span>{st}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <span className="text-[12px] muted hidden md:block">{hint}</span>
        <Button variant="ghost" onClick={() => setStep((x) => Math.max(0, x - 1))} disabled={step === 0}><ArrowLeft size={14} /> Back</Button>
        {step < 3 ? <Button variant="primary" onClick={() => setStep((x) => x + 1)} disabled={!canNext}>Next <ArrowRight size={14} /></Button> : <Button variant="primary" onClick={create} disabled={!canNext || !!writing}><Check size={14} /> Create agent</Button>}
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-[300px_minmax(0,1fr)] gap-3">
        <aside className="clay p-4 flex flex-col gap-3 self-start">
          <div className="text-[10.5px] font-bold uppercase tracking-wider muted">Preview</div>
          <div className="flat p-4">
            <div className="flex items-start gap-3"><AgentAvatar name={s.name || 'Agent'} icon={s.icon} color={s.color} size={42} /><div className="min-w-0 pt-0.5"><div className="display font-bold text-[15px] truncate">{s.name || 'Untitled agent'}</div><div className="text-[11.5px] muted">Draft</div></div></div>
            <p className="text-[12.5px] muted leading-relaxed mt-3 line-clamp-3">{s.description || s.purpose || 'What it does appears here.'}</p>
            <div className="mt-3"><AbilityWells tools={[...s.tools]} custom={customTools} /></div>
          </div>
          <div className="flex flex-col gap-1.5 text-[12.5px]">
            {[[THINKING.find((t) => t.id === s.thinking)!.icon, `${THINKING.find((t) => t.id === s.thinking)!.label} thinking`], [INDEPENDENCE.find((i) => i.level === s.autonomy)!.icon, INDEPENDENCE.find((i) => i.level === s.autonomy)!.label], [Sparkles, [...s.tones].join(', ') || 'No tone set'], [FileText, s.knowledge.size ? `${s.knowledge.size} knowledge librar${s.knowledge.size === 1 ? 'y' : 'ies'}` : 'No knowledge attached']].map(([I, l], i) => { const Icon = I as typeof Sparkles; return <div key={i} className="flex items-center gap-2.5"><span className="pressed w-7 h-7 rounded-[8px] grid place-items-center muted"><Icon size={13} /></span><span className="truncate">{l as string}</span></div> })}
          </div>
          <label className="mt-2 text-[12px] muted inline-flex items-center gap-1.5 cursor-pointer hover:text-[var(--text)]"><Upload size={12} /> Import from JSON instead<input type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = '' }} /></label>
        </aside>

        <section className="clay scroll">
          <AnimatePresence initial={false}>
            <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="max-w-[760px] mx-auto px-7 py-7 flex flex-col gap-6">
              {step === 0 && <>
                <div><h2 className="display text-[22px] font-bold">What's it for?</h2><div className="text-[13px] muted mt-1">One or two sentences. Who it helps and what it should never do.</div></div>
                <Textarea rows={5} autoFocus value={s.purpose} onChange={(e) => set({ purpose: e.target.value, instructions: s.edited ? s.instructions : '', description: '' })} placeholder="e.g. Answer IT helpdesk questions from our handbook. Escalate anything it can't answer, and never promise hardware." className="!text-[15px] !p-4" />
                <div className="flex flex-wrap gap-1.5">{['Summarise competitor news every morning and flag price changes', 'Turn pasted meeting notes into owners, actions and dates', 'Check our pricing page for changes and tell me what moved'].map((t) => <button key={t} onClick={() => set({ purpose: t })} className="chip hover:text-[var(--text)] !h-8"><CornerDownRight size={11} /> {t}</button>)}</div>
                <div><h3 className="display text-[15px] font-bold">Or start from a template</h3><div className="text-[12.5px] muted mt-0.5 mb-3">Ready-made agents you can change afterwards.</div>
                  <div className="grid sm:grid-cols-2 gap-2">{agentTemplates.map((t) => <button key={t.id} onClick={() => applyTemplate(t)} className={cx('flat p-3 text-left hover:bg-[var(--surface)] flex gap-3 items-center', s.name === t.name && 'border-[var(--accent)]')}><AgentAvatar name={t.name} icon={t.icon} color={t.color} size={34} /><span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">{t.name}</span><span className="block text-[11.5px] muted truncate">{t.description}</span></span><span className="text-[11px] muted">{t.tools.length} abilities</span></button>)}</div></div>
              </>}
              {step === 1 && <>
                <div><h2 className="display text-[22px] font-bold">What can it do?</h2><div className="text-[13px] muted mt-1">Tap to switch abilities on. A lock means it always asks a person first.</div></div>
                {cats.filter((c) => abil.some((a) => a.category === c)).map((c) => (
                  <div key={c}><div className="text-[11px] font-semibold uppercase tracking-wider muted mb-2">{c === 'Custom' ? 'Your APIs' : c}</div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{abil.filter((a) => a.category === c).map((a) => { const on = s.tools.has(a.id); const I = a.icon; return (
                      <button key={a.id} onClick={() => toggle('tools', a.id)} className={cx('flat p-3 text-left flex items-center gap-3 relative transition-all', on && 'border-[var(--accent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]')}>
                        <span className={cx('w-9 h-9 rounded-[10px] grid place-items-center shrink-0', on ? 'bg-[var(--accent)] text-white' : 'pressed muted')}><I size={16} /></span>
                        <span className="min-w-0"><span className="block text-[13px] font-semibold">{a.label}</span><span className="block text-[11px] muted">{a.sub}</span></span>
                        {a.gated && <Lock size={11} className="absolute top-2.5 right-2.5 text-[var(--warn)]" />}
                        {on && <Check size={14} className="ml-auto accent-ink shrink-0" />}
                      </button>
                    ) })}</div></div>
                ))}
                <div><h3 className="display text-[15px] font-bold mb-2">Knowledge</h3><div className="flex flex-wrap gap-2">{libraries.map((l) => <button key={l.id} onClick={() => toggle('knowledge', l.id)} className={cx('chip !h-9 !px-3 hover:text-[var(--text)]', s.knowledge.has(l.id) && 'chip-accent')}>{s.knowledge.has(l.id) && <Check size={12} />}{l.name} · {l.docs.length}</button>)}</div><div className="text-[11.5px] muted mt-2">Attaching a library switches on the "Your knowledge" ability.</div></div>
              </>}
              {step === 2 && <>
                <div><h2 className="display text-[22px] font-bold">How should it work?</h2><div className="text-[13px] muted mt-1">Thinking depth sets the model. Independence sets what it may do alone.</div></div>
                <div><h3 className="display text-[15px] font-bold mb-2">Thinking</h3><div className="grid grid-cols-3 gap-2">{THINKING.map((t) => { const on = s.thinking === t.id; const I = t.icon; return <button key={t.id} onClick={() => set({ thinking: t.id })} className={cx('flat p-4 text-left flex flex-col gap-2', on && 'border-[var(--accent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]')}><span className="flex items-end gap-1 h-5">{[8, 13, 18].map((h, i) => <i key={i} className={cx('block w-1.5 rounded-[2px]', i < t.level ? (on ? 'bg-[var(--accent)]' : 'bg-[var(--muted)]') : 'bg-[var(--clay-dark)]')} style={{ height: h }} />)}</span><span className="text-[13.5px] font-semibold flex items-center gap-1.5"><I size={13} /> {t.label}</span><span className="text-[11.5px] muted">{t.desc}</span><span className="text-[10.5px] muted truncate">{modelFor(t.id).split('/')[1]}</span></button> })}</div></div>
                <div><h3 className="display text-[15px] font-bold mb-2">Independence</h3><div className="grid grid-cols-3 gap-2">{INDEPENDENCE.map((o) => { const locked = o.level === 3 && hasGated; const on = s.autonomy === o.level; const I = o.icon; return <button key={o.level} disabled={locked} onClick={() => set({ autonomy: o.level })} className={cx('flat p-4 text-left flex flex-col gap-2 disabled:opacity-50', on && 'border-[var(--accent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]')}><span className={cx('w-10 h-10 rounded-[12px] grid place-items-center', on ? 'bg-[var(--accent)] text-white' : 'pressed muted')}><I size={17} /></span><span className="text-[13.5px] font-semibold">{o.label}{locked && <Lock size={11} className="inline ml-1.5 muted" />}</span><span className="text-[11.5px] muted">{locked ? 'Not available with abilities that ask a person.' : o.desc}</span></button> })}</div></div>
                <div><h3 className="display text-[15px] font-bold mb-2">Personality</h3><div className="flex flex-wrap gap-2">{TONES.map((t) => <button key={t} onClick={() => toggle('tones', t)} className={cx('chip !h-9 !px-3 hover:text-[var(--text)]', s.tones.has(t) && 'chip-accent')}>{s.tones.has(t) && <Check size={12} />}{t}</button>)}</div></div>
              </>}
              {step === 3 && <>
                <div><h2 className="display text-[22px] font-bold">Name and look</h2><div className="text-[13px] muted mt-1">This is how people find it in Chat and in workflows.</div></div>
                <div><h3 className="display text-[15px] font-bold mb-2">Name</h3><Input autoFocus value={s.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. IT Helpdesk" className="!text-[15px] !h-11" /></div>
                <div><h3 className="display text-[15px] font-bold mb-2">Colour</h3><div className="flex gap-2 flex-wrap">{AGENT_COLORS.map((c) => <button key={c} onClick={() => set({ color: c })} className={cx('w-9 h-9 rounded-full border-2 transition-transform', s.color === c ? 'border-[var(--text)] scale-110' : 'border-transparent')} style={{ background: c }} aria-label="Colour" />)}</div></div>
                <div><h3 className="display text-[15px] font-bold mb-2">Icon</h3><div className="flex gap-2 flex-wrap">{(Object.keys(AGENT_ICONS) as AgentIcon[]).map((k) => { const I = AGENT_ICONS[k]; const on = s.icon === k; return <button key={k} onClick={() => set({ icon: k })} className={cx('w-11 h-11 rounded-[12px] grid place-items-center', on ? 'bg-[var(--accent)] text-white' : 'flat muted hover:text-[var(--text)]')} aria-label={k}><I size={18} /></button> })}</div></div>
                <div className="flat p-4">
                  <div className="flex items-center gap-3">
                    <span className="pressed w-10 h-10 rounded-[12px] grid place-items-center muted"><FileText size={16} /></span>
                    <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold">{writing ? writing : s.instructions && !s.edited ? 'Instructions are ready' : s.edited ? 'Instructions edited by you' : 'Instructions composed from your choices'}</div><div className="text-[12px] muted">{apiKey ? 'Let the Co-Create Assistant write richer instructions and sample prompts, or edit them yourself.' : 'Composed from your purpose, abilities and personality. Edit freely.'}</div></div>
                    {apiKey && <Button size="sm" onClick={writeWithAssistant} disabled={!!writing}><Sparkles size={13} /> {s.instructions && !s.edited ? 'Rewrite' : 'Write for me'}</Button>}
                    <Button size="sm" variant="ghost" onClick={() => set({ showInstr: !s.showInstr })}>{s.showInstr ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {s.showInstr ? 'Hide' : 'View'}</Button>
                  </div>
                  {s.showInstr && <div className="mt-3 flex flex-col gap-3"><Textarea rows={12} value={instructions} onChange={(e) => set({ instructions: e.target.value, edited: true })} className="!leading-relaxed" /><div><div className="text-[12px] font-semibold mb-1">Sample prompts <span className="muted font-normal">· one per line</span></div><Textarea rows={3} value={s.samplePrompts.join('\n')} onChange={(e) => set({ samplePrompts: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} placeholder={'What is the parental leave policy?\nHow do I claim travel expenses?'} /></div></div>}
                </div>
              </>}
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
      <Confirm open={blocker.state === 'blocked'} onClose={() => blocker.state === 'blocked' && blocker.reset()} title="Leave without creating the agent?" danger confirmLabel="Discard" body="What you have filled in so far will be lost." onConfirm={() => blocker.state === 'blocked' && blocker.proceed()} />
    </Page>
  )
}

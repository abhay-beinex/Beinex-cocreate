// New-agent dialog: choose a path (describe, build manually, template, import), with a guided manual builder.
import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wand2, PencilRuler, LayoutTemplate, Upload, ArrowRight, ArrowLeft, Sparkles, Check, Lock, Globe, Brain, BookOpen, Send, Code2, Zap, Scale } from 'lucide-react'
import { useApp, useUser } from '@/store/app'
import { agentTemplates, GOVERNED, MODEL_PROFILES, type Agent, type Autonomy } from '@/lib/data'
import { streamChat } from '@/lib/openrouter'
import { TOOLS } from '@/lib/tools'
import { Button, Input, Modal, Textarea, Toggle, Segmented, cx } from './ui'
import { AgentAvatar, AvatarPicker, AGENT_COLORS } from './AgentAvatar'

type Mode = 'choose' | 'describe' | 'manual' | 'templates'
const catIcon = { Web: Globe, Reasoning: Brain, Knowledge: BookOpen, Actions: Send, Custom: Code2 } as const
const profileIcon = { fast: Zap, balanced: Scale, reasoning: Brain } as const

export function CreateAgentDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (a: Agent) => void }) {
  const store = useApp()
  const user = useUser()!
  const { upsertAgent, defaultModel, apiKey, customTools, libraries, profiles } = store
  const [mode, setMode] = useState<Mode>('choose')
  const [desc, setDesc] = useState('')
  const [designing, setDesigning] = useState<string | null>(null)

  const close = () => { if (designing) return; onClose(); setTimeout(() => { setMode('choose'); setDesc('') }, 200) }
  const create = (t: Partial<Agent> & { name: string }) => {
    const a: Agent = { id: `agent-${Date.now().toString(36)}`, description: '', instructions: `You are a helpful assistant. ${GOVERNED}`, model: defaultModel, tools: [], knowledge: [], autonomy: 2, status: 'draft', version: 1, samplePrompts: [], updatedAt: new Date().toISOString().slice(0, 10), createdBy: user.id, ...t }
    upsertAgent(a); onCreated(a); close()
  }
  const generate = async () => {
    const text = desc.trim(); if (!text) return
    if (!apiKey) { create({ name: 'New agent', description: text.slice(0, 90), instructions: `${text}\n\n${GOVERNED}` }); return }
    setDesigning('Reading your description…')
    const t0 = Date.now()
    const tick = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); setDesigning(s < 4 ? 'Reading your description…' : s < 9 ? 'Writing the instructions…' : s < 14 ? 'Choosing tools and prompts…' : 'Almost there…') }, 1000)
    const sys = `You design AI agents for a governed enterprise platform. Available tools: ${[...TOOLS.map((t) => `${t.name} (${t.desc})`), ...customTools.map((t) => `${t.name} (${t.description})`)].join('; ')}. Icons: sparkles, bot, search, pen, chart, support, globe, shield, book, calculator, mail, briefcase, scale, idea, megaphone, wrench. Given a description, reply ONLY with JSON: {"name": "2-4 words", "description": "one line", "icon": "one icon id", "instructions": "a complete system prompt in second person, 120-250 words, covering purpose, how to answer, what to refuse, ending with: ${GOVERNED}", "tools": ["tool_name", ...], "samplePrompts": ["...", "...", "..."]}. Choose only the tools that are needed.`
    let acc = ''
    try {
      for await (const ev of streamChat({ key: apiKey, model: defaultModel, messages: [{ role: 'system', content: sys }, { role: 'user', content: text }], temperature: 0.3 })) { if (ev.type === 'delta') acc += ev.text; if (ev.type === 'usage') store.recordSpend(ev.usage.cost ?? 0) }
      const j = JSON.parse(acc.replace(/^```json?|```$/g, '').trim())
      const tools = (j.tools ?? []).filter((t: string) => TOOLS.some((x) => x.name === t) || customTools.some((x) => x.name === t))
      create({ name: j.name ?? 'New agent', description: j.description ?? '', instructions: j.instructions ?? '', tools, knowledge: tools.includes('search_knowledge') ? ['company'] : [], samplePrompts: Array.isArray(j.samplePrompts) ? j.samplePrompts : [], icon: typeof j.icon === 'string' ? j.icon : undefined })
    } catch { create({ name: 'New agent', description: text.slice(0, 90), instructions: `${text}\n\n${GOVERNED}`, tools: ['web_search', 'search_knowledge'], knowledge: ['company'] }) }
    finally { clearInterval(tick); setDesigning(null) }
  }
  const importFile = (f: File) => { f.text().then((s) => { try { const j = JSON.parse(s); create({ name: j.name ?? 'Imported agent', description: j.description ?? '', instructions: j.instructions ?? '', tools: Array.isArray(j.tools) ? j.tools : [], knowledge: Array.isArray(j.knowledge) ? j.knowledge : [], samplePrompts: Array.isArray(j.samplePrompts) ? j.samplePrompts : [], model: j.model ?? defaultModel, icon: j.icon, color: j.color, autonomy: j.autonomy ?? 2 }) } catch { alert('That file is not a valid agent export.') } }) }

  const title = mode === 'choose' ? 'New agent' : mode === 'describe' ? 'Describe your agent' : mode === 'manual' ? 'Build an agent' : 'Start from a template'

  return (
    <Modal open={open} onClose={close} title={<span className="flex items-center gap-2">{mode !== 'choose' && !designing && <button onClick={() => setMode('choose')} className="btn btn-ghost btn-sm btn-icon"><ArrowLeft size={15} /></button>}{title}</span>} width={mode === 'manual' ? 820 : 720}>
      {designing ? (
        <div className="py-12 text-center">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2.5, ease: 'linear' }} className="mx-auto mb-4 w-12 h-12 rounded-[14px] grid place-items-center" style={{ background: 'linear-gradient(145deg,#1a4a73,#10385b)' }}><Sparkles size={22} className="text-white" /></motion.div>
          <div className="display text-[16px] font-bold">Co-Create Assistant is designing your agent</div>
          <div className="text-[12.5px] muted mt-1">{designing}</div>
        </div>
      ) : mode === 'choose' ? (
        <div className="flex flex-col gap-3">
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { id: 'describe' as Mode, icon: Wand2, color: '#10385b', title: 'Describe it', body: apiKey ? 'One sentence. The Co-Create Assistant writes the instructions and picks the tools.' : 'Not available right now: models are offline.', disabled: !apiKey },
              { id: 'manual' as Mode, icon: PencilRuler, color: '#0ea5e9', title: 'Build it yourself', body: 'A guided builder: identity, instructions, capabilities. Full control from the first line.' },
              { id: 'templates' as Mode, icon: LayoutTemplate, color: '#8b5cf6', title: 'Start from a template', body: `${agentTemplates.length} ready-made agents for research, writing, data, support and monitoring.` },
            ].map((o) => (
              <button key={o.id} disabled={o.disabled} onClick={() => setMode(o.id)} className="flat p-4 text-left hover:bg-[var(--surface)] disabled:opacity-50 flex flex-col gap-3 min-h-[150px] group">
                <span className="w-10 h-10 rounded-[12px] grid place-items-center text-white" style={{ background: o.color }}><o.icon size={18} /></span>
                <span className="block text-[13.5px] font-semibold">{o.title}</span>
                <span className="block text-[12px] muted leading-relaxed">{o.body}</span>
                <span className="mt-auto text-[12px] font-medium accent-ink inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">Continue <ArrowRight size={12} /></span>
              </button>
            ))}
          </div>
          <label className="flat p-3 flex items-center gap-3 cursor-pointer hover:bg-[var(--surface)]"><Upload size={15} className="muted" /><span className="text-[12.5px]"><span className="font-semibold">Import from JSON</span><span className="muted"> · an agent exported from this workspace or another one</span></span><input type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = '' }} /></label>
        </div>
      ) : mode === 'describe' ? (
        <div className="flex flex-col gap-3">
          <Textarea rows={5} autoFocus value={desc} onChange={(e) => setDesc(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate() }} placeholder="e.g. An agent that answers employee questions about our HR policies from the handbook, in a friendly tone, and asks for approval before promising any exception" />
          <div className="flex flex-wrap gap-1.5">{['Summarise competitor news every morning and flag price changes', 'Turn pasted meeting notes into owners, actions and dates', 'Answer IT helpdesk questions from our docs and escalate the rest'].map((s) => <button key={s} onClick={() => setDesc(s)} className="chip hover:text-[var(--text)]">{s}</button>)}</div>
          <div className="flex items-center justify-between gap-3 mt-2"><span className="text-[11.5px] muted">Be specific about the audience, the tone and what it must not do. Everything stays editable afterwards.</span><Button variant="primary" onClick={generate} disabled={!desc.trim()}>Create <ArrowRight size={14} /></Button></div>
        </div>
      ) : mode === 'templates' ? (
        <div className="grid sm:grid-cols-2 gap-2">
          {agentTemplates.map((t) => (
            <button key={t.id} onClick={() => create({ ...t, knowledge: t.tools.includes('search_knowledge') ? ['company'] : [] })} className="flat p-3 text-left hover:bg-[var(--surface)] flex gap-3">
              <AgentAvatar name={t.name} icon={t.icon} color={t.color} size={36} />
              <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">{t.name}</span><span className="block text-[11.5px] muted">{t.description}</span><span className="block text-[11px] muted mt-1">{t.tools.length} tools · {t.model?.split('/')[1]}</span></span>
            </button>
          ))}
        </div>
      ) : (
        <ManualBuilder onCreate={create} customTools={customTools} libraries={libraries} profiles={profiles} defaultModel={defaultModel} />
      )}
    </Modal>
  )
}

function ManualBuilder({ onCreate, customTools, libraries, profiles, defaultModel }: { onCreate: (a: Partial<Agent> & { name: string }) => void; customTools: { name: string; label: string; description: string }[]; libraries: { id: string; name: string; docs: unknown[] }[]; profiles: { id: string; model: string }[]; defaultModel: string }) {
  const [step, setStep] = useState(0)
  const [b, setB] = useState({ name: '', description: '', icon: 'sparkles', color: AGENT_COLORS[0], role: '', tasks: '', style: 'Clear and concise. Use short paragraphs and bullet points where helpful.', refuse: '', unsure: 'Say what is missing and ask a clarifying question instead of guessing.', custom: '', tools: [] as string[], knowledge: [] as string[], model: defaultModel, autonomy: 2 as Autonomy, prompts: '' })
  const set = (p: Partial<typeof b>) => setB((x) => ({ ...x, ...p }))

  const composed = useMemo(() => {
    const lines: string[] = []
    lines.push(`You are ${b.name ? `${b.name}, ` : ''}${b.role.trim() || 'a helpful assistant'}.`)
    if (b.tasks.trim()) lines.push(`\nWhat you do:\n${b.tasks.trim().split('\n').filter(Boolean).map((l) => `- ${l.replace(/^[-•]\s*/, '')}`).join('\n')}`)
    if (b.style.trim()) lines.push(`\nHow you answer:\n${b.style.trim()}`)
    if (b.refuse.trim()) lines.push(`\nWhat you must not do:\n${b.refuse.trim().split('\n').filter(Boolean).map((l) => `- ${l.replace(/^[-•]\s*/, '')}`).join('\n')}`)
    if (b.unsure.trim()) lines.push(`\nWhen unsure:\n${b.unsure.trim()}`)
    if (b.custom.trim()) lines.push(`\n${b.custom.trim()}`)
    lines.push(`\n${GOVERNED}`)
    return lines.join('\n')
  }, [b])

  const steps = ['Identity', 'Instructions', 'Capabilities', 'Review']
  const canNext = step === 0 ? b.name.trim().length > 1 : step === 1 ? b.role.trim().length > 3 : true
  const toolRows = [...TOOLS.map((t) => ({ name: t.name, label: t.label, desc: t.desc, write: t.write, cat: t.category as keyof typeof catIcon })), ...customTools.map((t) => ({ name: t.name, label: t.label, desc: t.description, write: false, cat: 'Custom' as const }))]
  const cats = ['Web', 'Reasoning', 'Knowledge', 'Actions', ...(customTools.length ? ['Custom'] : [])] as (keyof typeof catIcon)[]
  const hasWrite = b.tools.some((t) => TOOLS.find((x) => x.name === t)?.write)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <button key={s} onClick={() => i < step && setStep(i)} className={cx('flex items-center gap-2 text-[12px] font-semibold', i === step ? 'text-[var(--text)]' : i < step ? 'accent-ink' : 'muted')}>
            <span className={cx('w-5 h-5 rounded-full grid place-items-center text-[10.5px]', i === step ? 'bg-[var(--accent)] text-white' : i < step ? 'bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] accent-ink' : 'bg-[var(--clay-dark)]')}>{i < step ? <Check size={11} /> : i + 1}</span>{s}
            {i < steps.length - 1 && <span className="w-6 h-px bg-[var(--line)] ml-1" />}
          </button>
        ))}
      </div>

      <AnimatePresence initial={false}>
        <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18 }} className="min-h-[340px]">
          {step === 0 && (
            <div className="grid md:grid-cols-[1fr_300px] gap-6">
              <div className="flex flex-col gap-4">
                <div><div className="text-[12px] font-semibold mb-1.5">Name</div><Input autoFocus value={b.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. HR Policy Helper" /><div className="text-[11.5px] muted mt-1.5">Short and specific. People see this in Chat and in workflow steps.</div></div>
                <div><div className="text-[12px] font-semibold mb-1.5">One-line description</div><Input value={b.description} onChange={(e) => set({ description: e.target.value })} placeholder="e.g. Answers HR policy questions from the handbook and escalates exceptions" /><div className="text-[11.5px] muted mt-1.5">Say what it does and for whom. Shown on cards and used by the assistant to pick the right agent.</div></div>
              </div>
              <div className="flat p-4">
                <div className="flex items-center gap-3 mb-4"><AgentAvatar name={b.name || 'Agent'} icon={b.icon} color={b.color} size={44} /><div className="min-w-0"><div className="text-[13.5px] font-semibold truncate">{b.name || 'Your agent'}</div><div className="text-[11.5px] muted truncate">{b.description || 'Description'}</div></div></div>
                <AvatarPicker icon={b.icon} color={b.color} onChange={(p) => set(p)} />
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="grid md:grid-cols-[1fr_320px] gap-6">
              <div className="flex flex-col gap-4">
                <Block label="Role" hint="Complete the sentence: You are…"><Input autoFocus value={b.role} onChange={(e) => set({ role: e.target.value })} placeholder="an HR policy assistant for employees of Beinex" /></Block>
                <Block label="What it does" hint="One task per line."><Textarea rows={3} value={b.tasks} onChange={(e) => set({ tasks: e.target.value })} placeholder={'Answer questions about leave, expenses and benefits from the handbook\nPoint to the exact policy section\nDraft an email to HR when a case needs a person'} /></Block>
                <Block label="How it answers" hint="Tone, length, format, language."><Textarea rows={2} value={b.style} onChange={(e) => set({ style: e.target.value })} /></Block>
                <Block label="What it must not do" hint="One rule per line."><Textarea rows={2} value={b.refuse} onChange={(e) => set({ refuse: e.target.value })} placeholder={'Never promise an exception to policy\nDo not answer questions outside HR topics'} /></Block>
                <Block label="When unsure"><Input value={b.unsure} onChange={(e) => set({ unsure: e.target.value })} /></Block>
                <Block label="Anything else" hint="Optional. Added verbatim."><Textarea rows={2} value={b.custom} onChange={(e) => set({ custom: e.target.value })} /></Block>
              </div>
              <div className="flat p-4 flex flex-col min-h-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider muted mb-2">Instructions preview</div>
                <pre className="text-[12px] whitespace-pre-wrap leading-relaxed muted overflow-auto max-h-[420px] font-sans">{composed}</pre>
                <div className="text-[11px] muted mt-2">Composed from your answers. You can edit the full text in the editor afterwards.</div>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="grid md:grid-cols-[1fr_300px] gap-6">
              <div className="flex flex-col gap-3">
                <div className="text-[12px] font-semibold">Tools <span className="muted font-normal">· {b.tools.length} selected</span></div>
                {cats.map((c) => { const I = catIcon[c]; return (
                  <div key={c}>
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider muted mb-1"><I size={12} /> {c}</div>
                    <div className="flat divide-y divide-[var(--line)]">{toolRows.filter((t) => t.cat === c).map((t) => (
                      <label key={t.name} className="flex items-center gap-3 px-3 h-10 cursor-pointer"><div className="flex-1 min-w-0"><div className="text-[12.5px] font-medium flex items-center gap-1.5">{t.label}{t.write && <Lock size={11} className="muted" />}</div><div className="text-[11px] muted truncate">{t.desc}</div></div><Toggle checked={b.tools.includes(t.name)} onChange={(v) => setB((x) => ({ ...x, tools: v ? [...x.tools, t.name] : x.tools.filter((n) => n !== t.name) }))} /></label>
                    ))}</div>
                  </div>
                ) })}
              </div>
              <div className="flex flex-col gap-4">
                <div><div className="text-[12px] font-semibold mb-1.5">Knowledge</div><div className="flat divide-y divide-[var(--line)]">{libraries.map((l) => <label key={l.id} className="flex items-center gap-3 px-3 h-10 cursor-pointer"><span className="flex-1 text-[12.5px]">{l.name} <span className="muted">· {l.docs.length}</span></span><Toggle checked={b.knowledge.includes(l.id)} onChange={(v) => setB((x) => ({ ...x, knowledge: v ? [...x.knowledge, l.id] : x.knowledge.filter((k) => k !== l.id), tools: v && !x.tools.includes('search_knowledge') ? [...x.tools, 'search_knowledge'] : x.tools }))} /></label>)}</div></div>
                <div><div className="text-[12px] font-semibold mb-1.5">Model</div><div className="flex flex-col gap-1.5">{MODEL_PROFILES.map((p) => { const id = profiles.find((x) => x.id === p.id)?.model ?? p.model; const I = profileIcon[p.id]; const on = b.model === id; return <button key={p.id} onClick={() => set({ model: id })} className={cx('flat p-2.5 text-left flex items-center gap-2.5', on && 'border-[var(--accent)]')}><span className={cx('w-7 h-7 rounded-[8px] grid place-items-center', on ? 'bg-[var(--accent)] text-white' : 'bg-[var(--clay-dark)] muted')}><I size={13} /></span><span className="min-w-0"><span className="block text-[12.5px] font-semibold">{p.name}</span><span className="block text-[11px] muted truncate">{p.purpose}</span></span>{on && <Check size={13} className="ml-auto accent-ink" />}</button> })}</div></div>
                <div><div className="text-[12px] font-semibold mb-1.5">Autonomy</div><Segmented value={String(hasWrite && b.autonomy === 3 ? 2 : b.autonomy) as '1' | '2' | '3'} onChange={(v) => set({ autonomy: Number(v) as Autonomy })} items={[{ id: '1', label: 'Notify' }, { id: '2', label: 'Approve' }, { id: '3', label: hasWrite ? 'Locked' : 'Act' }]} /><div className="text-[11px] muted mt-1.5">{['Gated tools are switched off.', 'Gated actions wait for a person.', hasWrite ? 'Locked because gated tools are on.' : 'No gated tools, so nothing needs approval.'][(hasWrite && b.autonomy === 3 ? 2 : b.autonomy) - 1]}</div></div>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="grid md:grid-cols-[1fr_320px] gap-6">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3"><AgentAvatar name={b.name} icon={b.icon} color={b.color} size={44} /><div><div className="text-[15px] font-semibold">{b.name}</div><div className="text-[12.5px] muted">{b.description || 'No description'}</div></div></div>
                <div className="grid grid-cols-3 gap-2 text-[12px]">
                  <div className="flat p-3"><div className="muted">Model</div><div className="font-medium truncate">{b.model.split('/')[1] ?? b.model}</div></div>
                  <div className="flat p-3"><div className="muted">Tools</div><div className="font-medium">{b.tools.length || 'None'}</div></div>
                  <div className="flat p-3"><div className="muted">Knowledge</div><div className="font-medium">{b.knowledge.length || 'None'}</div></div>
                </div>
                <Block label="Sample prompts" hint="One per line. Shown in Chat as suggestions. Optional."><Textarea rows={3} value={b.prompts} onChange={(e) => set({ prompts: e.target.value })} placeholder={'What is the parental leave policy?\nHow do I claim travel expenses?'} /></Block>
                <div className="text-[11.5px] muted">Created as a draft. Test it in the editor preview, then publish to make it available in Chat and workflows.</div>
              </div>
              <div className="flat p-4"><div className="text-[11px] font-semibold uppercase tracking-wider muted mb-2">Instructions</div><pre className="text-[12px] whitespace-pre-wrap leading-relaxed muted overflow-auto max-h-[360px] font-sans">{composed}</pre></div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between pt-2 border-t hairline">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}><ArrowLeft size={14} /> Back</Button>
        {step < steps.length - 1 ? <Button variant="primary" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>Next <ArrowRight size={14} /></Button>
          : <Button variant="primary" onClick={() => onCreate({ name: b.name.trim(), description: b.description.trim(), icon: b.icon, color: b.color, instructions: composed, tools: b.tools, knowledge: b.knowledge, model: b.model, autonomy: hasWrite && b.autonomy === 3 ? 2 : b.autonomy, samplePrompts: b.prompts.split('\n').map((s) => s.trim()).filter(Boolean) })}><Check size={14} /> Create agent</Button>}
      </div>
    </div>
  )
}

const Block = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div><div className="text-[12px] font-semibold mb-1.5">{label}{hint && <span className="muted font-normal"> · {hint}</span>}</div>{children}</div>
)

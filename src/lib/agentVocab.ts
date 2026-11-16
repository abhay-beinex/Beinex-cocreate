// Plain-language vocabulary for agents, used everywhere an agent is shown or edited.
import { Globe, Telescope, Link, Calculator, Code2, Clock, BookOpen, FilePlus, Mail, ShieldCheck, Bell, Hand, Rocket, Zap, Scale, Brain, type LucideIcon } from 'lucide-react'
import type { Agent, Autonomy, CustomTool } from './data'
import { TOOLS } from './tools'

export type Ability = { id: string; label: string; sub: string; icon: LucideIcon; gated: boolean; category: 'Web' | 'Reasoning' | 'Knowledge' | 'Actions' | 'Custom' }

const BUILT_IN: Record<string, Omit<Ability, 'id' | 'category' | 'gated'>> = {
  web_search: { label: 'Web search', sub: 'Read only', icon: Globe },
  deep_research: { label: 'Deep research', sub: 'Read only', icon: Telescope },
  read_url: { label: 'Read pages', sub: 'Read only', icon: Link },
  calculate: { label: 'Calculate', sub: 'Read only', icon: Calculator },
  run_javascript: { label: 'Run code', sub: 'Sandboxed', icon: Code2 },
  current_datetime: { label: 'Date and time', sub: 'Read only', icon: Clock },
  search_knowledge: { label: 'Your knowledge', sub: 'Read only', icon: BookOpen },
  save_document: { label: 'Save documents', sub: 'Writes to outputs', icon: FilePlus },
  draft_email: { label: 'Draft emails', sub: 'Asks a person', icon: Mail },
  request_approval: { label: 'Ask approval', sub: 'Asks a person', icon: ShieldCheck },
}

export const abilities = (custom: CustomTool[] = []): Ability[] => [
  ...TOOLS.map((t) => ({ id: t.name, category: t.category, gated: t.write, ...(BUILT_IN[t.name] ?? { label: t.label, sub: t.write ? 'Asks a person' : 'Read only', icon: Globe }) })),
  ...custom.map((c) => ({ id: c.name, label: c.label, sub: 'Your API', icon: Code2, gated: false, category: 'Custom' as const })),
]
export const abilityOf = (id: string, custom: CustomTool[] = []) => abilities(custom).find((a) => a.id === id)

export const THINKING = [
  { id: 'fast', label: 'Fast', desc: 'Quick replies and simple lookups', level: 1, icon: Zap },
  { id: 'balanced', label: 'Balanced', desc: 'Right for most agents', level: 2, icon: Scale },
  { id: 'reasoning', label: 'Deep', desc: 'Research and hard analysis', level: 3, icon: Brain },
] as const
export type ThinkingId = (typeof THINKING)[number]['id']

export const INDEPENDENCE: { level: Autonomy; label: string; desc: string; icon: LucideIcon }[] = [
  { level: 1, label: 'Inform', desc: 'Never acts. Tells you what it found.', icon: Bell },
  { level: 2, label: 'Ask first', desc: 'Drafts actions. A person approves.', icon: Hand },
  { level: 3, label: 'Act', desc: 'Acts on read-only abilities by itself.', icon: Rocket },
]

export const TONES = ['Friendly', 'Formal', 'Concise', 'Detailed', 'Cites sources', 'Plain English', 'Asks before guessing'] as const
export const toneLine = (tones: string[]) => {
  const map: Record<string, string> = {
    Friendly: 'warm and friendly', Formal: 'formal and professional', Concise: 'concise, with short paragraphs and bullets where helpful', Detailed: 'thorough, covering the important details',
    'Cites sources': 'citing sources and document titles for every fact', 'Plain English': 'in plain English with no jargon', 'Asks before guessing': 'asking a clarifying question whenever something is unclear',
  }
  return tones.map((t) => map[t]).filter(Boolean).join('; ')
}

export const applyTonesToInstructions = (instructions: string, tones: string[]): string => {
  const tl = toneLine(tones)
  const line = tl ? `How you answer: ${tl}.` : ''
  if (/(?:^|\n)How you answer:[^\n]*/i.test(instructions)) {
    return line
      ? instructions.replace(/(^|\n)How you answer:[^\n]*/i, `$1${line}`)
      : instructions.replace(/\n?How you answer:[^\n]*\n?/i, '\n').replace(/\n{3,}/g, '\n\n').trim()
  }
  if (!line) return instructions
  if (/\n\n(When unsure|Use your abilities)/i.test(instructions)) {
    return instructions.replace(/\n\n(When unsure|Use your abilities)/i, `\n\n${line}\n\n$1`)
  }
  const parts = instructions.trim().split(/\n\n+/)
  if (parts.length > 1) {
    parts.splice(1, 0, line)
    return parts.join('\n\n')
  }
  return `${instructions.trim()}\n\n${line}`
}

/** Which thinking profile an agent's model corresponds to, if any. */
export const thinkingOf = (agent: Pick<Agent, 'model'>, profiles: { id: string; model: string }[], defaultModel: string) => {
  const hit = profiles.find((p) => p.model === agent.model)
  if (hit) return THINKING.find((t) => t.id === hit.id) ?? THINKING[1]
  if (agent.model === defaultModel) return THINKING[1]
  return undefined
}

export type Readiness = { score: number; total: number; items: { id: string; label: string; ok: boolean; fixable: boolean }[] }
export const readiness = (a: Agent, opts: { tested?: boolean } = {}): Readiness => {
  const gated = a.tools.some((t) => TOOLS.find((x) => x.name === t)?.write)
  const items = [
    { id: 'name', label: 'Give it a real name', ok: !!a.name.trim() && a.name !== 'New agent' && a.name !== 'Untitled agent', fixable: true },
    { id: 'description', label: 'Describe what it does in one line', ok: !!a.description.trim(), fixable: true },
    { id: 'instructions', label: 'Write instructions of at least a few sentences', ok: a.instructions.trim().length >= 120, fixable: true },
    { id: 'escalate', label: 'Say what to do when unsure', ok: /unsure|ask|missing|uncertain|escalat/i.test(a.instructions), fixable: true },
    { id: 'abilities', label: 'Switch on at least one ability', ok: a.tools.length > 0, fixable: false },
    { id: 'knowledge', label: 'Attach knowledge if it searches your knowledge', ok: !a.tools.includes('search_knowledge') || a.knowledge.length > 0, fixable: false },
    { id: 'prompts', label: 'Add two or three sample prompts', ok: a.samplePrompts.length >= 2, fixable: true },
    { id: 'tested', label: 'Try it once in Test drive', ok: !!opts.tested, fixable: false },
    { id: 'tests', label: 'Add tests and pass them', ok: (a.tests?.length ?? 0) > 0 && a.tests!.every((t) => t.last?.pass), fixable: false },
  ]
  if (gated && a.autonomy === 1) items.push({ id: 'gated', label: 'Independence is Inform, so gated abilities are off', ok: false, fixable: false })
  return { score: items.filter((i) => i.ok).length, total: items.length, items }
}

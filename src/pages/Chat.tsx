import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Sparkles, Plus, ChevronDown, Users } from 'lucide-react'
import { useApp } from '@/store/app'
import { Tile, colorFor, cx, SearchBox } from '@/components/ui'
import { Page } from '@/components/motion'
import { Thread, Composer, useAgentChat, type AgentLike } from '@/components/ChatThread'
import { BRAND } from '@/lib/data'

const ASSISTANT: AgentLike = {
  id: 'assistant', name: `${BRAND.name} Assistant`, description: 'General help across finance, agents and workflows',
  instructions: `You are the ${BRAND.full} assistant for a UAE public-sector finance team. Be concise, accurate and governed: you never change company data yourself; you recommend, draft, and route to a human approver. Use the tools to answer with real records rather than guessing. Use markdown sparingly. Currency is AED. If unsure, say so.`,
  model: '', tools: ['lookup_invoice', 'lookup_purchase_order', 'find_duplicates', 'lookup_supplier', 'list_suppliers', 'search_knowledge'], knowledge: ['finance-policies', 'vat-guidance'],
  samplePrompts: ['What needs my approval today?', 'Which suppliers have a licence expiring soon?', 'Explain the AED 50,000 approval rule'],
}

export default function Chat() {
  const { agentId } = useParams()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const { agents, councils, defaultModel, models } = useApp()
  const [filter, setFilter] = useState('')
  const [model, setModel] = useState('')

  const current = useMemo(() => agents.find((a) => a.id === agentId), [agentId, agents])
  const agent: AgentLike = current ? { ...current } : { ...ASSISTANT, model: defaultModel }
  const key = current?.id ?? 'assistant'
  const activeModel = model || agent.model
  const chat = useAgentChat(agent, `chat:${key}`)

  const sentQ = useRef<string | null>(null)
  useEffect(() => { const q = params.get('q'); if (q && sentQ.current !== q) { sentQ.current = q; setParams({}, { replace: true }); chat.send(q, activeModel) } }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  const list = [{ id: 'assistant', name: ASSISTANT.name }, ...agents.map((a) => ({ id: a.id, name: a.name }))].filter((a) => a.name.toLowerCase().includes(filter.toLowerCase()))

  return (
    <Page className="h-full grid grid-cols-[240px_1fr] gap-3">
      <aside className="clay p-3 flex flex-col min-h-0">
        <SearchBox value={filter} onChange={setFilter} placeholder="Search" className="mb-2" />
        <div className="flex flex-col gap-0.5 scroll min-h-0">
          {list.map((a) => (
            <button key={a.id} onClick={() => nav(a.id === 'assistant' ? '/chat' : `/chat/${a.id}`)} className={cx('flex items-center gap-2.5 px-2 h-10 rounded-[10px] text-left hover:bg-[var(--clay-dark)]', key === a.id && 'bg-[var(--surface-2)] shadow-[0_1px_2px_rgba(16,24,40,.06)]')}>
              <Tile color={a.id === 'assistant' ? '#10385b' : colorFor(a.name)} size={26} radius={8}>{a.id === 'assistant' ? <Sparkles size={13} /> : <span className="text-[11px] font-bold">{a.name[0]}</span>}</Tile>
              <span className="text-[13px] font-medium truncate">{a.name}</span>
            </button>
          ))}
          {councils.length > 0 && <div className="text-[10.5px] font-semibold uppercase tracking-wider muted px-2 mt-3 mb-1">Councils</div>}
          {councils.map((c) => (
            <button key={c.id} onClick={() => nav(`/agents?tab=councils&open=${c.id}`)} className="flex items-center gap-2.5 px-2 h-10 rounded-[10px] text-left hover:bg-[var(--clay-dark)] muted">
              <Tile color={colorFor(c.name)} size={26} radius={8}><Users size={13} /></Tile><span className="text-[13px] font-medium truncate">{c.name}</span>
            </button>
          ))}
        </div>
        <button onClick={() => nav('/agents')} className="mt-auto btn btn-ghost btn-sm justify-start"><Plus size={14} /> New agent</button>
      </aside>

      <section className="clay flex flex-col min-h-0">
        <header className="flex items-center gap-3 px-5 h-14 border-b hairline">
          <div className="font-semibold text-[14px]">{agent.name}</div>
          <span className="muted text-[12.5px] truncate">{agent.description}</span>
          <div className="flex-1" />
          {chat.msgs.length > 0 && <button className="text-[12px] muted hover:text-[var(--text)]" onClick={chat.clear}>New chat</button>}
        </header>
        <div className="flex-1 scroll"><Thread msgs={chat.msgs} agent={agent} onPrompt={(p) => chat.send(p, activeModel)} /></div>
        <footer className="px-5 pb-4">
          <div className="max-w-[720px] mx-auto">
            <Composer onSend={(t) => chat.send(t, activeModel)} busy={chat.busy} onStop={chat.stop} placeholder={`Message ${agent.name}…`}
              right={<label className="relative muted hover:text-[var(--text)] text-[11.5px] font-medium flex items-center gap-1 h-9 px-2 cursor-pointer shrink-0">
                {activeModel.split('/')[1] ?? activeModel} <ChevronDown size={12} />
                <select value={activeModel} onChange={(e) => setModel(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer">
                  {!models.some((m) => m.id === activeModel) && <option value={activeModel}>{activeModel}</option>}
                  {models.slice(0, 250).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>} />
            <div className="text-[11px] muted mt-2 px-1">Governed chat. Tools read pilot data; anything that writes is queued for a human.</div>
          </div>
        </footer>
      </section>
    </Page>
  )
}

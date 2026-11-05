// Chat v2: threads (many per agent), switch the agent and thinking level per thread, attach files, act on answers.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Sparkles, Plus, ChevronDown, Trash2, Pencil, MessageSquare, Search } from 'lucide-react'
import { useApp } from '@/store/app'
import { Tile, cx } from '@/components/ui'
import { AgentAvatar } from '@/components/AgentAvatar'
import { Page } from '@/components/motion'
import { Thread, Composer, useAgentChat, type AgentLike, type Attachment } from '@/components/ChatThread'
import { THINKING, thinkingOf } from '@/lib/agentVocab'
import { BRAND, GOVERNED, type Thread as ThreadT } from '@/lib/data'

const ASSISTANT: AgentLike = {
  id: 'assistant', name: `${BRAND.name} Assistant`, description: 'Searches the web, reads pages, calculates, runs code and uses your knowledge. External actions wait for a person.',
  instructions: `You are the ${BRAND.full} assistant. Use the tools to answer with real information: search the web for anything current, read pages when a URL is given, calculate exactly, and run JavaScript for data work. When a file is attached, work from its contents. Cite sources as links. Be concise and use markdown sparingly. ${GOVERNED}`,
  model: '', tools: ['web_search', 'deep_research', 'read_url', 'calculate', 'run_javascript', 'current_datetime', 'search_knowledge', 'save_document', 'draft_email', 'request_approval'], knowledge: ['company'],
  samplePrompts: ['What happened in AI this week?', 'Summarise the Wikipedia page on Dubai in 3 bullets', 'Compound 1.2M at 18% for 4 years', 'Draft a short note announcing a new expense policy'],
}
const uid = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
const dayOf = (t: number) => { const d = new Date(t); const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1); return d.toDateString() === today.toDateString() ? 'Today' : d.toDateString() === y.toDateString() ? 'Yesterday' : Date.now() - t < 7 * 86400000 ? 'This week' : 'Earlier' }

export default function Chat() {
  const { agentId } = useParams()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const store = useApp()
  const { agents, threads, chats, upsertThread, removeThread, defaultModel, profiles, addDoc } = store
  const [filter, setFilter] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const threadId = params.get('t')

  // threads with messages, or the current one
  const list = useMemo(() => threads.filter((t) => (chats[`thread:${t.id}`]?.length ?? 0) > 0 || t.id === threadId).filter((t) => t.title.toLowerCase().includes(filter.toLowerCase())).sort((a, b) => b.updatedAt - a.updatedAt), [threads, chats, threadId, filter])
  const thread = threads.find((t) => t.id === threadId)
  const keepQ = (t: string): Record<string, string> => { const q = params.get('q'); return q ? { t, q } : { t } }
  const newThread = (aid = 'assistant', model?: string) => { const t: ThreadT = { id: uid(), agentId: aid, title: 'New chat', createdAt: Date.now(), updatedAt: Date.now(), model }; upsertThread(t); setParams(keepQ(t.id), { replace: true }); return t }

  // /chat/:agentId opens (or starts) a thread with that agent; ?q= sends a first message to the assistant
  const booted = useRef<string | null>(null)
  useEffect(() => {
    if (agentId) { const existing = threads.find((t) => t.agentId === agentId && (chats[`thread:${t.id}`]?.length ?? 0) === 0); const t = existing ?? { id: uid(), agentId, title: 'New chat', createdAt: Date.now(), updatedAt: Date.now() }; if (!existing) upsertThread(t); nav(`/chat?t=${t.id}`, { replace: true }); return }
    if (!thread) { const empty = threads.find((t) => (chats[`thread:${t.id}`]?.length ?? 0) === 0); if (empty) setParams(keepQ(empty.id), { replace: true }); else newThread() }
  }, [agentId, threadId]) // eslint-disable-line react-hooks/exhaustive-deps

  const current = useMemo(() => agents.find((a) => a.id === thread?.agentId), [agents, thread?.agentId])
  const agent: AgentLike = current ? { ...current } : { ...ASSISTANT, model: defaultModel }
  const key = thread ? `thread:${thread.id}` : undefined
  const chat = useAgentChat(agent, key)
  const activeModel = thread?.model || agent.model
  const thinking = thinkingOf({ model: activeModel }, profiles, defaultModel)

  const send = (text: string, files: Attachment[] = []) => {
    if (!thread) return
    const first = (chat.msgs.length === 0)
    upsertThread({ ...thread, title: first ? (text.trim() || files[0]?.name || 'New chat').slice(0, 60) : thread.title, updatedAt: Date.now() })
    chat.send(text, activeModel, files)
  }
  useEffect(() => { const q = params.get('q'); if (q && thread && booted.current !== q) { booted.current = q; setParams({ t: thread.id }, { replace: true }); send(q) } }, [params, thread]) // eslint-disable-line react-hooks/exhaustive-deps

  const switchAgent = (aid: string) => { if (!thread) return; upsertThread({ ...thread, agentId: aid, model: undefined, updatedAt: thread.updatedAt }) }
  const setThinking = (id: string) => { if (!thread) return; upsertThread({ ...thread, model: profiles.find((p) => p.id === id)?.model ?? defaultModel }) }
  const onAction = (a: 'save' | 'workflow', m: { content: string }, question?: string) => {
    if (a === 'save') { addDoc('outputs', { title: (question ?? 'Chat answer').slice(0, 80), content: m.content }); return }
    nav(`/workflows/new?template=blank&build=${encodeURIComponent(`Build a workflow that answers this kind of request each time it is run: ${question ?? ''}. The approach that worked: ${m.content.slice(0, 600)}`)}`)
  }
  const groups = useMemo(() => { const g = new Map<string, ThreadT[]>(); for (const t of list) { const k = dayOf(t.updatedAt); g.set(k, [...(g.get(k) ?? []), t]) } return [...g.entries()] }, [list])
  const nameOf = (aid: string) => (aid === 'assistant' ? ASSISTANT.name : agents.find((a) => a.id === aid)?.name ?? 'Deleted agent')
  const live = agents.filter((a) => a.status === 'live' || a.id === thread?.agentId)

  return (
    <Page className="h-full grid grid-cols-[256px_1fr] gap-3">
      <aside className="clay p-3 flex flex-col min-h-0 gap-2">
        <button onClick={() => newThread()} className="btn btn-primary justify-start !h-10"><Plus size={15} /> New chat</button>
        <div className="relative"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 muted" /><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search chats" aria-label="Search chats" className="input !h-9 !pl-8" /></div>
        <div className="flex flex-col gap-0.5 scroll min-h-0 -mx-1 px-1">
          {groups.length === 0 && <div className="text-[12px] muted px-2 py-6 text-center">{filter ? 'No chat matches.' : 'Your chats appear here.'}</div>}
          {groups.map(([day, ts]) => (
            <div key={day} className="mb-2">
              <div className="text-[10.5px] font-semibold uppercase tracking-wider muted px-2 py-1.5">{day}</div>
              {ts.map((t) => { const on = t.id === threadId; const a = agents.find((x) => x.id === t.agentId); return (
                <div key={t.id} className={cx('group flex items-center gap-2 pl-2 pr-1 h-11 rounded-[11px] hover:bg-[var(--clay-dark)]', on && 'bg-[var(--surface-2)] shadow-[0_1px_2px_rgba(16,24,40,.06)]')}>
                  {t.agentId === 'assistant' ? <Tile color="#10385b" size={24} radius={7}><Sparkles size={12} /></Tile> : <AgentAvatar name={a?.name ?? '?'} icon={a?.icon} color={a?.color} size={24} radius={7} />}
                  {renaming === t.id ? <input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { upsertThread({ ...t, title: renameVal.trim() || t.title }); setRenaming(null) } if (e.key === 'Escape') setRenaming(null) }} onBlur={() => { upsertThread({ ...t, title: renameVal.trim() || t.title }); setRenaming(null) }} aria-label="Chat title" className="flex-1 min-w-0 bg-transparent outline-0 text-[12.5px] font-medium border-b border-[var(--accent)]" />
                    : <button onClick={() => setParams({ t: t.id })} className="flex-1 min-w-0 text-left"><span className="block text-[12.5px] font-medium truncate">{t.title}</span><span className="block text-[10.5px] muted truncate">{nameOf(t.agentId)}</span></button>}
                  <div className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                    <button onClick={() => { setRenaming(t.id); setRenameVal(t.title) }} className="btn btn-ghost btn-sm btn-icon !w-7 !h-7" title="Rename" aria-label="Rename chat"><Pencil size={12} /></button>
                    <button onClick={() => { removeThread(t.id); if (on) setParams({}, { replace: true }) }} className="btn btn-ghost btn-sm btn-icon !w-7 !h-7 hover:!text-[var(--danger)]" title="Delete" aria-label="Delete chat"><Trash2 size={12} /></button>
                  </div>
                </div>
              ) })}
            </div>
          ))}
        </div>
      </aside>

      <section className="clay flex flex-col min-h-0">
        <header className="flex items-center gap-3 px-5 h-14 border-b hairline">
          {agent.id === 'assistant' ? <Tile color="#10385b" size={28} radius={9}><Sparkles size={14} /></Tile> : <AgentAvatar name={agent.name} icon={agent.icon} color={agent.color} size={28} radius={9} />}
          <div className="min-w-0"><div className="font-semibold text-[14px] truncate">{thread?.title ?? 'Chat'}</div><div className="muted text-[11.5px] truncate">{agent.name}{thinking ? ` · ${thinking.label}` : ''} · {agent.tools.length} abilities</div></div>
          <div className="flex-1" />
          {chat.msgs.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => newThread(thread?.agentId)}><Plus size={13} /> New chat with {agent.id === 'assistant' ? 'the assistant' : agent.name}</button>}
        </header>
        <div className="flex-1 scroll">
          <Thread msgs={chat.msgs} agent={agent} onPrompt={(p) => send(p)} onAction={onAction} emptyExtra={agent.id === 'assistant' && live.length > 0 ? (
            <div className="mt-8"><div className="text-[11px] font-semibold uppercase tracking-wider muted mb-2">Or chat with an agent</div><div className="flex flex-wrap justify-center gap-2">{live.slice(0, 6).map((a) => <button key={a.id} onClick={() => switchAgent(a.id)} className="flat pl-1.5 pr-3 h-9 flex items-center gap-2 text-[12.5px] font-medium hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--line))]"><AgentAvatar name={a.name} icon={a.icon} color={a.color} size={24} radius={7} />{a.name}</button>)}</div></div>
          ) : undefined} />
        </div>
        <footer className="px-5 pb-4">
          <div className="max-w-[760px] mx-auto">
            <Composer onSend={send} busy={chat.busy} onStop={chat.stop} attach placeholder={`Message ${agent.name}…`}
              left={<label className="relative shrink-0 flex items-center gap-1.5 h-9 pl-1 pr-2 rounded-[10px] hover:bg-[var(--clay-dark)] cursor-pointer text-[12px] font-medium max-w-[180px]" title="Who answers in this chat">
                {agent.id === 'assistant' ? <Tile color="#10385b" size={22} radius={7}><Sparkles size={11} /></Tile> : <AgentAvatar name={agent.name} icon={agent.icon} color={agent.color} size={22} radius={7} />}<span className="truncate">{agent.id === 'assistant' ? 'Assistant' : agent.name}</span><ChevronDown size={12} className="muted" />
                <select value={agent.id} onChange={(e) => switchAgent(e.target.value)} aria-label="Who answers" className="absolute inset-0 opacity-0 cursor-pointer"><option value="assistant">{ASSISTANT.name}</option>{live.map((a) => <option key={a.id} value={a.id}>{a.name}{a.status === 'draft' ? ' · draft' : ''}</option>)}</select>
              </label>}
              right={<label className="relative shrink-0 flex items-center gap-1 h-9 px-2 rounded-[10px] hover:bg-[var(--clay-dark)] cursor-pointer text-[11.5px] font-medium muted hover:text-[var(--text)]" title="Thinking level for this chat">
                {thinking ? <><thinking.icon size={12} /> {thinking.label}</> : <span className="truncate max-w-[110px]">{activeModel.split('/')[1] ?? activeModel}</span>}<ChevronDown size={12} />
                <select value={thinking?.id ?? ''} onChange={(e) => setThinking(e.target.value)} aria-label="Thinking level" className="absolute inset-0 opacity-0 cursor-pointer">{!thinking && <option value="">{activeModel}</option>}{THINKING.map((t) => <option key={t.id} value={t.id}>{t.label} · {t.desc}</option>)}</select>
              </label>} />
            <div className="text-[11px] muted mt-2 px-1 flex items-center gap-1.5"><MessageSquare size={11} /> Attach text files for context. Actions that reach outside wait for a person under Approvals.</div>
          </div>
        </footer>
      </section>
    </Page>
  )
}

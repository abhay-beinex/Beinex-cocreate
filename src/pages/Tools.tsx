import { useState } from 'react'
import { Lock, Globe, Brain, BookOpen, Send, Plus, Trash2, Pencil, Play, Code2, Plug, Check, Loader2 } from 'lucide-react'
import { useApp, useUser, can } from '@/store/app'
import { TOOLS, runTool } from '@/lib/tools'
import type { CustomTool } from '@/lib/data'
import { CONNECTORS, connectorTool } from '@/lib/connectors'
import { Button, Chip, Confirm, Field, Input, Modal, PageHeader, Select, Textarea, Tile } from '@/components/ui'
import { Page, Stagger, Item } from '@/components/motion'

const cats = [
  { id: 'Web', icon: Globe, color: '#0ea5e9', desc: 'Live web search, deep research and page reading.' },
  { id: 'Reasoning', icon: Brain, color: '#8b5cf6', desc: 'Exact maths and a JavaScript sandbox for data work. Runs in the browser.' },
  { id: 'Knowledge', icon: BookOpen, color: '#10b981', desc: 'Search attached libraries and save documents back to the workspace.' },
  { id: 'Actions', icon: Send, color: '#f59e0b', desc: 'External actions. Always queued under Approvals for a person to decide.' },
] as const

const blank = (by: string): CustomTool => ({ id: `ct-${Date.now().toString(36)}`, name: '', label: '', description: '', method: 'GET', url: '', headers: '', body: '', params: [{ name: 'query', description: 'Search text' }], createdBy: by })

export default function Tools() {
  const user = useUser()!
  const { agents, workflows, customTools, upsertCustomTool, removeCustomTool, apiKey, profiles, defaultModel } = useApp()
  const [edit, setEdit] = useState<CustomTool | null>(null)
  const [confirmTool, setConfirmTool] = useState<{ id: string; label: string; used: number; wfUsed: number } | null>(null)
  const [testArgs, setTestArgs] = useState('')
  const [testOut, setTestOut] = useState('')
  const [tryOut, setTryOut] = useState<Record<string, string>>({})
  const [trying, setTrying] = useState<string | null>(null)
  const tryConnector = async (c: (typeof CONNECTORS)[number]) => { setTrying(c.id); const t = customTools.find((x) => x.name === c.name) ?? connectorTool(c, user.id); const out = await runTool(t.name, JSON.stringify(c.sample), { key: apiKey, models: { fast: profiles.find((p) => p.id === 'fast')?.model ?? defaultModel, reasoning: defaultModel }, libraries: [], custom: [t] }); setTryOut((o) => ({ ...o, [c.id]: out })); setTrying(null) }
  const editable = can(user, 'build')

  const valid = edit && /^[a-z][a-z0-9_]{2,40}$/.test(edit.name) && edit.label.trim() && edit.description.trim() && /^https?:\/\//.test(edit.url) && !TOOLS.some((t) => t.name === edit.name) && !customTools.some((t) => t.name === edit.name && t.id !== edit.id)
  const test = async () => {
    if (!edit) return
    setTestOut('Calling…')
    const args: Record<string, string> = {}; testArgs.split('\n').forEach((l) => { const [k, ...v] = l.split('='); if (k && v.length) args[k.trim()] = v.join('=').trim() })
    setTestOut(await runTool(edit.name, JSON.stringify(args), { key: apiKey, models: { fast: profiles.find((p) => p.id === 'fast')?.model ?? defaultModel, reasoning: defaultModel }, libraries: [], custom: [edit] }))
  }

  return (
    <Page className="max-w-[1080px] mx-auto pt-8 pb-16 px-4">
      <PageHeader title="Abilities" subtitle="What agents can do. Built-in abilities are ready to use; add your own API as an ability." actions={editable && <Button variant="primary" onClick={() => { setEdit(blank(user.id)); setTestOut(''); setTestArgs('query=example') }}><Plus size={15} /> Add your API</Button>} />
      <Stagger className="flex flex-col gap-6" delay={0.06}>
        {cats.map((c) => (
          <Item key={c.id}>
            <div className="flex items-center gap-2 mb-2 px-1"><c.icon size={14} className="muted" /><span className="text-[12px] font-semibold">{c.id}</span><span className="text-[12px] muted">· {c.desc}</span></div>
            <div className="clay px-3 py-1">
              {TOOLS.filter((t) => t.category === c.id).map((t) => {
                const used = agents.filter((a) => a.tools.includes(t.name)).length; return (
                  <div key={t.name} className="row">
                    <Tile color={t.write ? '#f59e0b' : c.color} size={34}>{t.write ? <Lock size={15} /> : <c.icon size={15} />}</Tile>
                    <div className="flex-1 min-w-0"><div className="text-[13.5px] font-medium">{t.label} <code className="text-[11px] muted font-normal ml-1">{t.name}</code></div><div className="text-[12px] muted">{t.desc}</div></div>
                    {t.write && <Chip tone="warn">Gated</Chip>}
                    <span className="text-[12.5px] muted w-[90px] text-right">{used} agent{used === 1 ? '' : 's'}</span>
                  </div>
                )
              })}
            </div>
          </Item>
        ))}
        <Item>
          <div className="flex items-center gap-2 mb-2 px-1"><Plug size={14} className="muted" /><span className="text-[12px] font-semibold">Connectors</span><span className="text-[12px] muted">· Ready-made public APIs. Add one and any agent or workflow step can call it.</span></div>
          <div className="clay px-3 py-1">
            {CONNECTORS.map((c) => {
              const added = customTools.find((t) => t.name === c.name); const out = tryOut[c.id]; return (
                <div key={c.id} className="row flex-wrap">
                  <Tile color="#2563eb" size={34}><Globe size={15} /></Tile>
                  <div className="flex-1 min-w-0"><div className="text-[13.5px] font-medium">{c.label} <span className="text-[11px] muted font-normal ml-1">{c.category}</span></div><div className="text-[12px] muted truncate">{c.description}</div></div>
                  <Button size="sm" variant="ghost" onClick={() => tryConnector(c)} disabled={trying === c.id} title={`Try with ${Object.entries(c.sample).map(([k, v]) => `${k}=${v}`).join(', ')}`}>{trying === c.id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Try</Button>
                  {added ? <span className="chip chip-ok !h-7"><Check size={12} /> Added</span> : editable ? <Button size="sm" onClick={() => upsertCustomTool(connectorTool(c, user.id))}><Plus size={12} /> Add</Button> : null}
                  {out && <pre className="basis-full text-[11px] muted whitespace-pre-wrap max-h-32 overflow-auto flat p-2 mt-1">{out.slice(0, 1500)}</pre>}
                </div>
              )
            })}
          </div>
        </Item>
        <Item>
          <div className="flex items-center gap-2 mb-2 px-1"><Code2 size={14} className="muted" /><span className="text-[12px] font-semibold">Your API</span><span className="text-[12px] muted">· HTTP endpoints you define. The agent fills the parameters; the response comes back to it.</span></div>
          <div className="clay px-3 py-1">
            {customTools.length === 0 && <div className="py-8 text-center text-[12.5px] muted">Nothing added yet. Connect any HTTP API that allows browser requests, such as a public data API or your own service.</div>}
            {customTools.map((t) => {
              const used = agents.filter((a) => a.tools.includes(t.name)).length; const wfUsed = workflows.filter((w) => w.nodes.some((n) => n.data.brick === 'tool' && n.data.tool === t.name)).length; return (
                <div key={t.id} className="row">
                  <Tile color={t.connector ? '#2563eb' : '#64748b'} size={34}>{t.connector ? <Globe size={15} /> : <Code2 size={15} />}</Tile>
                  <div className="flex-1 min-w-0"><div className="text-[13.5px] font-medium">{t.label} <code className="text-[11px] muted font-normal ml-1">{t.name}</code></div><div className="text-[12px] muted truncate">{t.method} {t.url}</div></div>
                  <span className="text-[12.5px] muted w-[150px] text-right">{used} agent{used === 1 ? '' : 's'}{wfUsed > 0 ? ` · ${wfUsed} workflow${wfUsed === 1 ? '' : 's'}` : ''}</span>
                  {editable && <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setEdit(t); setTestOut(''); setTestArgs(t.params.map((p) => `${p.name}=`).join('\n')) }}><Pencil size={13} /></button>}
                  {editable && <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setConfirmTool({ id: t.id, label: t.label, used, wfUsed })} aria-label={`Delete ${t.label}`}><Trash2 size={13} /></button>}
                </div>
              )
            })}
          </div>
        </Item>
      </Stagger>

      <Confirm open={!!confirmTool} onClose={() => setConfirmTool(null)} title={`Delete ${confirmTool?.label}?`} danger confirmLabel="Delete" body={confirmTool && (confirmTool.used > 0 || confirmTool.wfUsed > 0) ? `Used by ${[confirmTool.used ? `${confirmTool.used} agent${confirmTool.used === 1 ? '' : 's'}` : '', confirmTool.wfUsed ? `${confirmTool.wfUsed} workflow${confirmTool.wfUsed === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ')}. Workflows using this ability will show a check warning until updated.` : 'No agent or workflow uses it.'} onConfirm={() => confirmTool && removeCustomTool(confirmTool.id)} />
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit && customTools.some((t) => t.id === edit.id) ? 'Edit custom tool' : 'New custom tool'} width={680}>
        {edit && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Label"><Input value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value, name: edit.name || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') })} placeholder="Weather lookup" /></Field>
              <Field label="Tool name" hint="Lowercase, letters, digits and underscores."><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="weather_lookup" /></Field>
            </div>
            <Field label="Description for the agent" hint="Tell the model when to use it and what it returns."><Input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} placeholder="Get the current weather for a city. Returns JSON with temperature and conditions." /></Field>
            <div className="grid grid-cols-[110px_1fr] gap-3">
              <Field label="Method"><Select value={edit.method} onChange={(e) => setEdit({ ...edit, method: e.target.value as 'GET' | 'POST' })}><option>GET</option><option>POST</option></Select></Field>
              <Field label="URL" hint="Use {param} placeholders, e.g. https://api.example.com/search?q={query}"><Input value={edit.url} onChange={(e) => setEdit({ ...edit, url: e.target.value })} placeholder="https://wttr.in/{city}?format=j1" /></Field>
            </div>
            <Field label="Parameters" hint="One per line: name = description">
              <Textarea rows={3} value={edit.params.map((p) => `${p.name} = ${p.description}`).join('\n')} onChange={(e) => setEdit({ ...edit, params: e.target.value.split('\n').map((l) => { const [n, ...d] = l.split('='); return { name: n.trim(), description: d.join('=').trim() } }).filter((p) => p.name) })} />
            </Field>
            <details><summary className="text-[12px] font-semibold cursor-pointer muted">Headers and body</summary>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <Field label="Headers (JSON)"><Textarea rows={3} value={edit.headers} onChange={(e) => setEdit({ ...edit, headers: e.target.value })} placeholder='{"Authorization": "Bearer …"}' /></Field>
                <Field label="Body (POST, with {param})"><Textarea rows={3} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} placeholder='{"q": "{query}"}' /></Field>
              </div>
            </details>
            <div className="flat p-3">
              <div className="text-[12px] font-semibold mb-2 flex items-center gap-2">Test <span className="muted font-normal">name=value per line</span></div>
              <div className="grid grid-cols-[1fr_auto] gap-2"><Textarea rows={2} value={testArgs} onChange={(e) => setTestArgs(e.target.value)} /><Button size="sm" onClick={test} disabled={!valid}><Play size={12} /> Call</Button></div>
              {testOut && <pre className="text-[11px] muted whitespace-pre-wrap mt-2 max-h-40 overflow-auto">{testOut}</pre>}
            </div>
            <div className="text-[11.5px] muted">Calls run from the browser, so the API must allow cross-origin requests. Keys in headers are stored in this workspace only.</div>
            <div className="flex justify-end gap-2"><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" disabled={!valid} onClick={() => { upsertCustomTool(edit); setEdit(null) }}>Save tool</Button></div>
          </div>
        )}
      </Modal>
    </Page>
  )
}

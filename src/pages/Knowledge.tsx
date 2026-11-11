import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, Plus, FileText, Trash2, ChevronRight, Upload, Link2, Type } from 'lucide-react'
import { useApp, useUser, can } from '@/store/app'
import { runTool } from '@/lib/tools'
import { Button, Confirm, Field, Input, Modal, PageHeader, Segmented, Textarea, Tile, colorFor, cx } from '@/components/ui'
import { Page, Stagger, Item } from '@/components/motion'

export default function Knowledge() {
  const user = useUser()!
  const { libraries, agents, addDoc, removeDoc, addLibrary, removeLibrary, apiKey, defaultModel, flashMsg } = useApp()
  const [confirmLib, setConfirmLib] = useState<{ id: string; name: string; count: number } | null>(null)
  const [confirmDoc, setConfirmDoc] = useState<{ lib: string; id: string; title: string } | null>(null)
  const [open, setOpen] = useState<string | null>(libraries[0]?.id ?? null)
  const [adding, setAdding] = useState<string | null>(null)
  const [mode, setMode] = useState<'text' | 'file' | 'url'>('text')
  const [doc, setDoc] = useState({ title: '', content: '', source: '' })
  const [url, setUrl] = useState('')
  const [fetching, setFetching] = useState(false)
  const [newLib, setNewLib] = useState<{ name: string; desc: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const lib = libraries.find((l) => l.id === open) ?? libraries[0]
  const editable = can(user, 'build')

  const readFiles = async (files: FileList) => {
    for (const f of Array.from(files)) {
      if (f.size > 2_000_000) { flashMsg(`${f.name} is over 2 MB. Paste the relevant section instead.`, 'danger'); continue }
      const text = await f.text()
      addDoc(adding!, { title: f.name.replace(/\.(txt|md|csv|json|html?)$/i, ''), content: text.slice(0, 200_000), source: f.name })
    }
    setAdding(null)
  }
  const importUrl = async () => {
    setFetching(true)
    const text = await runTool('read_url', JSON.stringify({ url }), { key: apiKey, models: { fast: defaultModel, reasoning: defaultModel }, libraries: [] })
    setFetching(false)
    if (/^Could not|^Provide a full/.test(text)) { flashMsg(text, 'danger'); return }
    const title = (text.match(/^Title:\s*(.+)$/m)?.[1] ?? url).trim()
    addDoc(adding!, { title, content: text, source: url }); setAdding(null); setUrl('')
  }

  return (
    <Page className="max-w-[1080px] mx-auto pt-8 pb-16 px-4">
      <PageHeader title="Knowledge" subtitle="Libraries of documents agents search and cite." actions={editable && <Button variant="primary" onClick={() => setNewLib({ name: '', desc: '' })}><Plus size={15} /> New library</Button>} />
      <div className="grid grid-cols-[300px_1fr] gap-4">
        <Stagger className="clay px-3 py-1 self-start" delay={0.05}>
          {libraries.map((l) => (
            <Item key={l.id}>
              <button onClick={() => setOpen(l.id)} className={cx('row hover w-full text-left', lib?.id === l.id && 'bg-[var(--clay-dark)] rounded-[12px]')}>
                <Tile color={colorFor(l.name)} size={32} radius={10}><BookOpen size={14} /></Tile>
                <div className="flex-1 min-w-0"><div className="text-[13px] font-medium truncate">{l.name}</div><div className="text-[11.5px] muted">{l.docs.length} document{l.docs.length === 1 ? '' : 's'}</div></div>
                <ChevronRight size={14} className="muted" />
              </button>
            </Item>
          ))}
        </Stagger>
        <AnimatePresence initial={false}>
          {lib && (
            <motion.div key={lib.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }} className="clay p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="flex-1"><h2 className="display text-[17px] font-bold">{lib.name}</h2><p className="muted text-[12.5px]">{lib.desc}</p><div className="text-[11.5px] muted mt-1">Used by {agents.filter((a) => a.knowledge.includes(lib.id)).map((a) => a.name).join(', ') || 'no agents yet'}</div></div>
                {editable && <Button size="sm" variant="primary" onClick={() => { setAdding(lib.id); setMode('text'); setDoc({ title: '', content: '', source: '' }) }}><Plus size={13} /> Add</Button>}
                {editable && lib.id !== 'outputs' && lib.id !== 'company' && <button className="btn btn-ghost btn-sm btn-icon" title="Delete library" onClick={() => setConfirmLib({ id: lib.id, name: lib.name, count: lib.docs.length })} aria-label="Delete library"><Trash2 size={13} /></button>}
              </div>
              <div className="flat divide-y divide-[var(--line)]">
                {lib.docs.length === 0 && <div className="p-6 text-center muted text-[12.5px]">No documents yet. Paste text, upload .txt / .md / .csv / .json files, or import a web page.</div>}
                {lib.docs.map((d) => (
                  <details key={d.id} className="group">
                    <summary className="flex items-center gap-3 px-3 h-12 cursor-pointer list-none">
                      <FileText size={15} className="muted" /><span className="flex-1 text-[13px] font-medium truncate">{d.title}</span><span className="text-[11px] muted">{Math.round(d.content.length / 1000)}k chars · {d.updatedAt}{d.source ? ` · ${d.source.length > 30 ? d.source.slice(0, 30) + '…' : d.source}` : ''}</span>
                      {editable && <button onClick={(e) => { e.preventDefault(); setConfirmDoc({ lib: lib.id, id: d.id, title: d.title }) }} className="muted hover:text-[var(--danger)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Remove ${d.title}`}><Trash2 size={13} /></button>}
                    </summary>
                    <div className="px-3 pb-3 pl-10 text-[12.5px] leading-relaxed muted whitespace-pre-wrap max-h-72 overflow-auto">{d.content}</div>
                  </details>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Confirm open={!!confirmLib} onClose={() => setConfirmLib(null)} title={`Delete "${confirmLib?.name}"?`} danger confirmLabel="Delete" body={`Its ${confirmLib?.count ?? 0} document${confirmLib?.count === 1 ? '' : 's'} are removed and agents lose this library.`} onConfirm={() => { if (confirmLib) { removeLibrary(confirmLib.id); setOpen(libraries[0]?.id ?? null) } }} />
      <Confirm open={!!confirmDoc} onClose={() => setConfirmDoc(null)} title={`Remove "${confirmDoc?.title}"?`} danger confirmLabel="Remove" body="Agents can no longer search or cite it." onConfirm={() => confirmDoc && removeDoc(confirmDoc.lib, confirmDoc.id)} />
      <Modal open={!!adding} onClose={() => setAdding(null)} title="Add to library" width={620}>
        <div className="flex flex-col gap-4">
          <Segmented value={mode} onChange={setMode} items={[{ id: 'text', label: <><Type size={12} className="inline mr-1" />Paste text</> }, { id: 'file', label: <><Upload size={12} className="inline mr-1" />Upload files</> }, { id: 'url', label: <><Link2 size={12} className="inline mr-1" />From URL</> }]} />
          {mode === 'text' && <>
            <Field label="Title"><Input value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} placeholder="e.g. Travel expense policy" /></Field>
            <Field label="Content"><Textarea rows={8} value={doc.content} onChange={(e) => setDoc({ ...doc, content: e.target.value })} /></Field>
            <div className="flex justify-end"><Button variant="primary" disabled={!doc.title.trim() || !doc.content.trim()} onClick={() => { addDoc(adding!, doc); setAdding(null) }}>Add</Button></div>
          </>}
          {mode === 'file' && <>
            <button onClick={() => fileRef.current?.click()} className="flat p-10 text-center hover:bg-[var(--surface)]"><Upload size={20} className="mx-auto muted mb-2" /><div className="text-[13px] font-medium">Choose files</div><div className="text-[12px] muted">.txt, .md, .csv, .json or .html · up to 2 MB each</div></button>
            <input ref={fileRef} type="file" multiple accept=".txt,.md,.csv,.json,.html,.htm,text/*" className="hidden" onChange={(e) => { if (e.target.files?.length) readFiles(e.target.files); e.target.value = '' }} />
            <div className="text-[11.5px] muted">PDF and Word import arrive with the production roll-out; export them to text for now.</div>
          </>}
          {mode === 'url' && <>
            <Field label="Web page URL" hint="The readable text of the page is saved as a document."><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></Field>
            <div className="flex justify-end"><Button variant="primary" disabled={!/^https?:\/\//.test(url) || fetching} onClick={importUrl}>{fetching ? 'Reading…' : 'Import'}</Button></div>
          </>}
        </div>
      </Modal>
      <Modal open={!!newLib} onClose={() => setNewLib(null)} title="New library" width={480}>
        {newLib && <div className="flex flex-col gap-4">
          <Field label="Name"><Input value={newLib.name} onChange={(e) => setNewLib({ ...newLib, name: e.target.value })} /></Field>
          <Field label="Description"><Input value={newLib.desc} onChange={(e) => setNewLib({ ...newLib, desc: e.target.value })} /></Field>
          <div className="flex justify-end"><Button variant="primary" disabled={!newLib.name.trim()} onClick={() => { addLibrary(newLib.name.trim(), newLib.desc.trim()); setNewLib(null) }}>Create</Button></div>
        </div>}
      </Modal>
    </Page>
  )
}

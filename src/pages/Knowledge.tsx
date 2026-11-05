import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, Plus, FileText, Trash2, ChevronRight } from 'lucide-react'
import { useApp, useUser, can } from '@/store/app'
import { Button, Field, Input, Modal, PageHeader, Textarea, Tile, colorFor, cx } from '@/components/ui'
import { Page, Stagger, Item } from '@/components/motion'

export default function Knowledge() {
  const user = useUser()!
  const { libraries, agents, addDoc, removeDoc, addLibrary } = useApp()
  const [open, setOpen] = useState<string | null>(libraries[0]?.id ?? null)
  const [adding, setAdding] = useState<string | null>(null)
  const [doc, setDoc] = useState({ title: '', content: '' })
  const [newLib, setNewLib] = useState<{ name: string; desc: string } | null>(null)
  const lib = libraries.find((l) => l.id === open)
  const editable = can(user, 'build')

  return (
    <Page className="max-w-[1080px] mx-auto pt-8 pb-16 px-4">
      <PageHeader title="Knowledge" subtitle="Libraries agents cite in every recommendation." actions={editable && <Button variant="primary" onClick={() => setNewLib({ name: '', desc: '' })}><Plus size={15} /> New library</Button>} />
      <div className="grid grid-cols-[300px_1fr] gap-4">
        <Stagger className="clay px-3 py-1 self-start" delay={0.05}>
          {libraries.map((l) => (
            <Item key={l.id}>
              <button onClick={() => setOpen(l.id)} className={cx('row hover w-full text-left', open === l.id && 'bg-[var(--clay-dark)] rounded-[12px]')}>
                <Tile color={colorFor(l.name)} size={32} radius={10}><BookOpen size={14} /></Tile>
                <div className="flex-1 min-w-0"><div className="text-[13px] font-medium truncate">{l.name}</div><div className="text-[11.5px] muted">{l.docs.length} documents</div></div>
                <ChevronRight size={14} className="muted" />
              </button>
            </Item>
          ))}
        </Stagger>
        <AnimatePresence initial={false}>
          {lib && (
            <motion.div key={lib.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.25 }} className="clay p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="flex-1"><h2 className="display text-[17px] font-bold">{lib.name}</h2><p className="muted text-[12.5px]">{lib.desc}</p>
                  <div className="text-[11.5px] muted mt-1">Used by {agents.filter((a) => a.knowledge.includes(lib.id)).map((a) => a.name).join(', ') || 'no agents yet'}</div></div>
                {editable && <Button size="sm" onClick={() => { setAdding(lib.id); setDoc({ title: '', content: '' }) }}><Plus size={13} /> Add document</Button>}
              </div>
              <div className="flat divide-y divide-[var(--line)]">
                {lib.docs.length === 0 && <div className="p-6 text-center muted text-[12.5px]">No documents yet.</div>}
                {lib.docs.map((d) => (
                  <details key={d.id} className="group">
                    <summary className="flex items-center gap-3 px-3 h-12 cursor-pointer list-none">
                      <FileText size={15} className="muted" /><span className="flex-1 text-[13px] font-medium">{d.title}</span><span className="text-[11.5px] muted">{d.updatedAt}</span>
                      {editable && <button onClick={(e) => { e.preventDefault(); if (confirm('Remove this document?')) removeDoc(lib.id, d.id) }} className="muted hover:text-[var(--danger)] opacity-0 group-hover:opacity-100"><Trash2 size={13} /></button>}
                    </summary>
                    <div className="px-3 pb-3 pl-10 text-[12.5px] leading-relaxed muted whitespace-pre-wrap">{d.content}</div>
                  </details>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Modal open={!!adding} onClose={() => setAdding(null)} title="Add document" width={600}>
        <div className="flex flex-col gap-4">
          <Field label="Title"><Input value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} placeholder="e.g. Travel expense policy" /></Field>
          <Field label="Content" hint="Paste the text. File upload and SharePoint sync arrive at production roll-out."><Textarea rows={8} value={doc.content} onChange={(e) => setDoc({ ...doc, content: e.target.value })} /></Field>
          <div className="flex justify-end"><Button variant="primary" disabled={!doc.title.trim() || !doc.content.trim()} onClick={() => { addDoc(adding!, doc); setAdding(null) }}>Add</Button></div>
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

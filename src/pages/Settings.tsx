import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Download, Upload } from 'lucide-react'
import { useApp, useUser, can } from '@/store/app'
import { roleLabel, roleDesc, BRAND, type Role } from '@/lib/data'
import { Button, Chip, Confirm, Field, Input, Modal, PageHeader, Select, Toggle, Avatar, cx } from '@/components/ui'
import { ALL_HOLIDAYS } from '@/lib/holidays'
import { Page } from '@/components/motion'

const sections = [['users', 'Users'], ['governance', 'Governance'], ['workspace', 'Workspace']] as const
type Section = (typeof sections)[number][0]

export default function Settings() {
  const s = useApp()
  const user = useUser()!
  const [params] = useSearchParams()
  const [section, setSection] = useState<Section>((params.get('tab') as Section) || (can(user, 'admin') ? 'users' : 'workspace'))
  const [invite, setInvite] = useState<{ name: string; email: string; password: string; role: Role; title: string } | null>(null)
  const [pwFor, setPwFor] = useState<{ id: string; pw: string } | null>(null)
  const [err, setErr] = useState('')
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; name: string } | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const admin = can(user, 'admin')
  const security = can(user, 'security')

  const exportWs = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), agents: s.agents, councils: s.councils, workflows: s.workflows, libraries: s.libraries, customTools: s.customTools }, null, 2)], { type: 'application/json' })); a.download = `cocreate-workspace-${new Date().toISOString().slice(0, 10)}.json`; a.click() }

  const Row = ({ title, desc, right }: { title: string; desc?: React.ReactNode; right: React.ReactNode }) => (
    <div className="flex items-center gap-4 py-3.5 border-b hairline last:border-0"><div className="flex-1 min-w-0"><div className="text-[13px] font-medium">{title}</div>{desc && <div className="text-[12px] muted">{desc}</div>}</div>{right}</div>
  )
  const visible = sections.filter(([id]) => (id === 'users' ? admin : id === 'governance' ? admin || security : true))

  return (
    <Page className="max-w-[1080px] mx-auto pt-8 pb-16 px-4">
      <PageHeader title="Settings" subtitle="People, governance and workspace." />
      <div className="grid grid-cols-[200px_1fr] gap-6">
        <nav className="flex flex-col gap-0.5">{visible.map(([id, label]) => <button key={id} onClick={() => setSection(id)} className={cx('h-9 px-3 rounded-[10px] text-left text-[13px] font-medium', section === id ? 'bg-[var(--surface-2)] shadow-[0_1px_2px_rgba(16,24,40,.06)]' : 'muted hover:text-[var(--text)] hover:bg-[var(--clay-dark)]')}>{label}</button>)}</nav>
        <AnimatePresence initial={false}>
          <motion.div key={section} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="clay p-6 min-h-[420px]">
            {section === 'users' && admin && (
              <div>
                <div className="flex items-start justify-between mb-4"><div><h2 className="text-[15px] font-semibold">Users</h2><p className="text-[12.5px] muted mt-1">Accounts sign in with email and password. Single sign-on arrives with the production roll-out.</p></div><Button size="sm" variant="primary" onClick={() => { setInvite({ name: '', email: '', password: '', role: 'builder', title: '' }); setErr('') }}><Plus size={13} /> Add user</Button></div>
                <div className="flat divide-y divide-[var(--line)]">
                  {s.users.map((u) => (
                    <div key={u.id} className="flex items-center gap-3 px-3 h-14">
                      <Avatar initials={u.initials} size={30} />
                      <div className="flex-1 min-w-0"><div className="text-[13px] font-medium truncate">{u.name} {u.id === user.id && <span className="muted font-normal">(you)</span>}</div><div className="text-[11.5px] muted truncate">{u.email}{u.title ? ` · ${u.title}` : ''} · last active {u.lastActive}</div></div>
                      {u.id !== user.id ? <Select value={u.role} onChange={(e) => s.updateUser(u.id, { role: e.target.value as Role })} className="!w-[130px] !h-8 !text-[12px]">{(Object.keys(roleLabel) as Role[]).map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}</Select> : <Chip className="w-[90px] justify-center">{roleLabel[u.role]}</Chip>}
                      <button onClick={() => setPwFor({ id: u.id, pw: '' })} className="text-[11.5px] muted hover:text-[var(--text)]">Password</button>
                      {u.id !== user.id && <button onClick={() => s.updateUser(u.id, { status: u.status === 'disabled' ? 'active' : 'disabled' })} className={cx('text-[11.5px] w-[52px]', u.status === 'disabled' ? 'text-[var(--danger)]' : 'muted hover:text-[var(--text)]')}>{u.status === 'disabled' ? 'Enable' : 'Disable'}</button>}
                      {u.id !== user.id && <button onClick={() => setConfirmRemove({ id: u.id, name: u.name })} className="muted hover:text-[var(--danger)]" aria-label={`Remove ${u.name}`}><Trash2 size={13} /></button>}
                    </div>
                  ))}
                </div>
                <div className="mt-5 text-[12px] font-semibold mb-1">Roles</div>
                {(Object.keys(roleLabel) as Role[]).map((r) => <Row key={r} title={roleLabel[r]} desc={roleDesc[r]} right={<span className="text-[12px] muted">{s.users.filter((u) => u.role === r).length}</span>} />)}
              </div>
            )}

            {section === 'governance' && (admin || security) && (
              <div className="max-w-[560px]">
                <h2 className="text-[15px] font-semibold mb-1">Governance</h2><p className="text-[12.5px] muted mb-4">Controls that apply to every agent and workflow.</p>
                <Row title="Pause all schedules" desc="Scheduled workflows stop firing until resumed. Manual runs still work." right={<Toggle checked={s.schedulesPaused} onChange={s.setSchedulesPaused} />} />
                <div className="mt-6 text-[12px] font-semibold mb-1">Spend caps (USD per day)</div>
                <Row title="Per user" desc={`You have used $${s.spentToday(user.id).toFixed(3)} today.`} right={<Input type="number" step="0.5" min="0" value={s.caps.user} onChange={(e) => s.setCap('user', Math.max(0, +e.target.value))} className="!w-[110px] !h-8 text-right" />} />
                <Row title="Whole workspace" desc={`Used $${s.spentToday().toFixed(3)} today across everyone.`} right={<Input type="number" step="1" min="0" value={s.caps.org} onChange={(e) => s.setCap('org', Math.max(0, +e.target.value))} className="!w-[110px] !h-8 text-right" />} />
                <div className="text-[11.5px] muted mt-3">Costs come from the model provider's usage reports per call. When a cap is reached, agent steps stop with a clear message instead of running.</div>
              </div>
            )}

            {section === 'workspace' && (
              <div className="max-w-[560px]">
                <h2 className="text-[15px] font-semibold mb-4">Workspace</h2>
                <Row title="Dark theme" right={<Toggle checked={s.theme === 'dark'} onChange={(v) => s.setTheme(v ? 'dark' : 'light')} />} />
                <Row title="Arabic layout (RTL)" right={<Toggle checked={s.dir === 'rtl'} onChange={(v) => s.setDir(v ? 'rtl' : 'ltr')} />} />
                <Row title="Themed cursor" desc="A Co-Create arrow and hand instead of the system cursor." right={<Toggle checked={s.themedCursor} onChange={s.setThemedCursor} />} />
                <Row title="Seasonal touches" desc="A small badge on the logo and a greeting on Home during holidays: Middle East, India and international." right={<Toggle checked={s.seasonal} onChange={s.setSeasonal} />} />
                {s.seasonal && <Row title="Preview a holiday" desc="Show one now, for a demo. Clears when you choose None." right={<Select value={s.holidayPreview ?? ''} onChange={(e) => s.setHolidayPreview(e.target.value || null)} className="!w-[220px] !h-8 !text-[12px]"><option value="">None (follow the calendar)</option>{ALL_HOLIDAYS.map((h) => <option key={h.id} value={h.id}>{h.emoji} {h.name}</option>)}</Select>} />}
                <Row title="Change my password" right={<Button size="sm" onClick={() => setPwFor({ id: user.id, pw: '' })}>Change</Button>} />
                {admin && <>
                  <div className="mt-6 text-[12px] font-semibold mb-1">Backup</div>
                  <Row title="Export workspace" desc="Agents, workflows, knowledge and your API abilities as JSON." right={<Button size="sm" onClick={exportWs}><Download size={13} /> Export</Button>} />
                  <Row title="Import workspace" desc="Replaces the same sections from a file exported here." right={<><Button size="sm" onClick={() => fileRef.current?.click()}><Upload size={13} /> Import</Button><input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then((t) => { const err = s.importWorkspace(t); s.flashMsg(err ?? 'Workspace imported.', err ? 'danger' : 'ok') }); e.target.value = '' }} /></>} />
                  <Row title="Reset pilot data" desc="Clears everything in this browser, including users and runs." right={<Button size="sm" onClick={() => setConfirmReset(true)}>Reset</Button>} />
                </>}
                <div className="text-[11.5px] muted mt-6">{BRAND.full} pilot · data lives in this browser.</div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <Confirm open={!!confirmRemove} onClose={() => setConfirmRemove(null)} title={`Remove ${confirmRemove?.name}?`} danger confirmLabel="Remove" body="They can no longer sign in. Their past decisions stay in the audit log." onConfirm={() => confirmRemove && s.removeUser(confirmRemove.id)} />
      <Confirm open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset all pilot data?" danger confirmLabel="Reset" body="Everything in this browser is cleared: agents, workflows, runs, knowledge and users. This cannot be undone." onConfirm={() => { localStorage.removeItem('cocreate-v3'); location.href = '/login' }} />
      <Modal open={!!invite} onClose={() => setInvite(null)} title="Add user" width={480}>
        {invite && <div className="flex flex-col gap-4">
          <Field label="Name"><Input value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} /></Field>
          <Field label="Work email"><Input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder="name@company.com" /></Field>
          <Field label="Temporary password" hint="Share it with them; they can change it under Settings › Workspace."><Input type="text" value={invite.password} onChange={(e) => setInvite({ ...invite, password: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Title"><Input value={invite.title} onChange={(e) => setInvite({ ...invite, title: e.target.value })} /></Field><Field label="Role" hint={roleDesc[invite.role]}><Select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as Role })}>{(Object.keys(roleLabel) as Role[]).map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}</Select></Field></div>
          {err && <div className="text-[12.5px] text-[var(--danger)]">{err}</div>}
          <div className="flex justify-end"><Button variant="primary" disabled={!invite.name.trim() || !/\S+@\S+\.\S+/.test(invite.email) || invite.password.length < 6} onClick={async () => { const e = await s.addUser(invite); if (e) setErr(e); else setInvite(null) }}>Add user</Button></div>
        </div>}
      </Modal>
      <Modal open={!!pwFor} onClose={() => setPwFor(null)} title="Set password" width={420}>
        {pwFor && <div className="flex flex-col gap-4">
          <Field label="New password" hint="At least 6 characters."><Input type="password" value={pwFor.pw} onChange={(e) => setPwFor({ ...pwFor, pw: e.target.value })} autoFocus /></Field>
          <div className="flex justify-end"><Button variant="primary" disabled={pwFor.pw.length < 6} onClick={async () => { await s.setPassword(pwFor.id, pwFor.pw); setPwFor(null); s.flashMsg('Password updated.', 'ok') }}>Save</Button></div>
        </div>}
      </Modal>
    </Page>
  )
}

import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink, Plus, Trash2 } from 'lucide-react'
import { useApp, useUser, can } from '@/store/app'
import { checkKey, listModels } from '@/lib/openrouter'
import { roleLabel, roleDesc, BRAND, type Role } from '@/lib/data'
import { Button, Chip, Field, Input, Modal, PageHeader, Select, Toggle, Avatar, cx } from '@/components/ui'
import { Page } from '@/components/motion'

const sections = [['openrouter', 'OpenRouter'], ['users', 'Users'], ['governance', 'Governance'], ['notifications', 'Notifications'], ['workspace', 'Workspace']] as const
type Section = (typeof sections)[number][0]

export default function Settings() {
  const s = useApp()
  const user = useUser()!
  const [params] = useSearchParams()
  const [section, setSection] = useState<Section>((params.get('tab') as Section) || 'openrouter')
  const [draft, setDraft] = useState(s.apiKey)
  const [state, setState] = useState<{ ok?: boolean; msg?: string; busy?: boolean }>({})
  const [invite, setInvite] = useState<{ name: string; email: string; role: Role; title: string; department: string } | null>(null)
  const admin = can(user, 'admin')

  const connect = async () => {
    setState({ busy: true })
    try { const info = await checkKey(draft.trim()); s.setApiKey(draft.trim()); s.setModels(await listModels(draft.trim())); setState({ ok: true, msg: `Connected${info.label ? ` · ${info.label}` : ''}${info.usage !== undefined ? ` · $${Number(info.usage).toFixed(2)} used` : ''}` }) }
    catch (e: any) { setState({ ok: false, msg: e.message }) }
  }

  const Row = ({ title, desc, right }: { title: string; desc?: React.ReactNode; right: React.ReactNode }) => (
    <div className="flex items-center gap-4 py-3.5 border-b hairline last:border-0"><div className="flex-1 min-w-0"><div className="text-[13px] font-medium">{title}</div>{desc && <div className="text-[12px] muted">{desc}</div>}</div>{right}</div>
  )

  return (
    <Page className="max-w-[1080px] mx-auto pt-8 pb-16 px-4">
      <PageHeader title="Settings" subtitle="Model access, people, governance and delivery." />
      <div className="grid grid-cols-[200px_1fr] gap-6">
        <nav className="flex flex-col gap-0.5">
          {sections.map(([id, label]) => <button key={id} onClick={() => setSection(id)} className={cx('h-9 px-3 rounded-[10px] text-left text-[13px] font-medium', section === id ? 'bg-[var(--surface-2)] shadow-[0_1px_2px_rgba(16,24,40,.06)]' : 'muted hover:text-[var(--text)] hover:bg-[var(--clay-dark)]')}>{label}</button>)}
        </nav>
        <AnimatePresence initial={false}>
          <motion.div key={section} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="clay p-6 min-h-[420px]">
            {section === 'openrouter' && (
              <div className="max-w-[560px] flex flex-col gap-5">
                <div><h2 className="text-[15px] font-semibold">OpenRouter</h2><p className="text-[12.5px] muted mt-1">{BRAND.name} calls OpenRouter directly from this browser. The key is stored locally and sent only to OpenRouter.</p></div>
                <Field label="API key" hint="Get one at openrouter.ai/keys."><div className="flex gap-2"><Input type="password" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="sk-or-v1-…" /><Button variant="primary" onClick={connect} disabled={!draft.trim() || state.busy}>{state.busy ? 'Checking…' : 'Connect'}</Button></div></Field>
                {state.msg && <div className={cx('text-[12.5px] font-medium', state.ok ? 'text-[var(--ok)]' : 'text-[var(--danger)]')}>{state.msg}</div>}
                {s.apiKey && !state.msg && <div className="text-[12.5px] font-medium text-[var(--ok)] flex items-center gap-3">Connected <button className="muted font-normal hover:underline" onClick={() => { s.setApiKey(''); setDraft('') }}>Disconnect</button></div>}
                <Row title="Default model" desc="New agents and the assistant start here. Change it under Models." right={<Chip tone="accent">{s.defaultModel}</Chip>} />
                <Row title="Spend caps" desc="Enforced through OpenRouter key limits at roll-out." right={<div className="flex gap-2 text-[12.5px]"><span>User ${s.spend.user}/day</span><span className="muted">·</span><span>Group ${s.spend.group}/day</span><span className="muted">·</span><span>Org ${s.spend.org}/mo</span></div>} />
                <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-[12.5px] font-medium accent-ink inline-flex items-center gap-1 hover:underline">Manage keys on OpenRouter <ExternalLink size={12} /></a>
              </div>
            )}

            {section === 'users' && (
              <div>
                <div className="flex items-start justify-between mb-4"><div><h2 className="text-[15px] font-semibold">Users</h2><p className="text-[12.5px] muted mt-1">Pilot accounts. Single sign-on replaces passwords at roll-out.</p></div>{admin && <Button size="sm" variant="primary" onClick={() => setInvite({ name: '', email: '', role: 'builder', title: '', department: '' })}><Plus size={13} /> Invite</Button>}</div>
                <div className="flat divide-y divide-[var(--line)]">
                  {s.users.map((u) => (
                    <div key={u.id} className="flex items-center gap-3 px-3 h-14">
                      <Avatar initials={u.initials} size={30} />
                      <div className="flex-1 min-w-0"><div className="text-[13px] font-medium truncate">{u.name} {u.id === user.id && <span className="muted font-normal">(you)</span>}</div><div className="text-[11.5px] muted truncate">{u.email} · {u.title}</div></div>
                      <span className="text-[11.5px] muted w-[80px]">{u.lastActive}</span>
                      {admin && u.id !== user.id ? <Select value={u.role} onChange={(e) => s.updateUser(u.id, { role: e.target.value as Role })} className="!w-[130px] !h-8 !text-[12px]">{(Object.keys(roleLabel) as Role[]).map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}</Select> : <Chip className="w-[90px] justify-center">{roleLabel[u.role]}</Chip>}
                      <Chip tone={u.status === 'active' ? 'ok' : u.status === 'invited' ? 'accent' : undefined} className="capitalize w-[72px] justify-center">{u.status}</Chip>
                      {admin && u.id !== user.id && <button onClick={() => s.updateUser(u.id, { status: u.status === 'disabled' ? 'active' : 'disabled' })} className="text-[11.5px] muted hover:text-[var(--text)] w-[52px]">{u.status === 'disabled' ? 'Enable' : 'Disable'}</button>}
                      {admin && u.id !== user.id && <button onClick={() => { if (confirm(`Remove ${u.name}?`)) s.removeUser(u.id) }} className="muted hover:text-[var(--danger)]"><Trash2 size={13} /></button>}
                    </div>
                  ))}
                </div>
                <div className="mt-5 text-[12px] font-semibold mb-1">Roles</div>
                {(Object.keys(roleLabel) as Role[]).map((r) => <Row key={r} title={roleLabel[r]} desc={roleDesc[r]} right={<span className="text-[12px] muted">{s.users.filter((u) => u.role === r).length}</span>} />)}
              </div>
            )}

            {section === 'governance' && (
              <div className="max-w-[560px]">
                <h2 className="text-[15px] font-semibold mb-1">Governance</h2><p className="text-[12.5px] muted mb-4">Watchers monitor in the background and never change external systems.</p>
                <Row title="Emergency pause" desc={can(user, 'security') ? 'Pauses every watcher platform-wide. You are authorised.' : 'Restricted to the Head of Information Security.'} right={<Toggle checked={s.emergencyPause} onChange={s.setEmergencyPause} disabled={!can(user, 'security')} />} />
                {s.watchers.map((w) => <Row key={w.id} title={w.name} desc={`${w.owner} · ${w.used}/${w.cap} today`} right={<Toggle checked={w.status === 'active'} onChange={() => s.toggleWatcher(w.id)} disabled={s.emergencyPause || !can(user, 'build')} />} />)}
                <div className="mt-6 text-[12px] font-semibold mb-1">Spend caps (USD)</div>
                {([['user', 'Per user, per day'], ['group', 'Finance group, per day'], ['org', 'Organisation, per month']] as const).map(([k, l]) => <Row key={k} title={l} right={<Input type="number" value={s.spend[k]} onChange={(e) => s.setSpend(k, +e.target.value)} className="!w-[110px] !h-8 text-right" disabled={!admin} />} />)}
              </div>
            )}

            {section === 'notifications' && (
              <div className="max-w-[560px]">
                <h2 className="text-[15px] font-semibold mb-4">Notifications</h2>
                <Row title="Daily suggestions" desc="How many open items Home shows." right={<div className="seg">{([3, 5, 10, 0] as const).map((c) => <button key={c} className={cx(s.dailyCap === c && 'on')} onClick={() => s.setDailyCap(c)}>{c === 0 ? 'All' : `Top ${c}`}</button>)}</div>} />
                <Row title="Quiet hours" desc="19:00–07:00. Routine alerts wait; critical ones still show." right={<Toggle checked={s.quietHours} onChange={s.setQuietHours} />} />
                {([['teams', 'Microsoft Teams'], ['outlook', 'Outlook'], ['digest', 'Email digest']] as const).map(([k, l]) => <Row key={k} title={l} right={<Toggle checked={s.channels[k]} onChange={(v) => s.setChannel(k, v)} />} />)}
              </div>
            )}

            {section === 'workspace' && (
              <div className="max-w-[560px]">
                <h2 className="text-[15px] font-semibold mb-4">Workspace</h2>
                <Row title="Dark theme" right={<Toggle checked={s.theme === 'dark'} onChange={(v) => s.setTheme(v ? 'dark' : 'light')} />} />
                <Row title="Arabic layout (RTL)" right={<Toggle checked={s.dir === 'rtl'} onChange={(v) => s.setDir(v ? 'rtl' : 'ltr')} />} />
                <Row title="Reset pilot data" desc="Clears local changes and restores the seed workspace." right={<Button size="sm" onClick={() => { if (confirm('Reset all local pilot data?')) { localStorage.removeItem('cocreate-v1'); location.href = '/login' } }}>Reset</Button>} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <Modal open={!!invite} onClose={() => setInvite(null)} title="Invite user" width={480}>
        {invite && <div className="flex flex-col gap-4">
          <Field label="Name"><Input value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} /></Field>
          <Field label="Work email"><Input value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder="name@beinex.com" /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Title"><Input value={invite.title} onChange={(e) => setInvite({ ...invite, title: e.target.value })} /></Field><Field label="Department"><Input value={invite.department} onChange={(e) => setInvite({ ...invite, department: e.target.value })} /></Field></div>
          <Field label="Role" hint={roleDesc[invite.role]}><Select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as Role })}>{(Object.keys(roleLabel) as Role[]).map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}</Select></Field>
          <div className="flex justify-end"><Button variant="primary" disabled={!invite.name.trim() || !/@/.test(invite.email)} onClick={() => { s.addUser(invite); setInvite(null) }}>Send invite</Button></div>
        </div>}
      </Modal>
    </Page>
  )
}

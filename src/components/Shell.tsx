import { useEffect, useRef, useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Home, MessageSquare, Sparkles, Workflow, Wrench, BookOpen, ListChecks, Cpu, Settings, Sun, Moon, Languages, PanelLeftClose, PanelLeftOpen, LogOut, Bell, ShieldCheck, Clock, Info, CheckCheck, ChevronUp, Check } from 'lucide-react'
import { useApp, useUser } from '@/store/app'
import { BRAND, roleLabel } from '@/lib/data'
import { tickSchedules, watchDocuments, reconcileRuns } from '@/lib/runner'
import { BeinexMark } from './Logo'
import { currentHoliday, holidayById } from '@/lib/holidays'
import { Avatar, cx } from './ui'

const groups: { title?: string; items: { to: string; label: string; icon: typeof Home; end?: boolean }[] }[] = [
  { items: [{ to: '/', label: 'Home', icon: Home, end: true }, { to: '/chat', label: 'Chat', icon: MessageSquare }] },
  { title: 'Build', items: [{ to: '/agents', label: 'Agents', icon: Sparkles }, { to: '/workflows', label: 'Workflows', icon: Workflow }, { to: '/tools', label: 'Abilities', icon: Wrench }, { to: '/knowledge', label: 'Knowledge', icon: BookOpen }] },
  { title: 'Operate', items: [{ to: '/runs', label: 'Runs', icon: ListChecks }, { to: '/models', label: 'Models', icon: Cpu }, { to: '/settings', label: 'Settings', icon: Settings }] },
]
const kindIcon = { approval: ShieldCheck, run: ListChecks, schedule: Clock, info: Info }

export default function Shell() {
  const { theme, setTheme, dir, setDir, logout, notifications, markRead, schedulesPaused, runs, themedCursor, seasonal, holidayPreview, flash, touchSession } = useApp()
  const holiday = seasonal ? (holidayPreview ? holidayById(holidayPreview) : currentHoliday()) : undefined
  const user = useUser()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('nav-collapsed') === '1')
  const builder = /^\/workflows\/[^/]+/.test(useLocation().pathname)
  const before = useRef<boolean | null>(null)
  useEffect(() => { if (builder) { if (before.current === null) { before.current = collapsed; setCollapsed(true) } } else if (before.current !== null) { setCollapsed(before.current); before.current = null } }, [builder]) // eslint-disable-line react-hooks/exhaustive-deps
  const [menu, setMenu] = useState<'user' | 'bell' | null>(null)
  const nav = useNavigate()
  const loc = useLocation()
  const wrap = useRef<HTMLDivElement>(null)
  const unread = notifications.filter((n) => !n.read).length
  const waiting = runs.filter((r) => r.status === 'waiting').length

  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); document.documentElement.dir = dir }, [theme, dir])
  useEffect(() => { document.documentElement.classList.toggle('cursor-themed', themedCursor) }, [themedCursor])
  useEffect(() => {
    let last = 0
    const bump = () => { const t = Date.now(); if (t - last > 60_000) { last = t; touchSession() } }
    const check = () => { const s = useApp.getState(); if (s.currentUserId && s.sessionAt && Date.now() - s.sessionAt > 8 * 3600_000) { s.logout(); nav('/login') } }
    window.addEventListener('pointerdown', bump); window.addEventListener('keydown', bump); const i = setInterval(check, 60_000); bump(); check()
    return () => { window.removeEventListener('pointerdown', bump); window.removeEventListener('keydown', bump); clearInterval(i) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!builder) localStorage.setItem('nav-collapsed', collapsed ? '1' : '0') }, [collapsed, builder])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); nav('/chat') } if (e.key === 'Escape') setMenu(null) }
    const onClick = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setMenu(null) }
    window.addEventListener('keydown', onKey); window.addEventListener('mousedown', onClick)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onClick) }
  }, [nav])
  useEffect(() => { reconcileRuns(); const t = setInterval(() => { tickSchedules() }, 60_000); tickSchedules(); const off = watchDocuments(); return () => { clearInterval(t); off() } }, [])

  if (!user) return <Navigate to="/login" replace />
  const editor = /^\/(agents|workflows)\/[^/]+/.test(loc.pathname) || loc.pathname.startsWith('/chat')

  return (
    <div className="h-full flex relative z-[1] p-3 gap-3">
      <div className="ambient" />
      <aside ref={wrap} className={cx('glass rounded-[22px] flex flex-col p-2.5 transition-[width] duration-300 shrink-0 relative z-40', collapsed ? 'w-[66px]' : 'w-[224px]')}>
        {/* brand + collapse */}
        <div className={cx('flex items-center gap-2.5 h-12 mb-2', collapsed ? 'justify-center' : 'px-1.5')}>
          <button onClick={() => nav('/')} className="flex items-center gap-2.5 text-left min-w-0">
            <div className="relative w-9 h-9 rounded-[12px] grid place-items-center shrink-0" style={{ background: 'linear-gradient(145deg,#1a4a73,#10385b)', boxShadow: 'inset 2px 2px 5px rgba(255,255,255,.18), inset -3px -4px 8px rgba(0,0,0,.35), 0 8px 16px -10px rgba(16,56,91,.7)' }}><BeinexMark size={20} />{holiday && <span className="holiday-badge" title={`${holiday.name} · ${holiday.greeting}`} aria-label={holiday.name} role="img">{holiday.emoji}</span>}</div>
            {!collapsed && <div className="leading-tight min-w-0"><div className="display font-extrabold text-[14.5px] truncate">{BRAND.name}</div><div className="text-[10.5px] muted font-medium">by {BRAND.company}</div></div>}
          </button>
          {!collapsed && <button className="btn btn-ghost btn-sm btn-icon ml-auto" title="Collapse sidebar" onClick={() => setCollapsed(true)}><PanelLeftClose size={15} /></button>}
        </div>
        {collapsed && <button className="btn btn-ghost btn-sm btn-icon mx-auto mb-2" title="Expand sidebar" onClick={() => setCollapsed(false)}><PanelLeftOpen size={15} /></button>}

        <nav className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {groups.map((g, gi) => (
            <div key={gi} className="flex flex-col gap-0.5">
              {g.title && !collapsed && <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] muted px-2.5 mb-1">{g.title}</div>}
              {g.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end} title={collapsed ? label : undefined} className={({ isActive }) => cx('flex items-center gap-2.5 h-9 rounded-[11px] text-[13px] font-medium transition-all relative', collapsed ? 'justify-center' : 'px-2.5', isActive ? 'bg-[var(--surface-2)] text-[var(--text)] shadow-[0_1px_2px_rgba(16,24,40,.06)] font-semibold' : 'muted hover:text-[var(--text)] hover:bg-[var(--clay-dark)]')}>
                  <Icon size={17} strokeWidth={2} />
                  {!collapsed && <span className="flex-1 truncate">{label}</span>}
                  {to === '/runs' && waiting > 0 && <span className={cx('min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--warn)] text-white text-[10.5px] grid place-items-center font-semibold', collapsed && 'absolute -top-0.5 -right-0.5')}>{waiting}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* bottom: notifications + account */}
        <div className="mt-2 flex flex-col gap-0.5 border-t hairline pt-2">
          <div className="relative">
            <button aria-label="Notifications" aria-expanded={menu === 'bell'} onClick={() => setMenu(menu === 'bell' ? null : 'bell')} title={collapsed ? 'Notifications' : undefined} className={cx('w-full flex items-center gap-2.5 h-9 rounded-[11px] text-[13px] font-medium relative', collapsed ? 'justify-center' : 'px-2.5', menu === 'bell' ? 'bg-[var(--surface-2)] text-[var(--text)]' : 'muted hover:text-[var(--text)] hover:bg-[var(--clay-dark)]')}>
              <Bell size={17} />{!collapsed && <span className="flex-1 text-left">Notifications</span>}
              {unread > 0 && <span className={cx('min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--accent)] text-white text-[10.5px] grid place-items-center font-semibold', collapsed && 'absolute -top-0.5 -right-0.5')}>{unread}</span>}
            </button>
            <AnimatePresence>
              {menu === 'bell' && (
                <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} className="absolute bottom-0 start-full ms-3 w-[340px] pop rounded-[18px] p-2 z-50 max-h-[460px] scroll">
                  <div className="flex items-center justify-between px-2 py-1.5"><span className="text-[12.5px] font-semibold">Notifications</span>{unread > 0 && <button onClick={() => markRead()} className="text-[11px] muted hover:text-[var(--text)] inline-flex items-center gap-1"><CheckCheck size={12} /> Mark all read</button>}</div>
                  {notifications.length === 0 && <div className="px-2 py-8 text-center text-[12px] muted">Nothing needs you. Approvals, failed runs and schedule problems show up here.</div>}
                  {notifications.slice(0, 30).map((n) => {
                    const I = kindIcon[n.kind]; return (
                      <button key={n.id} onClick={() => { markRead(n.id); setMenu(null); if (n.link) nav(n.link) }} className={cx('w-full text-left flex gap-2.5 p-2 rounded-[11px] hover:bg-[var(--clay-dark)]', !n.read && 'bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]')}>
                        <span className="w-7 h-7 rounded-[8px] grid place-items-center shrink-0 bg-[var(--clay-dark)] muted"><I size={13} /></span>
                        <span className="min-w-0"><span className="block text-[12.5px] font-medium truncate">{n.title}</span>{n.body && <span className="block text-[11.5px] muted line-clamp-2">{n.body}</span>}<span className="block text-[10.5px] muted mt-0.5">{n.at}</span></span>
                      </button>
                    )
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="relative">
            <button aria-label="Account menu" aria-expanded={menu === 'user'} onClick={() => setMenu(menu === 'user' ? null : 'user')} className={cx('w-full flex items-center gap-2.5 h-11 rounded-[12px] hover:bg-[var(--clay-dark)]', collapsed ? 'justify-center' : 'px-1.5', menu === 'user' && 'bg-[var(--surface-2)]')}>
              <Avatar initials={user.initials} size={30} />
              {!collapsed && <><div className="text-left leading-tight min-w-0 flex-1"><div className="text-[12.5px] font-semibold truncate">{user.name}</div><div className="text-[11px] muted truncate">{roleLabel[user.role]}</div></div><ChevronUp size={14} className="muted" /></>}
            </button>
            <AnimatePresence>
              {menu === 'user' && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="absolute bottom-full mb-2 start-0 w-[260px] pop rounded-[18px] p-2 z-50">
                  <div className="px-2 py-2 flex items-center gap-2.5"><Avatar initials={user.initials} size={34} /><div className="min-w-0"><div className="text-[13px] font-semibold truncate">{user.name}</div><div className="text-[11.5px] muted truncate">{user.email}</div></div></div>
                  <div className="h-px bg-[var(--line)] my-1" />
                  <div className="px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider muted">Appearance</div>
                  <div className="flex gap-1 px-1 mb-1">
                    {([['light', Sun, 'Light'], ['dark', Moon, 'Dark']] as const).map(([t, I, l]) => <button key={t} onClick={() => setTheme(t)} className={cx('flex-1 h-9 rounded-[10px] text-[12.5px] font-medium inline-flex items-center justify-center gap-1.5', theme === t ? 'bg-[var(--surface-2)] shadow-[0_1px_2px_rgba(16,24,40,.08)]' : 'muted hover:text-[var(--text)]')}><I size={14} /> {l}{theme === t && <Check size={12} className="accent-ink" />}</button>)}
                  </div>
                  <button onClick={() => setDir(dir === 'ltr' ? 'rtl' : 'ltr')} className="w-full flex items-center gap-2 px-2 h-9 rounded-[10px] text-[13px] hover:bg-[var(--clay-dark)]"><Languages size={14} /> <span className="flex-1 text-left">Layout direction</span><span className="text-[11.5px] muted">{dir === 'ltr' ? 'Left to right' : 'Right to left'}</span></button>
                  <div className="h-px bg-[var(--line)] my-1" />
                  <button onClick={() => { setMenu(null); nav('/settings') }} className="w-full flex items-center gap-2 px-2 h-9 rounded-[10px] text-[13px] hover:bg-[var(--clay-dark)]"><Settings size={14} /> Settings</button>
                  <button onClick={() => { setMenu(null); logout(); nav('/login') }} className="w-full flex items-center gap-2 px-2 h-9 rounded-[10px] text-[13px] hover:bg-[var(--clay-dark)]"><LogOut size={14} /> Sign out</button>
                  {schedulesPaused && <div className="px-2 pt-2 text-[11px] font-semibold text-[var(--warn)]">Schedules are paused</div>}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </aside>

      <main className={cx('flex-1 min-w-0 min-h-0', editor ? '' : 'scroll')}>
        <Outlet />
      </main>
      <AnimatePresence>{flash && (
        <motion.div key={flash.id} role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className={cx('fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] pop rounded-full h-10 px-4 flex items-center gap-2 text-[13px] font-medium', flash.tone === 'danger' && 'text-[var(--danger)]', flash.tone === 'ok' && 'text-[var(--ok)]')}>{flash.text}</motion.div>
      )}</AnimatePresence>
    </div>
  )
}

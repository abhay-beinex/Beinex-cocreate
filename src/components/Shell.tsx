import { useEffect, useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Home, MessageSquare, Sparkles, Workflow, Wrench, BookOpen, ListChecks, Cpu, Settings, Sun, Moon, Languages, ChevronsLeft, ChevronsRight, LogOut, Check } from 'lucide-react'
import { useApp, useUser } from '@/store/app'
import { BRAND, roleLabel } from '@/lib/data'
import { BeinexMark } from './Logo'
import { Avatar, cx } from './ui'

const groups = [
  [{ to: '/', label: 'Home', icon: Home, end: true }, { to: '/chat', label: 'Chat', icon: MessageSquare }],
  [{ to: '/agents', label: 'Agents', icon: Sparkles }, { to: '/workflows', label: 'Workflows', icon: Workflow }, { to: '/tools', label: 'Tools', icon: Wrench }, { to: '/knowledge', label: 'Knowledge', icon: BookOpen }],
  [{ to: '/runs', label: 'Runs', icon: ListChecks }, { to: '/models', label: 'Models', icon: Cpu }, { to: '/settings', label: 'Settings', icon: Settings }],
]

export default function Shell() {
  const { theme, toggleTheme, dir, setDir, logout, emergencyPause } = useApp()
  const user = useUser()
  const [collapsed, setCollapsed] = useState(false)
  const [menu, setMenu] = useState(false)
  const nav = useNavigate()
  const loc = useLocation()

  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); document.documentElement.dir = dir }, [theme, dir])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); nav('/chat') } if (e.key === 'Escape') setMenu(false) }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [nav])

  if (!user) return <Navigate to="/login" replace />
  const editor = /^\/(agents|workflows)\/[^/]+/.test(loc.pathname) || loc.pathname.startsWith('/chat')

  return (
    <div className="h-full flex relative z-[1] p-3 gap-3">
      <div className="ambient" />
      <aside className={cx('glass rounded-[22px] flex flex-col p-2.5 transition-all duration-300 shrink-0', collapsed ? 'w-[64px]' : 'w-[212px]')}>
        <button onClick={() => nav('/')} className={cx('flex items-center gap-2.5 px-1.5 h-12 mb-3 text-left', collapsed && 'justify-center px-0')}>
          <div className="w-9 h-9 rounded-[12px] grid place-items-center shrink-0" style={{ background: 'linear-gradient(145deg,#1a4a73,#10385b)', boxShadow: 'inset 2px 2px 5px rgba(255,255,255,.18), inset -3px -4px 8px rgba(0,0,0,.35), 0 8px 16px -10px rgba(16,56,91,.7)' }}>
            <BeinexMark size={20} />
          </div>
          {!collapsed && <div className="leading-tight"><div className="display font-extrabold text-[14.5px]">{BRAND.name}</div><div className="text-[10.5px] muted font-medium">by {BRAND.company}</div></div>}
        </button>

        <nav className="flex flex-col gap-3">
          {groups.map((g, gi) => (
            <div key={gi} className="flex flex-col gap-0.5">
              {g.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end} title={label}
                  className={({ isActive }) => cx('flex items-center gap-2.5 h-9 rounded-[11px] px-2.5 text-[13px] font-medium transition-all', collapsed && 'justify-center px-0',
                    isActive ? 'bg-[var(--surface-2)] text-[var(--text)] shadow-[0_1px_2px_rgba(16,24,40,.06)] font-semibold' : 'muted hover:text-[var(--text)] hover:bg-[var(--clay-dark)]')}>
                  <Icon size={17} strokeWidth={2} />
                  {!collapsed && <span>{label}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="flex-1" />
        {emergencyPause && !collapsed && <div className="text-[11px] font-semibold text-[var(--danger)] px-2.5 mb-2">Emergency pause is on</div>}

        <div className={cx('flex items-center gap-0.5 mb-1', collapsed && 'flex-col')}>
          <button className="btn btn-ghost btn-sm btn-icon" title="Theme" onClick={toggleTheme}>{theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}</button>
          <button className="btn btn-ghost btn-sm btn-icon" title="Direction" onClick={() => setDir(dir === 'ltr' ? 'rtl' : 'ltr')}><Languages size={15} /></button>
          {!collapsed && <div className="flex-1" />}
          <button className="btn btn-ghost btn-sm btn-icon" title="Collapse" onClick={() => setCollapsed((c) => !c)}>{collapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}</button>
        </div>

        <div className="relative">
          <button onClick={() => setMenu((o) => !o)} className={cx('w-full flex items-center gap-2.5 p-1.5 rounded-[12px] hover:bg-[var(--clay-dark)]', collapsed && 'justify-center')}>
            <Avatar initials={user.initials} size={30} />
            {!collapsed && <div className="text-left leading-tight min-w-0"><div className="text-[12.5px] font-semibold truncate">{user.name}</div><div className="text-[11px] muted truncate">{roleLabel[user.role]}</div></div>}
          </button>
          {menu && (
            <div className="absolute bottom-full mb-2 left-0 w-[230px] glass rounded-[16px] p-1.5 z-20 fade-up">
              <div className="px-2 py-2 text-[11.5px] muted truncate">{user.email}</div>
              <button onClick={() => { setMenu(false); nav('/settings') }} className="w-full flex items-center gap-2 px-2 h-9 rounded-[10px] text-[13px] hover:bg-[var(--clay-dark)]"><Settings size={14} /> Settings</button>
              <button onClick={() => { setMenu(false); logout(); nav('/login') }} className="w-full flex items-center gap-2 px-2 h-9 rounded-[10px] text-[13px] hover:bg-[var(--clay-dark)]"><LogOut size={14} /> Sign out</button>
              <div className="px-2 pt-1 text-[10.5px] muted flex items-center gap-1"><Check size={10} /> Switch accounts from the sign-in screen</div>
            </div>
          )}
        </div>
      </aside>

      <main className={cx('flex-1 min-w-0 min-h-0', editor ? '' : 'scroll')}>
        <Outlet />
      </main>
    </div>
  )
}

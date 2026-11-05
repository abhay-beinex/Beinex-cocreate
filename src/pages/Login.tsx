import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Lock } from 'lucide-react'
import { useApp } from '@/store/app'
import { BRAND, roleLabel } from '@/lib/data'
import { BeinexWordmark } from '@/components/Logo'
import { Avatar, Button, Input, cx } from '@/components/ui'
import { ease } from '@/components/motion'

export default function Login() {
  const nav = useNavigate()
  const { users, login } = useApp()
  const [picked, setPicked] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const active = users.filter((u) => u.status === 'active')

  const go = () => {
    const u = picked ? users.find((x) => x.id === picked) : users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase())
    if (!u) { setErr('No pilot account with that email.'); return }
    if (!picked && pw !== 'cocreate') { setErr('Pilot password is "cocreate".'); return }
    login(u.id); nav('/')
  }

  return (
    <div className="h-full relative overflow-hidden grid place-items-center p-6">
      <div className="ambient" />
      {[['12%', '18%', 220, '#04bbf2'], ['80%', '22%', 160, '#0074d9'], ['70%', '78%', 260, '#8b5cf6'], ['18%', '80%', 140, '#10b981']].map(([l, t, s, c], i) => (
        <motion.div key={i} className="absolute rounded-full pointer-events-none" style={{ left: l as string, top: t as string, width: s as number, height: s as number, background: `radial-gradient(circle at 35% 35%, ${c}55, ${c}10 60%, transparent 70%)`, filter: 'blur(6px)' }}
          animate={{ y: [0, -18, 0], x: [0, 8, 0] }} transition={{ duration: 9 + i * 2, repeat: Infinity, ease: 'easeInOut' }} />
      ))}

      <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease }} className="relative w-full max-w-[920px] grid md:grid-cols-[1.1fr_1fr] gap-6">
        <div className="hidden md:flex flex-col justify-between p-10 rounded-[28px] glass">
          <BeinexWordmark height={26} />
          <div>
            <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5, ease }} className="display text-[40px] font-extrabold leading-[1.05]">
              Build agents.<br />Keep humans<br />in the loop.
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="muted mt-4 text-[14px] max-w-[360px] leading-relaxed">
              {BRAND.full} lets your team build AI agents and workflows with real tools, and keeps a person in control of every external action.
            </motion.p>
          </div>
          <div className="text-[11.5px] muted">Pilot workspace</div>
        </div>

        <div className="clay p-8 flex flex-col">
          <div className="md:hidden mb-6"><BeinexWordmark height={24} /></div>
          <h2 className="display text-[20px] font-bold">Sign in</h2>
          <p className="muted text-[13px] mt-1 mb-5">Pick a pilot account, or use your work email.</p>

          <div className="flex flex-col gap-1.5 mb-5">
            {active.map((u, i) => (
              <motion.button key={u.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.05, ease }}
                onClick={() => { setPicked(u.id); setErr('') }}
                className={cx('flex items-center gap-3 p-2 rounded-[14px] text-left border transition-all', picked === u.id ? 'border-[var(--accent)] bg-[var(--surface-2)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_20%,transparent)]' : 'border-transparent hover:bg-[var(--clay-dark)]')}>
                <Avatar initials={u.initials} size={32} />
                <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold truncate">{u.name}</span><span className="block text-[11.5px] muted truncate">{roleLabel[u.role]} · {u.title}</span></span>
              </motion.button>
            ))}
          </div>

          <div className="flex items-center gap-3 text-[11px] muted mb-4"><span className="flex-1 h-px bg-[var(--line)]" />or<span className="flex-1 h-px bg-[var(--line)]" /></div>
          <div className="flex flex-col gap-2">
            <Input placeholder="name@beinex.com" value={email} onChange={(e) => { setEmail(e.target.value); setPicked(null); setErr('') }} />
            <Input type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
          </div>
          {err && <div className="text-[12px] text-[var(--danger)] mt-2">{err}</div>}
          <Button variant="primary" className="mt-4 w-full !h-11" onClick={go} disabled={!picked && !email}>Continue <ArrowRight size={15} /></Button>
          <div className="text-[11px] muted mt-4 flex items-center gap-1.5"><Lock size={11} /> Single sign-on (Entra ID) is enabled at production roll-out.</div>
        </div>
      </motion.div>
    </div>
  )
}

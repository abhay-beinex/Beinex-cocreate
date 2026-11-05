import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Lock } from 'lucide-react'
import { useApp } from '@/store/app'
import { BRAND } from '@/lib/data'
import { BeinexWordmark } from '@/components/Logo'
import { loginGate, recordLogin } from '@/lib/auth'
import { Button, Input } from '@/components/ui'
import { ease } from '@/components/motion'

export default function Login() {
  const nav = useNavigate()
  const login = useApp((s) => s.login)
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const go = async () => {
    const gate = loginGate(); if (gate.blockedFor > 0) { setErr(`Too many attempts. Try again in ${gate.blockedFor}s.`); return }
    setBusy(true)
    const e = await login(email, pw)
    setBusy(false)
    recordLogin(!e)
    if (e) { setErr(loginGate().blockedFor > 0 ? `${e} Too many attempts; wait 30 seconds.` : e); return }
    nav('/')
  }

  return (
    <div className="h-full relative overflow-hidden grid place-items-center p-6">
      <div className="ambient" />
      {[['12%', '18%', 220, '#04bbf2'], ['80%', '22%', 160, '#0074d9'], ['70%', '78%', 260, '#8b5cf6'], ['18%', '80%', 140, '#10b981']].map(([l, t, s, c], i) => (
        <motion.div key={i} className="absolute rounded-full pointer-events-none" style={{ left: l as string, top: t as string, width: s as number, height: s as number, background: `radial-gradient(circle at 35% 35%, ${c}55, ${c}10 60%, transparent 70%)`, filter: 'blur(6px)' }}
          animate={{ y: [0, -18, 0], x: [0, 8, 0] }} transition={{ duration: 9 + i * 2, repeat: Infinity, ease: 'easeInOut' }} />
      ))}
      <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease }} className="relative w-full max-w-[880px] grid md:grid-cols-[1.1fr_1fr] gap-6">
        <div className="hidden md:flex flex-col justify-between p-10 rounded-[28px] glass">
          <BeinexWordmark height={26} />
          <div>
            <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5, ease }} className="display text-[40px] font-extrabold leading-[1.05]">Build agents.<br />Keep people<br />in control.</motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="muted mt-4 text-[14px] max-w-[360px] leading-relaxed">{BRAND.full} lets your team build AI agents and workflows with real tools. Every external action waits for a person.</motion.p>
          </div>
          <div className="text-[11.5px] muted">Pilot workspace</div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); go() }} className="clay p-8 flex flex-col">
          <div className="md:hidden mb-6"><BeinexWordmark height={24} /></div>
          <h2 className="display text-[20px] font-bold">Sign in</h2>
          <p className="muted text-[13px] mt-1 mb-6">Use your workspace account.</p>
          <div className="flex flex-col gap-3">
            <div><div className="text-[12px] font-semibold mb-1.5">Email</div><Input autoFocus type="email" autoComplete="username" placeholder="you@company.com" value={email} onChange={(e) => { setEmail(e.target.value); setErr('') }} /></div>
            <div><div className="text-[12px] font-semibold mb-1.5">Password</div><Input type="password" autoComplete="current-password" placeholder="••••••••" value={pw} onChange={(e) => { setPw(e.target.value); setErr('') }} /></div>
          </div>
          {err && <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-[12.5px] text-[var(--danger)] mt-3">{err}</motion.div>}
          <Button type="submit" variant="primary" className="mt-5 w-full !h-11" disabled={!email || !pw || busy}>Sign in <ArrowRight size={15} /></Button>
          <div className="text-[11px] muted mt-5 flex items-center gap-1.5"><Lock size={11} /> Accounts are managed by an admin under Settings › Users.</div>
        </form>
      </motion.div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { RefreshCw, Star, Brain } from 'lucide-react'
import { useApp } from '@/store/app'
import { MODEL_PROFILES } from '@/lib/data'
import { listModels, fmtPrice } from '@/lib/openrouter'
import { Button, Chip, PageHeader, SearchBox, Segmented, Select, cx } from '@/components/ui'
import { Page, Stagger, Item } from '@/components/motion'

export default function Models() {
  const nav = useNavigate()
  const { apiKey, models, setModels, defaultModel, setDefaultModel, profiles, setProfileModel } = useApp()
  const [q, setQ] = useState('')
  const [cap, setCap] = useState<'all' | 'tools' | 'vision'>('all')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const refresh = async () => { setLoading(true); setErr(''); try { setModels(await listModels(apiKey || undefined)) } catch (e: any) { setErr(e.message) } finally { setLoading(false) } }
  useEffect(() => { if (!models.length) refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => models.filter((m) => (m.id + m.name).toLowerCase().includes(q.toLowerCase())).filter((m) => cap === 'all' || (cap === 'tools' ? m.supported_parameters?.includes('tools') : m.architecture?.input_modalities?.includes('image'))).slice(0, 150), [models, q, cap])
  const acc = { verify: 96.2, decide: 92.4, draft: 90.1 } as Record<string, number>

  return (
    <Page className="max-w-[1080px] mx-auto pt-8 pb-16 px-4">
      <PageHeader title="Models" subtitle="Approved model profiles, backed by the OpenRouter catalog." actions={<Button onClick={refresh} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh</Button>} />

      <Stagger className="grid md:grid-cols-3 gap-4 mb-8" delay={0.08}>
        {MODEL_PROFILES.map((p) => {
          const cur = profiles.find((x) => x.id === p.id)?.model ?? p.model
          const a = acc[p.id]; const r = 26; const c = 2 * Math.PI * r
          return (
            <Item key={p.id}>
              <div className="clay p-5 flex gap-4">
                <div className="relative w-16 h-16 shrink-0">
                  <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90"><circle cx="32" cy="32" r={r} fill="none" stroke="var(--clay-dark)" strokeWidth="6" /><motion.circle cx="32" cy="32" r={r} fill="none" stroke={a >= p.min ? 'var(--accent)' : 'var(--danger)'} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - a / 100) }} transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }} /></svg>
                  <span className="absolute inset-0 grid place-items-center text-[12px] font-bold tabular-nums">{a}%</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[14px] flex items-center gap-1.5"><Brain size={14} className="muted" /> {p.name}</div>
                  <div className="text-[12px] muted mt-0.5 leading-snug">{p.purpose}</div>
                  <div className="text-[11px] muted mt-1">Rolling accuracy · minimum {p.min}%</div>
                  {models.length ? <Select value={cur} onChange={(e) => setProfileModel(p.id, e.target.value)} className="!h-8 !text-[12px] mt-2">{!models.some((m) => m.id === cur) && <option value={cur}>{cur}</option>}{models.filter((m) => m.supported_parameters?.includes('tools')).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select> : <Chip tone="accent" className="mt-2">{cur}</Chip>}
                </div>
              </div>
            </Item>
          )
        })}
      </Stagger>

      <div className="flex items-center gap-3 mb-4">
        <SearchBox value={q} onChange={setQ} placeholder="Search catalog" className="w-[280px]" />
        <Segmented value={cap} onChange={setCap} items={[{ id: 'all', label: 'All' }, { id: 'tools', label: 'Tool calling' }, { id: 'vision', label: 'Vision' }]} />
        <span className="text-[12.5px] muted ml-auto">{models.length ? `${models.length} models` : ''}</span>
      </div>
      {err && <div className="text-[13px] text-[var(--danger)] mb-4">{err}. <button className="underline" onClick={() => nav('/settings?tab=openrouter')}>Check your key</button></div>}
      <div className="clay px-3 py-1">
        <div className="row text-[11px] font-semibold uppercase tracking-wider muted !py-2"><span className="flex-1">Model</span><span className="w-[180px]">Capabilities</span><span className="w-[80px] text-right">Context</span><span className="w-[90px] text-right">Prompt</span><span className="w-[90px] text-right">Output</span><span className="w-[110px]" /></div>
        {!models.length && <div className="py-10 text-center muted text-[13px]">{loading ? 'Loading…' : 'No models loaded.'}</div>}
        {list.map((m) => { const d = m.id === defaultModel; return (
          <div key={m.id} className={cx('row', d && 'bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] rounded-[12px]')}>
            <span className="flex-1 min-w-0"><span className="block text-[13px] font-medium truncate flex items-center gap-1.5">{d && <Star size={12} className="text-[var(--warn)] fill-[var(--warn)]" />}{m.name}</span><span className="block text-[11.5px] muted truncate">{m.id}</span></span>
            <span className="w-[180px] flex gap-1">{m.supported_parameters?.includes('tools') && <Chip>tools</Chip>}{m.architecture?.input_modalities?.includes('image') && <Chip>vision</Chip>}{m.supported_parameters?.includes('reasoning') && <Chip>reasoning</Chip>}</span>
            <span className="w-[80px] text-right text-[12.5px] tabular-nums muted">{m.context_length ? `${Math.round(m.context_length / 1000)}k` : '—'}</span>
            <span className="w-[90px] text-right text-[12.5px] tabular-nums">{fmtPrice(m.pricing.prompt)}</span>
            <span className="w-[90px] text-right text-[12.5px] tabular-nums">{fmtPrice(m.pricing.completion)}</span>
            <span className="w-[110px] text-right">{d ? <span className="text-[12px] muted">Default</span> : <Button size="sm" onClick={() => setDefaultModel(m.id)}>Set default</Button>}</span>
          </div>
        ) })}
      </div>
    </Page>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Star, Zap, Scale, Brain } from 'lucide-react'
import { useApp, useUser, can } from '@/store/app'
import { MODEL_PROFILES } from '@/lib/data'
import { listModels, fmtPrice } from '@/lib/openrouter'
import { Button, Chip, PageHeader, SearchBox, Segmented, Select, Tile, cx } from '@/components/ui'
import { Page, Stagger, Item } from '@/components/motion'

const icons = { fast: Zap, balanced: Scale, reasoning: Brain } as const
const colors = { fast: '#10b981', balanced: '#0ea5e9', reasoning: '#8b5cf6' } as const

export default function Models() {
  const user = useUser()!
  const editable = can(user, 'build')
  const nav = useNavigate()
  const { apiKey, models, setModels, defaultModel, setDefaultModel, profiles, setProfileModel } = useApp()
  const [q, setQ] = useState('')
  const [cap, setCap] = useState<'all' | 'tools' | 'vision'>('all')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const refresh = async () => { setLoading(true); setErr(''); try { setModels(await listModels(apiKey || undefined)) } catch (e: any) { setErr(e.message) } finally { setLoading(false) } }
  useEffect(() => { if (!models.length) refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => models.filter((m) => (m.id + m.name).toLowerCase().includes(q.toLowerCase())).filter((m) => cap === 'all' || (cap === 'tools' ? m.supported_parameters?.includes('tools') : m.architecture?.input_modalities?.includes('image'))).slice(0, 150), [models, q, cap])
  const toolModels = models.filter((m) => m.supported_parameters?.includes('tools'))

  return (
    <Page className="max-w-[1080px] mx-auto pt-8 pb-16 px-4">
      <PageHeader title="Models" subtitle="Each thinking level maps to a model. Agents choose a level; conditions and actions use Balanced and Fast." actions={<Button onClick={refresh} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh</Button>} />
      <Stagger className="grid md:grid-cols-3 gap-4 mb-8" delay={0.08}>
        {MODEL_PROFILES.map((p) => {
          const cur = profiles.find((x) => x.id === p.id)?.model ?? p.model
          const m = models.find((x) => x.id === cur); const Icon = icons[p.id]
          return (
            <Item key={p.id}>
              <div className="clay p-5 flex flex-col gap-3">
                <div className="flex items-center gap-3"><Tile color={colors[p.id]} size={36}><Icon size={16} /></Tile><div><div className="font-semibold text-[14px]">{p.name}</div><div className="text-[11.5px] muted">{p.purpose}</div></div></div>
                {models.length ? <Select value={cur} disabled={!editable} onChange={(e) => editable && setProfileModel(p.id, e.target.value)} className="!h-9 !text-[12.5px]">{!models.some((x) => x.id === cur) && <option value={cur}>{cur}</option>}{toolModels.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select> : <Chip tone="accent">{cur}</Chip>}
                {m && <div className="text-[11.5px] muted">{fmtPrice(m.pricing.prompt)} in · {fmtPrice(m.pricing.completion)} out · {m.context_length ? `${Math.round(m.context_length / 1000)}k context` : ''}</div>}
              </div>
            </Item>
          )
        })}
      </Stagger>
      <div className="flex items-center gap-3 mb-4">
        <SearchBox value={q} onChange={setQ} placeholder="Search catalog" className="w-[280px]" />
        <Segmented value={cap} onChange={setCap} items={[{ id: 'all', label: 'All' }, { id: 'tools', label: 'Tool calling' }, { id: 'vision', label: 'Vision' }]} />
        <span className="text-[12.5px] muted ml-auto">{models.length ? `${models.length} models · default is used by new agents and the assistant` : ''}</span>
      </div>
      {err && <div className="text-[13px] text-[var(--danger)] mb-4">{err}</div>}
      <div className="clay px-3 py-1">
        <div className="row text-[11px] font-semibold uppercase tracking-wider muted !py-2"><span className="flex-1">Model</span><span className="w-[180px]">Capabilities</span><span className="w-[80px] text-right">Context</span><span className="w-[90px] text-right">Prompt</span><span className="w-[90px] text-right">Output</span><span className="w-[110px]" /></div>
        {!models.length && <div className="py-10 text-center muted text-[13px]">{loading ? 'Loading…' : 'No models loaded.'}</div>}
        {list.map((m) => {
          const d = m.id === defaultModel; return (
            <div key={m.id} className={cx('row', d && 'bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] rounded-[12px]')}>
              <span className="flex-1 min-w-0"><span className="block text-[13px] font-medium truncate flex items-center gap-1.5">{d && <Star size={12} className="text-[var(--warn)] fill-[var(--warn)]" />}{m.name}</span><span className="block text-[11.5px] muted truncate">{m.id}</span></span>
              <span className="w-[180px] flex gap-1">{m.supported_parameters?.includes('tools') && <Chip>tools</Chip>}{m.architecture?.input_modalities?.includes('image') && <Chip>vision</Chip>}{m.supported_parameters?.includes('reasoning') && <Chip>reasoning</Chip>}</span>
              <span className="w-[80px] text-right text-[12.5px] tabular-nums muted">{m.context_length ? `${Math.round(m.context_length / 1000)}k` : '—'}</span>
              <span className="w-[90px] text-right text-[12.5px] tabular-nums">{fmtPrice(m.pricing.prompt)}</span>
              <span className="w-[90px] text-right text-[12.5px] tabular-nums">{fmtPrice(m.pricing.completion)}</span>
              <span className="w-[110px] text-right">{d ? <span className="text-[12px] muted">Default</span> : editable ? <Button size="sm" onClick={() => setDefaultModel(m.id)}>Set default</Button> : null}</span>
            </div>
          )
        })}
      </div>
    </Page>
  )
}

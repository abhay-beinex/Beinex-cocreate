import { Lock, Globe, Brain, BookOpen, Plug, Send } from 'lucide-react'
import { useApp } from '@/store/app'
import { TOOLS } from '@/lib/tools'
import { Chip, PageHeader, Tile } from '@/components/ui'
import { Page, Stagger, Item } from '@/components/motion'

const cats = [
  { id: 'Web', icon: Globe, color: '#0ea5e9', desc: 'Live web search, deep research and page reading through OpenRouter.' },
  { id: 'Reasoning', icon: Brain, color: '#8b5cf6', desc: 'Exact maths and a JavaScript sandbox for data work. Runs in the browser.' },
  { id: 'Knowledge', icon: BookOpen, color: '#10b981', desc: 'Search attached libraries and save documents back to the workspace.' },
  { id: 'Actions', icon: Send, color: '#f59e0b', desc: 'External actions. Always queued under Approvals for a person to decide.' },
] as const

const connectors = [
  { name: 'OpenRouter', status: 'Connected', desc: 'Models, web search plugin' },
  { name: 'Microsoft 365', status: 'Roll-out', desc: 'Outlook drafts, Teams notifications, SharePoint' },
  { name: 'Slack', status: 'Roll-out', desc: 'Notifications and approvals' },
  { name: 'Custom MCP server', status: 'Roll-out', desc: 'Bring your own tools over the Model Context Protocol' },
]

export default function Tools() {
  const { agents, apiKey } = useApp()
  return (
    <Page className="max-w-[1080px] mx-auto pt-8 pb-16 px-4">
      <PageHeader title="Tools" subtitle="Built-in capabilities any agent can use. Turn them on per agent in the agent editor." />
      <Stagger className="flex flex-col gap-6" delay={0.06}>
        {cats.map((c) => (
          <Item key={c.id}>
            <div className="flex items-center gap-2 mb-2 px-1"><c.icon size={14} className="muted" /><span className="text-[12px] font-semibold">{c.id}</span><span className="text-[12px] muted">· {c.desc}</span></div>
            <div className="clay px-3 py-1">
              {TOOLS.filter((t) => t.category === c.id).map((t) => {
                const used = agents.filter((a) => a.tools.includes(t.name)).length
                return (
                  <div key={t.name} className="row">
                    <Tile color={t.write ? '#f59e0b' : c.color} size={34}>{t.write ? <Lock size={15} /> : <c.icon size={15} />}</Tile>
                    <div className="flex-1 min-w-0"><div className="text-[13.5px] font-medium">{t.label} <code className="text-[11px] muted font-normal ml-1">{t.name}</code></div><div className="text-[12px] muted">{t.desc}</div></div>
                    {t.write && <Chip tone="warn">Gated</Chip>}
                    <span className="text-[12.5px] muted w-[90px] text-right">{used} agent{used === 1 ? '' : 's'}</span>
                  </div>
                )
              })}
            </div>
          </Item>
        ))}
        <Item>
          <div className="text-[12px] font-semibold mb-2 px-1">Connectors</div>
          <div className="clay px-3 py-1">
            {connectors.map((c) => (
              <div key={c.name} className="row">
                <Tile color="#64748b" size={34}><Plug size={15} /></Tile>
                <div className="flex-1 min-w-0"><div className="text-[13.5px] font-medium">{c.name}</div><div className="text-[12px] muted">{c.desc}</div></div>
                <Chip tone={c.name === 'OpenRouter' ? (apiKey ? 'ok' : undefined) : undefined}>{c.name === 'OpenRouter' ? (apiKey ? 'Connected' : 'Not connected') : c.status}</Chip>
              </div>
            ))}
          </div>
        </Item>
      </Stagger>
    </Page>
  )
}

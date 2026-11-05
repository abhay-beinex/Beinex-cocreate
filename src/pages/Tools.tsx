import { Lock, Wrench, Plug } from 'lucide-react'
import { useApp } from '@/store/app'
import { TOOLS } from '@/lib/tools'
import { Chip, PageHeader, Tile, colorFor } from '@/components/ui'
import { Page, Stagger, Item } from '@/components/motion'

const connectors = [
  { name: 'Microsoft Outlook', status: 'Connected', desc: 'Email triggers and drafts' },
  { name: 'Microsoft Teams', status: 'Connected', desc: 'Notifications and approvals' },
  { name: 'SAP S/4HANA', status: 'Connected · read-only', desc: 'Invoices, POs and the general ledger' },
  { name: 'SharePoint', status: 'Not connected', desc: 'Policy documents' },
]

export default function Tools() {
  const { agents } = useApp()
  const cats = ['Finance', 'Suppliers', 'Knowledge', 'Actions'] as const
  return (
    <Page className="max-w-[1080px] mx-auto pt-8 pb-16 px-4">
      <PageHeader title="Tools" subtitle="Capabilities agents can call. Read tools answer instantly; write tools always queue for a human." />
      <Stagger className="flex flex-col gap-6" delay={0.06}>
        {cats.map((c) => (
          <Item key={c}>
            <div className="text-[12px] font-semibold mb-2 px-1">{c}</div>
            <div className="clay px-3 py-1">
              {TOOLS.filter((t) => t.category === c).map((t) => {
                const used = agents.filter((a) => a.tools.includes(t.name)).length
                return (
                  <div key={t.name} className="row">
                    <Tile color={t.write ? '#f59e0b' : colorFor(t.category)} size={34}>{t.write ? <Lock size={15} /> : <Wrench size={15} />}</Tile>
                    <div className="flex-1 min-w-0"><div className="text-[13.5px] font-medium">{t.label}</div><div className="text-[12px] muted">{t.desc}</div></div>
                    {t.write && <Chip tone="warn">Gated</Chip>}
                    <span className="text-[12.5px] muted w-[110px] text-right">{used} agent{used === 1 ? '' : 's'}</span>
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
                <Chip tone={c.status.startsWith('Connected') ? 'ok' : undefined}>{c.status}</Chip>
              </div>
            ))}
          </div>
          <div className="text-[11.5px] muted mt-2 px-1">Custom tools via MCP are enabled at production roll-out.</div>
        </Item>
      </Stagger>
    </Page>
  )
}

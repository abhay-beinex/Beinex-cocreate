// Custom React Flow node and edge for the flow builder: rich step cards with live run status, yes/no branch handles and labelled edges.
import { memo } from 'react'
import { Handle, Position, BaseEdge, EdgeLabelRenderer, getBezierPath, type Node, type Edge, type NodeProps, type EdgeProps } from '@xyflow/react'
import { Plus, Check, X, Loader2, Hourglass, Clock, Zap } from 'lucide-react'
import type { StepData } from '@/lib/data'
import { brickOf, NODE_W } from '@/lib/flow'
import { Tile, cx } from './ui'
import { AgentAvatar } from './AgentAvatar'

export type StepStatus = 'running' | 'ok' | 'failed' | 'waiting' | 'skipped'
export type FlowUi = {
  line: string
  status?: StepStatus
  problem?: boolean
  agent?: { name: string; icon?: string; color?: string; thinking?: string }
  approver?: string
  schedule?: string
  editable: boolean
  onAdd?: (nodeId: string, branch?: 'yes' | 'no') => void
}
export type FlowData = StepData & { ui: FlowUi }
export type FlowNode = Node<FlowData, 'step'>

const statusRing: Record<StepStatus, string> = {
  running: 'ring-2 ring-[var(--accent)]', ok: 'ring-2 ring-[var(--ok)]', failed: 'ring-2 ring-[var(--danger)]', waiting: 'ring-2 ring-[var(--warn)]', skipped: '',
}

function StatusBadge({ s }: { s?: StepStatus }) {
  if (!s || s === 'skipped') return null
  const map = { running: ['bg-[var(--accent)]', <Loader2 size={11} className="animate-spin" />], ok: ['bg-[var(--ok)]', <Check size={11} strokeWidth={3} />], failed: ['bg-[var(--danger)]', <X size={11} strokeWidth={3} />], waiting: ['bg-[var(--warn)]', <Hourglass size={10} />] } as const
  const [bg, icon] = map[s]
  return <span className={cx('absolute -top-2 -left-2 w-5 h-5 rounded-full grid place-items-center text-white shadow', bg)}>{icon}</span>
}

function AddButton({ onClick, title, className, style }: { onClick: () => void; title: string; className?: string; style?: React.CSSProperties }) {
  return (
    <button type="button" style={style} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onClick() }} title={title}
      className={cx('nodrag nopan absolute w-6 h-6 rounded-full grid place-items-center bg-[var(--surface-2)] border border-[var(--line)] text-[var(--muted)] shadow-[0_2px_6px_rgba(16,24,40,.12)] opacity-0 group-hover:opacity-100 transition-all hover:text-white hover:bg-[var(--accent)] hover:border-transparent hover:scale-110', className)}>
      <Plus size={13} strokeWidth={2.4} />
    </button>
  )
}

export const StepNodeView = memo(function StepNodeView({ id, data, selected }: NodeProps<FlowNode>) {
  const b = brickOf(data.brick); const Icon = b.icon; const ui = data.ui
  const isLogic = data.brick === 'logic'; const isStart = data.brick === 'trigger'
  return (
    <div className="group relative" style={{ width: NODE_W }}>
      <div className={cx('relative rounded-[16px] bg-[var(--surface-2)] border transition-all duration-200', selected ? 'border-[var(--accent)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_18%,transparent),0_14px_28px_-16px_var(--clay-drop)]' : 'border-[var(--line)] shadow-[0_10px_24px_-16px_var(--clay-drop)] group-hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--line))]', ui.status && statusRing[ui.status], ui.status === 'running' && 'animate-pulse-ring', ui.problem && !selected && 'border-dashed border-[var(--warn)]')}>
        <StatusBadge s={ui.status} />
        <div className="flex items-start gap-2.5 px-3 pt-3 pb-2.5">
          <Tile color={b.color} size={32} radius={10}>{isStart && ui.schedule ? <Clock size={14} /> : <Icon size={14} />}</Tile>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="block text-[13px] font-semibold truncate leading-tight">{data.label || b.label}</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em] muted shrink-0">{b.label}</span>
            </div>
            <div className="text-[11.5px] muted leading-snug mt-0.5 line-clamp-2 break-words">{ui.line}</div>
          </div>
        </div>
        {(ui.agent || ui.approver || ui.schedule) && (
          <div className="px-3 pb-2.5 -mt-0.5 flex items-center gap-1.5 text-[11px]">
            {ui.agent && <span className="inline-flex items-center gap-1.5 h-6 pl-0.5 pr-2 rounded-full bg-[var(--clay-dark)] font-medium max-w-full"><AgentAvatar name={ui.agent.name} icon={ui.agent.icon} color={ui.agent.color} size={18} radius={6} /><span className="truncate">{ui.agent.name}</span>{ui.agent.thinking && <span className="muted">· {ui.agent.thinking}</span>}</span>}
            {ui.approver && <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[var(--clay-dark)] font-medium truncate">{ui.approver}</span>}
            {ui.schedule && <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[var(--clay-dark)] font-medium truncate"><Clock size={11} /> {ui.schedule}</span>}
            {isStart && !ui.schedule && <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[var(--clay-dark)] font-medium"><Zap size={11} /> Manual</span>}
          </div>
        )}
        {isLogic && (
          <div className="px-3 pb-2.5 flex items-center justify-end gap-1.5 text-[10.5px] font-semibold">
            <span className="h-5 px-2 rounded-full bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] text-[var(--ok)]">Yes ↗</span>
            <span className="h-5 px-2 rounded-full bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--danger)]">No ↘</span>
          </div>
        )}
      </div>

      {!isStart && <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-[var(--surface-2)] !border-2 !border-[var(--muted)]" />}
      {isLogic ? (
        <>
          <Handle id="yes" type="source" position={Position.Right} style={{ top: '38%' }} className="!w-2.5 !h-2.5 !bg-[var(--surface-2)] !border-2 !border-[var(--ok)]" />
          <Handle id="no" type="source" position={Position.Right} style={{ top: '72%' }} className="!w-2.5 !h-2.5 !bg-[var(--surface-2)] !border-2 !border-[var(--danger)]" />
          {ui.editable && ui.onAdd && <AddButton title="Add a step on the Yes branch" onClick={() => ui.onAdd!(id, 'yes')} className="-right-8" style={{ top: 'calc(38% - 12px)' }} />}
          {ui.editable && ui.onAdd && <AddButton title="Add a step on the No branch" onClick={() => ui.onAdd!(id, 'no')} className="-right-8" style={{ top: 'calc(72% - 12px)' }} />}
        </>
      ) : (
        <>
          <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-[var(--surface-2)] !border-2 !border-[var(--muted)]" />
          {ui.editable && ui.onAdd && <AddButton title="Add a step after this one" onClick={() => ui.onAdd!(id)} className="-right-8 top-1/2 -translate-y-1/2" />}
        </>
      )}
    </div>
  )
})

export type BranchEdge = Edge<{ label?: string; active?: boolean; editable?: boolean; onDelete?: (id: string) => void; onFlip?: (id: string) => void }, 'branch'>

export const BranchEdgeView = memo(function BranchEdgeView({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data }: EdgeProps<BranchEdge>) {
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.35 })
  const label = (data?.label ?? '').toLowerCase()
  const tone = label.startsWith('yes') ? 'var(--ok)' : label.startsWith('no') ? 'var(--danger)' : undefined
  return (
    <>
      <BaseEdge id={id} path={path} style={{ stroke: selected ? 'var(--accent)' : tone ?? 'var(--muted)', strokeWidth: selected ? 2.2 : 1.7, opacity: selected || data?.active ? 1 : 0.75, strokeDasharray: data?.active ? '6 6' : undefined }} className={data?.active ? 'edge-flow' : undefined} />
      {(tone || selected) && (
        <EdgeLabelRenderer>
          <div className="nodrag nopan absolute flex items-center gap-1" style={{ transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)`, pointerEvents: 'all' }}>
            {tone && <button type="button" onClick={() => data?.editable && data?.onFlip?.(id)} title={data?.editable ? 'Switch branch' : undefined} className="h-5 px-2 rounded-full text-[10.5px] font-semibold text-white shadow-sm" style={{ background: tone }}>{label.startsWith('yes') ? 'Yes' : 'No'}</button>}
            {selected && data?.editable && <button type="button" onClick={() => data?.onDelete?.(id)} title="Remove connection" className="w-5 h-5 rounded-full grid place-items-center bg-[var(--surface-2)] border border-[var(--line)] text-[var(--muted)] hover:text-[var(--danger)] shadow-sm"><X size={11} strokeWidth={2.6} /></button>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})

export const nodeTypes = { step: StepNodeView }
export const edgeTypes = { branch: BranchEdgeView }

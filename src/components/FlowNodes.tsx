// Custom React Flow node and edge for the flow builder: step cards with live run status, labelled branch handles
// (yes/no, each/done), variable badges and labelled edges.
import { memo } from 'react'
import { Handle, Position, BaseEdge, EdgeLabelRenderer, getBezierPath, type Node, type Edge, type NodeProps, type EdgeProps } from '@xyflow/react'
import { Plus, Check, X, Loader2, Hourglass, Clock, Zap, Link2, Eye, FileInput } from 'lucide-react'
import type { StepData } from '@/lib/data'
import { brickOf, NODE_W, producesVar, keyOf } from '@/lib/flow'
import { Tile, cx } from './ui'
import { AgentAvatar } from './AgentAvatar'

export type StepStatus = 'running' | 'ok' | 'failed' | 'waiting' | 'skipped'
export type FlowUi = {
  line: string
  status?: StepStatus
  problem?: boolean
  agent?: { name: string; icon?: string; color?: string; thinking?: string }
  approver?: string
  trigger?: { kind: 'manual' | 'schedule' | 'link' | 'watch' | 'event'; text: string }
  nested?: 'loop' | 'parallel'
  editable: boolean
  onAdd?: (nodeId: string, branch?: string) => void
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
    <button type="button" style={style} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onClick() }} title={title} aria-label={title}
      className={cx('nodrag nopan absolute w-6 h-6 rounded-full grid place-items-center bg-[var(--surface-2)] border border-[var(--line)] text-[var(--muted)] shadow-[0_2px_6px_rgba(16,24,40,.12)] opacity-0 group-hover:opacity-100 transition-all hover:text-white hover:bg-[var(--accent)] hover:border-transparent hover:scale-110', className)}>
      <Plus size={13} strokeWidth={2.4} />
    </button>
  )
}

const triggerIcon = { manual: Zap, schedule: Clock, link: Link2, watch: Eye, event: FileInput } as const

export const StepNodeView = memo(function StepNodeView({ id, data, selected }: NodeProps<FlowNode>) {
  const b = brickOf(data.brick); const Icon = b.icon; const ui = data.ui
  const isLogic = data.brick === 'logic'; const isLoop = data.brick === 'loop'; const isStart = data.brick === 'trigger'
  const two = isLogic || isLoop
  const labels: [string, string] = isLogic ? ['Yes', 'No'] : ['Each', 'Done']
  const TI = isStart && ui.trigger ? triggerIcon[ui.trigger.kind] : Icon
  return (
    <div className="group relative" style={{ width: NODE_W }}>
      <div className={cx('relative rounded-[16px] bg-[var(--surface-2)] border transition-all duration-200', selected ? 'border-[var(--accent)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_18%,transparent),0_14px_28px_-16px_var(--clay-drop)]' : 'border-[var(--line)] shadow-[0_10px_24px_-16px_var(--clay-drop)] group-hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--line))]', ui.status && statusRing[ui.status], ui.status === 'running' && 'animate-pulse-ring', ui.problem && !selected && 'border-dashed border-[var(--warn)]', ui.nested && 'bg-[color-mix(in_srgb,var(--surface-2)_92%,' + (ui.nested === 'loop' ? '#f97316' : '#14b8a6') + ')]')}>
        <StatusBadge s={ui.status} />
        <div className="flex items-start gap-2.5 px-3 pt-3 pb-2.5">
          <Tile color={b.color} size={32} radius={10}><TI size={14} /></Tile>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="block text-[13px] font-semibold truncate leading-tight">{data.label || b.label}</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em] muted shrink-0">{b.tag}</span>
            </div>
            <div className="text-[11.5px] muted leading-snug mt-0.5 line-clamp-2 break-words">{ui.line}</div>
          </div>
        </div>
        {(ui.agent || ui.approver || ui.trigger || producesVar(data.brick)) && (
          <div className="px-3 pb-2.5 -mt-0.5 flex items-center gap-1.5 text-[11px] flex-wrap">
            {ui.agent && <span className="inline-flex items-center gap-1.5 h-6 pl-0.5 pr-2 rounded-full bg-[var(--clay-dark)] font-medium max-w-full"><AgentAvatar name={ui.agent.name} icon={ui.agent.icon} color={ui.agent.color} size={18} radius={6} /><span className="truncate">{ui.agent.name}</span>{ui.agent.thinking && <span className="muted">· {ui.agent.thinking}</span>}</span>}
            {ui.approver && <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[var(--clay-dark)] font-medium truncate">{ui.approver}</span>}
            {ui.trigger && <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[var(--clay-dark)] font-medium truncate"><TI size={11} /> {ui.trigger.text}</span>}
            {producesVar(data.brick) && <span className="inline-flex items-center h-6 px-2 rounded-full font-mono text-[10.5px] text-[var(--accent-ink)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] truncate" title="Use this step's result in later steps">{`{{${keyOf(data)}}}`}</span>}
          </div>
        )}
        {two && (
          <div className="px-3 pb-2.5 flex items-center justify-end gap-1.5 text-[10.5px] font-semibold">
            <span className="h-5 px-2 rounded-full bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] text-[var(--ok)]">{labels[0]} ↗</span>
            <span className={cx('h-5 px-2 rounded-full', isLogic ? 'bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--danger)]' : 'bg-[var(--clay-dark)] muted')}>{labels[1]} ↘</span>
          </div>
        )}
      </div>

      {!isStart && <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-[var(--surface-2)] !border-2 !border-[var(--muted)]" />}
      {two ? (
        <>
          <Handle id={isLogic ? 'yes' : 'each'} type="source" position={Position.Right} style={{ top: '38%' }} className="!w-2.5 !h-2.5 !bg-[var(--surface-2)] !border-2 !border-[var(--ok)]" />
          <Handle id={isLogic ? 'no' : 'done'} type="source" position={Position.Right} style={{ top: '72%' }} className={cx('!w-2.5 !h-2.5 !bg-[var(--surface-2)] !border-2', isLogic ? '!border-[var(--danger)]' : '!border-[var(--muted)]')} />
          {ui.editable && ui.onAdd && <AddButton title={`Add a step on the ${labels[0]} branch`} onClick={() => ui.onAdd!(id, isLogic ? 'yes' : 'each')} className="-right-8" style={{ top: 'calc(38% - 12px)' }} />}
          {ui.editable && ui.onAdd && <AddButton title={`Add a step on the ${labels[1]} branch`} onClick={() => ui.onAdd!(id, isLogic ? 'no' : 'done')} className="-right-8" style={{ top: 'calc(72% - 12px)' }} />}
        </>
      ) : (
        <>
          <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-[var(--surface-2)] !border-2 !border-[var(--muted)]" />
          {ui.editable && ui.onAdd && <AddButton title={data.brick === 'parallel' ? 'Add a branch' : 'Add a step after this one'} onClick={() => ui.onAdd!(id)} className="-right-8 top-1/2 -translate-y-1/2" />}
        </>
      )}
    </div>
  )
})

export type BranchEdge = Edge<{ label?: string; active?: boolean; editable?: boolean; onDelete?: (id: string) => void; onFlip?: (id: string) => void }, 'branch'>

const toneOf = (label: string) => (label.startsWith('yes') || label.startsWith('each') ? 'var(--ok)' : label.startsWith('no') ? 'var(--danger)' : label.startsWith('done') ? 'var(--muted)' : undefined)
const textOf = (label: string) => (label.startsWith('yes') ? 'Yes' : label.startsWith('no') ? 'No' : label.startsWith('each') ? 'Each' : label.startsWith('done') ? 'Done' : '')

export const BranchEdgeView = memo(function BranchEdgeView({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data }: EdgeProps<BranchEdge>) {
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.35 })
  const label = (data?.label ?? '').toLowerCase()
  const tone = toneOf(label)
  return (
    <>
      <BaseEdge id={id} path={path} style={{ stroke: selected ? 'var(--accent)' : tone ?? 'var(--muted)', strokeWidth: selected ? 2.2 : 1.7, opacity: selected || data?.active ? 1 : 0.75, strokeDasharray: data?.active ? '6 6' : undefined }} className={data?.active ? 'edge-flow' : undefined} />
      {(tone || selected) && (
        <EdgeLabelRenderer>
          <div className="nodrag nopan absolute flex items-center gap-1" style={{ transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)`, pointerEvents: 'all' }}>
            {tone && <button type="button" onClick={() => data?.editable && data?.onFlip?.(id)} title={data?.editable ? 'Switch branch' : undefined} className="h-5 px-2 rounded-full text-[10.5px] font-semibold text-white shadow-sm" style={{ background: tone }}>{textOf(label)}</button>}
            {selected && data?.editable && <button type="button" onClick={() => data?.onDelete?.(id)} title="Remove connection" className="w-5 h-5 rounded-full grid place-items-center bg-[var(--surface-2)] border border-[var(--line)] text-[var(--muted)] hover:text-[var(--danger)] shadow-sm"><X size={11} strokeWidth={2.6} /></button>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})

export const nodeTypes = { step: StepNodeView }
export const edgeTypes = { branch: BranchEdgeView }

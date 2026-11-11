// Custom React Flow node and edge for the flow builder: step cards with live run status, labelled branch handles
// (yes/no, each/done, one per category), variable badges, and edges with branch pills and an insert button.
import { memo } from 'react'
import { Handle, Position, BaseEdge, EdgeLabelRenderer, getBezierPath, type Node, type Edge, type NodeProps, type EdgeProps } from '@xyflow/react'
import { Plus, Check, X, Loader2, Hourglass, Clock, Zap, Link2, Eye, FileInput } from 'lucide-react'
import type { StepData } from '@/lib/data'
import { brickOf, NODE_W, producesVar, keyOf, branchesOf } from '@/lib/flow'
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
/** Colour of a branch pill by its id. */
export const branchTone = (id: string) => (id === 'yes' || id === 'each' ? 'var(--ok)' : id === 'no' ? 'var(--danger)' : id === 'done' ? 'var(--muted)' : 'var(--accent-deep)')

export const StepNodeView = memo(function StepNodeView({ id, data, selected }: NodeProps<FlowNode>) {
  const b = brickOf(data.brick); const Icon = b.icon; const ui = data.ui
  const isStart = data.brick === 'trigger'
  const outs = branchesOf(data)
  const TI = isStart && ui.trigger ? triggerIcon[ui.trigger.kind] : Icon
  const handleCls = '!w-2.5 !h-2.5 !bg-[var(--surface-2)] !border-2'
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
        {outs.length > 0 && (
          <div className="px-3 pb-2.5 flex items-center justify-end gap-1 text-[10.5px] font-semibold flex-wrap">
            {outs.map((o) => <span key={o.id} className="h-5 px-2 rounded-full truncate max-w-[110px]" style={{ color: branchTone(o.id), background: `color-mix(in srgb, ${branchTone(o.id)} 13%, transparent)` }}>{o.label} ↗</span>)}
          </div>
        )}
      </div>

      {!isStart && <Handle type="target" position={Position.Left} className={cx(handleCls, '!border-[var(--muted)]')} />}
      {outs.length > 0 ? (
        outs.map((o, i) => {
          const top = `${((i + 1) / (outs.length + 1)) * 100}%`; return (
            <span key={o.id}>
              <Handle id={o.id} type="source" position={Position.Right} style={{ top }} className={handleCls} />
              {ui.editable && ui.onAdd && <AddButton title={`Add a step on the ${o.label} branch`} onClick={() => ui.onAdd!(id, o.id)} className="-right-8" style={{ top: `calc(${top} - 12px)` }} />}
            </span>
          )
        })
      ) : (
        <>
          <Handle type="source" position={Position.Right} className={cx(handleCls, '!border-[var(--muted)]')} />
          {ui.editable && ui.onAdd && <AddButton title={data.brick === 'parallel' ? 'Add a branch' : 'Add a step after this one'} onClick={() => ui.onAdd!(id)} className="-right-8 top-1/2 -translate-y-1/2" />}
        </>
      )}
    </div>
  )
})

export type BranchEdge = Edge<{ label?: string; active?: boolean; editable?: boolean; onDelete?: (id: string) => void; onFlip?: (id: string) => void; onInsert?: (id: string) => void }, 'branch'>

const textOf = (label: string) => (label === 'yes' ? 'Yes' : label === 'no' ? 'No' : label === 'each' ? 'Each' : label === 'done' ? 'Done' : label.charAt(0).toUpperCase() + label.slice(1))

export const BranchEdgeView = memo(function BranchEdgeView({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data }: EdgeProps<BranchEdge>) {
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.35 })
  const label = (data?.label ?? '').toLowerCase()
  const tone = label ? branchTone(label) : undefined
  const flippable = !!label
  return (
    <>
      <BaseEdge id={id} path={path} style={{ stroke: selected ? 'var(--accent)' : tone ?? 'var(--muted)', strokeWidth: selected ? 2.2 : 1.7, opacity: selected || data?.active ? 1 : 0.75, strokeDasharray: data?.active ? '6 6' : undefined }} className={data?.active ? 'edge-flow' : undefined} />
      <EdgeLabelRenderer>
        <div className={cx('nodrag nopan absolute flex items-center gap-1 edge-tools', !tone && !selected && 'edge-tools-quiet')} style={{ transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)`, pointerEvents: 'all' }} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          {tone && <button type="button" onClick={() => data?.editable && flippable && data?.onFlip?.(id)} title={data?.editable && flippable ? 'Switch branch' : undefined} className="h-5 px-2 rounded-full text-[10.5px] font-semibold text-white shadow-sm max-w-[120px] truncate" style={{ background: tone }}>{textOf(label)}</button>}
          {data?.editable && data?.onInsert && <button type="button" onClick={() => data.onInsert?.(id)} title="Insert a step here" aria-label="Insert a step here" className="edge-plus w-5 h-5 rounded-full grid place-items-center bg-[var(--surface-2)] border border-[var(--line)] text-[var(--muted)] hover:text-white hover:bg-[var(--accent)] hover:border-transparent shadow-sm"><Plus size={11} strokeWidth={2.6} /></button>}
          {selected && data?.editable && <button type="button" onClick={() => data?.onDelete?.(id)} title="Remove connection" aria-label="Remove connection" className="w-5 h-5 rounded-full grid place-items-center bg-[var(--surface-2)] border border-[var(--line)] text-[var(--muted)] hover:text-[var(--danger)] shadow-sm"><X size={11} strokeWidth={2.6} /></button>}
        </div>
      </EdgeLabelRenderer>
    </>
  )
})

export const nodeTypes = { step: StepNodeView }
export const edgeTypes = { branch: BranchEdgeView }

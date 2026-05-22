/**
 * TypeChip — 7  chip
 *
 * design.md §2.1
 *   goal=brand, decision=green, artifact=purple, progress=tertiary,
 *   open_question=yellow, constraint=red, handoff=orange
 *
 *  SpanTooltip / SpanDetailDrawer / Legend sidebar
 */

import { useTranslation } from 'react-i18next'
import {
  Target, CheckCircle2, Package, Activity,
  HelpCircle, Lock, ArrowRightLeft,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WhiteboardEntryType } from '@shared/whiteboard-types'

interface TypeVisual {
  icon: LucideIcon
  labelKey: string
  bgFillCls: string
  /** chip dim  tooltip / legend */
  bgSoftCls: string
  toneCls: string
}

export const TYPE_VISUAL: Record<WhiteboardEntryType, TypeVisual> = {
  goal: {
    icon: Target,
    labelKey: 'whiteboard.type.goal',
    bgFillCls: 'bg-[rgb(var(--accent-brand))] text-white',
    bgSoftCls: 'bg-[rgba(var(--accent-brand),0.14)]',
    toneCls: 'text-[rgb(var(--accent-brand))]',
  },
  decision: {
    icon: CheckCircle2,
    labelKey: 'whiteboard.type.decision',
    bgFillCls: 'bg-emerald-500 text-white',
    bgSoftCls: 'bg-emerald-500/15',
    toneCls: 'text-emerald-500',
  },
  artifact: {
    icon: Package,
    labelKey: 'whiteboard.type.artifact',
    bgFillCls: 'bg-violet-500 text-white',
    bgSoftCls: 'bg-violet-500/15',
    toneCls: 'text-violet-500',
  },
  progress: {
    icon: Activity,
    labelKey: 'whiteboard.type.progress',
    bgFillCls: 'bg-bg-tertiary text-text-secondary border border-border',
    bgSoftCls: 'bg-bg-tertiary',
    toneCls: 'text-text-secondary',
  },
  open_question: {
    icon: HelpCircle,
    labelKey: 'whiteboard.type.open_question',
    bgFillCls: 'bg-amber-500 text-[rgb(var(--bg-primary))]',
    bgSoftCls: 'bg-amber-500/15',
    toneCls: 'text-amber-500',
  },
  constraint: {
    icon: Lock,
    labelKey: 'whiteboard.type.constraint',
    bgFillCls: 'bg-rose-500 text-white',
    bgSoftCls: 'bg-rose-500/15',
    toneCls: 'text-rose-500',
  },
  handoff: {
    icon: ArrowRightLeft,
    labelKey: 'whiteboard.type.handoff',
    bgFillCls: 'bg-sky-500 text-white',
    bgSoftCls: 'bg-sky-500/15',
    toneCls: 'text-sky-500',
  },
}

export interface TypeChipProps {
  type: WhiteboardEntryType
  /** sm: icon-only (12px); md: icon + label; lg:  md  padding */
  size?: 'sm' | 'md' | 'lg'
  withLabel?: boolean
  /** soft  tooltipvs  fill  pill */
  variant?: 'fill' | 'soft'
  className?: string
}

const SIZE_CLS: Record<NonNullable<TypeChipProps['size']>, { padding: string; iconPx: number; text: string }> = {
  sm: { padding: 'px-1 py-px',     iconPx: 12, text: 'text-[10px]' },
  md: { padding: 'px-1.5 py-0.5',  iconPx: 12, text: 'text-[10.5px]' },
  lg: { padding: 'px-2 py-1',      iconPx: 14, text: 'text-[11.5px]' },
}

export const TypeChip = ({
  type, size = 'md', withLabel, variant = 'soft', className,
}: TypeChipProps) => {
  const { t } = useTranslation('chat')
  const v = TYPE_VISUAL[type]
  const Icon = v.icon
  const showLabel = withLabel ?? size !== 'sm'
  const sz = SIZE_CLS[size]
  const bgCls = variant === 'fill' ? v.bgFillCls : `${v.bgSoftCls} ${v.toneCls}`
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded font-medium uppercase tracking-wide',
        sz.padding,
        sz.text,
        bgCls,
        className,
      )}
    >
      <Icon size={sz.iconPx} className="shrink-0" strokeWidth={2.25} />
      {showLabel && <span>{t(v.labelKey)}</span>}
    </span>
  )
}

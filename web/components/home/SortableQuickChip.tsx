import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import WorkspaceIcon from '@/components/icons/WorkspaceIcon'
import type { QuickItem } from './types'
import { getQuickItemKey } from './utils'

interface SortableQuickChipProps {
  item: QuickItem
  isSelected: boolean
  onSelect: () => void
  onRemove: (e: React.MouseEvent) => void
  selectLabel: string
  deleteLabel: string
}

const SortableQuickChip = ({
  item, isSelected, onSelect, onRemove, selectLabel, deleteLabel,
}: SortableQuickChipProps) => {
  const id = getQuickItemKey(item)
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors select-none',
        isSelected
          ? 'border-accent-brand/40 bg-accent-brand/10 text-accent-brand'
          : 'border-border text-text-secondary hover:border-accent-brand/30 hover:text-text-primary',
        isDragging && 'opacity-50 shadow-lg z-50',
      )}
    >
      {/* Drag handle */}
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing flex items-center shrink-0 text-text-muted/40 hover:text-text-muted transition-colors -ml-0.5"
        aria-label="Drag to reorder"
      >
        <GripVertical size={10} />
      </span>
      {/* Clickable content */}
      <button
        onClick={onSelect}
        onKeyDown={(e) => { if (e.key === 'Enter') onSelect() }}
        aria-label={selectLabel}
        tabIndex={0}
        className="inline-flex items-center gap-1.5 bg-transparent border-none p-0 cursor-pointer"
      >
        <WorkspaceIcon size={11} className="shrink-0" />
        <span className="truncate max-w-[120px]">
          {item.type === 'workspace' ? item.label : item.paths[0].split('/').pop()}
        </span>
      </button>
      {/* Delete button */}
      <button
        onClick={onRemove}
        onKeyDown={(e) => { if (e.key === 'Enter') onRemove(e as unknown as React.MouseEvent) }}
        aria-label={deleteLabel}
        tabIndex={0}
        className="flex items-center justify-center rounded-sm hover:bg-bg-hover p-0.5 -mr-0.5 transition-colors opacity-0 group-hover:opacity-100"
      >
        <X size={10} />
      </button>
    </div>
  )
}

export default SortableQuickChip

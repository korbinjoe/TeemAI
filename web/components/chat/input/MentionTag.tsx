
import { cn } from '@/lib/utils'

interface MentionTagProps {
  name: string
  className?: string
}

const MentionTag = ({ name, className }: MentionTagProps) => (
  <span
    className={cn(
      'inline-flex items-center gap-0.5 px-1 py-0 rounded text-xs font-medium',
      'bg-accent-brand/10 text-accent-brand',
      'cursor-default select-all',
      className,
    )}
  >
    @{name}
  </span>
)

export default MentionTag

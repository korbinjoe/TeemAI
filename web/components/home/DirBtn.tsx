import { cn } from '@/lib/utils'

interface DirBtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary'
}

const DirBtn = ({ children, variant = 'default', disabled, ...props }: DirBtnProps) => (
  <button
    disabled={disabled}
    className={cn(
      'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
      variant === 'primary'
        ? 'border-accent-brand bg-accent-brand text-primary-foreground hover:opacity-90'
        : 'border-border bg-bg-input text-text-primary hover:bg-bg-hover-subtle',
    )}
    {...props}
  >
    {children}
  </button>
)

export default DirBtn

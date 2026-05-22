/**
 * ClearAllButton — sidebar
 * 2
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface ClearAllButtonProps {
  onConfirm: () => void
  className?: string
}

const ClearAllButton = ({ onConfirm, className }: ClearAllButtonProps) => {
  const { t } = useTranslation('common')
  const [armed, setArmed] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
  }, [])

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (armed) {
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
      timerRef.current = null
      setArmed(false)
      onConfirm()
      return
    }
    setArmed(true)
    timerRef.current = window.setTimeout(() => {
      setArmed(false)
      timerRef.current = null
    }, 2000)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'ml-auto mr-3 text-[10px] cursor-pointer transition-colors px-1.5 py-0.5 rounded',
        armed
          ? 'bg-amber-500/10 text-accent-yellow'
          : 'text-text-muted hover:text-text-emphasis',
        className,
      )}
    >
      {armed ? t('clearAll.confirmClick') : t('clearAll.dismissAll')}
    </button>
  )
}

export default ClearAllButton

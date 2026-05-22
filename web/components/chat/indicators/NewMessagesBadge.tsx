/**
 * NewMessagesBadge — N
 *
 */

import { ArrowDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface NewMessagesBadgeProps {
  count: number
  onClick: () => void
}

const NewMessagesBadge = ({ count, onClick }: NewMessagesBadgeProps) => {
  const { t } = useTranslation('chat')
  if (count <= 0) return null

  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent-brand text-white text-xs font-medium shadow-lg cursor-pointer border-none transition-all hover:bg-accent-brand/90 animate-in fade-in slide-in-from-bottom-2 duration-200"
      tabIndex={0}
      aria-label={t('newMessages', { count })}
    >
      <ArrowDown size={12} />
      {t('newMessages', { count })}
    </button>
  )
}

export default NewMessagesBadge

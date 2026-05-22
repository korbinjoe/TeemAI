import type { TFunction } from 'i18next'

export const formatTokens = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${n}`
}

export const relativeTime = (ts: number, t: TFunction): string => {
  const diff = Date.now() - ts
  if (diff < 60_000) return t('common:time.justNow')
  if (diff < 3_600_000) return t('common:time.minutesAgo', { count: Math.floor(diff / 60_000) })
  if (diff < 86_400_000) return t('common:time.hoursAgo', { count: Math.floor(diff / 3_600_000) })
  return t('common:time.daysAgo', { count: Math.floor(diff / 86_400_000) })
}

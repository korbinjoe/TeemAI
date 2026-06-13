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

const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** Label for a time-group divider in the message stream: anchors a section of
 *  messages to a moment (今天/昨天/date) so the time pulse is readable at a glance. */
export const formatTimeDivider = (ts: number): string => {
  const d = new Date(ts)
  const now = new Date()
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(d, now)) return `今天 ${time}`
  if (isSameDay(d, yesterday)) return `昨天 ${time}`
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日 ${time}`
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${time}`
}

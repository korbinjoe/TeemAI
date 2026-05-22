import { useEffect, useState } from 'react'
import { API_BASE, authFetch } from '@/config/api'
import { useNotification } from '@/contexts/NotificationContext'

interface DailySummary {
  date: string
  model: string
  totalInput: number
  totalOutput: number
  totalCacheRead: number
  totalCacheCreation: number
  totalCost: number
}

interface CronJob {
  id: string
  enabled: boolean
}

export interface TokenDetail {
  tokens: number
  cost: number
  input: number
  output: number
  cacheRead: number
  cacheCreation: number
}

export interface HomeStats {
  todayTokens: number
  todayCost: number
  weekTokens: number
  weekCost: number
  monthTokens: number
  monthCost: number
  todayDetail: TokenDetail
  weekDetail: TokenDetail
  monthDetail: TokenDetail
  cronJobsTotal: number
  cronJobsEnabled: number
  unreadCount: number
  loading: boolean
}

const sumTokens = (rows: DailySummary[]): TokenDetail =>
  rows.reduce((acc, r) => ({
    tokens: acc.tokens + r.totalInput + r.totalOutput + r.totalCacheRead + r.totalCacheCreation,
    cost: acc.cost + r.totalCost,
    input: acc.input + r.totalInput,
    output: acc.output + r.totalOutput,
    cacheRead: acc.cacheRead + r.totalCacheRead,
    cacheCreation: acc.cacheCreation + r.totalCacheCreation,
  }), { tokens: 0, cost: 0, input: 0, output: 0, cacheRead: 0, cacheCreation: 0 })

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const useHomeStats = (): HomeStats => {
  const emptyDetail: TokenDetail = { tokens: 0, cost: 0, input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }
  const { unreadCount } = useNotification()
  const [stats, setStats] = useState<HomeStats>({
    todayTokens: 0, todayCost: 0,
    weekTokens: 0, weekCost: 0,
    monthTokens: 0, monthCost: 0,
    todayDetail: emptyDetail, weekDetail: emptyDetail, monthDetail: emptyDetail,
    cronJobsTotal: 0, cronJobsEnabled: 0,
    unreadCount: 0,
    loading: true,
  })

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    Promise.all([
      authFetch(`${API_BASE}/api/token-usage/daily?days=30`, { signal }).then((r) => r.ok ? r.json() : []).catch(() => []),
      authFetch(`${API_BASE}/api/cron-jobs`, { signal }).then((r) => r.ok ? r.json() : []).catch(() => []),
    ]).then(([tokenRows, cronJobs]: [DailySummary[], CronJob[]]) => {
      if (signal.aborted) return

      const todayStr = today()
      const todayRows = tokenRows.filter((r) => r.date === todayStr)
      const todayData = sumTokens(todayRows)

      const dates = new Set<string>()
      const sorted = [...tokenRows].sort((a, b) => b.date.localeCompare(a.date))
      for (const r of sorted) { dates.add(r.date); if (dates.size >= 7) break }
      const weekRows = tokenRows.filter((r) => dates.has(r.date))
      const weekData = sumTokens(weekRows)

      const monthData = sumTokens(tokenRows)

      setStats((s) => ({
        ...s,
        todayTokens: todayData.tokens,
        todayCost: todayData.cost,
        weekTokens: weekData.tokens,
        weekCost: weekData.cost,
        monthTokens: monthData.tokens,
        monthCost: monthData.cost,
        todayDetail: todayData,
        weekDetail: weekData,
        monthDetail: monthData,
        cronJobsTotal: cronJobs.length,
        cronJobsEnabled: cronJobs.filter((j) => j.enabled).length,
        loading: false,
      }))
    }).catch(() => {
      if (!signal.aborted) setStats((s) => ({ ...s, loading: false }))
    })

    return () => controller.abort()
  }, [])

  return { ...stats, unreadCount }
}

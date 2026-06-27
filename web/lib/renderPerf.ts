import type { ProfilerOnRenderCallback } from 'react'

interface RenderPerfMark {
  name: string
  t: number
  detail?: Record<string, unknown>
}

interface RenderPerfMeasure {
  name: string
  start: string
  end: string
  duration: number
}

interface RenderPerfProfile {
  id: string
  phase: string
  actualDuration: number
  baseDuration: number
  startTime: number
  commitTime: number
}

const marks: RenderPerfMark[] = []
const measures: RenderPerfMeasure[] = []
const profiles: RenderPerfProfile[] = []

export const isRenderPerfEnabled = (): boolean => {
  if (typeof import.meta === 'undefined') return false
  return import.meta.env.VITE_RENDER_PERF === 'true'
}

const perfMarkName = (name: string): string => `render:${name}`

export const renderPerf = {
  get enabled(): boolean {
    return isRenderPerfEnabled()
  },

  mark(name: string, detail?: Record<string, unknown>): void {
    if (!isRenderPerfEnabled() || typeof performance === 'undefined') return
    const t = performance.now()
    marks.push({ name, t, detail })
    try {
      performance.mark(perfMarkName(name), { detail })
    } catch {
      try { performance.mark(perfMarkName(name)) } catch {}
    }
  },

  measure(name: string, start: string, end: string): void {
    if (!isRenderPerfEnabled() || typeof performance === 'undefined') return
    try {
      const entry = performance.measure(`render:${name}`, perfMarkName(start), perfMarkName(end))
      measures.push({ name, start, end, duration: entry.duration })
    } catch {
      // Marks are best-effort; missing marks should not affect normal runtime.
    }
  },

  routeStart(route: string, detail?: Record<string, unknown>): void {
    this.mark(`route:${route}:start`, detail)
  },

  routeReady(route: string, detail?: Record<string, unknown>): void {
    this.mark(`route:${route}:ready`, detail)
    this.measure(`route:${route}`, `route:${route}:start`, `route:${route}:ready`)
  },

  interactionStart(id: string, detail?: Record<string, unknown>): void {
    this.mark(`interaction:${id}:start`, detail)
  },

  interactionReady(id: string, detail?: Record<string, unknown>): void {
    this.mark(`interaction:${id}:ready`, detail)
    this.measure(`interaction:${id}`, `interaction:${id}:start`, `interaction:${id}:ready`)
  },

  onProfilerRender: ((id, phase, actualDuration, baseDuration, startTime, commitTime) => {
    if (!isRenderPerfEnabled()) return
    profiles.push({
      id,
      phase,
      actualDuration,
      baseDuration,
      startTime,
      commitTime,
    })
  }) satisfies ProfilerOnRenderCallback,

  getSnapshot() {
    return {
      marks: [...marks],
      measures: [...measures],
      profiles: [...profiles],
    }
  },

  clear(): void {
    marks.length = 0
    measures.length = 0
    profiles.length = 0
    try {
      performance.clearMarks()
      performance.clearMeasures()
    } catch {}
  },
}

declare global {
  interface Window {
    __renderPerf?: typeof renderPerf
  }
}

if (typeof window !== 'undefined' && isRenderPerfEnabled()) {
  window.__renderPerf = renderPerf
}

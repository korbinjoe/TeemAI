import { writeFileSync } from 'fs'
import type { CDPSession, Page } from 'playwright'
import type { MetricMap } from './types'

interface BrowserProbeSnapshot {
  longTasks: Array<{ name: string; startTime: number; duration: number }>
  layoutShifts: Array<{ value: number; hadRecentInput: boolean }>
  largestContentfulPaints: Array<{ startTime: number; renderTime?: number; loadTime?: number }>
}

declare global {
  interface Window {
    __renderPerfProbe?: BrowserProbeSnapshot
    __renderPerf?: {
      getSnapshot?: () => unknown
    }
  }
}

export const installPerformanceProbe = async (page: Page): Promise<void> => {
  await page.addInitScript({
    content: `
(() => {
  const probe = {
    longTasks: [],
    layoutShifts: [],
    largestContentfulPaints: [],
  };
  Object.defineProperty(window, '__renderPerfProbe', {
    value: probe,
    writable: false,
    configurable: true,
  });
  const observe = (type, cb) => {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) cb(entry);
      });
      observer.observe({ type, buffered: true });
    } catch {}
  };
  observe('longtask', (entry) => {
    probe.longTasks.push({ name: entry.name, startTime: entry.startTime, duration: entry.duration });
  });
  observe('layout-shift', (entry) => {
    probe.layoutShifts.push({ value: entry.value || 0, hadRecentInput: !!entry.hadRecentInput });
  });
  observe('largest-contentful-paint', (entry) => {
    probe.largestContentfulPaints.push({
      startTime: entry.startTime,
      renderTime: entry.renderTime,
      loadTime: entry.loadTime,
    });
  });
})();
`,
  })
}

export const collectBrowserMetrics = async (
  page: Page,
  extra: MetricMap = {},
): Promise<MetricMap> => {
  const browserMetrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const paints = performance.getEntriesByType('paint')
    const measures = performance.getEntriesByType('measure') as PerformanceMeasure[]
    const probe = window.__renderPerfProbe ?? { longTasks: [], layoutShifts: [], largestContentfulPaints: [] }
    const renderPerfSnapshot = window.__renderPerf?.getSnapshot?.() ?? null
    const bodyTextLength = document.body?.innerText?.trim().length ?? 0
    const documentElementCount = document.getElementsByTagName('*').length
    const visibleElementCount = [...document.body.querySelectorAll<HTMLElement>('body *')]
      .filter((el) => {
        const rect = el.getBoundingClientRect()
        const style = window.getComputedStyle(el)
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
      }).length
    const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number } }).memory
    return {
      nav: nav ? {
        domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
        load: nav.loadEventEnd - nav.startTime,
        responseEnd: nav.responseEnd - nav.startTime,
      } : null,
      paints: paints.map((p) => ({ name: p.name, startTime: p.startTime })),
      measures: measures.map((m) => ({ name: m.name, duration: m.duration })),
      probe,
      renderPerfSnapshot,
      bodyTextLength,
      documentElementCount,
      visibleElementCount,
      memory: memory ? {
        usedJSHeapSize: memory.usedJSHeapSize ?? null,
        totalJSHeapSize: memory.totalJSHeapSize ?? null,
      } : null,
    }
  })

  const metrics: MetricMap = { ...extra }
  if (browserMetrics.nav) {
    metrics.navDomContentLoadedMs = round(browserMetrics.nav.domContentLoaded)
    metrics.navLoadMs = round(browserMetrics.nav.load)
    metrics.navResponseEndMs = round(browserMetrics.nav.responseEnd)
  }

  for (const paint of browserMetrics.paints) {
    metrics[paint.name === 'first-contentful-paint' ? 'firstContentfulPaintMs' : `${paint.name}Ms`] = round(paint.startTime)
  }

  for (const measure of browserMetrics.measures) {
    metrics[`measure.${measure.name}`] = round(measure.duration)
  }

  const longTasks = browserMetrics.probe.longTasks
  metrics.longTaskCount = longTasks.length
  metrics.longTaskTotalMs = round(longTasks.reduce((sum, task) => sum + task.duration, 0))
  metrics.longTaskMaxMs = round(Math.max(0, ...longTasks.map((task) => task.duration)))

  metrics.cumulativeLayoutShift = round(
    browserMetrics.probe.layoutShifts
      .filter((shift) => !shift.hadRecentInput)
      .reduce((sum, shift) => sum + shift.value, 0),
  )

  const latestLcp = browserMetrics.probe.largestContentfulPaints.at(-1)
  if (latestLcp) metrics.largestContentfulPaintMs = round(latestLcp.renderTime || latestLcp.loadTime || latestLcp.startTime)

  metrics.bodyTextLength = browserMetrics.bodyTextLength
  metrics.documentElementCount = browserMetrics.documentElementCount
  metrics.visibleElementCount = browserMetrics.visibleElementCount
  if (browserMetrics.memory?.usedJSHeapSize != null) {
    metrics.jsHeapUsedMb = round(browserMetrics.memory.usedJSHeapSize / 1024 / 1024)
  }
  if (browserMetrics.memory?.totalJSHeapSize != null) {
    metrics.jsHeapTotalMb = round(browserMetrics.memory.totalJSHeapSize / 1024 / 1024)
  }

  await withCdp(page, async (client) => {
    const performanceMetrics = await client.send('Performance.getMetrics').catch(() => null)
    if (performanceMetrics) {
      const lookup = new Map(performanceMetrics.metrics.map((m) => [m.name, m.value]))
      const taskDuration = lookup.get('TaskDuration')
      const scriptDuration = lookup.get('ScriptDuration')
      if (taskDuration != null) metrics.cdpTaskDurationMs = round(taskDuration * 1000)
      if (scriptDuration != null) metrics.cdpScriptDurationMs = round(scriptDuration * 1000)
    }
    await client.send('HeapProfiler.collectGarbage').catch(() => {})
    const domCounters = await client.send('Memory.getDOMCounters').catch(() => null)
    if (domCounters) {
      metrics.domNodes = domCounters.nodes
      metrics.domDocuments = domCounters.documents
      metrics.domJsEventListeners = domCounters.jsEventListeners
    }
  })

  return metrics
}

export const detectBlankPage = async (page: Page): Promise<boolean> => {
  return page.evaluate(() => {
    const body = document.body
    if (!body) return true
    const textLength = body.innerText.trim().length
    const visible = [...body.querySelectorAll<HTMLElement>('body *')].some((el) => {
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      return rect.width >= 20 && rect.height >= 20 && style.display !== 'none' && style.visibility !== 'hidden'
    })
    return textLength < 3 && !visible
  })
}

export const startChromeTrace = async (page: Page): Promise<{ stop: (path?: string) => Promise<void> } | null> => {
  try {
    const client = await page.context().newCDPSession(page)
    await client.send('Tracing.start', {
      categories: ['devtools.timeline', 'blink.user_timing', 'v8', 'loading'].join(','),
      transferMode: 'ReturnAsStream',
    })
    return {
      stop: async (path?: string) => {
        const stream = await new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Timed out waiting for Chrome trace')), 10_000)
          client.once('Tracing.tracingComplete', (event) => {
            clearTimeout(timeout)
            resolve(event.stream)
          })
          void client.send('Tracing.end').catch(reject)
        })
        let eof = false
        let data = ''
        while (!eof) {
          const chunk = await client.send('IO.read', { handle: stream })
          if (path) data += chunk.data ?? ''
          eof = !!chunk.eof
        }
        await client.send('IO.close', { handle: stream }).catch(() => {})
        await client.detach().catch(() => {})
        if (path) writeFileSync(path, data)
      },
    }
  } catch {
    return null
  }
}

const withCdp = async (page: Page, fn: (client: CDPSession) => Promise<void>): Promise<void> => {
  const client = await page.context().newCDPSession(page).catch(() => null)
  if (!client) return
  try {
    await client.send('Performance.enable').catch(() => {})
    await fn(client)
  } finally {
    await client.detach().catch(() => {})
  }
}

const round = (value: number): number => Math.round(value * 10) / 10

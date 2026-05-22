import { useState, useRef, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'openteam:devpanel-layout'
const DEFAULT_W = 420
const DEFAULT_H = 600
const MIN_W = 320
const MIN_H = 300

interface PanelLayout { x: number; y: number; w: number; h: number }

const loadLayout = (): PanelLayout => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return {
        x: p.x ?? window.innerWidth - DEFAULT_W - 16,
        y: p.y ?? 60,
        w: p.w ?? DEFAULT_W,
        h: p.h ?? DEFAULT_H,
      }
    }
  } catch { /* ignore */ }
  try {
    const old = localStorage.getItem('openteam:devpanel-position')
    if (old) {
      const p = JSON.parse(old)
      localStorage.removeItem('openteam:devpanel-position')
      return { x: p.x, y: p.y, w: DEFAULT_W, h: DEFAULT_H }
    }
  } catch { /* ignore */ }
  return { x: window.innerWidth - DEFAULT_W - 16, y: 60, w: DEFAULT_W, h: DEFAULT_H }
}

const saveLayout = (layout: PanelLayout) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
}

const clampLayout = (l: PanelLayout): PanelLayout => ({
  x: Math.max(0, Math.min(l.x, window.innerWidth - MIN_W)),
  y: Math.max(0, Math.min(l.y, window.innerHeight - 100)),
  w: Math.max(MIN_W, Math.min(l.w, window.innerWidth)),
  h: Math.max(MIN_H, Math.min(l.h, window.innerHeight)),
})

type ResizeEdge = 'right' | 'bottom' | 'corner'

export const useDragResizePanel = () => {
  const [layout, setLayout] = useState<PanelLayout>(loadLayout)
  const dragging = useRef(false)
  const resizeEdge = useRef<ResizeEdge | null>(null)
  const startMouse = useRef({ x: 0, y: 0 })
  const startSnap = useRef<PanelLayout>({ x: 0, y: 0, w: 0, h: 0 })

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    dragging.current = true
    startMouse.current = { x: e.clientX, y: e.clientY }
    startSnap.current = { ...layout }
    e.preventDefault()
  }, [layout])

  const handleResizeStart = useCallback((edge: ResizeEdge) => (e: React.MouseEvent) => {
    resizeEdge.current = edge
    startMouse.current = { x: e.clientX, y: e.clientY }
    startSnap.current = { ...layout }
    e.preventDefault()
    e.stopPropagation()
  }, [layout])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - startMouse.current.x
      const dy = e.clientY - startMouse.current.y
      const s = startSnap.current

      if (dragging.current) {
        setLayout(clampLayout({ ...s, x: s.x + dx, y: s.y + dy }))
      } else if (resizeEdge.current === 'right') {
        setLayout(clampLayout({ ...s, w: s.w + dx }))
      } else if (resizeEdge.current === 'bottom') {
        setLayout(clampLayout({ ...s, h: s.h + dy }))
      } else if (resizeEdge.current === 'corner') {
        setLayout(clampLayout({ ...s, w: s.w + dx, h: s.h + dy }))
      }
    }
    const onUp = () => {
      if (dragging.current || resizeEdge.current) {
        dragging.current = false
        resizeEdge.current = null
        setLayout((l) => { saveLayout(l); return l })
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  useEffect(() => {
    const onResize = () => setLayout((l) => clampLayout(l))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return { layout, handleDragStart, handleResizeStart }
}

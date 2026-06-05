import {
  useCallback, useLayoutEffect, useRef, useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'

const DEFAULT_STORAGE_KEY = 'teemai:agent-editor:identity-split-left-px'
const DEFAULT_LEFT_PX = 360
const GUTTER_PX = 6

export type UseIdentitySplitPaneOptions = {
  disabled?: boolean
  minLeftPx?: number
  minRightPx?: number
  defaultLeftPx?: number
  /**
   * localStorage  IDENTITY
   */
  storageKey?: string
  /**
   * `first` +
   * `second` flex  +  AGENTS/SOUL
   */
  fixedPane?: 'first' | 'second'
}

export type UseIdentitySplitPaneResult = {
  splitContainerRef: RefObject<HTMLDivElement | null>
  leftPx: number
  gutterPx: number
  gutterProps: {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void
    onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void
  }
}

/**
 * pxPointer Events + localStorage
 */
export const useIdentitySplitPane = ({
  disabled = false,
  minLeftPx = 260,
  minRightPx = 200,
  defaultLeftPx = DEFAULT_LEFT_PX,
  storageKey = DEFAULT_STORAGE_KEY,
  fixedPane = 'first',
}: UseIdentitySplitPaneOptions): UseIdentitySplitPaneResult => {
  const splitContainerRef = useRef<HTMLDivElement | null>(null)
  const leftPxRef = useRef(defaultLeftPx)

  const readInitialPx = useCallback(() => {
    const minFixed = fixedPane === 'first' ? minLeftPx : minRightPx
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw != null) {
        const n = Number(raw)
        if (Number.isFinite(n) && n >= minFixed) return n
      }
    } catch { /* ignore */ }
    return defaultLeftPx
  }, [defaultLeftPx, fixedPane, minLeftPx, minRightPx, storageKey])

  const [leftPx, setLeftPx] = useState(() => readInitialPx())

  leftPxRef.current = leftPx

  const dragRef = useRef<{ startClientX: number; startLeftPx: number } | null>(null)

  const clampFixedPx = useCallback((next: number) => {
    const el = splitContainerRef.current
    if (!el) return next
    const w = el.clientWidth
    if (fixedPane === 'first') {
      const maxFirst = Math.max(minLeftPx, w - minRightPx - GUTTER_PX)
      return Math.min(maxFirst, Math.max(minLeftPx, next))
    }
    const maxSecond = Math.max(minRightPx, w - minLeftPx - GUTTER_PX)
    return Math.min(maxSecond, Math.max(minRightPx, next))
  }, [fixedPane, minLeftPx, minRightPx])

  useLayoutEffect(() => {
    const el = splitContainerRef.current
    if (!el) return
    const sync = () => {
      setLeftPx((prev) => clampFixedPx(prev))
    }
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    sync()
    return () => ro.disconnect()
  }, [clampFixedPx])

  const persist = useCallback((px: number) => {
    try {
      localStorage.setItem(storageKey, String(Math.round(px)))
    } catch { /* ignore */ }
  }, [storageKey])

  const handleGutterPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return
    e.preventDefault()
    dragRef.current = {
      startClientX: e.clientX,
      startLeftPx: leftPxRef.current,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [disabled])

  const handleGutterPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || disabled) return
    const delta = e.clientX - dragRef.current.startClientX
    const next = clampFixedPx(dragRef.current.startLeftPx + delta)
    setLeftPx(next)
  }, [clampFixedPx, disabled])

  const endDrag = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch { /* ignore */ }
    setLeftPx((prev) => {
      const v = clampFixedPx(prev)
      persist(v)
      return v
    })
  }, [clampFixedPx, persist])

  return {
    splitContainerRef,
    leftPx,
    gutterPx: GUTTER_PX,
    gutterProps: {
      onPointerDown: handleGutterPointerDown,
      onPointerMove: handleGutterPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  }
}

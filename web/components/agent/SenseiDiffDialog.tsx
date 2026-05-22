import { useRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Loader2, CheckCircle2, Terminal, Info, AlertTriangle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import type { SenseiLogEntry } from '@/hooks/useSenseiUpgrade'
import type {
  FullSuiteState, FullSuiteSegment,
} from '@/hooks/useSenseiUpgradeFull'

type UpgradeStatus = 'idle' | 'analyzing' | 'complete' | 'error'

interface SenseiDiffDialogBaseProps {
  status: UpgradeStatus
  logs: SenseiLogEntry[]
  error: string | null
  onCancel: () => void
  onDismiss: () => void
  agentName: string
}

interface SenseiDiffDialogSingleProps extends SenseiDiffDialogBaseProps {
  mode?: 'upgrade' | 'generate'
  original: string
  optimized: string
  onApply: () => void
}

interface SenseiDiffDialogFullProps extends SenseiDiffDialogBaseProps {
  mode: 'full-suite'
  isNew?: boolean
  current: FullSuiteState
  optimized: FullSuiteState
  partialError?: FullSuiteSegment[]
  onApply: () => void
  onRetrySegment?: (segment: FullSuiteSegment) => void
}

type SenseiDiffDialogProps = SenseiDiffDialogSingleProps | SenseiDiffDialogFullProps

const isFullSuite = (p: SenseiDiffDialogProps): p is SenseiDiffDialogFullProps =>
  p.mode === 'full-suite'

const formatElapsed = (time: number, baseTime: number) => {
  const elapsed = Math.max(0, Math.floor((time - baseTime) / 1000))
  const min = Math.floor(elapsed / 60)
  const sec = elapsed % 60
  return min > 0
    ? `${min}:${String(sec).padStart(2, '0')}`
    : `${sec}s`
}

const computeLineDiff = (a: string, b: string) => {
  const aLines = a.split('\n')
  const bLines = b.split('\n')
  const result: Array<{ type: 'same' | 'add' | 'remove'; text: string }> = []

  const n = aLines.length
  const m = bLines.length
  const max = n + m
  const v = new Map<number, number>()
  v.set(1, 0)
  const trace: Array<Map<number, number>> = []

  outer:
  for (let d = 0; d <= max; d++) {
    const vCopy = new Map(v)
    trace.push(vCopy)
    for (let k = -d; k <= d; k += 2) {
      let x: number
      if (k === -d || (k !== d && (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0))) {
        x = v.get(k + 1) ?? 0
      } else {
        x = (v.get(k - 1) ?? 0) + 1
      }
      let y = x - k
      while (x < n && y < m && aLines[x] === bLines[y]) {
        x++
        y++
      }
      v.set(k, x)
      if (x >= n && y >= m) break outer
    }
  }

  let x = n
  let y = m
  const edits: Array<{ type: 'same' | 'add' | 'remove'; text: string }> = []

  for (let d = trace.length - 1; d >= 0; d--) {
    const vd = trace[d]
    const k = x - y
    let prevK: number
    if (k === -d || (k !== d && (vd.get(k - 1) ?? 0) < (vd.get(k + 1) ?? 0))) {
      prevK = k + 1
    } else {
      prevK = k - 1
    }
    const prevX = vd.get(prevK) ?? 0
    const prevY = prevX - prevK

    while (x > prevX && y > prevY) {
      x--
      y--
      edits.push({ type: 'same', text: aLines[x] })
    }
    if (d > 0) {
      if (x === prevX) {
        y--
        edits.push({ type: 'add', text: bLines[y] })
      } else {
        x--
        edits.push({ type: 'remove', text: aLines[x] })
      }
    }
  }

  edits.reverse()
  result.push(...edits)
  return result
}

const LogIcon = ({ type }: { type: SenseiLogEntry['type'] }) => {
  if (type === 'stage') return <CheckCircle2 size={12} className="text-accent-brand shrink-0" />
  if (type === 'verbose') return <Info size={12} className="text-text-secondary shrink-0" />
  return <Terminal size={12} className="text-text-secondary shrink-0" />
}

const DiffPane = ({ original, optimized, label }: {
  original: string
  optimized: string
  label: string
}) => {
  const diffLines = computeLineDiff(original, optimized)
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="bg-bg-secondary px-3 py-1.5 text-xs text-text-secondary border-b border-border font-mono">
        {label}
      </div>
      <div className="overflow-x-auto">
        <pre className="text-xs leading-relaxed font-mono">
          {diffLines.map((line, i) => (
            <div
              key={i}
              className={
                line.type === 'add'
                  ? 'bg-[rgba(52,211,153,0.1)] text-[#34d399]'
                  : line.type === 'remove'
                    ? 'bg-[rgba(248,113,113,0.1)] text-[#f87171]'
                    : 'text-text-secondary'
              }
            >
              <span className="inline-block w-5 text-right mr-2 text-text-secondary select-none">
                {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
              </span>
              {line.text}
            </div>
          ))}
        </pre>
      </div>
    </div>
  )
}

const ContentPane = ({ content, label }: { content: string; label: string }) => (
  <div className="rounded-md border border-border overflow-hidden">
    <div className="bg-bg-secondary px-3 py-1.5 text-xs text-text-secondary border-b border-border font-mono">
      {label}
    </div>
    <div className="overflow-x-auto">
      <pre className="text-xs leading-relaxed font-mono px-4 py-3 text-text-primary whitespace-pre-wrap">
        {content}
      </pre>
    </div>
  </div>
)

const FULL_SEGMENTS: { key: FullSuiteSegment; label: string; file: string }[] = [
  { key: 'identity', label: 'IDENTITY', file: 'IDENTITY.md' },
  { key: 'agents',   label: 'AGENTS',   file: 'AGENTS.md' },
  { key: 'soul',     label: 'SOUL',     file: 'SOUL.md' },
]

const SenseiDiffDialog = (props: SenseiDiffDialogProps) => {
  const { t } = useTranslation('agents')
  const { status, logs, error, onCancel, onDismiss, agentName } = props
  const isOpen = status !== 'idle'
  const isAnalyzing = status === 'analyzing'
  const isComplete = status === 'complete'
  const isError = status === 'error'

  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (isAnalyzing && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs, isAnalyzing])

  const baseTime = logs.length > 0 ? logs[0].time : 0
  const fullSuite = isFullSuite(props)

  const [activeSeg, setActiveSeg] = useState<FullSuiteSegment>('identity')

  const fullReady = fullSuite && isComplete && (
    !!props.optimized.identity || !!props.optimized.agents || !!props.optimized.soul
  )

  const singleHasChanges = !fullSuite && isComplete
    ? computeLineDiff(props.original, props.optimized).some((l) => l.type !== 'same')
    : false

  const titleText = fullSuite
    ? t('sensei.titleFullSuite')
    : t('sensei.titleUpgrade')

  const descText = (() => {
    if (isAnalyzing) {
      if (fullSuite) return t('sensei.analyzingFull')
      return t('sensei.analyzingSingle', { name: agentName })
    }
    if (isComplete) {
      if (fullSuite) {
        const partial = props.partialError ?? []
        if (partial.length === 0) {
          return props.isNew ? t('sensei.completeNewCheck') : t('sensei.completeCheck')
        }
        return t('sensei.completePartialError', { segments: partial.map((s) => s.toUpperCase()).join(' / ') })
      }
      return singleHasChanges ? t('sensei.completeSuggestions') : t('sensei.completeNoChanges')
    }
    if (isError) return fullSuite ? t('sensei.errorFull') : t('sensei.errorSingle')
    return ''
  })()

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onDismiss() }}>
      <DialogContent className="max-w-3xl h-[80vh] p-0 flex flex-col">
        <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Sparkles size={14} className="text-accent-brand" />
            {titleText}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {descText}
          </DialogDescription>
        </DialogHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
          {isAnalyzing && (
            <div className="space-y-0.5">
              {logs.length === 0 && (
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <Loader2 size={14} className="animate-spin" />
                  {t('sensei.initializing')}
                </div>
              )}
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={
                    log.type === 'content'
                      ? 'pl-6'
                      : 'flex items-start gap-2 py-1'
                  }
                >
                  {log.type === 'content' ? (
                    <pre className="text-xs text-text-secondary whitespace-pre-wrap font-mono leading-relaxed">
                      {log.text}
                    </pre>
                  ) : (
                    <>
                      <LogIcon type={log.type} />
                      <span className="text-xs text-text-secondary font-mono tabular-nums shrink-0 w-8">
                        {formatElapsed(log.time, baseTime)}
                      </span>
                      <span className={
                        log.type === 'stage'
                          ? 'text-xs text-text-primary'
                          : 'text-xs text-text-secondary font-mono'
                      }>
                        {log.text}
                      </span>
                    </>
                  )}
                </div>
              ))}
              {logs.length > 0 && (
                <div className="flex items-center gap-2 py-1 pl-0.5">
                  <Loader2 size={12} className="animate-spin text-accent-brand" />
                </div>
              )}
            </div>
          )}

          {isComplete && fullSuite && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-1 border-b border-border-subtle">
                {FULL_SEGMENTS.map((seg) => {
                  const failed = (props.partialError ?? []).includes(seg.key)
                  const empty = !props.optimized[seg.key]
                  return (
                    <button
                      key={seg.key}
                      onClick={() => setActiveSeg(seg.key)}
                      className={`relative flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors border-b-2 ${
                        activeSeg === seg.key
                          ? 'border-accent-brand text-text-primary'
                          : 'border-transparent text-text-secondary hover:text-text-primary'
                      }`}
                      tabIndex={0}
                    >
                      <span className="font-mono">{seg.file}</span>
                      {failed && <AlertTriangle size={10} className="text-amber-400" />}
                      {!failed && empty && (
                        <span className="text-[10px] text-text-secondary">{t('sensei.empty')}</span>
                      )}
                    </button>
                  )
                })}
                <span className="flex-1" />
                {(() => {
                  const failed = (props.partialError ?? []).includes(activeSeg)
                  if (!failed || !props.onRetrySegment) return null
                  return (
                    <button
                      onClick={() => props.onRetrySegment?.(activeSeg)}
                      className="text-[11px] text-accent-brand hover:underline px-2 py-1"
                      tabIndex={0}
                    >
                      {t('sensei.retrySegment')}
                    </button>
                  )
                })()}
              </div>
              {props.isNew ? (
                <ContentPane
                  key={activeSeg}
                  label={FULL_SEGMENTS.find((s) => s.key === activeSeg)?.file ?? ''}
                  content={props.optimized[activeSeg] ?? ''}
                />
              ) : (
                <DiffPane
                  key={activeSeg}
                  label={t('sensei.diffLabel', { file: FULL_SEGMENTS.find((s) => s.key === activeSeg)?.file ?? '' })}
                  original={props.current[activeSeg] ?? ''}
                  optimized={props.optimized[activeSeg] ?? ''}
                />
              )}
            </div>
          )}

          {isComplete && !fullSuite && (
            <DiffPane
              label={props.mode === 'generate' ? t('sensei.generateLabel') : t('sensei.diffOriginalOptimized')}
              original={props.original}
              optimized={props.optimized}
            />
          )}

          {isError && (
            <div className="rounded-md border border-red-500/20 bg-red-500/5 p-4">
              <div className="text-xs text-red-400">{error}</div>
            </div>
          )}
        </div>

        <DialogFooter className="px-4 py-3 border-t border-border shrink-0">
          {isAnalyzing && (
            <button
              onClick={onCancel}
              className="rounded px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
              aria-label={t('sensei.cancelAnalysis')}
              tabIndex={0}
            >
              {t('sensei.cancel')}
            </button>
          )}
          {isComplete && (
            <>
              <button
                onClick={onDismiss}
                className="rounded px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
                aria-label={t('sensei.close')}
                tabIndex={0}
              >
                {t('sensei.cancel')}
              </button>
              {fullSuite ? (
                <button
                  onClick={props.onApply}
                  disabled={!fullReady}
                  className="rounded bg-accent-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label={t('sensei.applyAllLabel')}
                  tabIndex={0}
                >
                  {t('sensei.applyAll')}
                </button>
              ) : singleHasChanges ? (
                <button
                  onClick={props.onApply}
                  className="rounded bg-accent-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity"
                  aria-label={t('sensei.apply')}
                  tabIndex={0}
                >
                  {t('sensei.apply')}
                </button>
              ) : null}
            </>
          )}
          {isError && (
            <button
              onClick={onDismiss}
              className="rounded px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
              aria-label={t('sensei.close')}
              tabIndex={0}
            >
              {t('sensei.close')}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default SenseiDiffDialog

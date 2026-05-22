/**
 * TerminalSkeleton —
 *
 *  CSS  +
 *  prompt
 */

const TerminalSkeleton = () => (
  <div className="h-full w-full flex flex-col gap-2.5 px-4 pt-3" style={{ background: '#141414' }}>
    <div className="h-3 w-20 rounded-sm animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
    <div
      className="h-3 w-44 rounded-sm animate-pulse"
      style={{ background: 'rgba(255,255,255,0.06)', animationDelay: '150ms' }}
    />
    <div
      className="h-3 w-32 rounded-sm animate-pulse"
      style={{ background: 'rgba(255,255,255,0.06)', animationDelay: '300ms' }}
    />
  </div>
)

export default TerminalSkeleton

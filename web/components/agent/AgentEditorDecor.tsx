/** Agent  AgentEditorPage  */

export const FileIcon = ({ filename, active }: { filename: string; active: boolean }) => {
  const color = active ? '#60a5fa' : '#6b7280'
  if (filename.endsWith('.md')) {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <rect x="1" y="0.5" width="10" height="11" rx="1.5" stroke={color} strokeWidth="1" />
        <path d="M3 4h6M3 6h6M3 8h4" stroke={color} strokeWidth="0.8" strokeLinecap="round" />
      </svg>
    )
  }
  return null
}

export const MetricCard = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-border bg-bg-primary p-2 text-center">
    <div className="text-sm font-semibold text-text-emphasis">{value}</div>
    <div className="text-xs text-text-secondary">{label}</div>
  </div>
)

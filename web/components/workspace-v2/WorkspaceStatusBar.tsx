const WorkspaceStatusBar = () => (
  <div className="h-7 border-t border-border-subtle flex items-center px-3 gap-3 font-mono text-[10px] text-text-muted bg-bg-tertiary flex-shrink-0">
    {/* Running */}
    <span className="inline-flex items-center gap-1">
      <span className="w-[5px] h-[5px] rounded-full bg-accent-brand animate-pulse" />
      <span className="text-accent-brand-light">2 running</span>
    </span>

    {/* Waiting */}
    <span className="inline-flex items-center gap-1">
      <span className="w-[5px] h-[5px] rounded-full bg-accent-yellow" />
      <span className="text-accent-yellow">1 waiting</span>
    </span>

    {/* Error */}
    <span className="inline-flex items-center gap-1">
      <span className="w-[5px] h-[5px] rounded-full bg-accent-red" />
      <span className="text-accent-red">1 error</span>
    </span>

    <Divider />
    <span>feat/settings-redesign</span>

    <span className="flex-1" />

    <span>14/21 tools</span>
    <Divider />
    <span>42.1K tokens</span>
    <Divider />
    <span className="text-text-primary">$0.42</span>
    <Divider />
    <span className="text-accent-purple">12m 34s</span>
  </div>
)

const Divider = () => <span className="w-px h-3 bg-border" />

export default WorkspaceStatusBar

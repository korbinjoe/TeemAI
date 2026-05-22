import { useWorkspace, type IdeTab } from '../../contexts/WorkspaceContext'
import { Terminal, ChevronDown, Globe } from './icons'
import { cn } from '../../lib/utils'

const IDE_TABS: IdeTab[] = ['Files', 'Changes', 'War Room', 'Browser']

const IDEPanel = () => {
  const { activeIdeTab, setIdeTab, terminalOpen, toggleTerminal } = useWorkspace()

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Tab bar */}
      <div className="h-8 border-b border-border-subtle flex items-center px-2 gap-px flex-shrink-0 bg-bg-secondary">
        {IDE_TABS.map((tab) => (
          <button
            key={tab}
            className={cn(
              'flex items-center gap-[5px] px-2.5 py-1 rounded-[5px] text-[11px] cursor-pointer transition-colors',
              activeIdeTab === tab
                ? 'bg-accent-brand/[0.08] text-accent-brand-light font-medium'
                : 'text-text-secondary hover:bg-bg-hover',
            )}
            onClick={() => setIdeTab(tab)}
          >
            {tab}
            {tab === 'Changes' && (
              <span className="text-[9px] px-[5px] py-px rounded-[3px] bg-accent-green/[0.12] text-accent-green font-semibold">
                5
              </span>
            )}
          </button>
        ))}
        <span className="flex-1" />
        <span className="font-mono text-[9px] text-text-muted">openteam-web</span>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        <TabContent tab={activeIdeTab} />
      </div>

      {/* Terminal */}
      <div
        className="border-t border-border-subtle flex flex-col flex-shrink-0 transition-[height] duration-200 overflow-hidden"
        style={{ height: terminalOpen ? 120 : 26 }}
      >
        <div
          className="h-[26px] flex items-center px-2 gap-1.5 bg-bg-secondary cursor-pointer flex-shrink-0"
          onClick={toggleTerminal}
        >
          <Terminal size={11} className="text-text-secondary" />
          <span className="text-[10px] font-medium text-text-secondary">Terminal</span>
          <span className="font-mono text-[9px] text-text-muted">zsh</span>
          <span className="flex-1" />
          <ChevronDown
            size={10}
            className={cn('text-text-muted transition-transform duration-200', !terminalOpen && 'rotate-180')}
          />
        </div>
        {terminalOpen && (
          <div className="flex-1 px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-text-secondary overflow-hidden bg-bg-primary">
            <div><span className="text-accent-green">❯</span> <span className="text-text-primary">git status</span></div>
            <div className="text-text-muted">On branch feat/settings-redesign</div>
            <div className="text-accent-red">  modified: web/pages/SettingsPage.tsx</div>
            <div className="text-accent-green">  new file: web/components/settings/SettingsTabs.tsx</div>
            <div><span className="text-accent-green">❯</span> <span className="inline-block w-1.5 h-3 bg-text-primary animate-pulse" /></div>
          </div>
        )}
      </div>
    </div>
  )
}

const TabContent = ({ tab }: { tab: IdeTab }) => {
  if (tab === 'Files') return <FilesContent />
  if (tab === 'Changes') return <ChangesContent />
  if (tab === 'War Room') return <WarRoomContent />
  return <BrowserContent />
}

const FilesContent = () => (
  <div className="p-3 font-mono text-[11px] leading-[2] text-text-secondary">
    <div className="text-[11px] text-text-muted mb-2 font-sans font-medium uppercase tracking-wide">Workspace Files</div>
    <div>📁 web/</div>
    <div className="pl-4">📁 components/</div>
    <div className="pl-8">📁 settings/</div>
    <div className="pl-12 text-accent-green">📄 SettingsTabs.tsx <span className="text-text-muted">new</span></div>
    <div className="pl-12 text-accent-green">📄 AgentSettingsTab.tsx <span className="text-text-muted">new</span></div>
    <div className="pl-4">📁 pages/</div>
    <div className="pl-8 text-accent-yellow">📄 SettingsPage.tsx <span className="text-text-muted">modified</span></div>
    <div>📁 server/</div>
    <div className="pl-4 text-accent-yellow">📄 index.ts <span className="text-text-muted">modified</span></div>
  </div>
)

const ChangesContent = () => (
  <div className="flex flex-col h-full">
    <div className="px-3 py-2 flex items-center gap-1.5 border-b border-border">
      <span className="text-[11px] font-semibold text-text-primary">Unstaged Changes</span>
      <span className="font-mono text-[10px] px-1.5 py-px rounded-[3px] bg-accent-green/10 text-accent-green">5 files</span>
      <span className="flex-1" />
      <button className="text-[10px] px-2 py-[3px] rounded border border-border bg-transparent text-text-secondary cursor-pointer">Stage All</button>
      <button className="text-[10px] px-2 py-[3px] rounded border border-accent-brand/30 bg-accent-brand/[0.08] text-accent-brand-light cursor-pointer">Commit</button>
    </div>
    <div className="flex-1 overflow-y-auto px-2 py-1 font-mono text-[11px]">
      <FileRow status="A" path="web/pages/SettingsPage.tsx" stat="+84 -156" active />
      <FileRow status="A" path="web/components/settings/SettingsTabs.tsx" stat="new" />
      <FileRow status="A" path="web/components/settings/AgentSettingsTab.tsx" stat="new" />
      <FileRow status="M" path="web/App.tsx" stat="+12 -2" />
      <FileRow status="M" path="server/index.ts" stat="+8 -0" />
    </div>
  </div>
)

const FileRow = ({ status, path, stat, active }: { status: string; path: string; stat: string; active?: boolean }) => (
  <div className={cn(
    'flex items-center gap-2 px-2 py-[5px] rounded-[5px] mb-0.5 cursor-pointer',
    active ? 'bg-accent-brand/[0.06]' : 'hover:bg-bg-hover',
  )}>
    <span className={cn('w-3 font-semibold', status === 'A' ? 'text-accent-green' : 'text-accent-yellow')}>{status}</span>
    <span className="flex-1 truncate text-text-secondary">{path}</span>
    <span className={cn('text-[9px]', status === 'A' ? 'text-accent-green' : 'text-accent-yellow')}>{stat}</span>
  </div>
)

const WarRoomContent = () => (
  <div className="p-3 space-y-2">
    <WarRoomCard type="DECISION" color="accent-brand" content="Use tabbed layout instead of accordion for settings" by="Designer" ago="2m" />
    <WarRoomCard type="OPEN QUESTION" color="accent-yellow" content="JWT or session-based auth?" by="Fullstack" ago="4m" />
    <WarRoomCard type="CONSTRAINT" color="accent-red" content="Docker daemon.json requires root access" by="Shield" ago="12m" />
  </div>
)

const WarRoomCard = ({ type, color, content, by, ago }: { type: string; color: string; content: string; by: string; ago: string }) => (
  <div className={cn('p-2.5 rounded-md border', color === 'accent-red' ? 'border-accent-red/[0.15]' : 'border-border')}>
    <div className={cn('text-[10px] font-semibold mb-1', `text-${color}`)}>{type}</div>
    <div className="text-[11px] text-text-primary">{content}</div>
    <div className="text-[10px] text-text-muted mt-1">by {by} · {ago} ago</div>
  </div>
)

const BrowserContent = () => (
  <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-muted py-12">
    <Globe size={32} />
    <div className="text-xs">No preview running</div>
    <div className="text-[11px] text-text-muted">Start dev server to see live preview</div>
    <button className="mt-2 px-4 py-1.5 rounded-md border border-accent-brand/30 bg-accent-brand/[0.08] text-accent-brand-light text-[11px] cursor-pointer">
      Start Dev Server
    </button>
  </div>
)

export default IDEPanel

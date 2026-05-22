import { Clock, Users, Folder, Star, Calendar, Moon, Bell, Settings } from './icons'

const SidebarFooter = () => (
  <div className="px-2 py-1.5 border-t border-border-subtle flex items-center gap-px">
    <IconBtn title="History"><Clock size={14} /></IconBtn>
    <IconBtn title="Agents"><Users size={14} /></IconBtn>
    <IconBtn title="Workspaces"><Folder size={14} /></IconBtn>
    <IconBtn title="Skills"><Star size={14} /></IconBtn>
    <IconBtn title="Cron Jobs"><Calendar size={14} /></IconBtn>
    <div className="w-px h-3.5 bg-border mx-[3px]" />
    <IconBtn title="Theme"><Moon size={14} /></IconBtn>
    <IconBtn title="Notifications" badge>
      <Bell size={14} />
    </IconBtn>
    <IconBtn title="Settings"><Settings size={14} /></IconBtn>
  </div>
)

const IconBtn = ({ children, title, badge }: { children: React.ReactNode; title: string; badge?: boolean }) => (
  <button
    className="w-7 h-7 rounded-md flex items-center justify-center cursor-pointer text-text-muted hover:bg-bg-hover hover:text-text-secondary transition-colors relative"
    title={title}
  >
    {children}
    {badge && (
      <span className="absolute top-[3px] right-[3px] w-1.5 h-1.5 rounded-full bg-accent-red border-[1.5px] border-bg-secondary" />
    )}
  </button>
)

export default SidebarFooter

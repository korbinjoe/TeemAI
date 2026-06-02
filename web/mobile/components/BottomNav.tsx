import { Rocket, PlusCircle } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

const tabs = [
  { path: '/mobile', label: 'Missions', icon: Rocket },
  { path: '/mobile/dispatch', label: 'New', icon: PlusCircle },
] as const

const BottomNav = () => {
  const location = useLocation()
  const navigate = useNavigate()

  const isActive = (path: string) => {
    if (path === '/mobile') return location.pathname === '/mobile'
    return location.pathname.startsWith(path)
  }

  return (
    <nav className="flex border-t border-border-subtle bg-bg-secondary shrink-0">
      {tabs.map(({ path, label, icon: Icon }) => (
        <button
          key={path}
          onClick={() => navigate(path)}
          className={cn(
            'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors',
            isActive(path) ? 'text-accent-brand-light' : 'text-text-muted',
          )}
        >
          <Icon size={22} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}

export default BottomNav

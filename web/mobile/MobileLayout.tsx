import { Outlet, useLocation } from 'react-router-dom'
import { useMobileAuth } from './hooks/useMobileAuth'
import ConnectionStatus from './components/ConnectionStatus'
import BottomNav from './components/BottomNav'

const TITLES: Record<string, string> = {
  '/mobile': 'Missions',
  '/mobile/dispatch': 'New Mission',
}

const MobileLayout = () => {
  const { isAuthenticated } = useMobileAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-bg-primary px-6 text-center">
        <div className="text-lg font-semibold text-text-primary">OpenTeam Mobile</div>
        <p className="text-sm text-text-secondary">
          Scan the QR code from your desktop OpenTeam settings to connect.
        </p>
      </div>
    )
  }

  const isDetail = location.pathname.startsWith('/mobile/mission/')
  const title = TITLES[location.pathname]

  return (
    <div className="flex h-dvh flex-col bg-bg-primary">
      {!isDetail && title && (
        <div className="flex items-center justify-between px-5 pt-2 pb-1 shrink-0">
          <span className="text-[28px] font-bold tracking-tight">{title}</span>
          <ConnectionStatus />
        </div>
      )}
      {isDetail && <ConnectionStatus inline={false} />}
      <div className="flex-1 min-h-0 flex flex-col">
        <Outlet />
      </div>
      {!isDetail && <BottomNav />}
    </div>
  )
}

export default MobileLayout

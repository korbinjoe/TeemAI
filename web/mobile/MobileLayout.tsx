import { Outlet } from 'react-router-dom'
import { useMobileAuth } from './hooks/useMobileAuth'
import ConnectionStatus from './components/ConnectionStatus'
import BottomNav from './components/BottomNav'

const MobileLayout = () => {
  const { isAuthenticated } = useMobileAuth()

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

  return (
    <div className="flex h-dvh flex-col bg-bg-primary">
      <ConnectionStatus />
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  )
}

export default MobileLayout

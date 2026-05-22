import { Outlet } from 'react-router-dom'
import AppSidebar from '../components/nav/AppSidebar'
import { useEnvCheck } from '../hooks/useEnvCheck'
import { GlobalCreateWorkspaceModal } from '../components/workspace/GlobalCreateWorkspaceModal'

const MainLayout = () => {
  useEnvCheck()

  return (
    <>
      <div className="flex h-screen bg-bg-primary overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-bg-primary">
          <Outlet />
        </div>
      </div>
      <GlobalCreateWorkspaceModal />
    </>
  )
}

export default MainLayout

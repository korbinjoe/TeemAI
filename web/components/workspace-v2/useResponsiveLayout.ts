import { useEffect } from 'react'
import { useWorkspace } from '../../contexts/WorkspaceContext'

const BREAKPOINT_SM = 768
const BREAKPOINT_MD = 1024

const useResponsiveLayout = () => {
  const { layoutMode, panelCollapsed, setLayoutMode, togglePanel } = useWorkspace()

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth

      if (w < BREAKPOINT_SM && layoutMode !== 'single') {
        setLayoutMode('single')
      } else if (w < BREAKPOINT_MD && layoutMode === 'quad') {
        setLayoutMode('split')
      }

      if (w < BREAKPOINT_MD && !panelCollapsed) {
        togglePanel()
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [layoutMode, panelCollapsed, setLayoutMode, togglePanel])
}

export default useResponsiveLayout

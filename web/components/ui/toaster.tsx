import { Toaster as Sonner } from 'sonner'
import { useTheme } from '../../contexts/ThemeContext'

/**
 * Sonner `offset` / `mobileOffset`
 */
const Toaster = () => {
  const { theme } = useTheme()
  return (
    <Sonner
      theme={theme}
      position="top-right"
      offset={{ top: '2.75rem', right: '0.75rem' }}
      mobileOffset={{ top: '2.75rem', right: '0.5rem' }}
      toastOptions={{
        style: {
          background: 'rgb(var(--bg-elevated))',
          border: '1px solid rgb(var(--border-color))',
          color: 'rgb(var(--text-primary))',
          fontSize: '12px',
        },
      }}
    />
  )
}

export { Toaster }

import { Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { isElectron, ELECTRON_TITLEBAR_PADDING } from '../utils/env'
import GeneralSettings from '@/components/settings/GeneralSettings'

const SettingsPage = () => {
  const { t } = useTranslation('settings')
  return (
    <div className="flex h-full flex-col bg-bg-primary">
      <div
        className="h-9 border-b border-border-subtle flex items-center px-2.5 gap-1.5 shrink-0"
        style={{ paddingLeft: isElectron ? ELECTRON_TITLEBAR_PADDING : 10 }}
      >
        <Settings size={14} className="text-text-emphasis" />
        <span className="text-xs font-semibold text-text-emphasis">{t('settings:title')}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <GeneralSettings />
      </div>
    </div>
  )
}

export default SettingsPage

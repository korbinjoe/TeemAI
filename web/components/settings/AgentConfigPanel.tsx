/**
 * AgentConfigPanel -
 * ACP agent-config API Phase 2  Agent Editor
 */

import { useTranslation } from 'react-i18next'

const AgentConfigPanel = () => {
  const { t } = useTranslation(['settings'])

  return (
    <div className="h-full flex flex-col items-center justify-center text-text-secondary gap-2">
      <div className="text-[32px] opacity-30">🤖</div>
      <div className="text-[13px]">{t('settings:agentConfig.comingSoon')}</div>
      <div className="text-xs opacity-60">{t('settings:agentConfig.currentManaged')}</div>
    </div>
  )
}

export default AgentConfigPanel

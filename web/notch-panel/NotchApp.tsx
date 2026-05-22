import { useNotchState } from './hooks/useNotchState'
import { useAgentStatus } from './hooks/useAgentStatus'
import { NotchAnimation } from './components/NotchAnimation'
import { NotchCompact } from './components/NotchCompact'
import { NotchExpanded } from './components/NotchExpanded'

export const NotchApp = () => {
  const { state, expand, compact } = useNotchState()
  const { chatActivity, agents, notifications } = useAgentStatus()

  if (state === 'hidden') return null

  return (
    <NotchAnimation state={state}>
      {state === 'compact' ? (
        <NotchCompact
          agents={agents}
          onExpand={expand}
        />
      ) : (
        <NotchExpanded
          chatActivity={chatActivity}
          agents={agents}
          notifications={notifications}
          onCompact={compact}
        />
      )}
    </NotchAnimation>
  )
}

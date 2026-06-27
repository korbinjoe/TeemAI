import { describe, expect, it } from 'vitest'
import { selectScenariosForChangedFiles } from '../../scripts/render-perf/scenarios'

describe('render perf changed-file scenario selection', () => {
  it('runs terminal loop scenarios for terminal changes', () => {
    const selected = selectScenariosForChangedFiles(['web/components/terminal/TerminalPanel.tsx'])
    expect(selected).toContain('terminal.open')
    expect(selected).toContain('mission.mode-toggle.loop')
    expect(selected).toContain('mission.switch-with-terminal-active')
    expect(selected).toContain('mission.initial')
  })

  it('runs multi-mission loops for chat render changes', () => {
    const selected = selectScenariosForChangedFiles(['web/components/chat/ChatInstance.tsx'])
    expect(selected).toContain('mission.multi-active.switch-loop')
    expect(selected).toContain('mission.mode-toggle.loop')
  })

  it('falls back to core smoke for backend-only changes', () => {
    const selected = selectScenariosForChangedFiles(['server/routes/system/logRoutes.ts'])
    expect(selected).toEqual([
      'home.initial',
      'workspace.initial',
      'mission.initial',
      'mission.switch.warm',
    ])
  })
})

/**
 * Debug:  startServer()  await
 *  import  .load()
 */
console.log('[D] Import start')

import('../server/index.ts').then(async (mod) => {
  console.log('[D] Module loaded, calling startServer with debug...')

  const { SkillManager } = await import('../server/config/SkillManager.ts')
  const { join } = await import('path')
  const sm = new SkillManager(join(process.cwd(), 'ai-assets', 'skills'))
  console.log('[D] Testing skillManager.loadBuiltinSkills...')
  await sm.loadBuiltinSkills()
  console.log('[D] ✅ skillManager OK')

  const { AgentRegistry } = await import('../server/config/AgentRegistry.ts')
  const ar = new AgentRegistry(join(process.cwd(), 'ai-assets', 'agents'))
  console.log('[D] Testing agentRegistry.load...')
  await ar.load()
  console.log('[D] ✅ agentRegistry OK')

  const { AgentStore, ChatStore, WorkspaceStore, ExecutionLogStore, CronJobStore, NotificationStore } = await import('../server/stores/index.ts')

  console.log('[D] Testing agentStore.load...')
  const as2 = new AgentStore()
  await as2.load()
  console.log('[D] ✅ agentStore OK')

  console.log('[D] Testing workspaceStore.load...')
  const ws2 = new WorkspaceStore()
  await ws2.load()
  console.log('[D] ✅ workspaceStore OK')

  console.log('[D] Testing chatStore.load...')
  const cs = new ChatStore()
  await cs.load()
  console.log('[D] ✅ chatStore OK')

  console.log('[D] Testing executionLogStore.load...')
  const els = new ExecutionLogStore()
  await els.load()
  console.log('[D] ✅ executionLogStore OK')

  console.log('[D] Testing cronJobStore.load...')
  const cjs = new CronJobStore()
  await cjs.load()
  console.log('[D] ✅ cronJobStore OK')

  console.log('[D] Testing notificationStore.load...')
  const ns = new NotificationStore()
  await ns.load()
  console.log('[D] ✅ notificationStore OK')

  const { SuperTokenManager } = await import('../server/services/SuperTokenManager.ts')
  console.log('[D] Testing superTokenManager.load...')
  const stm = new SuperTokenManager()
  await stm.load()
  console.log('[D] ✅ superTokenManager OK')

  console.log('[D] All loads passed!')
}).catch(e => {
  console.error('[D] Error:', e)
})

setTimeout(() => {
  console.log('[D] 30s timeout')
  process.exit(1)
}, 30000)

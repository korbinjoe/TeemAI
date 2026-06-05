# Implementation Tasks

- [ ] 1. Add `parseBaseAgentId`, `countRunningByBaseAgent`, `findAllRunningByBaseAgent` to ExpertSessionStore
- [ ] 2. Add `forceNewInstance` to handleStart payload type and implement instance spawning branch in ExpertLifecycle
- [ ] 3. Add `updateTaskAgent` method to WorkflowEngine
- [ ] 4. Update handoff endpoint in expertRoutes.ts to pass `forceNewInstance: true`
- [ ] 5. Update WorkflowScheduler.startTask to pass `forceNewInstance: true` and sync instanceId back to engine
- [ ] 6. Add `instanceId` to handleStart return type
- [ ] 7. Write tests for parallel instance spawning

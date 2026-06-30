import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const root = mkdtempSync(join(tmpdir(), 'teemai-self-evolution-manual-'))
process.env.TEEMAI_HOME = join(root, 'home')
mkdirSync(process.env.TEEMAI_HOME, { recursive: true })

const [
  { checkAndRun },
  { EvolutionReviewService },
  { EvolutionReviewContextBuilder },
  { SenseiReviewRunner },
  { EvolutionApplyService },
  { AgentEvolutionService },
  { SkillEvolutionService },
  { EvolutionOptimizationLab },
  stores,
] = await Promise.all([
  import('../server/services/agent-evolution/EvolutionTrigger.ts'),
  import('../server/services/agent-evolution/EvolutionReviewService.ts'),
  import('../server/services/agent-evolution/EvolutionReviewContextBuilder.ts'),
  import('../server/services/agent-evolution/SenseiReviewRunner.ts'),
  import('../server/services/agent-evolution/EvolutionApplyService.ts'),
  import('../server/services/agent-evolution/AgentEvolutionService.ts'),
  import('../server/services/agent-evolution/SkillEvolutionService.ts'),
  import('../server/services/agent-evolution/EvolutionOptimizationLab.ts'),
  import('../server/stores/index.ts'),
])

const {
  EvolutionReviewJobStore,
  EvolutionEventStore,
  SkillEvolutionStore,
  MemoryStore,
  closeDatabase,
} = stores

const agentsDir = join(process.env.TEEMAI_HOME, 'agents')
const skillsDir = join(process.env.TEEMAI_HOME, 'skills')
const leadDir = join(agentsDir, 'lead')
mkdirSync(join(leadDir, 'memory'), { recursive: true })
mkdirSync(skillsDir, { recursive: true })

writeFileSync(join(leadDir, 'IDENTITY.md'), 'name: Lead\nnickname: Lead\n', 'utf-8')
writeFileSync(join(leadDir, 'AGENTS.md'), 'Lead agent notes.\n', 'utf-8')
writeFileSync(join(leadDir, 'SOUL.md'), 'Original safe instruction.\n', 'utf-8')

const recentDate = (daysAgo: number): string => {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

writeFileSync(
  join(leadDir, 'memory', 'satisfaction.md'),
  [
    '# Satisfaction Scores',
    '',
    ...Array.from({ length: 5 }, (_, index) => [
      `## low-${index + 1} \u2014 ${recentDate(index + 1)}`,
      'MSS: -12 | Turns: 8 | Corrections: 0 | Escalations: 1 | Iterations: 2 | Acceptances: 0 | Commits: 0 | Rating: LOW',
      '',
    ].join('\n')),
  ].join('\n'),
  'utf-8',
)

const registry = {
  get: (id: string) => id === 'lead'
    ? {
      id: 'lead',
      name: 'Lead',
      description: 'Manual verification lead agent',
      icon: '',
      systemPrompt: { mode: 'append', content: '' },
      skills: [],
      mcpServers: {},
      workspaceDir: leadDir,
    }
    : undefined,
  list: () => [{ id: 'lead' }],
}

const snapshotPromptFiles = () => ({
  identity: readFileSync(join(leadDir, 'IDENTITY.md'), 'utf-8'),
  agents: readFileSync(join(leadDir, 'AGENTS.md'), 'utf-8'),
  soul: readFileSync(join(leadDir, 'SOUL.md'), 'utf-8'),
})

const reviewJobStore = new EvolutionReviewJobStore()
const evolutionEventStore = new EvolutionEventStore()
const skillEvolutionStore = new SkillEvolutionStore()
const memoryStore = new MemoryStore()
const contextBuilder = new EvolutionReviewContextBuilder({
  agentRegistry: registry,
  memoryStore,
})
const reviewService = new EvolutionReviewService(
  reviewJobStore,
  new SenseiReviewRunner(contextBuilder),
)

const beforeTriggeredReview = snapshotPromptFiles()
checkAndRun(registry, agentsDir, reviewService)
const queuedTriggerJob = reviewJobStore.nextQueued()
assert.equal(queuedTriggerJob?.triggerType, 'low_satisfaction')
const proposalJob = await reviewService.runNext()
assert.equal(proposalJob?.status, 'proposal_ready')
assert.ok((proposalJob?.proposal?.actions.length ?? 0) > 0)
assert.deepEqual(snapshotPromptFiles(), beforeTriggeredReview)

const skillEvolutionService = new SkillEvolutionService({
  skillsDir,
  store: skillEvolutionStore,
  evolutionEventStore,
})
const agentEvolutionService = new AgentEvolutionService({
  agentRegistry: registry,
  evolutionEventStore,
})
const applyService = new EvolutionApplyService({
  reviewJobStore,
  skillEvolutionService,
  agentEvolutionService,
  memoryStore,
})
const applyReviewService = new EvolutionReviewService(reviewJobStore, undefined, applyService)
const applyJob = reviewJobStore.create({
  targetType: 'agent',
  targetId: 'lead',
  triggerType: 'manual_verification',
  evidence: { task: '8.4' },
})
reviewJobStore.setProposal(applyJob.id, {
  evidence: applyJob.evidence,
  rootCause: 'Manual verification patch for a low-risk prompt note.',
  diff: '```diff\n+ Reviewed evolution note: ask for acceptance criteria before implementation.\n```',
  expectedImpact: 'Adds a reversible instruction to the lead prompt.',
  risk: 'Low: isolated temporary agent prompt.',
  validationPlan: 'Verify changed file, snapshot, event, and applied action metadata.',
  rollbackPath: 'Use rollback snapshot recorded on the applied action.',
  actions: [{
    type: 'agent_prompt_patch',
    agentId: 'lead',
    filePath: 'SOUL.md',
    find: 'Original safe instruction.',
    replace: 'Original safe instruction.\nReviewed evolution note: ask for acceptance criteria before implementation.',
  }],
})
applyReviewService.approve(applyJob.id)
const appliedJob = await applyReviewService.apply(applyJob.id)
const appliedAction = appliedJob.appliedActions?.[0]
assert.equal(appliedJob.status, 'applied')
assert.equal(appliedAction?.status, 'applied')
assert.ok(appliedAction?.changedFile?.endsWith('SOUL.md'))
assert.ok(appliedAction?.rollbackRef && existsSync(appliedAction.rollbackRef))
assert.match(readFileSync(join(leadDir, 'SOUL.md'), 'utf-8'), /Reviewed evolution note/)
assert.match(readFileSync(join(appliedAction.rollbackRef, 'SOUL.md'), 'utf-8'), /Original safe instruction\.\n$/)
const event = evolutionEventStore.listByAgent('lead').find((item) => item.sourceRef === `evolution-review:${applyJob.id}`)
assert.equal(event?.type, 'strategy_evolved')
assert.equal(event?.rollbackRef, appliedAction.rollbackRef)

const skillName = 'manual-verification-skill'
const skillDir = join(skillsDir, skillName)
mkdirSync(skillDir, { recursive: true })
const skillBefore = [
  '---',
  `name: ${skillName}`,
  'description: Non-critical manual verification skill.',
  '---',
  '',
  'review code callback validation',
  '',
].join('\n')
const skillPath = join(skillDir, 'SKILL.md')
writeFileSync(skillPath, skillBefore, 'utf-8')
const lab = new EvolutionOptimizationLab({ reviewJobStore, maxGrowthRatio: 2 })
const labJob = lab.run({
  target: {
    type: 'skill',
    skillName,
    filePath: 'SKILL.md',
    baselineText: skillBefore,
    candidateText: skillBefore.replace(
      'review code callback validation',
      'review code callback validation security acceptance criteria',
    ),
  },
  dataset: [
    { split: 'train', taskInput: 'review code', expectedBehavior: 'callback validation' },
    { split: 'holdout', taskInput: 'review security code', expectedBehavior: 'security callback validation acceptance criteria' },
  ],
  datasetSource: 'manual-dry-run',
})
assert.equal(labJob?.status, 'proposal_ready')
assert.equal(labJob?.proposal?.actions[0]?.type, 'skill_patch')
assert.equal(labJob?.proposal?.metrics?.datasetSource, 'manual-dry-run')
assert.equal(readFileSync(skillPath, 'utf-8'), skillBefore)

const preserveTempRoot = process.env.KEEP_SELF_EVOLUTION_VERIFY_TEMP === '1'

console.log(JSON.stringify({
  status: 'passed',
  tempRoot: root,
  tempRootPreserved: preserveTempRoot,
  task83: {
    triggerJobId: proposalJob?.id,
    triggerType: proposalJob?.triggerType,
    actionCount: proposalJob?.proposal?.actions.length,
    promptFilesUnchanged: true,
  },
  task84: {
    applyJobId: appliedJob.id,
    changedFile: appliedAction?.changedFile,
    rollbackRef: appliedAction?.rollbackRef,
    eventType: event?.type,
  },
  task85: {
    labJobId: labJob?.id,
    actionType: labJob?.proposal?.actions[0]?.type,
    datasetSource: labJob?.proposal?.metrics?.datasetSource,
    skillFileUnchanged: true,
  },
}, null, 2))

closeDatabase()
if (!preserveTempRoot) {
  rmSync(root, { recursive: true, force: true })
}

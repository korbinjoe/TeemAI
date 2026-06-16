# Design: Hermes-Style Self-Evolution for TeemAI

## Architecture

新增机制分为六层：

```text
Signal Capture
  satisfaction / whiteboard / task outcome / user correction / skill use
        |
Canonicalization
  agentId normalization / source provenance / dedup
        |
Review Jobs
  background Sensei review with restricted tools
        |
Writes
  memory_evolve / skill_evolve / episode_index
        |
Governance
  approval / snapshots / pin / archive / restore / audit log
        |
Runtime Injection
  Cross-Session Memory / Prior Similar Episodes / skill body or slash availability
```

## Decision 1: Fix Canonical Agent Identity Before Adding More Signals

### Problem

TeemAI currently mixes:

- `agent.id`: `fullstack-engineer`
- `agent.name`: `Fullstack Engineer`
- `TEEMAI_INSTANCE_ID`: `fullstack-engineer`, `fullstack-engineer:2`, `fullstack-engineer:auto`
- filesystem dirs under `~/.teemai/agents`

### Decision

Introduce a shared helper:

```ts
canonicalAgentId(raw: string): string
```

Rules:

1. Strip `:auto`.
2. Strip trailing `:<number>`.
3. Preserve ids that are actually registered and contain colon only if registry says so.
4. Resolve only to ids present in `AgentRegistry` when running server-side.

Use this in:

- `MemoryGrowthCapture`
- `EvolutionTrigger`
- satisfaction hook output path
- Evolution routes
- prompt memory lookup

### Compatibility

During migration, `ConfigCompiler` reads memory by:

1. `agent.id`
2. legacy `agent.name`

and dedupes by memory id/source.

## Decision 2: Background Review Jobs Are Proposal-Only by Default

### Problem

Sensei currently contains a strong Active Evolution Protocol in prompt text, but no runtime loop invokes it with evidence.

### Decision

Add `EvolutionReviewService`:

```ts
interface EvolutionReviewJob {
  id: string
  targetType: 'agent' | 'skill' | 'team'
  targetId: string
  triggerType: string
  evidence: unknown
  status: 'queued' | 'running' | 'proposal_ready' | 'approved' | 'rejected' | 'applied' | 'failed'
  proposal?: EvolutionProposal
}
```

Review jobs run in an isolated agent session:

- target agent context is included as readonly evidence;
- allowed write tools are only proposal-writing tools;
- actual mutation requires approval.

## Decision 3: Skill Evolution Needs a Store, Not Only Files

### Problem

Files alone cannot answer:

- Which skill was created by agent vs user?
- Which skill has not been used recently?
- Which skill is pinned?
- Which skill patch can be rolled back?
- Which bundled skill must not be modified?

### Decision

Add `SkillEvolutionStore` backed by SQLite:

```ts
interface SkillEvolutionRecord {
  skillName: string
  source: 'bundled' | 'user' | 'agent'
  path: string
  createdBy?: string
  createdAt: string
  lastUsedAt?: string
  lastViewedAt?: string
  lastPatchedAt?: string
  useCount: number
  viewCount: number
  patchCount: number
  pinned: boolean
  archivedAt?: string
  supersededBy?: string
}
```

The store is a sidecar to files. `SKILL.md` stays human-readable; operational telemetry stays out of skill content.

## Decision 4: `skill_evolve` Is a Narrow Server-Owned API

### Actions

- `create`
- `patch`
- `write_file`
- `remove_file`
- `archive`
- `restore`
- `pin`

### Constraints

- Must validate frontmatter for `SKILL.md`.
- Must reject path traversal and absolute paths.
- Must enforce file size limits.
- Must create rollback snapshot before mutation.
- Must reject direct mutation of `source='bundled'` unless a user approval explicitly unlocks it.
- Must record patch_count and provenance.

This mirrors Hermes `skill_manage` without importing its Python implementation.

## Decision 5: Runtime Asset Governance Uses a Manifest

### Problem

`WorkspaceSeeder` currently copies bundled assets into `~/.teemai`, but does not delete obsolete files and does not mark source. This preserves user data, but makes lifecycle ambiguous.

### Decision

Create `~/.teemai/skills/.teemai-manifest.json`:

```json
{
  "bundled": {
    "whiteboard": {
      "sourcePath": "ai-assets/skills/whiteboard",
      "hash": "sha256:...",
      "seededAt": "2026-06-16T00:00:00.000Z"
    }
  },
  "user": {},
  "agent": {}
}
```

Seeder behavior:

- update bundled files when source hash changes;
- do not delete unknown dirs;
- mark unknown dirs as `user` on first audit;
- never let curator archive bundled or user skills by default.

## Decision 6: Episodic Memory Is a Lightweight Index

### Data Sources

- JSONL sessions from registered missions;
- workflow task results;
- whiteboard entries with durable types;
- execution logs and token usage when available.

### Index

Use SQLite FTS5:

```ts
interface Episode {
  id: string
  agentId: string
  missionId: string
  title: string
  summary: string
  outcome: 'success' | 'failed' | 'blocked' | 'unknown'
  tags: string[]
  files: string[]
  startedAt: string
  completedAt?: string
}
```

### Injection

Before an agent starts a mission task:

```text
## Prior Similar Episodes

1. [success] Implemented OAuth callback validation
   Source: mission abc, 2026-06-10, files: server/routes/auth.ts
   Lesson: validate provider state before token exchange; add replay test.
```

Limits:

- max 3 episodes;
- max 1200 chars total;
- failed outcomes included only when their lesson is explicit;
- no injection when confidence is low.

## Decision 7: EvolutionLog Should Show Actions, Not Raw Memory Rows Only

Add producers:

- `memory_updated`: durable memory captured/applied
- `skill_acquired`: new agent-created skill
- `strategy_evolved`: approved SOUL.md / AGENTS.md patch
- `milestone`: aggregate metric crossing or curator report

Each entry includes `sourceRef` so the user can inspect evidence.

## Data Flow

### Triggered Review

```text
satisfaction.md / whiteboard / task outcome
        |
EvolutionTrigger.evaluate()
        |
EvolutionReviewService.enqueue()
        |
Sensei review session
        |
EvolutionProposalStore
        |
User approves
        |
Agent/Skill mutation + snapshot + EvolutionLog
```

### Skill Use Telemetry

```text
Agent config includes skill
        |
ConfigCompiler/SlashCommandResolver records use
        |
SkillEvolutionStore.bumpUse()
        |
Curator can later classify stale / overlapping skills
```

## Migration Plan

1. Add canonicalization helper and tests.
2. Fix memory prompt lookup.
3. Merge suffixed satisfaction dirs into canonical dirs.
4. Add manifest and classify existing runtime skills as bundled/user.
5. Add skill telemetry without mutation.
6. Add proposal-only review jobs.
7. Add approved writes and rollback.
8. Add curator archive/pin/restore after telemetry has accumulated.

## Open Questions

1. Whether agent prompt changes should require approval every time, or allow auto-apply for low-risk formatting-only prompt patches.
2. Whether user-created skills under `~/.teemai/skills` should be editable by agent after explicit opt-in.
3. Whether to expose review jobs in Agent Editor first or Mission timeline first.


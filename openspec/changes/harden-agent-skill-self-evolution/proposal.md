# Proposal: Harden Agent and Skill Self-Evolution

## Why

参照 `~/work/hermes-agent` 的闭环学习机制，重新评审 TeemAI 内置 agents 和 skills 的自我进化能力，并补齐从信号采集、经验提取、受控写入、检索注入、技能治理到用户确认的完整闭环。

结论：TeemAI 已经有若干正确的零件：`MemoryStore`、`MemoryGrowthCapture`、`satisfaction-score.sh`、`EvolutionTrigger`、Sensei prompt、EvolutionLog UI、agent workspace memory 文件夹。但它们目前更像“成长记录展示系统”，还不是 Hermes 式的自我进化系统。Hermes 的关键差异是：每隔若干轮会启动后台 review fork，只允许写 memory / skill；技能写入有 `skill_manage` 的校验、provenance、usage telemetry；后续由 curator 对 agent-created skills 做合并、归档、pin、备份和恢复。

## Summary

本变更先修复现有 agent / skill 自我进化链路中的真实断点，再逐步加入 Hermes-style 的 background review、受控 skill evolution、episodic retrieval 和 Sensei approval UX，让 TeemAI 的学习行为从“被动记录”升级为“有证据、有边界、可回滚、需确认”的闭环。

## What Changes

- Repair existing memory and satisfaction signal wiring so captured learnings are injected back into canonical agents.
- Make Codex hook installation idempotent to avoid duplicated Stop hooks after repeated compiles or abnormal cleanup.
- Add runtime asset provenance, skill usage telemetry, and controlled skill mutation APIs.
- Add background evolution review jobs that generate evidence-backed proposals before any agent/skill behavior change.
- Add episodic memory indexing and retrieval for prior task/session outcomes.
- Expose Sensei approval, rollback, and evolution log UX for governed self-evolution.

## Review Findings

详细评审见 `review.md`。最关键的缺口如下：

1. **P0: 记忆写入和注入 key 不一致，导致捕获的 memory 可能不会进入下次 agent prompt。** `MemoryGrowthCapture` 按 `agentId` 写入，例如 `fullstack-engineer`；`ConfigCompiler.buildPromptContent()` 却调用 `buildMemoryPrompt(agent.name)`，内置 agent 的 name 是 `Fullstack Engineer`。这会让 `## Cross-Session Memory` 对已捕获记忆仍为空。
2. **P0: satisfaction / evolution 信号按 instance 目录碎片化。** Stop hook 只去掉 `:auto` 后缀，没有把 `lead:2`、`code-reviewer:3` 归一到 canonical agent id；当前 `~/.teemai/agents/` 已经出现多组带冒号后缀的 `satisfaction.md`。`EvolutionTrigger` 又直接扫描目录，容易把同一 agent 的表现拆成多个假 agent。
3. **P0: EvolutionTrigger 只是写 `evolution-triggers.json`，没有可执行的 Sensei review job。** 触发器不会启动 review fork，不会生成 proposal diff，不会等待用户确认，不会把结果写回 agent/skill。闭环停在“发现问题”。
4. **P1: skills 没有 Hermes 式 procedural-memory 生命周期。** TeemAI 的 `skill-creator` 是手动技能，没有 `skill_manage` 这样的受控写入工具；`SkillManager.registerCustomSkill()` 只是内存注册，不落盘；没有 created_by provenance、usage counter、pin、archive、restore、curator report。
5. **P1: bundled assets 和 runtime home 存在漂移。** `WorkspaceSeeder.seedDir(..., overwrite=true)` 会覆盖同名文件但不删除 runtime 多余文件。当前 `~/.teemai/skills` 里存在很多 repo `ai-assets/skills` 没有的技能和支持文件。没有 manifest 能区分 bundled、user-created、agent-created、stale artifact。
6. **P1: hook 写入对 Codex 路径不幂等。** `compileForCodex()` 会把 Stop hooks append 到项目 `.codex/hooks.json`，如果进程异常退出或 cleanup 未执行，就会累积重复 hook。当前仓库 `.codex/hooks.json` 已经有重复 `wb-auto-extract.sh` / `satisfaction-score.sh` 条目。
7. **P1: 没有 episodic retrieval。** TeemAI 已经有 JSONL、`~/.teemai/tasks/*/plan.md`、whiteboard 和 result 概念，但没有 Hermes `session_search` 那种跨会话搜索，也没有把 prior task trajectory 注入给 agent。

## Goals

1. **先修正现有闭环的真实断点**：memory key、instance canonicalization、hook idempotency。
2. **建立 Hermes-style background review**：每 N 轮或触发器命中时，启动受限的 review agent，只能调用 memory/skill evolution 能力。
3. **引入受控 skill evolution layer**：新增 skill store、`SkillEvolutionService` 和写入 API，支持 create/patch/write_file/remove/archive/pin/restore，记录 provenance 和 usage。
4. **让 Sensei 从 prompt 文案变成 action loop**：触发器生成 review job，Sensei 输出 evidence-backed proposal，用户确认后原子应用。
5. **增加 episodic memory retrieval**：从任务、会话、whiteboard 中建立轻量索引，在 agent 启动或接收任务前注入 top relevant prior episodes。
6. **给用户可理解的治理界面**：展示“学到了什么、改了哪个 agent/skill、为什么、如何回滚”，而不是只显示 growth timeline。

## Non-Goals

- 不做模型微调或 RL；自我进化保持 non-parametric。
- 不引入向量数据库作为第一阶段依赖；先用 SQLite FTS/BM25 和文件索引。
- 不允许 agent 静默改内置 agent prompt 或 bundled skill；所有行为变化必须经用户确认或明确配置。
- 不重写现有 workflow / whiteboard / mission runtime。
- 不把 TeemAI 变成 Hermes 的 Python 架构；只借鉴机制边界和治理模型。

## Approach

### Phase 1: Repair the Current Loop

- `ConfigCompiler` 改为按 `agent.id` 读取 `MemoryStore`，并兼容读取旧 `agent.name` memory 作为迁移窗口。
- `satisfaction-score.sh` 输出 canonical agent id：剥离 `:auto` 和 `:<number>` instance suffix，并写入统一目录。
- `EvolutionTrigger` 只扫描注册表中的 canonical agents，并合并旧 suffix 目录作为 backfill 输入。
- `compileForCodex()` 在 `.codex/hooks.json` 中写 marker-owned hook block，按 command 去重，不再无限 append。
- 增加一次性 migration/backfill：合并 `~/.teemai/agents/<id>:*/memory/satisfaction.md` 到 `~/.teemai/agents/<id>/memory/satisfaction.md`。

### Phase 2: Add Background Review Jobs

- 新增 `EvolutionReviewService`，在两类场景启动：
  - periodic nudge：每个 agent 每 N 个 mission / turn 后检查 memory 和 skill signals；
  - trigger nudge：`EvolutionTrigger` 命中 repeated corrections、low satisfaction、stale prompt、scope confusion、capability gap。
- Review job 运行在隔离会话中，继承目标 agent 的 context，但 tool surface 限制为：
  - `memory_evolve`
  - `skill_evolve`
  - `episode_search`
  - readonly file/session inspection
- Review job 只生成 proposal，不直接应用 prompt 或 skill 变更。

### Phase 3: Add Skill Evolution Governance

- 新增 `SkillEvolutionStore`，记录：
  - skill name/path/source: `bundled | user | agent`
  - created_by / updated_by
  - use_count / view_count / patch_count
  - last_used_at / last_viewed_at / last_patched_at
  - pinned / archived_at / superseded_by
- 新增 `skill_evolve` API/tool：
  - `create`
  - `patch`
  - `write_file`
  - `remove_file`
  - `archive`
  - `restore`
  - `pin`
- 所有 skill 写入必须：
  - 验证 frontmatter
  - 限制路径只能在 skill 目录内
  - 对 bundled skills 默认只允许 proposal，不允许直接写
  - 原子写入并生成 rollback snapshot

### Phase 4: Add Episodic Retrieval

- 新增 `EpisodicMemoryIndex`：
  - 从 JSONL session、workflow task result、whiteboard durable entries 生成 `{agentId, missionId, title, summary, outcome, tags, files, timestamp}`。
  - SQLite FTS5 / BM25 检索，不引入外部向量服务。
- 在 agent 接任务前注入 “Prior Similar Episodes”：
  - 最多 3 条；
  - 同 agent 优先，必要时 team-level fallback；
  - 明确标注来源和 outcome，避免把失败路径当成成功经验。

### Phase 5: Sensei Approval and UX

- Sensei evolution proposal 必须包含：
  - evidence
  - root cause
  - exact diff
  - expected impact
  - risk
  - validation plan
  - rollback path
- 用户可以 approve / reject / edit proposal。
- approve 后由服务端原子写入 SOUL.md / SKILL.md / reference files，并写入 EvolutionLog。

## Risks

| Risk | Mitigation |
|------|------------|
| Agent 把偶发失败固化成错误技能 | Review prompt 明确禁止 environment-dependent failure；skill_evolve 需要 evidence 和 validation plan |
| 自我进化产生 prompt drift | 所有 agent prompt 修改默认 proposal-only；需要用户确认；保留 rollback snapshot |
| 技能库被短期任务污染 | Hermes-style class-level skill policy；curator 合并 narrow skills；agent-created provenance 可追踪 |
| 检索注入增加 prompt 噪音 | top-3 上限、同 agent 优先、只注入 high-confidence episodes |
| 兼容现有 runtime home 里的额外技能 | manifest 标记 source/provenance，不删除用户资产；先 audit 再治理 |

## Validation

- Unit tests:
  - memory key lookup uses `agent.id` and supports legacy `agent.name` fallback.
  - satisfaction canonicalizer maps `lead:2` and `lead:auto` to `lead`.
  - Codex hooks writer is idempotent across 3 compile cycles.
  - `skill_evolve` rejects path traversal and invalid SKILL.md frontmatter.
- Integration tests:
  - whiteboard decision captured to MemoryStore appears in next agent prompt.
  - low satisfaction trigger creates a review job.
  - review job can propose a skill patch but cannot mutate bundled skill without approval.
  - approved skill patch writes snapshot and EvolutionLog entry.
- Manual verification:
  - Run a mission with repeated user correction, wait for trigger, approve a Sensei proposal, then confirm next mission receives changed memory/skill context.

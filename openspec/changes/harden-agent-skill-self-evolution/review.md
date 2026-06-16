# Review: TeemAI Self-Evolution vs Hermes Agent

## Review Scope

### TeemAI

- `teemai.json`
- `ai-assets/agents/*/{IDENTITY.md,SOUL.md,AGENTS.md,TOOLS.md}`
- `ai-assets/skills/*/SKILL.md`
- `ai-assets/hooks/{wb-auto-extract.sh,satisfaction-score.sh}`
- `server/stores/MemoryStore.ts`
- `server/services/agent-evolution/{MemoryGrowthCapture.ts,EvolutionTrigger.ts}`
- `server/runtime/{ConfigCompiler.ts,HooksConfigManager.ts,PluginCommandsScanner.ts}`
- `server/config/{AgentRegistry.ts,SkillManager.ts}`
- `server/routes/agent/{memoryRoutes.ts,evolutionRoutes.ts,agentRoutes.ts}`
- `web/components/evolution/EvolutionLog.tsx`
- `web/hooks/{useAgentDNA.ts,useAgentEvolution.ts}`
- runtime state under `~/.teemai/agents` and `~/.teemai/skills`

### Hermes Agent Reference

- `agent/background_review.py`
- `agent/turn_context.py`
- `agent/turn_finalizer.py`
- `agent/memory_manager.py`
- `agent/memory_provider.py`
- `tools/memory_tool.py`
- `tools/skill_manager_tool.py`
- `tools/skill_usage.py`
- `agent/curator.py`
- `agent/curator_backup.py`
- `tools/session_search_tool.py`

## Hermes Mechanism Summary

Hermes 的自我进化不是单纯的“记录成长”，而是一个分层闭环：

1. **Declarative memory**：`MEMORY.md` / `USER.md` 保存稳定事实和用户偏好，并带注入防护、文件锁、漂移保护。
2. **Procedural memory as skills**：`skill_manage` 允许 agent 创建、patch、写 reference/template/script，技能是“如何做一类任务”的长期经验。
3. **Background review fork**：主任务结束后，后台 fork 一个受限 agent，只允许 memory/skills 工具，判断本轮是否应该沉淀。
4. **Usage/provenance telemetry**：`skill_usage.py` 记录 skill use/view/patch、created_by、pinned、archived state。
5. **Curator**：周期性 review agent-created skills，做合并、归档、备份、恢复；built-in / hub skills 有保护边界。
6. **Session search / episodic recall**：通过 FTS5 搜索过去会话，用真实 transcript 提供跨会话回忆。
7. **Governance**：危险写入要 gate，skill 变更可 rollback，curator report 可审计。

## TeemAI Current Mechanism

TeemAI 当前机制由以下零件组成：

- `teemai.json` 注册 10 个内置 agents，包括 `sensei`。
- `AgentRegistry` 从 `~/.teemai/agents` 读取 `IDENTITY.md` / `SOUL.md` / `AGENTS.md` / `TOOLS.md` / daily memory files。
- `SkillManager` 从 `~/.teemai/skills` 和 `~/.claude/skills` / `~/.codex/skills` 读取技能，并把 agent 配置里的 skill body 全量 append 到 prompt。
- `whiteboard` skill 通过 hooks 自动写 goal / artifact / handoff，手动写 decision / constraint / open_question。
- `MemoryGrowthCapture` 把部分 whiteboard entries 镜像到 `MemoryStore`。
- `satisfaction-score.sh` 在 Stop hook 里从 JSONL 解析用户反馈信号并写 `satisfaction.md`。
- `EvolutionTrigger` 周期性扫描 satisfaction 文件，生成 `~/.teemai/agents/sensei/evolution-triggers.json`。
- Sensei 的 SOUL.md 定义了 Active Evolution Protocol，但主要是 prompt 层协议。
- Evolution UI 从 `MemoryStore` 读取 `memory_updated` 事件作为 growth track。

这些零件方向正确，但闭环还没有打通。

## Findings

### P0: Captured Memory Is Keyed by Agent ID but Retrieved by Agent Name

`MemoryGrowthCapture.resolveAgentId()` 会将 whiteboard entry 的 `by` 解析为 canonical agent id，例如 `fullstack-engineer`，随后 `MemoryStore.create({ agentId })` 按这个 id 存储。

但 `ConfigCompiler.buildPromptContent()` 调用 `this.buildMemoryPrompt(agent.name)`。内置 agent 的 `name` 是显示名，例如 `Fullstack Engineer`，和 `agent_id` 列里的 `fullstack-engineer` 不一致。

影响：即使 whiteboard decision 已经进入 `MemoryStore`，下一次启动该 agent 时 `## Cross-Session Memory` 仍可能为空。这个问题直接破坏“跨会话记忆”的产品承诺。

### P0: Satisfaction Signals Are Fragmented by Runtime Instance IDs

`satisfaction-score.sh` 读取 `TEEMAI_INSTANCE_ID` 后只执行：

```bash
AGENT_ID="${AGENT_ID%:auto}"
```

当前 runtime 目录里已经出现：

- `lead/memory/satisfaction.md`
- `lead:2/memory/satisfaction.md`
- `lead:3/memory/satisfaction.md`
- `code-reviewer:2/memory/satisfaction.md`
- `product-strategist:2/memory/satisfaction.md`

`EvolutionTrigger` 直接扫描 `~/.teemai/agents/*/memory/satisfaction.md`，没有对这些目录做 canonicalization，也没有校验 registry。结果是同一个 agent 的低满意度、重复纠正、prompt stale 信号被拆散，Sensei 看到的是多个假 agent。

### P0: Trigger Does Not Produce an Evolution Action

`EvolutionTrigger` 只写 `evolution-triggers.json`。它不会：

- 启动 Sensei review job；
- 限制 review job 的 tool surface；
- 生成 agent/skill diff；
- 等待用户确认；
- 原子写入 SOUL.md / SKILL.md；
- 记录 rollback snapshot。

这和 Hermes 的 `background_review.py` 差异很大。Hermes 的 review fork 会在主任务之后运行，并且只允许 memory/skill tools，主任务不受干扰。

### P1: Skills Are Prompt Assets, Not Procedural Memory

TeemAI 的 skill 当前主要是 prompt 片段和 scripts：

- `SkillManager.loadBuiltinSkills()` 从 runtime home 加载 `SKILL.md`。
- `ConfigCompiler.buildPromptContent()` 把 agent 配置里的所有 skill body 直接拼进 system prompt。
- `skill-creator` 只是教 agent 如何手动创建技能。

缺少 Hermes 的关键能力：

- 受控 `skill_manage` 写入；
- created_by provenance；
- usage/view/patch telemetry；
- stale/archive/pin/restore；
- curator 合并 narrow skills；
- skill write approval 和 rollback。

因此 TeemAI skills 还不是“会随使用变强的程序性记忆”。

### P1: Bundled and Runtime Skills Drift Without Manifest Governance

`WorkspaceSeeder.seedDir('skills', true)` 会覆盖已有同名文件，但不会删除 runtime home 中多余的文件。当前 `~/.teemai/skills` 包含 repo `ai-assets/skills` 不存在的多组技能和支持文件，如 `aem`、`repo-explorer`、`slides`、`twitter-*`、`xhs-*`、多语言 code reviewer 等。

这些可能是有价值的用户资产，也可能是历史残留。但现在没有 manifest 能说明它们是 bundled、user-created 还是 agent-created。没有 provenance 时，任何 curator 都无法安全治理它们。

### P1: Codex Hook Merge Is Not Idempotent

`ConfigCompiler.compileForCodex()` 读取项目 `.codex/hooks.json` 后把新的 Stop hooks append 到原 Stop list。正常 cleanup 会恢复旧文件，但异常退出或进程被杀会留下 hook。下一次 compile 会继续 append。

当前 `.codex/hooks.json` 已经包含重复的 `wb-auto-extract.sh` 和 `satisfaction-score.sh`。这会造成重复写入、重复评分和更难排查的 side effects。

### P1: No Episodic Retrieval Layer

TeemAI 已有 JSONL、workflow task、whiteboard、plan.md 这些 episode 原料，但没有 Hermes `session_search` 那种工具，也没有 agent 启动前的 prior episode lookup。

当前 `MemoryStore` 更像 semantic memory，而缺少 episodic memory：某类任务曾经怎么做、哪里失败、最后 outcome 是什么。没有它，agent 仍会重复探索。

### P2: Evolution UI Overstates the Mechanism

README 写了 DNA metrics、success rate、first-pass rate、quality score、Evolution log、Sensei 自动优化。但实现中：

- `/api/agents/:id/dna` 读取 `ai-assets/evolution/dna/<agent.name>.json`，文件不存在时返回全 0。
- Evolution feed 目前只是 `MemoryStore` rows 映射为 `memory_updated`。
- `strategy_evolved` / `skill_acquired` 类型存在，但没有生产者。

这会让产品承诺和真实机制产生落差。

## Product Principle

自我进化的第一性原理不是“agent 有成长 UI”，而是：

1. 用户少重复纠正一次；
2. agent 少重复踩一次坑；
3. 团队少重复发明一次流程；
4. 每次行为变化都可解释、可确认、可回滚。

因此优化重点应该从“展示 agent 成长”转为“让经验可靠进入下一次执行”。


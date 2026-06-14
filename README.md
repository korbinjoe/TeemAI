# TeemAI

[![CI](https://github.com/korbinjoe/TeemAI/actions/workflows/ci.yml/badge.svg)](https://github.com/korbinjoe/TeemAI/actions/workflows/ci.yml)

**Your AI teammates — with names, memory, and growing expertise.**

You already use Claude Code or Codex. But every session starts from zero. Your agent doesn't remember your stack, your conventions, or the 20 times you told it "we use Tailwind, not CSS modules." And when you need three things done at once, you're stuck in one terminal, waiting.

TeemAI turns disposable AI sessions into a **persistent, professional team** — agents that know your project, work in parallel, and keep going while you're away.

```
You:    "Build the auth module, add tests, and update the docs."

        ✦ Lead breaks it into 3 tasks
        ✦ Engineer, Reviewer, and Tech Writer work simultaneously
        ✦ You go grab coffee
        ✦ Come back — 3 PRs ready for review
```

[![Watch the demo](https://github.com/user-attachments/assets/5f7b0993-b334-4e62-8114-3a24c6bd7a2c)](https://www.youtube.com/watch?v=NdwieO0M27E)

📦 [Releases](https://github.com/korbinjoe/TeemAI/releases)

> **Brand vs code naming.** "OpenTeam" is the public-facing product brand. The
> runtime and code truth is **TeemAI / teemai** — everything on disk and in the
> code uses this name: `~/.teemai/`, `teemai.json`, `teemai.db`, and the
> `TEEMAI_HOME` environment variable. Do **not** use `OpenTeam` as a code
> identifier, path, filename, or env var; reserve it for marketing copy only.

---

## Why TeemAI?

### Your agents start from zero every time

Every Claude Code session is a blank slate. No memory of your project, no awareness of your coding standards, no specialization. You re-explain the same context over and over.

**TeemAI fix**: Each agent has a persistent identity (IDENTITY.md), defined expertise (AGENTS.md), and personality (SOUL.md). They accumulate memory across sessions. A built-in coach (Sensei) analyzes their task history and automatically optimizes their capabilities.

### You're stuck running one agent at a time

You have three things to do, but your single terminal blocks you from doing any of them in parallel.

**TeemAI fix**: Dispatch multiple agents simultaneously. Engineer writes code while Reviewer audits while Designer prototypes — each in its own isolated git worktree, no merge conflicts.

### You have to babysit every step

Context-switch between agents, relay information manually, confirm every small decision. Managing AI is more exhausting than doing the work yourself.

**TeemAI fix**: Agents coordinate through a shared War Room — they see each other's goals, decisions, and artifacts. They self-decide when possible and only escalate when human judgment is genuinely needed.

### When you leave, everything stops

You go to a meeting, and your AI stops working. Your time away is wasted productivity.

**TeemAI fix**: Pulse-mode — batch-dispatch tasks, walk away, come back to results. The workflow engine handles dependencies, retries, and failure policies. When you return: "You were away for 2 hours. 3 completed, 1 needs your review."

---

## Quick Start

```bash
git clone https://github.com/korbinjoe/TeemAI.git
cd TeemAI && npm install

# Run (frontend + backend)
npm run dev
# → Open http://localhost:13000

# Or as Electron desktop app
npm run dev:electron
```

**Prerequisites**: Node.js >= 18, npm, and a Claude Code or Codex CLI installed.

---

## How It Works

### 1. Define your team

Each agent is a directory with markdown files that define who it is:

```
ai-assets/agents/code-reviewer/
├── IDENTITY.md    ← name, provider, tools
├── AGENTS.md      ← system prompt, expertise, workflows
└── SOUL.md        ← personality, tone, collaboration style
```

Or configure via `teemai.json`:

```jsonc
{
  "agents": {
    "list": [
      { "id": "lead", "name": "Lead", "model": "claude-sonnet-4-6" },
      { "id": "fullstack-product-engineer", "name": "Fullstack Engineer" },
      { "id": "code-reviewer", "name": "Code Reviewer" },
      { "id": "ui-designer", "name": "UI Designer" }
    ]
  }
}
```

### 2. Start a mission

Tell the Lead what you need. It decides whether to answer directly, hand off to one specialist, or decompose into a multi-step workflow across several agents.

### 3. Walk away

Agents work in isolated git worktrees. The workflow engine handles task dependencies, retries, and failure policies. When you come back, review the results and ship.

---

## Your Built-in Team

| Agent | Role | What makes it special |
|-------|------|----------------------|
| **Lead** | Orchestrator | Routes, decomposes, creates DAG workflows |
| **Fullstack Engineer** | Builder | End-to-end feature delivery |
| **Code Reviewer** | Quality gate | Multi-language review with structured reports |
| **UI Designer** | Visual + code | Design + implementation, browser-verified |
| **DevOps Engineer** | Infrastructure | CI/CD, deployment, monitoring |
| **Architect** | Structure | Architecture assessment, dependency governance |
| **Product Strategist** | Direction | Competitive analysis, PRDs, wireframes |
| **Image Creator** | Visual assets | AI image generation via Gemini |
| **Growth Marketer** | Distribution | Social media, promotion content |
| **Sensei** | Coach | Analyzes team performance, optimizes agent prompts |

Every agent remembers. Sensei watches their task history and evolves their capabilities over time. The team gets better the more you use it.

Adding a custom agent = create a directory with a `SOUL.md` and add one entry to `teemai.json`.

---

## Key Capabilities

### Session Management
- Unified view of all CLI AI sessions (Claude Code, Codex) — status visible at a glance
- Session history recovery — never lose a conversation
- Cross-session agent memory — your agents remember what they learned

### Orchestration
- DAG workflows — Lead decomposes tasks into dependency graphs
- Handoff protocol — agents route work to the right specialist
- Workspace isolation — each agent works in its own git worktree
- Failure policies — per-task `stop`, `skip`, or `retry` with configurable timeouts

### Collaboration
- War Room — shared context board where agents post goals, decisions, and blockers
- Agent-to-agent coordination without user as relay
- Attention-first — agents self-decide, only escalate when necessary

### Transparency
- Real-time token tracking by model and conversation
- Permission interception — approve or reject agent tool calls live
- DevPanel — 5-tab dashboard with protocol timeline and workflow DAG inspector
- Cron scheduler — recurring agent tasks with natural-language time parsing

### Agent Growth
- DNA metrics — task count, success rate, first-pass rate, quality score per agent
- Evolution log — visible growth trajectory over time
- Sensei — automatic prompt optimization based on task history

### Web IDE
- File tree + Monaco editor + multi-tab terminal
- Built-in browser preview for frontend work
- Git diff viewer and commit panel

---

## Use Cases

**Solo Founder** — You have a product idea. "Build the landing page, implement the signup API, and write the copy." Three agents work in parallel. You review one PR with all the pieces. Next week, they already know your tech stack.

**Open Source Maintainer** — A contributor submits a large PR. Dispatch Code Reviewer across backend, frontend, and config simultaneously. Get a structured review report in minutes. The reviewer remembers your project's conventions for next time.

**Freelancer** — Client wants a feature + tests + docs. Dispatch once, go work on another client. Come back to a complete deliverable. Your agents have been learning your client's codebase with each task.

---

## Skills System

Agents aren't just prompts — they carry executable skills:

| Skill | Description |
|-------|-------------|
| `workflow` | DAG creation, advancement, status tracking |
| `handoff` | Transfer tasks to the right specialist |
| `whiteboard` | Read/write shared War Room context |
| `playwright-cli` | Browser automation and screenshot verification |
| `image-generator` | AI image generation |
| `code-reviewer-*` | Language-specific review checklists |
| `skill-creator` | Create new skills dynamically |

Skills are composable — any agent can carry any combination. Build your own by dropping a script into the skills directory.

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────────────┐
│   Web UI    │────▶│   Express    │────▶│  CLI Agents (PTY Sessions) │
│  (React 18) │◀────│   + WS       │◀────│  Claude Code / Codex       │
└─────────────┘     └──────────────┘     └──────────────────────────┘
       │                   │                        │
  Electron app        REST + WS              WorkflowEngine
  (optional)          endpoints              WorkflowScheduler
                           │
              ┌────────────┼────────────┐
              │            │            │
         REST API     WebSocket     SQLite
     (Agent/Chat/    (terminal/    (persistent
      Workspace)     activity)     storage)
```

**Design decisions**:

- **JSONL as source of truth** — messages live in JSONL files, not the database
- **PTY persistence** — terminal sessions survive WebSocket disconnects
- **Provider-agnostic** — new CLI = implement `SessionDiscovery` + `OutputParser`
- **Server-driven workflows** — dependency resolution, scheduling, and failure handling

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite + TailwindCSS |
| Backend | Node.js + Express + WebSocket + node-pty |
| Storage | SQLite (better-sqlite3, WAL mode) |
| Desktop | Electron |
| CLI | Commander.js + Ink |
| Editor | Monaco Editor |
| Terminal | xterm.js |

---

## CLI

```bash
npx teemai serve       # Start as web service
npx teemai agents      # List configured agents
npx teemai workspaces  # Manage workspaces
npx teemai config      # View/edit configuration
npx teemai run         # Run a task directly
npx teemai chat        # Interactive chat mode
npx teemai daemon      # Manage background daemon
npx teemai update      # Check for updates
```

---

## Configuration

Runtime data lives in `~/.teemai/`. Team config in `teemai.json` at the project root.

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key | — |
| `ANTHROPIC_BASE_URL` | Custom API base URL | `https://api.anthropic.com` |
| `TEEMAI_HOME` | Data directory | `~/.teemai` |
| `PORT` | Server port | `13001` |

---

## Roadmap

- [ ] GitHub Actions integration — trigger workflows from CI
- [ ] Plugin marketplace — share and install community skills
- [ ] Multi-repo orchestration — agents working across repositories
- [ ] Voice dispatch — speak tasks, review results on mobile
- [ ] Cost budgets — per-workflow spending limits with auto-pause

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md).

Good first issues are tagged with [`good first issue`](../../labels/good%20first%20issue).

---

## License

[MIT](LICENSE)

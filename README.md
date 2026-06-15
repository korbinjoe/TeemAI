# TeemAI

[![CI](https://github.com/korbinjoe/TeemAI/actions/workflows/ci.yml/badge.svg)](https://github.com/korbinjoe/TeemAI/actions/workflows/ci.yml)

**The GUI for Claude Code, Codex, and your CLI fleet — every session in one place, your attention back, agents with real roles.**

You already ship with AI CLIs. But you're still juggling raw terminals: hunting for the right session, re-explaining your stack every time, and watching one agent while three other tasks wait. TeemAI is the control surface those CLIs never gave you — one place to see every session, run a team in parallel, and come back to finished work.

```
You:    "Build auth, add tests, update the docs."

        ✦ Lead splits it into 3 parallel missions
        ✦ Engineer, Reviewer, Tech Writer — each in its own worktree
        ✦ You leave for a meeting
        ✦ Return: "3 done, 1 needs your sign-off"
```

[![Watch the demo](https://github.com/user-attachments/assets/5f7b0993-b334-4e62-8114-3a24c6bd7a2c)](https://www.youtube.com/watch?v=NdwieO0M27E)

📦 [Releases](https://github.com/korbinjoe/TeemAI/releases)

> **Brand vs code naming.** "OpenTeam" is the public-facing product brand. The
> runtime and code truth is **TeemAI / teemai** — everything on disk and in the
> code uses this name: `~/.teemai/`, `teemai.json`, `teemai.db`, and the
> `TEEMAI_HOME` environment variable. Do **not** use `OpenTeam` as a code
> identifier, path, filename, or env var; reserve it for marketing copy only.

---

## Sound familiar?

| What you do today | What it costs you |
|-------------------|-------------------|
| Open 4 terminal tabs for Claude Code / Codex / Qoder | No overview — which session is stuck? which one finished? |
| Scroll JSONL or restart the CLI to find an old conversation | Context lost; you re-read or re-prompt from scratch |
| Copy-paste between agents because they can't see each other | You become the router — the bottleneck |
| One CLI session = one task | Three features in parallel means three context switches |
| Every new session forgets your conventions | "We use Tailwind" for the 21st time |
| Close the laptop → work stops | Your away time is dead time |

TeemAI doesn't replace your CLIs. It **wraps them** — same binaries, same models, same tool permissions — with a GUI, persistent agents, and orchestration you can't get from a bare terminal.

---

## Four things CLI power users actually need

### 1. A real GUI for your CLIs

Raw PTY terminals are fine for hacking. They're terrible for **operating** a fleet of agents.

TeemAI gives Claude Code, Codex, and Qoder CLI a unified desktop:

- **Mission sidebar** — every active and historical session in one list, with status dots (running / waiting / error / done)
- **Structured chat** — tool calls, diffs, and approvals parsed from JSONL, not a wall of ANSI
- **Live permission gate** — approve or reject tool use without missing it in scrollback
- **Web IDE built in** — file tree, Monaco editor, multi-tab terminal, git diff, browser preview
- **Electron desktop** — optional native app, same backend

Your CLIs keep running underneath. TeemAI is the cockpit.

### 2. Multi-session management that scales

When you run more than one agent, "session management" becomes the product.

- **One view, all sessions** — Claude, Codex, and Qoder sessions side by side; no tab archaeology
- **Session recovery** — refresh the page, reconnect WebSocket, reopen a mission — conversation reloads from JSONL (source of truth)
- **PTY persistence** — terminal processes survive disconnects; you don't lose in-flight work
- **Per-agent isolation** — each agent gets its own CLI session and git worktree; parallel work without merge fights
- **Token and cost visibility** — see spend by model and conversation before the invoice surprises you

Stop treating sessions as disposable. Treat them as assets you can return to.

### 3. Multi-agent definition — a team, not a prompt dump

A single generic "coding agent" can't cover review, design, DevOps, and product strategy. You need **roles with memory**.

Each agent is a directory of markdown — identity, expertise, personality:

```
ai-assets/agents/code-reviewer/
├── IDENTITY.md    ← name, provider, tools
├── AGENTS.md      ← system prompt, expertise, workflows
└── SOUL.md        ← personality, tone, collaboration style
```

Register in `teemai.json` — mix providers per agent (Claude Code on one, Codex on another, Qoder on a third):

```jsonc
{
  "agents": {
    "list": [
      { "id": "lead", "name": "Lead", "model": "claude-sonnet-4-6" },
      { "id": "fullstack-product-engineer", "name": "Fullstack Engineer" },
      { "id": "code-reviewer", "name": "Code Reviewer", "provider": "codex" },
      { "id": "ui-designer", "name": "UI Designer" }
    ]
  }
}
```

**10 built-in specialists** — Lead, Engineer, Reviewer, Designer, DevOps, Architect, Product Strategist, Growth Marketer, Image Creator, Sensei. Add your own: one `SOUL.md` + one config line.

Agents carry **Skills** (workflow, handoff, playwright-cli, code-reviewer-*, skill-creator, …) — executable capabilities, not just longer prompts.

### 4. Evolution and orchestration — dispatch, leave, review

**Evolution** — agents improve with use, not reset every Monday:

- **Cross-session memory** — agents retain project context across missions
- **DNA metrics** — task count, success rate, first-pass rate, quality score per agent
- **Evolution log** — visible growth trajectory
- **Sensei** — built-in coach that reads task history and optimizes agent prompts automatically

**Orchestration** — one human, many agents, one review pass:

- **Missions** — dispatch a goal; Lead routes, hands off, or builds a DAG workflow
- **War Room** — shared whiteboard where agents post goals, decisions, artifacts, blockers — no you-as-relay
- **DAG workflows** — dependencies, retries, `stop` / `skip` / `retry` failure policies
- **Pulse-mode** — batch-dispatch → walk away → batch-review: *"You were away 2 hours. 3 completed, 1 needs review."*
- **Cron scheduler** — recurring missions with natural-language time rules

This is the operating system for the **AI super-individual** — one person orchestrating what used to take a team.

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

**Prerequisites**: Node.js >= 18, npm, and at least one supported CLI installed (Claude Code, Codex, or Qoder CLI).

---

## How it works

1. **Define your team** — built-in agents or custom roles in `ai-assets/agents/` + `teemai.json`
2. **Start a mission** — tell Lead what you need; it answers, delegates, or decomposes into parallel work
3. **Walk away** — agents work in isolated worktrees; workflow engine handles deps and failures
4. **Review and ship** — structured results, permission history, and PR-ready diffs when you return

---

## Built-in team

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

---

## Use cases

**Solo founder** — "Landing page, signup API, and copy." Three agents, one review. Next week they already know your stack.

**Maintainer** — Large contributor PR? Reviewer scans backend, frontend, and config in parallel. Structured report in minutes — and it remembers your conventions next time.

**Freelancer** — Feature + tests + docs on one client while agents finish another. Pulse-mode turns dead time into deliverables.

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────────────────┐
│   Web UI    │────▶│   Express    │────▶│  CLI Agents (PTY Sessions)   │
│  (React 18) │◀────│   + WS       │◀────│  Claude Code / Codex / Qoder │
└─────────────┘     └──────────────┘     └──────────────────────────────┘
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

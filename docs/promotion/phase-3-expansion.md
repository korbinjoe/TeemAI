# Phase 3: Expansion (W4+)

## Goal

Convert launch momentum into sustained growth: expand channel coverage, get listed on Awesome Lists, build community, and cultivate contributors.

---

## T11: Awesome Lists PR Submissions

### Target Lists & Submission Strategy

| List | URL | Target Category | Submission Timing |
|------|-----|-----------------|-------------------|
| awesome-ai-tools | github.com/mahseema/awesome-ai-tools | Developer Tools | W4 |
| awesome-claude | Search for the most active Claude-related list | Tools & Integrations | W4 |
| awesome-developer-tools | github.com/mhxion/awesome-developer-tools | AI-Powered | W4+3d |
| awesome-selfhosted | github.com/awesome-selfhosted/awesome-selfhosted | Development - IDE | W5 |
| awesome-react | github.com/enaqx/awesome-react | Apps / Tools | W5 |

### PR Template

```markdown
## OpenTeam

[OpenTeam](https://github.com/xxx/openteam) - Web IDE for orchestrating
multiple AI coding agents in parallel. One person manages a full AI
engineering team. (MIT, TypeScript/React)
```

### Notes

- Read each list's CONTRIBUTING.md and strictly follow their format
- Ensure the project's Star count meets the list's minimum requirement (some require 100+)
- One PR per list, no batch submissions
- PR description should be concise, no hard-selling needed

---

## T12: Reddit Expansion Posts

### r/SideProject (W4)

```
Title: I'm building an OS for "AI super-individuals" — here's month 3

Body:
Hey everyone,

3 months ago I decided to build something for a workflow I couldn't find anywhere:
running multiple AI coding agents in parallel as a solo developer.

The idea: instead of being a developer who uses AI, become a "manager" of AI developers.

[screenshots of the journey - early prototype vs now]

Current state:
- Web IDE with integrated multi-terminal
- Claude Code and Codex support out of the box
- Git worktree isolation (agents don't conflict)
- Built-in token tracking (know what each agent costs)

What's working:
- I genuinely use it daily now for my own projects
- 3-5x throughput improvement for parallelizable tasks

What's still rough:
- Agent quality varies (sometimes they go off-track)
- Permission management needs work
- Documentation could be better

Open source (MIT): [link]

Would love to hear from other solo developers building with AI —
what's your workflow like?
```

### r/selfhosted (W4+2d)

```
Title: OpenTeam — self-hosted Web IDE for managing multiple AI coding agents [MIT, SQLite, no cloud]

Body:
If you use AI coding assistants and want to self-host a management layer for them:

**What it is**: A Web IDE that orchestrates multiple CLI-based AI coding agents
running in parallel on your machine.

**Self-hosted friendly**:
- Runs entirely on your hardware
- SQLite (WAL mode) — no Postgres/Redis/etc needed
- No cloud service dependencies (agents call their own APIs)
- Single `npm install && npm run dev`
- Data stays in `~/.openteam/`

**Stack**: Node.js + Express + React + SQLite + xterm.js

**Requirements**: Node 18+, npm, and whatever API keys your AI agents need.

No Docker image yet (PR welcome), but it's a straightforward Node app.

[GitHub link]
[Screenshot of the UI]
```

---

## T13: Dev.to Blog Post Publication

### Publishing Strategy

1. **URL**: `dev.to/[your-username]/why-i-built-openteam`
2. **Tags**: `#ai`, `#opensource`, `#productivity`, `#webdev`
3. **Cover image**: Comparison image or UI screenshot
4. **Canonical URL**: Set to dev.to version
5. **Medium sync**: Set canonical pointing to dev.to

### Publishing Time

US Pacific Tuesday/Wednesday morning — dev.to's peak activity hours

### Post-Publication

- Share link on Twitter + one hook sentence
- Mention in HN comments: "I wrote a detailed post about the architecture: [link]"
- Reply to all comments on the blog post

---

## T14: User Feedback Collection & Conversion

### Feedback Sources

| Source | Monitoring Method | Frequency |
|--------|-------------------|-----------|
| HN comments | Manual refresh + Hacker News email notifications | Intensive first 24h, then daily |
| Reddit comments | Reddit notification | Daily |
| GitHub Issues | GitHub notification | Real-time |
| Twitter Mentions | Twitter notification | Real-time |
| GitHub Discussions | GitHub notification | Daily |

### Feedback Classification Template

```markdown
## User Feedback Summary — Week [N]

### Feature Requests (convert to GitHub Issues)
- [ ] "Can it work with local models?" → Issue #XX
- [ ] "Docker support" → Issue #XX
- [ ] "VS Code extension" → Issue #XX

### Criticism/Problems (needs improvement)
- "Setup too complex" → Simplify Quick Start
- "Documentation lacking" → Improve docs

### Positive Feedback (use as future promotional material)
- "This is exactly what I needed" — @user (quotable)
- "4x productivity boost" — HN comment (quotable)

### Action Items
- [ ] Reply to all feedback
- [ ] Add high-frequency requests to Roadmap
- [ ] Request permission to quote positive feedback
```

---

## T15: GitHub Discussions Setup

### Initial Category Configuration

| Category | Description | Purpose |
|----------|-------------|---------|
| General | Chat about anything OpenTeam-related | Casual chat + daily questions |
| Show & Tell | Share what you've built with OpenTeam | User story showcase |
| Feature Requests | Suggest new features or improvements | Feature requests |
| Q&A | Get help from the community | Technical Q&A |

### Welcome Post Content

```markdown
# 👋 Welcome to OpenTeam Discussions!

Hey! Thanks for checking out OpenTeam.

This is the place to:
- Ask questions about setup, usage, or architecture
- Share your workflows and agent configurations
- Request features or discuss ideas
- Show off what you've built with OpenTeam

A few guidelines:
- Be kind and constructive
- Search existing discussions before creating a new one
- For bugs, please use GitHub Issues instead
- Feature requests here are great — we review them weekly

I'm actively building this and love hearing how people use it.
Looking forward to the conversation!
```

---

## T16: Weekly Content Cadence

### Weekly Schedule

| Day | Content Type | Example |
|-----|--------------|---------|
| Monday | Progress update | "This week: added [feature]. Here's a 15s demo" |
| Wednesday | Technical deep-dive | "How OpenTeam handles PTY session persistence" |
| Friday | Community/casual | Retweet user feedback, answer FAQs, meme |

### Content Bank (20 pre-drafted post ideas)

1. "How I went from 1 agent to 5 without losing my mind"
2. "The architecture decision that saved me: JSONL as source of truth"
3. "Why I chose SQLite over Postgres for a local-first tool"
4. "Agent Isolation 101: why git worktrees are perfect for multi-agent"
5. "Real numbers: token cost of running 5 agents on a typical task"
6. "The unexpected benefit: agents review each other's code"
7. "Provider-agnostic design: adding a new CLI in 50 lines"
8. "From Claude Code to OpenTeam: my workflow evolution"
9. "The hardest bug: race conditions in multi-PTY session management"
10. "What I learned about AI team management from managing real teams"

---

## T17: Good First Issues Preparation

### Issue Template

```markdown
## 📋 Description
[Clear description of what needs to be done]

## 🎯 Expected Outcome
[What success looks like]

## 💡 Implementation Hints
- Relevant files: `path/to/file.ts`
- Key function: `functionName()`
- Similar pattern: see `path/to/similar.ts`

## 🏷️ Difficulty
[Beginner / Intermediate / Advanced]

## 📚 Context
[Link to relevant docs or discussion]
```

### Pre-prepared Issue List

| # | Title | Difficulty | Area |
|---|-------|------------|------|
| 1 | Add Docker support (Dockerfile + docker-compose) | Beginner | DevOps |
| 2 | Add keyboard shortcuts for common actions | Beginner | Frontend |
| 3 | Improve error messages when API key is missing | Beginner | Backend |
| 4 | Add session export (download conversation as markdown) | Intermediate | Frontend+Backend |
| 5 | Support custom themes via JSON config | Intermediate | Frontend |
| 6 | Add agent performance metrics dashboard | Intermediate | Frontend |
| 7 | Implement conversation search/filter | Intermediate | Frontend+Backend |
| 8 | Add WebSocket reconnection with exponential backoff | Intermediate | Shared |
| 9 | Support Aider as a CLI provider | Advanced | Backend |
| 10 | Add E2E tests with Playwright | Advanced | Testing |

---

## T18: CONTRIBUTING.md English Version

### Content Structure

```markdown
# Contributing to OpenTeam

## Quick Setup (< 5 minutes)

1. Fork & clone
2. `npm install`
3. `npm run dev`
4. Open http://localhost:13000

## Development

### Project Structure
[brief map]

### Code Style
- TypeScript strict
- TailwindCSS for styling
- Const arrow functions, no semicolons
- Handler functions: `handle` prefix

### Running Tests
npm test

### Common Tasks
- Add a new API endpoint: see `server/routes/`
- Add a new UI component: see `web/components/`
- Add a new CLI provider: implement `SessionDiscovery` + `OutputParser`

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes (keep scope tight)
3. Ensure `npm test` passes
4. Open a PR with:
   - Clear title describing the change
   - Screenshot/GIF for UI changes
   - Link to related Issue

## First Contribution?

Look for issues labeled `good first issue` — they include
implementation hints and relevant file paths.

## Questions?

Open a Discussion thread — we're happy to help!
```

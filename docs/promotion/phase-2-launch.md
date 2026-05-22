# Phase 2: Launch (W3)

## Goal

Complete the initial launch on HN and Reddit, capturing the first wave of traffic and feedback.

---

## T8: Hacker News Show HN

### Posting Time

**US Pacific time Tuesday or Wednesday 8:00-9:30am** (avoid Monday backlog and Friday low activity)

Corresponding to Beijing time: Tuesday/Wednesday 23:00-next day 00:30

### Title (pick one)

```
Option A: Show HN: OpenTeam – Orchestrate multiple AI coding agents working in parallel
Option B: Show HN: OpenTeam – A Web IDE for managing a team of AI coding agents
Option C: Show HN: OpenTeam – One person, a full AI engineering team (open source)
```

Recommended: Option A — most specific, clearly states the differentiation.

### Body

```
Hi HN,

I built OpenTeam because I hit a ceiling with Claude Code: one agent at a time.

I'd start a task, wait, context-switch, start another, lose track. I wanted to
dispatch 5 tasks and walk away — like managing a real team, but with AI agents.

OpenTeam is a Web IDE that orchestrates multiple CLI-based AI agents in parallel:

- Lead Agent decomposes your request into subtasks
- Expert Agents execute in parallel, each in an isolated git worktree
- Real-time terminal view (xterm.js + PTY) — sessions persist in background
- Come back, review diffs, approve, ship

Key technical decisions:
• JSONL is the single source of truth for messages (no DB duplication)
• Provider-agnostic: supports Claude Code and Codex, adding more is 2 interfaces
• PTY sessions survive WebSocket disconnects — reconnect replays via scrollback

Stack: React 18 + TypeScript + Express + SQLite + node-pty + xterm.js

It's open source (MIT) and runs entirely on your laptop.

Demo: [GIF or video link]
GitHub: [repo link]

Happy to answer any questions about the architecture or multi-agent orchestration approach.
```

### Post-Launch Checklist

- [ ] Stay online for 2-3 hours **immediately** after posting
- [ ] Reply to every comment within 5 minutes (HN algorithm values early engagement)
- [ ] Reply style: technical depth + sincerity + non-defensive
- [ ] Respond to criticism with "good point, here's why we chose..." rather than arguing
- [ ] Do not solicit votes or have friends mass-upvote (HN has detection mechanisms and will flag)

### Prepared Responses for Common Questions

| Likely Question/Criticism | Prepared Response Approach |
|---------------------------|---------------------------|
| "How is this different from just opening multiple terminals?" | Global state visibility, automated task decomposition, worktree isolation, persistent background execution + notifications |
| "Why not just use tmux?" | tmux gives you terminal multiplexing but lacks task orchestration, state tracking, and diff review integration |
| "Why Electron? Why not just web?" | Supports both: pure web (`npm run dev`) and desktop version (offline optimization) |
| "Does this work with local models?" | Provider-agnostic architecture — any agent with a CLI can plug in |
| "What's the token cost for running 5 agents?" | Built-in token tracking, see each agent's consumption in real-time |
| "I tried Devin and it sucked" | OpenTeam is a tool, not an autonomous agent — you remain the decision-maker and reviewer |

### Time-Based Strategy

```
0-1h:   Actively reply to all comments, maintain post engagement
1-3h:   Continue monitoring, focus on high-quality technical discussions
3-6h:   Reduce frequency, but maintain replies within 24h
6-24h:  Reply to all remaining unanswered comments
```

---

## T9: Reddit First Post — r/LocalLLaMA

### Posting Time

**2 days** after HN launch (don't post same day — energy will be divided)

### Title

```
I built an open-source Web IDE that orchestrates multiple AI coding agents in parallel (supports Claude, Codex, and local models via CLI)
```

### Body

```
Hey everyone,

Been lurking here for a while. I built a tool that might be interesting for
anyone running multiple coding agents.

**The problem**: I use Claude Code (and sometimes Codex) daily, but I can only
run one at a time. For complex projects, I want to parallelize.

**What I built**: OpenTeam — a Web IDE that lets you orchestrate multiple
CLI-based agents simultaneously:

- Each agent gets its own terminal (PTY session)
- Tasks run in isolated git worktrees (no merge conflicts)
- Sessions persist even if you close the browser
- Provider-agnostic: if it has a CLI, it can plug in

**Why this matters for local model users**: The architecture is provider-agnostic.
It doesn't call any API directly — it wraps CLI tools. So if you have a coding
agent that runs as a CLI (like aider with a local model), it could plug into
OpenTeam's orchestration layer.

**Tech stack**: React 18, Express, SQLite, xterm.js, node-pty. Runs 100% on
your machine. MIT licensed.

[GitHub link]
[Demo GIF]

Would love feedback, especially from anyone who's tried to run multiple local
agents in parallel.
```

### r/LocalLLaMA-Specific Notes

- Emphasize **local-first**, **open source**, **provider-agnostic**
- Mention local model compatibility (even if currently primarily Claude/Codex)
- This community dislikes cloud-only and closed-source tools
- Don't come across as overly commercial

---

## T10: Reddit Second Post — r/ChatGPTPro

### Posting Time

**2-3 days** after T9

### Title

```
From running one AI coding agent at a time to managing a full team in parallel — here's what I built
```

### Body

```
If you use Claude/GPT for coding, you've probably hit this wall:

You ask it to build Feature A. While it's working, you want to start Feature B.
But you can't — you're stuck watching one stream of output.

I built OpenTeam to solve this. It's a Web IDE where you can:

1. Describe a complex task
2. A "Lead Agent" breaks it into subtasks
3. Multiple "Expert Agents" start working on them simultaneously
4. Each in its own isolated branch (no conflicts)
5. You walk away, come back, review all the diffs at once

Think of it like going from "solo developer" to "engineering manager" —
except your team is AI agents and they work 24/7.

Real-world example: I asked it to "add user auth, write tests, and update docs"
→ 3 agents started simultaneously → all done in 35 minutes instead of 2.5 hours serial.

Open source (MIT), runs locally, supports Claude Code and Codex out of the box.

[Demo GIF]
[GitHub link]

Anyone else been looking for something like this?
```

### r/ChatGPTPro-Specific Notes

- Emphasize **efficiency gains** and **workflow improvements**
- Audience leans toward product users (not deeply technical), use more accessible language
- Can share user stories and time comparison data
- Avoid overly technical architecture descriptions

---

## Launch-Period Twitter Coordination

### Twitter Post on HN Launch Day

```
Just launched OpenTeam on Hacker News 🚀

tl;dr: An open-source Web IDE that lets one person orchestrate
multiple AI coding agents working in parallel.

Dispatch tasks → walk away → come back to review diffs.

Would love your feedback:
[HN link]

Open source: [GitHub link]
```

### Twitter Post When HN Hits Front Page

```
OpenTeam just hit the front page of Hacker News.

The #1 question so far: "How is this different from multiple terminal tabs?"

Short answer: Tabs give you screens. OpenTeam gives you task decomposition,
workspace isolation, progress tracking, and batch review.

It's the difference between "I have 5 windows open" and
"I'm managing a team."

[HN link]
```

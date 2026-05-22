# Phase 1: Twitter Warm-up (W2)

## Goal

Establish Twitter presence before the HN launch, accumulate initial followers, and build engagement with KOLs.

---

## T5: Twitter Account Setup

### Profile Configuration

```
Name:       OpenTeam
Handle:     @openteam_dev (or similar available name)
Bio:        "One person, full AI team. Orchestrate multiple coding agents in parallel. Open source."
Location:   "Your laptop"
Website:    GitHub repo URL
Banner:     Product screenshot (multi-terminal parallel view)
Pinned:     First Demo GIF post
```

### Notes

- If it's a new account, engage with dozens of AI/dev accounts for 3-5 days before posting content
- New accounts have a high probability of shadow ban on their first post — post a few link-free text-only tweets first to warm up

---

## T6: Twitter Post Series (5 Days)

### Day 1 — Pain Point Post (text only, no links)

```
I've been running Claude Code for everything.

But there's a ceiling: one agent at a time.

Task A waits while Task B runs.
I context-switch between terminals.
I babysit processes that don't need me.

What if I could dispatch 5 tasks and walk away?

That's what I've been building for the last 3 months.
```

**Publishing time**: 9am US Pacific (targets US audience)

---

### Day 2 — Technical Post (with code screenshot)

```
The hardest problem in building a multi-agent IDE:

How do you parse real-time output from 5 CLI sessions simultaneously?

My solution: JSONL file watching + provider-specific parsers.

Each CLI (Claude, Codex) writes a JSONL stream.
A shared SessionFileWatcher tails them all.
Provider-specific OutputParsers extract structured messages.

Adding a new CLI = implement 2 interfaces. That's it.

[attach architecture diagram screenshot]
```

---

### Day 3 — Demo GIF Post (core viral post)

```
One person. Five AI agents. Zero babysitting.

Here's OpenTeam in action:

→ I type ONE task description
→ Lead Agent decomposes it into subtasks
→ 3 Expert Agents start coding in parallel
→ Each in its own git worktree (no conflicts)
→ I come back, review 3 diffs, ship

This is how I work now. Shipping next week.

[Demo GIF]
```

**This is the most important post** — highest probability of KOL retweets.

---

### Day 4 — Architecture Post (with system diagram)

```
OpenTeam architecture in one picture:

Web UI → Express + WS → PTY Sessions (one per agent)

Key decisions:
• JSONL = single source of truth (no DB for messages)
• PTY persists when you disconnect (come back anytime)
• Worktree isolation (agents never step on each other)
• Provider-agnostic (Claude today, any CLI tomorrow)

Open source. Runs on your laptop. No cloud required.

[attach Architecture diagram]
```

---

### Day 5 — Teaser Post

```
Tomorrow I'm launching OpenTeam on Hacker News.

tl;dr: A Web IDE that lets one person orchestrate multiple AI coding agents in parallel.

If you've ever wished you could:
- Run 5 Claude sessions at once
- Walk away and come back to finished code
- Review diffs instead of watching agents type

I built this for you (and me).

Drop a 🔖 if you want me to reply with the link tomorrow.

[comparison image]
```

---

## T7: KOL Engagement Strategy

### Target KOL List (by priority)

| Handle | Why | Engagement Approach |
|--------|-----|---------------------|
| @alexalbert__ | Anthropic developer relations | Comment on his Claude-related posts |
| @mcaborern | AI coding tools blogger | Engage in technical discussions |
| @swyx | AI engineering / Latent Space | Reply to his AI agent perspectives |
| @simonw | Open source + AI tools | Comment on his tool recommendations |
| @mckaywrigley | AI coding indie developer | Share technical insights |
| @kaboroevich | Heavy Claude user | Exchange experiences |

### Engagement Cadence

```
W2 Day 1-3: Leave high-value comments on 2-3 target KOLs' posts daily
            (don't mention your own product, pure technical discussion)

W2 Day 4-5: Naturally mention 1-2 KOLs in your own posts
            e.g. "Inspired by how @xxx uses Claude for..."

W3 Post-launch: DM 2-3 with the best rapport, attach HN link
            Script: "Hey, launched this today — thought you might
            find it interesting given your work on [specific topic].
            No pressure to share, just wanted you to see it."
```

### DM Template

```
Hey [name]! I've been following your work on [specific thing they posted].

I just launched OpenTeam — it lets you orchestrate multiple Claude/Codex
agents in parallel from a Web IDE. Basically what I wished existed when
running complex multi-file tasks.

Here's the HN post: [link]

No pressure at all to share — just thought it aligned with what you've
been exploring. Happy to answer any questions if you're curious.
```

### Don'ts

- Do not cold-DM people you haven't interacted with
- Do not mass-send identical messages
- Do not hard-promote your product in other people's threads
- Do not repeatedly @ the same person

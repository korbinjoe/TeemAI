# Phase 0: Asset Preparation (W1)

## Goal

Complete all promotional assets before launch, ensuring high-quality content is available for HN/Reddit/Twitter channels.

---

## T1: Record Demo GIF

### Script (complete within 30 seconds)

```
0-5s    Open OpenTeam Web UI, show empty Dashboard
5-10s   Create new Chat, type task description: "Build auth module, add unit tests, update API docs"
10-15s  Lead Agent decomposes task → 3 Expert Agents start simultaneously
15-22s  Switch to multi-terminal view, 3 Agents writing code in parallel (code scrolling)
22-27s  Task completion notification pops up, switch to Git Review panel, show 3 diffs
27-30s  Final frame: OpenTeam logo + "One person. Full team." tagline
```

### Recording Steps

1. **Environment Setup**
   ```bash
   npm run dev
   # Ensure 3+ Agents are configured in openteam.json
   # Prepare a real medium-complexity task
   ```

2. **Recording Tools**
   - macOS: OBS Studio (free) or QuickTime (built-in)
   - Resolution: 1920x1080, recording area limited to OpenTeam window
   - Disable system notifications, hide Dock

3. **Post-processing**
   ```bash
   # Convert video to GIF (use ffmpeg + gifski for high quality)
   ffmpeg -i demo.mov -vf "fps=12,scale=1280:-1" -c:v pam -f image2pipe - | \
     gifski -o demo.gif --fps 12 --quality 90 --width 1280 -

   # If > 5MB, reduce fps or width
   ffmpeg -i demo.mov -vf "fps=10,scale=960:-1" -c:v pam -f image2pipe - | \
     gifski -o demo.gif --fps 10 --quality 80 --width 960 -
   ```

4. **Quality Check**
   - [ ] File size ≤ 5MB
   - [ ] Text is legible on mobile screens
   - [ ] No personal information leaked (API keys, file paths, etc.)
   - [ ] Smooth playback without stuttering

5. **Output Files**
   - `docs/assets/demo.gif` — for README
   - `docs/assets/demo-twitter.gif` — 16:9 cropped version for Twitter

---

## T2: README English Optimization

Completed (see README.md rewrite).

### Verification Checklist

- [ ] First 3 lines answer What/Why/How different
- [ ] Demo GIF placed immediately below the title
- [ ] Quick Start steps ≤ 4 commands
- [ ] Comparison table clearly shows differentiation
- [ ] No Chinese text remaining (search with `grep -r '[一-龥]' README.md`)
- [ ] Have 1-2 native speakers review (can post to r/EnglishLearning or ask Twitter friends)

---

## T3: Comparison Image Creation

### Design Specifications

- Size: 1200x675px (Twitter 16:9)
- Background: dark (#1a1a2e)
- Font: Inter or JetBrains Mono
- Brand colors: consistent with OpenTeam theme

### Content Versions

**Version A — Feature Comparison Table**

```
┌──────────────────────────────────────────────────┐
│         How OpenTeam Compares                     │
├──────────────┬────┬────────┬───────┬──────┬─────┤
│              │ OT │ Cursor │ Claude│ Devin│Aider│
├──────────────┼────┼────────┼───────┼──────┼─────┤
│ Multi-agent  │ ✅ │   ❌   │  ❌   │  ❌  │ ❌  │
│ Open source  │ ✅ │   ❌   │  ✅   │  ❌  │ ✅  │
│ Local-first  │ ✅ │   △   │  ✅   │  ❌  │ ✅  │
│ Web IDE      │ ✅ │   ✅   │  ❌   │  ✅  │ ❌  │
│ Walk away    │ ✅ │   ❌   │  ❌   │  ✅  │ ❌  │
└──────────────┴────┴────────┴───────┴──────┴─────┘
```

**Version B — Efficiency Comparison**

```
┌────────────────────────────────────────────┐
│  5 tasks, 1 developer                      │
│                                            │
│  Serial (1 agent):  ████████████████ 2.5h  │
│  OpenTeam (5 agents): ████ 35min           │
│                                            │
│  4.3x faster with parallel agents          │
└────────────────────────────────────────────┘
```

### Recommended Tools

- Figma (most flexible)
- Excalidraw (quick hand-drawn style)
- Carbon (code screenshots)
- Or write an HTML page with TailwindCSS and take a screenshot

---

## T4: "Why I Built This" Blog Post

### Structure Outline (800-1200 words)

```markdown
# Why I Built OpenTeam: Giving One Person a Full AI Engineering Team

## The Problem (200 words)
- I use Claude Code to write code every day
- But can only run one at a time, waiting → context-switching → efficiency loss
- Things I want to do > what a single Agent can handle in parallel
- "If only I could manage 5 Agents at once"

## What I Tried (150 words)
- Open multiple terminal tabs? → Switching chaos, state lost
- tmux + multiple sessions? → No global view, can't tell who's doing what
- Custom scripts? → No visualization, painful debugging

## The Insight (150 words)
- The real problem isn't "running multiple Agents" but "how one person efficiently manages a team"
- Managing a real team requires: task decomposition, progress visibility, result review, context sharing
- So what I need is an "AI Team OS", not another chat wrapper

## How OpenTeam Works (300 words)
- Lead Agent decomposes the task
- Expert Agents execute in parallel (each in an isolated worktree)
- Web IDE gives you a global view
- When done, you get notified — come back and review diffs
- Key technical decisions: JSONL as source of truth, PTY persistence, provider-agnostic

## What's Next (150 words)
- Current state (alpha, what works, what's rough)
- Roadmap highlights
- Honest about what's still incomplete
- Invite people to try and give feedback

## CTA
- GitHub link
- Star if useful
- Issues welcome
```

### Publishing Checklist

- [ ] Complete English first draft
- [ ] Native speaker polish (can use Grammarly Pro + manual review)
- [ ] Include 2-3 screenshots/GIFs (reuse T1 and T3 assets)
- [ ] Publish on dev.to (supports canonical URL)
- [ ] Sync to Medium (set canonical URL pointing to dev.to to avoid SEO fragmentation)
- [ ] Add GitHub link + "Star if you find it useful" at the end

---

## All Asset Deliverables Checklist

| Asset | File/Location | Usage |
|-------|---------------|-------|
| Demo GIF (README) | `docs/assets/demo.gif` | README, HN, Reddit |
| Demo GIF (Twitter) | `docs/assets/demo-twitter.gif` | Twitter posts |
| Comparison Image A | `docs/assets/comparison-features.png` | README, Twitter, Reddit |
| Comparison Image B | `docs/assets/comparison-speed.png` | Twitter, Blog |
| Blog Post | dev.to + Medium | Long-tail search, Twitter traffic driver |
| README | `README.md` | GitHub homepage |

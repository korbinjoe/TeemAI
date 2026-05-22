# Tasks: Launch Overseas Promotion

## Phase 0: Asset Preparation (W1)

- [ ] **T1: Record 30s Demo GIF** — Showcase the core workflow: dispatch 3 tasks → Agents execute in parallel → come back to review diffs
  - Tools: OBS/QuickTime + gifski/ffmpeg
  - Verification: GIF ≤ 5MB, clear and readable, understandable without audio
- [ ] **T2: Polish English README opening paragraph** — The first 3 lines must answer "what is this / why should I care"
  - Verification: Have 1-2 native English speakers review
- [ ] **T3: Create comparison chart** — Single Agent serial vs OpenTeam parallel time/output comparison
  - Format: PNG, suitable for Twitter 16:9 and Reddit embedding
- [ ] **T4: Write "Why I built OpenTeam" blog post** — Personal story + technical insight
  - Length: 800-1200 words
  - Platform: dev.to primary, Medium syndication
  - Verification: English proofreading before publishing

## Phase 1: Warm-up (W2)

- [ ] **T5: Twitter account setup** — Complete Bio, pinned tweet, avatar/banner
- [ ] **T6: Publish Twitter series (5 posts)** — Build-in-public style
  - Day 1: Pain point post "I was running 5 Claude sessions manually..."
  - Day 2: Technical post "How I parse JSONL from multiple CLI sessions"
  - Day 3: Demo GIF post
  - Day 4: Architecture post (with diagram)
  - Day 5: Teaser post "Launching on HN tomorrow"
- [ ] **T7: Engage with 3-5 AI coding KOLs in advance** — Comment/retweet their content, build relationships
  - Targets: @alexalbert__, @mcaborern, AI tool indie hackers

## Phase 2: Launch (W3)

- [ ] **T8: Publish HN Show HN post** — US Pacific Time Tuesday/Wednesday 8-10am
  - Post includes: problem + solution + 3 tech highlights + demo link + repo link
  - Verification: Actively reply to all comments within 1 hour of posting
- [ ] **T9: Reddit first post (r/LocalLLaMA)** — 2 days after HN launch
  - Angle: Runs locally, multi-provider support, open source
  - Verification: No hard sell, share in technical discussion format
- [ ] **T10: Reddit second post (r/ChatGPTPro)** — 2 days after first post
  - Angle: Productivity boost, "from serial to parallel"

## Phase 3: Expansion (W4+)

- [ ] **T11: Submit Awesome Lists PRs** — Target lists:
  - awesome-ai-tools
  - awesome-claude
  - awesome-developer-tools
  - Verification: PRs merged
- [ ] **T12: Reddit expansion posts (r/SideProject + r/selfhosted)** — Different angles for each
- [ ] **T13: Publish dev.to blog post** — "Why I built OpenTeam" full article
- [ ] **T14: Collect user feedback and convert to Issues/Roadmap** — Extract from HN/Reddit comments
- [ ] **T15: Enable GitHub Discussions** — Categories: General / Show & Tell / Feature Requests / Q&A

## Ongoing Operations

- [ ] **T16: Establish weekly content cadence** — 2-3 Twitter updates per week + 1 technical blog post per month
- [ ] **T17: Label "good first issue"** — Prepare 5-10 onboarding issues for potential contributors
- [ ] **T18: Create CONTRIBUTING.md in English** — Lower the contributor participation barrier

## Dependencies

```
T1 ──┬──→ T6 (requires GIF)
T2 ──┤
T3 ──┘
T4 ────────→ T13 (blog post publication)
T5 ──→ T6 ──→ T7 ──→ T8
T8 ──→ T9 ──→ T10
T8 ──→ T11
T8 ──→ T14 ──→ T15
```

## Parallelizable

- T1, T2, T3, T4 can all run in parallel
- T9, T11 can run in parallel (different channels)
- T15, T16, T17, T18 can run in parallel

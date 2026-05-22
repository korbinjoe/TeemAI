# Design: Launch Overseas Promotion

## Architecture Overview

The promotion system consists of three layers: Content Assets Layer, Channel Distribution Layer, and Community Landing Layer.

```
┌─────────────────────────────────────────────────────┐
│                   Content Assets                      │
│  Demo GIF / Video / Blog Post / Comparison Chart     │
└───────────────────────┬─────────────────────────────┘
                        │ Distribution
┌───────────────────────▼─────────────────────────────┐
│              Distribution Channels                    │
│  Twitter/X │ Hacker News │ Reddit │ Dev.to │ GitHub │
└───────────────────────┬─────────────────────────────┘
                        │ Landing
┌───────────────────────▼─────────────────────────────┐
│              Community Landing                        │
│  GitHub Discussions │ Discord (optional) │ Issues     │
└─────────────────────────────────────────────────────┘
```

## Key Decisions

### 1. Community Landing: GitHub Discussions over Discord

**Rationale**:
- Early user volume is insufficient to sustain Discord activity; a dead server is worse than none
- GitHub Discussions is natively tied to the code repository, reducing user navigation friction
- Indexable by search engines, providing long-tail SEO value

**Follow-up**: Consider opening Discord after Stars exceed 1000

### 2. Launch Channel: HN over Product Hunt

**Rationale**:
- OpenTeam's current target users are technical builders; HN's audience is a better fit
- PH requires a more polished landing page and onboarding experience
- HN discussion quality is high, offering the opportunity for high-quality technical feedback

### 3. Demo Asset: GIF over Long Video

**Rationale**:
- GIF can be embedded in README, Twitter, Reddit — covers all channels
- Low production cost, fast iteration
- Twitter auto-plays GIFs; dwell rate is higher than video links

## Content Strategy

### Twitter Content Formula

```
Hook (pain point / data)
 ↓
Show (GIF / screenshot)
 ↓
CTA (GitHub link)
```

### HN Post Structure

```
Title: Show HN: OpenTeam – Orchestrate multiple AI coding agents in parallel
Body:
  - Problem (1-2 sentences)
  - Solution (1-2 sentences)
  - Tech highlights (3 bullet points)
  - Demo link
  - GitHub link
```

### Reddit Subreddit Matching

| Subreddit | Angle | Posting Interval |
|-----------|----------|----------|
| r/LocalLLaMA | Runs locally, multi-provider | W3 |
| r/ChatGPTPro | Productivity boost, parallel work | W3+2d |
| r/SideProject | Build story, indie hacker | W4 |
| r/selfhosted | Local SQLite, no cloud dependency | W4+2d |
| r/programming | Technical architecture sharing | W5 |

## Metrics & Success Criteria

| Metric | Phase 1 Target | Phase 2 Target |
|------|-------------|-------------|
| GitHub Stars | 200 | 500 |
| HN Points | 50+ | — |
| Twitter Followers | 100 | 300 |
| Contributors | 1-2 | 3-5 |
| README read → Clone conversion | 5% | 8% |

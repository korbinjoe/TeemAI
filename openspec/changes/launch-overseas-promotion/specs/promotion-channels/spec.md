# Capability: Promotion Channels

Overseas promotion channel strategy and execution standards.

## ADDED Requirements

### Requirement: Hacker News Launch

The project MUST launch on Hacker News with a Show HN post as the primary international debut channel.

#### Scenario: Successful HN post submission

- **Given** the Demo GIF has been recorded and the English README has been polished
- **When** publishing the Show HN post on US Pacific Time Tuesday through Thursday 8-10am
- **Then** the post title is ≤ 80 characters, with "Show HN" prefix
- **And** the body includes: problem description, solution, 3 technical highlights, demo link, GitHub link
- **And** all comments are replied to within 1 hour of posting

#### Scenario: HN post underperforms

- **Given** the HN post has < 10 points 4 hours after publication
- **When** determining that the launch performance is poor
- **Then** drive traffic via Twitter KOL retweets
- **And** retry at a different time slot the next day (without deleting the original post)

---

### Requirement: Reddit Multi-Subreddit Coverage

The project MUST cover at least 4 relevant subreddits with distinct angles per community.

#### Scenario: Subreddit post with correct angle

- **Given** the community rules of the target subreddit have been read
- **When** posting in r/LocalLLaMA
- **Then** emphasize local execution, open source, multi-provider support
- **And** do not hard-sell the project link; introduce it in a technical discussion format
- **And** posting interval from the previous subreddit is ≥ 2 days

#### Scenario: Avoid spam detection

- **Given** Reddit's anti-spam mechanisms
- **When** posting across multiple subreddits
- **Then** each post has completely different content (no copy-paste)
- **And** the account has ≥ 3 valuable comments in the target subreddit before posting
- **And** posts use text post format (not link posts)

---

### Requirement: Twitter/X Build-in-Public Campaign

The project MUST maintain a build-in-public presence on Twitter/X with consistent content cadence.

#### Scenario: Pre-launch content series

- **Given** the Demo GIF and comparison chart assets are ready
- **When** starting Twitter operations one week before HN launch
- **Then** publish 5 series posts, one per day
- **And** each post includes a visual element (GIF/screenshot/chart)
- **And** the last post is a teaser for the HN launch

#### Scenario: Ongoing engagement

- **Given** the launch is complete and entering the ongoing operations phase
- **When** maintaining the weekly content cadence
- **Then** publish 2-3 updates per week (feature releases / user stories / technical sharing)
- **And** reply to all mentions and comments

# Capability: Community Engagement

Community interaction mechanisms and contributor cultivation strategy.

## ADDED Requirements

### Requirement: GitHub Discussions Setup

The project MUST enable GitHub Discussions as the primary community interaction platform.

#### Scenario: Discussion categories configured

- **Given** GitHub Discussions has been enabled on the repository
- **When** configuring discussion categories
- **Then** the following categories are included: General / Show & Tell / Feature Requests / Q&A
- **And** each category has an English description explaining its purpose
- **And** a Welcome post is pinned explaining the community rules

#### Scenario: Community response SLA

- **Given** a user asks a question in Discussions
- **When** a new post is published
- **Then** an initial reply is provided within 24 hours
- **And** the reply quality is higher than "thanks for the feedback"

---

### Requirement: Contributor Onboarding

The project MUST prepare a clear contributor onboarding path with good-first-issues and documentation.

#### Scenario: Good first issues available

- **Given** the project wants to attract external contributors
- **When** preparing contributor-friendly issues
- **Then** 5-10 issues are labeled "good first issue"
- **And** each issue includes: problem description, expected outcome, implementation hints, relevant file paths
- **And** difficulty gradient: 2 beginner-level, 5 intermediate, 3 challenging

#### Scenario: CONTRIBUTING.md ready

- **Given** an overseas contributor is participating for the first time
- **When** reading CONTRIBUTING.md
- **Then** it includes: dev environment setup (3 steps or fewer), code conventions, PR process, issue templates
- **And** fully in English, no mixed Chinese
- **And** from clone to running dev server ≤ 5 minutes

---

### Requirement: KOL Engagement Strategy

The project MUST establish relationships with AI coding KOLs before launch to amplify reach.

#### Scenario: Pre-launch relationship building

- **Given** the target KOL list has been established (5-10 people)
- **When** one week before launch
- **Then** leave valuable comments on target KOLs' posts ≥ 3 times
- **And** do not cold-pitch the project directly
- **And** share naturally after establishing familiarity

#### Scenario: Post-launch amplification

- **Given** the HN/Reddit posts have been published
- **When** amplification is needed
- **Then** share the post via DM and explain why it is relevant to their audience
- **And** provide a unique angle to make it easy for them to retweet
- **And** accept being ignored; do not repeatedly pester

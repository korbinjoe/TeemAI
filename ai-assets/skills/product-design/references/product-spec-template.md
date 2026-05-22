# Product Design Specification Template

## Usage Instructions

This template is for writing feature-level product design specification documents. Trim sections based on feature complexity — simple features don't need every section filled.

Before writing the spec, make the Craft Quality decision (see the decision tree in SKILL.md) to determine the polish level this feature needs.

---

## Template Body

```markdown
# [Feature Name] Design Specification

> **Status**: Draft / In Review / Approved
> **Author**: [Name]
> **Date**: [YYYY-MM-DD]
> **Craft Level**: High / Medium / Low

## 1. Overview

### 1.1 Background
[Why are we building this feature? What problem does it solve? What data supports it?]

### 1.2 Goals
- **User goal**: [What users want to achieve through this feature]
- **Business goal**: [Business metrics: conversion/retention/efficiency]
- **Non-goals**: [What we explicitly won't do, to prevent scope creep]

### 1.3 Success Metrics
| Metric | Baseline | Target | Measurement Method |
|--------|----------|--------|-------------------|
| [Metric name] | [Current value] | [Expected value] | [How to measure] |

## 2. User Stories

Ordered by priority:

**P0 — Core**
- As a [role], I want to [action], so that [purpose]
- As a [role], I want to [action], so that [purpose]

**P1 — Important**
- As a [role], I want to [action], so that [purpose]

**P2 — Enhancement**
- As a [role], I want to [action], so that [purpose]

## 3. User Flows

### 3.1 Core Flow (Happy Path)

[Use Mermaid flowchart to describe the main user flow]

### 3.2 Exception Flows

[Describe error/edge case handling flows]

## 4. Detailed Design

### 4.1 Page/Component List

| Page/Component | Function | Priority | Notes |
|---------------|----------|----------|-------|
| [Name] | [Function description] | P0/P1/P2 | [Constraints/dependencies] |

### 4.2 Information Architecture

[Describe page hierarchy and navigation structure]

### 4.3 Core Page Design

#### [Page Name A]

**Layout description**:
[Describe overall page layout: header/sidebar/content area/footer]

**Functional sections**:
1. [Section name] — [Function] — [Interaction notes]
2. [Section name] — [Function] — [Interaction notes]

**Data display**:
| Field | Type | Source | Required |
|-------|------|--------|----------|
| [Field name] | text/number/date/enum | [API/local] | Yes/No |

## 5. State Design

### 5.1 Page States

| State | Trigger Condition | Display Content | Actions |
|-------|------------------|-----------------|---------|
| Loading | Initial load/refresh | [Skeleton/Spinner] | — |
| Empty | No data | [Guidance copy + CTA] | [Create first one] |
| Loaded | Data ready | [Normal content] | [CRUD] |
| Error | Request failed | [Error description + retry] | [Retry button] |
| Partial | Partial failure | [Available data + error hint] | [Retry failed parts] |

### 5.2 Component States

| Component | Default | Hover | Active | Disabled | Error |
|-----------|---------|-------|--------|----------|-------|
| [Component name] | [Description] | [Description] | [Description] | [Description] | [Description] |

## 6. Interaction Rules

### 6.1 Form Rules
| Field | Validation Rule | Validation Timing | Error Message |
|-------|----------------|-------------------|---------------|
| [Field name] | [Rule] | blur/submit/realtime | [Message] |

### 6.2 Operation Feedback
| Operation | Feedback Form | Feedback Content | Duration |
|-----------|--------------|------------------|----------|
| Save success | Toast | "Saved" | 3s |
| Delete confirmation | Dialog | "Are you sure? This cannot be undone" | User action |

## 7. Edge Cases

| # | Scenario | Handling |
|---|----------|----------|
| 1 | [Edge case description] | [How to handle] |
| 2 | [Edge case description] | [How to handle] |

## 8. Technical Constraints & Dependencies

- **Frontend framework**: [React/Vue/etc.]
- **Component library**: [Shadcn/Ant Design/etc.]
- **API dependencies**: [List required interfaces]
- **Performance requirements**: [First paint time/interaction response time]
- **Browser/device support**: [Compatibility requirements]

## 9. Iteration Plan

| Phase | Scope | Craft Level |
|-------|-------|-------------|
| MVP | [P0 user stories] | Medium |
| V1 | [+ P1 user stories] | High |
| V2 | [+ P2 user stories + polish] | High |

## 10. Open Questions

| # | Question | Impact Scope | Suggested Solution | Status |
|---|----------|-------------|-------------------|--------|
| 1 | [Pending question] | [What designs it affects] | [Your suggestion] | Pending discussion |
```

## Writing Principles

- **Specific > Abstract**: Write "input height 40px, border-radius 8px", not "input is medium-sized"
- **Behavior > Description**: Write "after user clicks save, show Toast 'Saved'", not "has save feature"
- **Omission = Pitfall**: Edge cases not covered will definitely come up as questions from dev. Proactively cover beats reactive firefighting
- **Testable**: Every feature point should be verifiable — "user can do X" rather than "supports X feature"

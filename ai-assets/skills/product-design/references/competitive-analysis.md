# Competitive Analysis Framework

## Analysis Process

### Step 1: Define Analysis Scope

**Competitor Classification**:
- **Direct competitors**: Solve the same problem, target the same user group (e.g., Figma vs Sketch)
- **Indirect competitors**: Solve the same problem but in different ways (e.g., Notion vs Google Docs + Trello)
- **Substitutes**: What users currently "make do with" (e.g., Excel for project management)

**Analysis Dimensions** (select 3-5 based on purpose):
- Core feature coverage
- User experience and interaction design
- Visual design and brand feel
- Information architecture and navigation
- Pricing and business model
- Target users and positioning
- Technical architecture (if visible)
- Ecosystem and integration capabilities

### Step 2: Experiential Research

Conduct deep hands-on experience with each competitor, focusing on:

```
1. Signup/onboarding flow — First impression from 0 to 1
2. Core task flow — Number of steps and smoothness to complete main tasks
3. Empty state handling — Guidance design when there's no data
4. Error handling — Intentionally trigger errors to see how they're handled
5. Performance feel — Operation response speed, loading times
6. Mobile experience — Is there a mobile version? Is it consistent?
7. Unique highlights — Design details that make you say "wow"
8. Obvious pain points — Experience issues that make you frown
```

### Step 3: Output Competitor Matrix

**Feature Matrix**:

```markdown
| Feature/Dimension | Us | Competitor A | Competitor B | Competitor C |
|-------------------|-----|-------------|-------------|-------------|
| [Feature 1]       | Y/P/N | Y/P/N | Y/P/N | Y/P/N |
| [Feature 2]       | Y/P/N | Y/P/N | Y/P/N | Y/P/N |
```

Legend: Y = Full support, P = Partial support, N = Not supported

**UX Experience Scoring**:

```markdown
| UX Dimension | Us | Competitor A | Competitor B |
|-------------|-----|-------------|-------------|
| Onboarding | B | A | C |
| Core task efficiency | C | A | B |
| Visual quality | B | A | A |
| Error handling | D | B | C |
| Mobile experience | F | A | B |
```

### Step 4: Extract Insights

**SWOT Cross-Analysis**:

```markdown
### Strengths
- [Where we do better than competitors]

### Weaknesses
- [Where competitors clearly outperform us]

### Opportunities
- [Blank areas no competitor does well]
- [Unmet user needs]

### Threats
- [Competitors' strong development directions]
- [Disruption risks]
```

### Step 5: Differentiation Strategy

Extract 3 differentiation paths from the competitive analysis:

**Path 1: Experience Differentiation**
- Which core flow can we make "notably better"?
- Reference cases: Stripe's developer experience, Linear's operation speed

**Path 2: Scenario Differentiation**
- Which niche user group are competitors overlooking?
- Reference cases: Notion targeting individuals vs Confluence targeting enterprises

**Path 3: Philosophy Differentiation**
- What unique product philosophy do we use for decisions?
- Reference cases: Basecamp's "less is more" vs Monday's "full-featured"

## Competitive Analysis Report Template

```markdown
# [Domain] Competitive Analysis Report

## Analysis Purpose
[Why are we doing this analysis? What questions do we want to answer?]

## Competitor Overview
| Competitor | Positioning | Target Users | Core Difference |
|-----------|-------------|--------------|-----------------|
| [Name] | [One-line positioning] | [Main user group] | [Biggest selling point] |

## Feature Matrix
[See Step 3]

## UX Experience Comparison
[See Step 3]

## Key Findings

### Industry Consensus (All competitors do this)
1. [Pattern/Feature]
2. [Pattern/Feature]

### Divergence Points (Competitors choose differently)
1. [Problem] — A chose [Approach X], B chose [Approach Y], because [reason]
2. [Problem] — ...

### White Space Opportunities (Nobody does well)
1. [Unmet need]
2. [Area for innovation]

## Design Recommendations
1. **Must-have** (table stakes): [What all competitors have, we must have too]
2. **Differentiator**: [Where we can do better]
3. **Delight**: [Original experience highlights]

## Action Items
| # | Action | Priority | Expected Impact |
|---|--------|----------|-----------------|
| 1 | [Specific action] | P0/P1/P2 | [Expected outcome] |
```

## Important Notes

- **Experience over screenshots**: Actually use competitors to complete core tasks, don't just look at website screenshots
- **Focus on "why" not "what"**: Don't just list features — analyze why competitors designed it that way
- **Avoid "I want it all"**: Competitors having 100 features doesn't mean you need 100. Focus on core differentiation
- **Continuous updates**: Competitors evolve — analysis should be ongoing, not one-time
- **User perspective**: Always compare from the user's angle, not internal feature perspective

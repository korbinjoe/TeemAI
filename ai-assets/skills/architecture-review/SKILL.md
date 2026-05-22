---
name: architecture-review
description: >
  Architecture review skill. Provides a complete 9-dimension review model, 4 analysis techniques,
  8 major anti-pattern detection checklists, and structured report templates.
  Triggers when user says "review architecture", "architecture health check", "analyze module dependencies", "evaluate evolvability".
allowed-tools: Read,Grep,Glob,Bash
---

## Review Dimension Framework (9-Dimension Review Model)

### 1. Layered Architecture & Separation of Concerns

**Review goal**: Whether each layer has clear responsibility definitions, whether cross-layer leakage exists.

- [ ] Does the presentation layer (UI) contain business logic or data access?
- [ ] Does the business layer directly manipulate DOM or depend on UI frameworks?
- [ ] Does the data layer leak into the presentation layer (e.g., components directly building SQL/API paths)?
- [ ] Are there "god modules" (single file > 500 lines, single directory > 20 direct child files)?
- [ ] Do layers communicate through explicit interface/type contracts?

**Detection method**:
```
Scan directory structure → identify layering pattern → check cross-layer imports → flag violations
```

### 2. Module Boundaries & Cohesion

**Review goal**: Whether modules are reasonably divided by domain/function, with high internal cohesion and low external coupling.

- [ ] Does directory structure reflect domain division (organized by feature vs by technical type)?
- [ ] Are there "junk drawer" directories (utils/helpers/common bloating into boundaryless catch-alls)?
- [ ] Is the module's public API minimized (only necessary interfaces exported via index.ts)?
- [ ] Are there direct references to internal implementations across modules (bypassing public API)?
- [ ] Is the same concept scattered across multiple unrelated directories?

**Detection method**:
```
Analyze import graph → calculate module Fan-in/Fan-out → identify high-coupling hotspots
```

### 3. Dependency Governance

**Review goal**: Whether dependency direction is reasonable, whether circular or implicit dependencies exist.

- [ ] Does dependency direction satisfy the "Stable Dependencies Principle" (high-level depends on low-level, not reverse)?
- [ ] Are there circular dependencies (A → B → C → A)?
- [ ] Are there cross-boundary dependencies (frontend directly importing backend internal modules, private paths in shared node_modules)?
- [ ] Do third-party dependencies have an isolation layer (directly scattered in business code vs encapsulated in adapter/wrapper)?
- [ ] Do key dependencies (xterm.js, Express, Electron) have a replacement/upgrade path?

**Detection method**:
```
Parse tsconfig paths / package.json → build dependency directed graph → detect cycles and direction violations
```

### 4. Data Flow & State Management

**Review goal**: Whether the complete chain from data creation to consumption is clear and traceable.

- [ ] Is the state management approach unified (not mixing props/zustand/context/global variables without discipline)?
- [ ] Are there "implicit shared states" (passing data between modules via global variables/singletons/filesystem)?
- [ ] Is data flow direction unidirectional and traceable (can you trace from UI event to state change to side effect)?
- [ ] Do WebSocket/event-driven data flows have clear message contracts and error handling?
- [ ] Is the server-client data sync strategy consistent (optimistic update/pessimistic update/eventual consistency)?

**Detection method**:
```
Trace core data chains (e.g., terminal data flow) → draw data flow diagram → mark breakpoints and ambiguous areas
```

### 5. API Design & Contracts

**Review goal**: Whether internal/external APIs are consistent, predictable, and have versioning strategy.

- [ ] Does API naming follow a unified style (RESTful / RPC / hybrid)?
- [ ] Are request/response type definitions shared between frontend and backend (avoiding type drift)?
- [ ] Do error responses have a unified format and classification?
- [ ] Do WebSocket messages have clear type definitions and protocol versioning?
- [ ] Are there "shadow APIs" (endpoints not registered in the router table but actually callable)?

### 6. Error Handling & Resilience Architecture

**Review goal**: Whether system behavior is predictable under exceptional conditions.

- [ ] Are errors handled at the correct layer (UI layer handles display, business layer handles logic, infrastructure layer handles IO)?
- [ ] Is there "error swallowing" code (empty catch blocks, catch with only console.log)?
- [ ] Do critical paths have fallback/degradation strategies (e.g., behavior when WebSocket disconnects)?
- [ ] Are process-level errors (unhandledRejection, uncaughtException) handled globally?
- [ ] Are there "timeout black holes" (network requests/process waits without timeouts)?

### 7. Testability

**Review goal**: Whether the architecture supports effective testing at each level.

- [ ] Can core business logic be unit tested without depending on UI framework?
- [ ] Are external dependencies (database, filesystem, network) injected via interfaces and replaceable with mocks?
- [ ] Are there untestable code paths (deeply nested side effects, critical logic in setTimeout)?
- [ ] Do integration test boundaries align with module boundaries?

### 8. Security Architecture

**Review goal**: Whether security is built in as an architectural constraint, not an afterthought patch.

- [ ] Is authentication/authorization handled in a unified middleware layer (not scattered across routes)?
- [ ] Is sensitive data (secrets, tokens) injected via environment variables/secret management services?
- [ ] Are there XSS risk points in frontend (dangerouslySetInnerHTML, unescaped user input)?
- [ ] Does the backend validate/sanitize all external input?
- [ ] Do child processes/PTY have resource limits and sandbox isolation?

### 9. Evolvability & Technical Debt

**Review goal**: Whether the architecture leaves room for future changes.

- [ ] How many files need modification to add a new feature? (Impact factor)
- [ ] How many places need changes to replace a key dependency (e.g., xterm.js major version upgrade)? (Replacement cost)
- [ ] Are there "hardcoded" configurations/constants scattered across multiple places?
- [ ] Are there deprecated but uncleaned code/modules/routes?
- [ ] Is technical debt marked and tracked (distribution and density of TODO/FIXME/HACK comments)?

---

## Review Methodology (Four Analysis Techniques)

### 1. Scenario-Based Analysis

Select 3-5 key scenarios and trace the architecture's response:

| Scenario Type | Example | Verification Goal |
|--------------|---------|-------------------|
| Normal traffic | User opens terminal and executes command | Data flow integrity, layer clarity |
| Peak scenario | 10 terminal sessions opened simultaneously | Resource management, state isolation |
| Failure scenario | WebSocket disconnects for 3 seconds then recovers | Error recovery, state consistency |
| Evolution scenario | Need to support SSH remote terminal | Whether abstraction layer is sufficient, change impact |
| Security scenario | Malicious user attempts command injection | Input validation, permission boundaries |

### 2. Failure Mode Analysis

Assume each component fails, evaluate the impact:

```
For each critical component:
  1. What happens if it crashes? (Blast radius)
  2. Is there a single point of failure? (SPOF detection)
  3. How long to recover? (MTTR assessment)
  4. Will it cascade? (Failure propagation chain)
```

### 3. Evolution Analysis

Evaluate the architecture's ability to handle change:

```
For each possible future requirement:
  1. How many modules need modification?
  2. Will it break existing interface contracts?
  3. Can it be achieved through extension rather than modification? (Open-Closed Principle)
  4. Estimate change cost (file count × complexity)
```

### 4. Trade-off Analysis

For each architectural decision, analyze gains and losses:

```
Decision: [specific decision]
Gained: [quality attribute improvement]
Lost: [quality attribute degradation]
Context: [why this trade-off is reasonable/unreasonable in the current scenario]
```

---

## Anti-Pattern Detection Checklist (8 Major Architectural Anti-Patterns)

| Anti-Pattern | Identification Signal | Harm |
|-------------|----------------------|------|
| **Distributed Monolith** | Modules are split but still tightly coupled — changing one requires syncing changes across many | Combines worst of monolith and distributed |
| **God Module** | Single file > 500 lines / single module > 50 exports / single component > 20 props | Unmaintainable, untestable |
| **Chatty API** | Completing one user action requires > 5 API calls | Poor performance, heavy frontend logic |
| **Anemic Model** | Data objects have only fields no behavior, all logic in external services | Domain knowledge lost, duplicated logic |
| **Under/Over Abstraction** | Business code directly operates low-level APIs / or AbstractFactoryFactory exists | Too tight coupling / excessive complexity |
| **Shared Mutable State** | Multiple modules read/write the same global variable/singleton without synchronization | Race conditions, hard to debug |
| **Error Swallowing** | Catch blocks only console.log or are empty, errors silently ignored | Hidden production failures, hard to locate |
| **Swiss Army Knife** | utils/helpers directory has 30+ unrelated functions | No cohesion, breeding ground for circular dependencies |

---

## Review Process

### Phase 1: Global Scan (Build Mental Model)

```
1. Read project metadata
   → package.json (dependency list, script commands)
   → tsconfig.json (path aliases, compilation config)
   → directory structure (Glob scan core directories)

2. Identify architectural patterns
   → Layering approach (by function/technology/hybrid)
   → State management approach (zustand/context/props)
   → Communication methods (REST/WebSocket/IPC)
   → Build and deployment model

3. Draw mental map
   → Core module list and responsibilities
   → Inter-module dependency directions
   → Primary data flow paths
```

### Phase 2: Deep Analysis (9-Dimension Review)

```
For each dimension:
  1. Collect evidence (verify with Grep/Glob/Read)
  2. Evaluate against checklist item by item
  3. Flag findings (Critical/Warning/Suggestion)
  4. Record specific file paths and line numbers as evidence
```

### Phase 3: Cross-Validation (Four Analysis Techniques)

```
1. Select 3-5 key scenarios for scenario-based analysis
2. Perform failure mode analysis on critical components
3. Assume 2-3 future requirements for evolution analysis
4. Perform trade-off analysis on important architectural decisions
```

### Phase 4: Output Report

Generate structured report using the template below.

---

## Output Specification

### Finding Severity Levels

| Level | Definition | Action Required |
|-------|-----------|-----------------|
| **[P0] Critical** | Single point of failure, security vulnerability, data consistency risk, blocks business goals | Must fix immediately |
| **[P1] Warning** | Maintainability degradation, high extension cost, design inconsistency | Fix in next iteration |
| **[P2] Suggestion** | Better alternatives, industry best practice alignment | Add to backlog |
| **[P3] Note** | Observed technical debt markers, future risk warnings | Record and track |

### Report Template

```markdown
# Architecture Review Report — {Project Name}

**Review date**: {date}
**Review scope**: {Full review / Module review / Change review}
**Review version**: {commit hash}

---

## I. Executive Summary

### Architecture Health Score

| Dimension | Score | Status |
|-----------|-------|--------|
| Layered Architecture & Separation of Concerns | {A/B/C/D} | {OK/Warning/Critical} |
| Module Boundaries & Cohesion | {A/B/C/D} | {OK/Warning/Critical} |
| Dependency Governance | {A/B/C/D} | {OK/Warning/Critical} |
| Data Flow & State Management | {A/B/C/D} | {OK/Warning/Critical} |
| API Design & Contracts | {A/B/C/D} | {OK/Warning/Critical} |
| Error Handling & Resilience | {A/B/C/D} | {OK/Warning/Critical} |
| Testability | {A/B/C/D} | {OK/Warning/Critical} |
| Security Architecture | {A/B/C/D} | {OK/Warning/Critical} |
| Evolvability & Technical Debt | {A/B/C/D} | {OK/Warning/Critical} |
| **Overall Rating** | **{A/B/C/D}** | |

### Key Findings

1. [P0] {Title} — {one-line description} ({evidence: file path})
2. [P1] {Title} — {one-line description} ({evidence: file path})
3. ...

### Architecture Strengths (Worth Keeping)

1. {Strength description} — {specific manifestation}
2. ...

---

## II. Detailed Findings

### {Dimension Name}

#### Finding-{Number}: {Title}

- **Severity**: [P0/P1/P2/P3]
- **Location**: `{file path}:{line number}` or `{directory path}/`
- **Current state**: {What the current architecture looks like, using code/paths/data as evidence}
- **Problem**: {Why this is an architectural issue}
- **Impact**: {Consequences if not fixed}
- **Recommendation**: {Specific improvement approach, can have multiple alternatives}
- **Change estimate**: {number of affected files}, {complexity assessment}

---

## III. Scenario Analysis

### Scenario {N}: {Scenario Name}

- **Trigger condition**: {When it happens}
- **Data flow path**: {Component A → Component B → Component C}
- **Issues discovered**: {Architectural weaknesses exposed during analysis}
- **Recommendation**: {Improvement approach}

---

## IV. Anti-Pattern Detection

| Anti-Pattern | Detection Result | Severity | Location |
|-------------|-----------------|----------|----------|
| God Module | {Present/Absent} | {P0-P3} | {path} |
| Circular Dependencies | {Present/Absent} | {P0-P3} | {path} |
| ... | | | |

---

## V. Architecture Decision Records (ADR)

### ADR-{Number}: {Decision Title}

- **Context**: {Why this decision was needed}
- **Decision**: {What approach was chosen}
- **Alternatives**: {Other approaches considered and reasons for rejection}
- **Consequences**: {Positive impact + negative impact}
- **Recommendation**: {Keep current decision / suggest adjustment}

---

## VI. Summary Matrix

| Dimension | P0 | P1 | P2 | P3 | Status |
|-----------|----|----|----|----|--------|
| Layered Architecture | {N} | {N} | {N} | {N} | {OK/Warning/Critical} |
| Module Boundaries | {N} | {N} | {N} | {N} | {OK/Warning/Critical} |
| Dependency Governance | {N} | {N} | {N} | {N} | {OK/Warning/Critical} |
| Data Flow | {N} | {N} | {N} | {N} | {OK/Warning/Critical} |
| API Design | {N} | {N} | {N} | {N} | {OK/Warning/Critical} |
| Error Handling | {N} | {N} | {N} | {N} | {OK/Warning/Critical} |
| Testability | {N} | {N} | {N} | {N} | {OK/Warning/Critical} |
| Security Architecture | {N} | {N} | {N} | {N} | {OK/Warning/Critical} |
| Evolvability | {N} | {N} | {N} | {N} | {OK/Warning/Critical} |

---

## VII. Action Items

### Must Act Immediately (P0)
- [ ] {Action item} — {responsible role} — {estimated effort}

### Should Act Soon (P1)
- [ ] {Action item} — {responsible role} — {estimated effort}

### Add to Backlog (P2+)
- [ ] {Action item} — {responsible role}
```

---

## Technology Stack-Specific Review Guidance

### React + TypeScript Frontend

- Is component hierarchy too deep (> 5 levels of props drilling)?
- Does prop forwarding exceed 3 layers (should consider context or state management)?
- Do custom Hooks take on too many responsibilities (single hook > 100 lines)?
- Is there tight coupling between components and business logic (logic should be extracted to hooks/services)?

### Express Backend

- Are routes, middleware, and business logic clearly layered?
- Is error handling done through unified middleware rather than scattered across routes?
- Are there synchronous blocking calls?

### xterm.js + PTY

- Does terminal instance lifecycle management have a clear state machine?
- Is the mapping between PTY processes and frontend terminal instances explicit?
- Does each segment of data flow (PTY → WebSocket → xterm) have backpressure/flow control?
- Is the terminal resize propagation chain complete (UI → WebSocket → PTY)?
- Does the session recovery chain have a clear state restoration sequence?

### Electron

- Is the responsibility boundary between main process and renderer process clear?
- Does IPC communication have type-safe message contracts?
- Are there security risks from renderer process directly accessing Node.js APIs?

---

## Review Trigger Modes

### Mode A: Full Review

- **Trigger**: User requests "review the entire project architecture" / "architecture health check"
- **Scope**: All 9 dimensions + scenario analysis + anti-pattern detection
- **Output**: Complete architecture review report

### Mode B: Change Review

- **Trigger**: User requests "review the architecture impact of this proposal/PR"
- **Scope**: Focus on dimensions affected by the change, evaluate impact on overall architecture
- **Output**: Impact analysis report + relevant ADRs

### Mode C: Focused Review

- **Trigger**: User requests "look at the dependencies" / "evaluate testability"
- **Scope**: Single dimension deep analysis
- **Output**: Focused analysis report

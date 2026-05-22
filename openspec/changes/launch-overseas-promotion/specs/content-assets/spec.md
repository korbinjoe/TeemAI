# Capability: Content Assets

Standards and quality requirements for content assets needed for promotion.

## ADDED Requirements

### Requirement: Demo GIF

The project MUST produce a high-quality demo GIF showcasing the core multi-agent parallel workflow.

#### Scenario: GIF meets quality standard

- **Given** the OpenTeam development environment is running normally
- **When** recording the Demo GIF
- **Then** duration is 20-30 seconds
- **And** file size ≤ 5MB (compatible with GitHub README embedding)
- **And** resolution ≥ 720p, text is clear and readable
- **And** showcases the complete workflow: dispatch tasks → multiple Agents work in parallel → review results

#### Scenario: GIF covers key differentiator

- **Given** the Demo GIF is intended to showcase differentiation
- **When** a user watches the GIF
- **Then** they can intuitively feel the visual impact of "multiple Agents working in parallel"
- **And** the core value is understandable without reading any text

---

### Requirement: README English Optimization

The README MUST communicate the project's value proposition within the first 3 lines for international developers.

#### Scenario: README above the fold

- **Given** an international user visits the GitHub repository for the first time
- **When** the user reads the first 3 lines of the README
- **Then** line 1: one sentence explaining what it is (What)
- **And** line 2: what problem it solves (Why)
- **And** line 3: key differentiator from competitors (How different)
- **And** immediately followed by the Demo GIF

---

### Requirement: Comparison Chart

The project MUST produce a visual comparison chart against key competitors to highlight differentiation.

#### Scenario: Chart content accuracy

- **Given** the comparison targets are Cursor, Claude Code CLI, Devin, Aider
- **When** creating the comparison chart
- **Then** comparison dimensions include: multi-Agent parallel / open source / runs locally / Web IDE / flexible provider
- **And** data is accurate, without exaggerating own strengths or disparaging competitors
- **And** format is PNG, adapted to Twitter 16:9 aspect ratio

---

### Requirement: "Why I Built This" Blog Post

The project MUST publish a narrative blog post on dev.to and Medium explaining the motivation behind OpenTeam.

#### Scenario: Blog post engagement

- **Given** the target audience is overseas technical builders
- **When** writing the blog post
- **Then** length is 800-1200 words
- **And** structure: personal pain point → tried existing solutions → why I built my own → core technical decisions → current status & roadmap
- **And** includes 2-3 screenshots or GIFs
- **And** English is proofread by a native speaker

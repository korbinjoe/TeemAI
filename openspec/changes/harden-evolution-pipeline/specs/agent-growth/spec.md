# Capability: Agent growth tracking deprecation

The `GrowthStore` (XP/level system) is deprecated and removed from the runtime. The `agent_growth` database table is retained for historical reference but has no active readers or writers.

## REMOVED Requirements

### Requirement: Task completion increments the agent's task counter

The system no longer automatically increments agent growth metrics on task completion events. The `GrowthStore.increment()` call path is removed.

#### Scenario: Task completion does not write to agent_growth

- **Given** an agent `fullstack-engineer` completes a task
- **When** the `task:completed` event is processed
- **Then** no row is inserted or updated in the `agent_growth` table
- **And** no error is raised

### Requirement: Growth REST API endpoints are removed

The system no longer exposes `GET /api/agents/:id/growth` or `POST /api/agents/:id/growth/:metric` endpoints.

#### Scenario: Growth API returns 404

- **Given** the server is running
- **When** a client sends `GET /api/agents/architect/growth`
- **Then** the server responds with 404

### Requirement: Evolution feed no longer derives milestones from GrowthStore

The `GET /api/agents/:id/evolution` endpoint no longer includes `milestone` entries derived from growth level thresholds.

#### Scenario: Evolution feed returns memory-only entries

- **Given** agent `architect` has 3 entries in `MemoryStore`
- **When** a client sends `GET /api/agents/architect/evolution`
- **Then** the response contains exactly 3 entries, all of type `memory_updated`
- **And** no entries of type `milestone` are present

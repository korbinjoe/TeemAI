/**
 * whiteboardLayout v2 —  DAG
 *
 *  0. normalizeAgent — :auto
 *  1. typeColorGroup — 7→4
 *  2.  +  +  agent
 *  3.  agent  agent →
 *  4. ref + handoff + goal-fanout
 *  5. Handoff
 *  6. Ref
 *  7. Temporal
 */

import { describe, it, expect } from 'vitest'
import {
  layoutWhiteboardDag,
  layoutWorkflowDag,
  typeColorGroup,
  normalizeAgent,
  DAG,
  type WorkflowDagTaskNode,
} from '../../lib/whiteboardLayout'
import type {
  WhiteboardEntry,
  WhiteboardEntryType,
} from '@shared/whiteboard-types'

// ============================================================
// ============================================================

const T0 = Date.parse('2026-04-19T10:00:00.000Z')
const min = (n: number) => T0 + n * 60_000

let __seqCounter = 0
const mk = (
  id: string,
  type: WhiteboardEntryType,
  by: string,
  atMs: number,
  opts?: { refs?: WhiteboardEntry['refs']; tags?: string[] },
): WhiteboardEntry => ({
  id,
  chatId: 'test',
  type,
  by,
  summary: `${type} ${id}`,
  refs: opts?.refs,
  tags: opts?.tags,
  status: 'active',
  timestamp: new Date(atMs).toISOString(),
  seq: ++__seqCounter,
})

const mkGoal = (id = 'goal-1', atMs = T0): WhiteboardEntry =>
  mk(id, 'goal', 'compass', atMs)

// ============================================================
// 0. normalizeAgent
// ============================================================

describe('normalizeAgent — :auto suffix normalization', () => {
  it('strips :auto suffix', () => {
    expect(normalizeAgent('forge:auto')).toBe('forge')
    expect(normalizeAgent('code-reviewer:auto')).toBe('code-reviewer')
  })
  it('returns normal id unchanged', () => {
    expect(normalizeAgent('forge')).toBe('forge')
  })
  it('only strips trailing :auto', () => {
    expect(normalizeAgent('foo:auto:bar')).toBe('foo:auto:bar')
  })
})

// ============================================================
// 1. typeColorGroup
// ============================================================

describe('typeColorGroup — 7→4 semantic groups', () => {
  it('goal/decision → direction', () => {
    expect(typeColorGroup('goal')).toBe('direction')
    expect(typeColorGroup('decision')).toBe('direction')
  })
  it('handoff → orch', () => {
    expect(typeColorGroup('handoff')).toBe('orch')
  })
  it('artifact/progress → exec', () => {
    expect(typeColorGroup('artifact')).toBe('exec')
    expect(typeColorGroup('progress')).toBe('exec')
  })
  it('open_question/constraint → signal', () => {
    expect(typeColorGroup('open_question')).toBe('signal')
    expect(typeColorGroup('constraint')).toBe('signal')
  })
})

// ============================================================
// ============================================================

describe('layoutWhiteboardDag — time-aware layering', () => {
  it('different agents same time no refs → same layer (parallel)', () => {
    const entries = [
      mk('a', 'decision', 'forge', min(0)),
      mk('b', 'progress', 'shield', min(1)),
      mk('c', 'decision', 'compass', min(2)),
    ]
    const { nodes } = layoutWhiteboardDag(entries, null, min(5))
    expect(nodes.every((n) => n.layer === 0)).toBe(true)
  })

  it('A referenced by B → A in upper layer, B in lower layer', () => {
    const entries = [
      mk('A', 'decision', 'forge', min(0)),
      mk('B', 'artifact', 'shield', min(1), { refs: { entries: ['A'] } }),
    ]
    const { nodes } = layoutWhiteboardDag(entries, null, min(5))
    const a = nodes.find((n) => n.id === 'A')!
    const b = nodes.find((n) => n.id === 'B')!
    expect(a.layer).toBeLessThan(b.layer)
    expect(a.x).toBeLessThan(b.x)
  })

  it('goal is in layer 0 when present', () => {
    const goal = mkGoal('g1', min(0))
    const entries = [
      mk('A', 'decision', 'forge', min(1)),
      mk('B', 'artifact', 'shield', min(2), { refs: { entries: ['A'] } }),
    ]
    const { nodes } = layoutWhiteboardDag(entries, goal, min(5))
    const g = nodes.find((n) => n.id === 'g1')!
    const a = nodes.find((n) => n.id === 'A')!
    const b = nodes.find((n) => n.id === 'B')!
    expect(g.layer).toBe(0)
    expect(a.layer).toBeGreaterThan(g.layer)
    expect(b.layer).toBeGreaterThan(a.layer)
  })

  it('chain dependency A → B → C → D assigned to incrementing layers', () => {
    const entries = [
      mk('A', 'decision', 'forge', min(0)),
      mk('B', 'artifact', 'forge', min(1), { refs: { entries: ['A'] } }),
      mk('C', 'progress', 'forge', min(2), { refs: { entries: ['B'] } }),
      mk('D', 'constraint', 'forge', min(3), { refs: { entries: ['C'] } }),
    ]
    const { nodes } = layoutWhiteboardDag(entries, null, min(5))
    const a = nodes.find((n) => n.id === 'A')!
    const b = nodes.find((n) => n.id === 'B')!
    const c = nodes.find((n) => n.id === 'C')!
    const d = nodes.find((n) => n.id === 'D')!
    expect(a.layer).toBeLessThan(b.layer)
    expect(b.layer).toBeLessThan(c.layer)
    expect(c.layer).toBeLessThan(d.layer)
  })

  it('sorted by timestamp within same layer', () => {
    const entries = [
      mk('c', 'progress', 'compass', min(3)),
      mk('a', 'decision', 'forge', min(1)),
      mk('b', 'progress', 'shield', min(2)),
    ]
    const { nodes } = layoutWhiteboardDag(entries, null, min(5))
    const layer0 = nodes
      .filter((n) => n.layer === 0)
      .sort((a, b) => a.y - b.y)
    expect(layer0.map((n) => n.id)).toEqual(['a', 'b', 'c'])
  })

  it('same agent same bucket no ref → same layer (parallel)', () => {
    const entries = [
      mk('a', 'decision', 'forge', min(0)),
      mk('b', 'artifact', 'forge', min(2)),
      mk('c', 'progress', 'forge', min(4)),
    ]
    const { nodes } = layoutWhiteboardDag(entries, null, min(5))
    const a = nodes.find((n) => n.id === 'a')!
    const b = nodes.find((n) => n.id === 'b')!
    const c = nodes.find((n) => n.id === 'c')!
    expect(a.layer).toBe(b.layer)
    expect(b.layer).toBe(c.layer)
  })

  it('same agent different bucket → different layers', () => {
    const entries = [
      mk('a', 'decision', 'forge', min(0)),
      mk('b', 'artifact', 'forge', min(6)),
    ]
    const { nodes } = layoutWhiteboardDag(entries, null, min(10))
    const a = nodes.find((n) => n.id === 'a')!
    const b = nodes.find((n) => n.id === 'b')!
    expect(a.layer).toBeLessThan(b.layer)
  })

  it('same agent same time → same layer', () => {
    const ts = min(1)
    const entries = [
      mk('a1', 'artifact', 'forge', ts),
      mk('a2', 'artifact', 'forge', ts),
      mk('a3', 'artifact', 'forge', ts),
    ]
    const { nodes } = layoutWhiteboardDag(entries, null, min(5))
    expect(nodes[0].layer).toBe(nodes[1].layer)
    expect(nodes[1].layer).toBe(nodes[2].layer)
  })
})

// ============================================================
// ============================================================

describe('layoutWhiteboardDag — cross-agent parallelism', () => {
  it('different agents same time period → shared layer (parallel visible)', () => {
    const entries = [
      mk('f1', 'decision', 'forge', min(0)),
      mk('s1', 'decision', 'shield', min(0)),
      mk('c1', 'progress', 'compass', min(1)),
    ]
    const { nodes } = layoutWhiteboardDag(entries, null, min(5))
    const f1 = nodes.find((n) => n.id === 'f1')!
    const s1 = nodes.find((n) => n.id === 's1')!
    expect(f1.layer).toBe(s1.layer)
  })

  it('different agents work in parallel after goal fanout', () => {
    const goal = mkGoal('g1', min(0))
    const entries = [
      mk('f1', 'decision', 'forge', min(1)),
      mk('s1', 'artifact', 'shield', min(1)),
    ]
    const { nodes } = layoutWhiteboardDag(entries, goal, min(5))
    const f1 = nodes.find((n) => n.id === 'f1')!
    const s1 = nodes.find((n) => n.id === 's1')!
    expect(f1.layer).toBe(s1.layer)
  })

  it('Dependencies push forward without breaking parallel agent positions', () => {
    const goal = mkGoal('g1', min(0))
    const entries = [
      mk('f1', 'decision', 'forge', min(1)),
      mk('f2', 'artifact', 'forge', min(2), { refs: { entries: ['f1'] } }),
      mk('s1', 'progress', 'shield', min(2)),
    ]
    const { nodes } = layoutWhiteboardDag(entries, goal, min(5))
    const f2 = nodes.find((n) => n.id === 'f2')!
    const s1 = nodes.find((n) => n.id === 's1')!
    expect(s1.layer).toBeLessThanOrEqual(f2.layer)
  })
})

// ============================================================
// ============================================================

describe('layoutWhiteboardDag — critical path', () => {
  it('ref chain marked critical', () => {
    const goal = mkGoal('g1', min(0))
    const entries = [
      mk('A', 'decision', 'forge', min(1), { refs: { entries: ['g1'] } }),
      mk('B', 'artifact', 'forge', min(2), { refs: { entries: ['A'] } }),
      mk('C', 'progress', 'shield', min(3)),
    ]
    const { nodes } = layoutWhiteboardDag(entries, goal, min(5))
    expect(nodes.find((n) => n.id === 'A')!.isCritical).toBe(true)
    expect(nodes.find((n) => n.id === 'B')!.isCritical).toBe(true)
    expect(nodes.find((n) => n.id === 'C')!.isCritical).toBe(false)
  })

  it('handoff chain included in critical path', () => {
    const goal = mkGoal('g1', min(0))
    const entries = [
      mk('h1', 'handoff', 'lead', min(1), { refs: { entries: ['s1'] } }),
      mk('s1', 'decision', 'shield', min(2)),
    ]
    const { nodes } = layoutWhiteboardDag(entries, goal, min(5))
    // goal-fanout → h1, handoff h1→s1, goal-fanout → s1
    const h1 = nodes.find((n) => n.id === 'h1')!
    const s1 = nodes.find((n) => n.id === 's1')!
    expect(h1.isCritical).toBe(true)
    expect(s1.isCritical).toBe(true)
  })

  it('goal-fanout edges included in critical path', () => {
    const goal = mkGoal('g1', min(0))
    const entries = [
      mk('A', 'decision', 'forge', min(1)),
      mk('B', 'artifact', 'forge', min(2), { refs: { entries: ['A'] } }),
    ]
    const { nodes } = layoutWhiteboardDag(entries, goal, min(5))
    expect(nodes.find((n) => n.id === 'A')!.isCritical).toBe(true)
    expect(nodes.find((n) => n.id === 'B')!.isCritical).toBe(true)
  })

  it('short paths not marked critical', () => {
    const goal = mkGoal('g1', min(0))
    const entries = [
      mk('A', 'decision', 'forge', min(1), { refs: { entries: ['g1'] } }),
      mk('B', 'artifact', 'forge', min(2), { refs: { entries: ['A'] } }),
      mk('C', 'progress', 'forge', min(3), { refs: { entries: ['B'] } }),
      mk('D', 'decision', 'shield', min(1), { tags: ['other'] }),
    ]
    const { nodes } = layoutWhiteboardDag(entries, goal, min(5))
    expect(nodes.find((n) => n.id === 'C')!.isCritical).toBe(true)
    expect(nodes.find((n) => n.id === 'D')!.isCritical).toBe(false)
  })

  it('refs pointing to non-existent id → skipped without error', () => {
    const goal = mkGoal('g1', min(0))
    const entries = [
      mk('A', 'decision', 'forge', min(1), { refs: { entries: ['ghost'] } }),
    ]
    expect(() => layoutWhiteboardDag(entries, goal, min(5))).not.toThrow()
  })

  it('no goal → no critical marking', () => {
    const entries = [mk('A', 'decision', 'forge', min(0))]
    const { nodes } = layoutWhiteboardDag(entries, null, min(1))
    expect(nodes[0].isCritical).toBe(false)
  })
})

// ============================================================
// ============================================================

describe('layoutWhiteboardDag — handoff edges', () => {
  it('handoff connects to target agent next non-handoff entry', () => {
    const entries = [
      mk('h1', 'handoff', 'forge', min(0), { refs: { entries: ['s1'] } }),
      mk('s1', 'decision', 'shield', min(2)),
    ]
    const { edges } = layoutWhiteboardDag(entries, null, min(5))
    const handoffs = edges.filter((e) => e.type === 'handoff')
    expect(handoffs).toHaveLength(1)
    expect(handoffs[0].source).toBe('h1')
    expect(handoffs[0].target).toBe('s1')
  })

  it('target agent no subsequent entry → no handoff edge created', () => {
    const entries = [
      mk('h1', 'handoff', 'forge', min(0), { refs: { entries: ['ghost'] } }),
    ]
    const { edges } = layoutWhiteboardDag(entries, null, min(1))
    expect(edges.filter((e) => e.type === 'handoff')).toEqual([])
  })

  it('handoff edges participate in layout layering', () => {
    const entries = [
      mk('h1', 'handoff', 'forge', min(0), { refs: { entries: ['s1'] } }),
      mk('s1', 'decision', 'shield', min(2)),
    ]
    const { nodes } = layoutWhiteboardDag(entries, null, min(5))
    const h1 = nodes.find((n) => n.id === 'h1')!
    const s1 = nodes.find((n) => n.id === 's1')!
    expect(h1.layer).toBeLessThan(s1.layer)
  })
})

// ============================================================
// ============================================================

describe('layoutWhiteboardDag — ref edges', () => {
  it('non-handoff entry refs.entries generates ref edges', () => {
    const entries = [
      mk('A', 'artifact', 'forge', min(0)),
      mk('B', 'artifact', 'shield', min(1), { refs: { entries: ['A'] } }),
    ]
    const { edges } = layoutWhiteboardDag(entries, null, min(5))
    const refs = edges.filter((e) => e.type === 'ref')
    expect(refs).toHaveLength(1)
    expect(refs[0].source).toBe('A')
    expect(refs[0].target).toBe('B')
  })

  it('direction→exec refs.entries generates causal edges', () => {
    const entries = [
      mk('A', 'decision', 'forge', min(0)),
      mk('B', 'artifact', 'shield', min(1), { refs: { entries: ['A'] } }),
    ]
    const { edges } = layoutWhiteboardDag(entries, null, min(5))
    const causals = edges.filter((e) => e.type === 'causal')
    expect(causals).toHaveLength(1)
    expect(causals[0].source).toBe('A')
    expect(causals[0].target).toBe('B')
  })
})

// ============================================================
// ============================================================

describe('layoutWhiteboardDag — temporal edges', () => {
  it('same agent consecutive entries creates temporal edges', () => {
    const entries = [
      mk('a', 'decision', 'forge', min(0)),
      mk('b', 'artifact', 'forge', min(1)),
      mk('c', 'progress', 'forge', min(2)),
    ]
    const { edges } = layoutWhiteboardDag(entries, null, min(5))
    const temporals = edges.filter((e) => e.type === 'temporal')
    expect(temporals).toHaveLength(2)
    expect(temporals[0].source).toBe('a')
    expect(temporals[0].target).toBe('b')
    expect(temporals[1].source).toBe('b')
    expect(temporals[1].target).toBe('c')
  })

  it('does not duplicate temporal edges when explicit edge exists', () => {
    const entries = [
      mk('a', 'artifact', 'forge', min(0)),
      mk('b', 'artifact', 'forge', min(1), { refs: { entries: ['a'] } }),
    ]
    const { edges } = layoutWhiteboardDag(entries, null, min(5))
    expect(edges.filter((e) => e.type === 'temporal')).toHaveLength(0)
    expect(edges.filter((e) => e.type === 'ref')).toHaveLength(1)
  })

  it('temporal edges do not affect layering — same bucket no ref means same layer', () => {
    const entries = [
      mk('f1', 'decision', 'forge', min(0)),
      mk('f2', 'artifact', 'forge', min(2)),
      mk('s1', 'progress', 'shield', min(1), { tags: ['unrelated'] }),
    ]
    const { nodes, edges } = layoutWhiteboardDag(entries, null, min(5))
    const temporals = edges.filter((e) => e.type === 'temporal')
    expect(temporals).toHaveLength(1)
    expect(temporals[0].source).toBe('f1')
    expect(temporals[0].target).toBe('f2')
    const f1 = nodes.find((n) => n.id === 'f1')!
    const f2 = nodes.find((n) => n.id === 'f2')!
    expect(f1.layer).toBe(f2.layer)
  })

  it('same agent multiple artifacts no ref → same layer (batch output parallel display)', () => {
    const goal = mkGoal('g1', min(0))
    const entries = [
      mk('a1', 'artifact', 'forge', min(1)),
      mk('a2', 'artifact', 'forge', min(1) + 2000),
      mk('a3', 'artifact', 'forge', min(1) + 4000),
      mk('a4', 'artifact', 'forge', min(2)),
    ]
    const { nodes } = layoutWhiteboardDag(entries, goal, min(5))
    const artifactLayers = nodes.filter((n) => n.type === 'artifact').map((n) => n.layer)
    expect(new Set(artifactLayers).size).toBe(1)
  })

  it('temporal edges not marked critical', () => {
    const goal = mkGoal('g1', min(0))
    const entries = [
      mk('a', 'decision', 'forge', min(1)),
      mk('b', 'artifact', 'forge', min(2)),
    ]
    const { edges } = layoutWhiteboardDag(entries, goal, min(5))
    const temporals = edges.filter((e) => e.type === 'temporal')
    for (const t of temporals) {
      expect(t.isCritical).toBe(false)
    }
  })

  it('goal fanout: goal connects to each agent first entry', () => {
    const goal = mkGoal('g1', min(0))
    const entries = [
      mk('a', 'decision', 'forge', min(1)),
      mk('b', 'artifact', 'shield', min(2)),
    ]
    const { edges } = layoutWhiteboardDag(entries, goal, min(5))
    const goalEdges = edges.filter((e) => e.source === 'g1')
    expect(goalEdges).toHaveLength(2)
    expect(goalEdges.map((e) => e.target).sort()).toEqual(['a', 'b'])
  })

  it(':auto entries temporal edges correctly chained', () => {
    const entries = [
      mk('a', 'decision', 'forge', min(0)),
      mk('b', 'progress', 'forge:auto', min(1)),
      mk('c', 'artifact', 'forge', min(2)),
    ]
    const { edges, nodes } = layoutWhiteboardDag(entries, null, min(5))
    const temporals = edges.filter((e) => e.type === 'temporal')
    expect(temporals).toHaveLength(2)
    expect(nodes.every((n) => n.agent === 'forge')).toBe(true)
  })
})

// ============================================================
// ============================================================

describe('layoutWhiteboardDag — cycle protection', () => {
  it('Mutual references do not infinite-loop', () => {
    const entries = [
      mk('A', 'decision', 'forge', min(0), { refs: { entries: ['B'] } }),
      mk('B', 'artifact', 'shield', min(1), { refs: { entries: ['A'] } }),
    ]
    const { nodes } = layoutWhiteboardDag(entries, null, min(5))
    expect(nodes).toHaveLength(2)
  })

  it('Cycles reachable from root do not infinite-loop', () => {
    const entries = [
      mk('R', 'decision', 'lead', min(0)),
      mk('A', 'artifact', 'forge', min(1), { refs: { entries: ['R', 'B'] } }),
      mk('B', 'progress', 'shield', min(2), { refs: { entries: ['A'] } }),
    ]
    const { nodes } = layoutWhiteboardDag(entries, null, min(5))
    expect(nodes).toHaveLength(3)
  })

  it('self-referencing entry does not infinite loop', () => {
    const entries = [
      mk('S', 'decision', 'forge', min(0), { refs: { entries: ['S'] } }),
    ]
    const { nodes } = layoutWhiteboardDag(entries, null, min(5))
    expect(nodes).toHaveLength(1)
  })
})

// ============================================================
// ============================================================

describe('layoutWhiteboardDag — edge cases', () => {
  it('0 entries + no goal → empty layout', () => {
    const r = layoutWhiteboardDag([], null, T0)
    expect(r.nodes).toEqual([])
    expect(r.edges).toEqual([])
  })

  it('filters status !== active and type === goal', () => {
    const entries: WhiteboardEntry[] = [
      mk('a', 'decision', 'forge', min(0)),
      { ...mk('b', 'artifact', 'forge', min(1)), status: 'archived' },
      mk('c', 'goal', 'compass', min(2)),
    ]
    const r = layoutWhiteboardDag(entries, null, min(3))
    expect(r.nodes.map((n) => n.id)).toEqual(['a'])
  })

  it(':auto suffix normalized to same agent', () => {
    const entries = [
      mk('a', 'decision', 'forge', min(0)),
      mk('b', 'progress', 'forge:auto', min(1)),
    ]
    const { nodes } = layoutWhiteboardDag(entries, null, min(3))
    expect(nodes.every((n) => n.agent === 'forge')).toBe(true)
    expect(nodes.find((n) => n.id === 'b')!.by).toBe('forge:auto')
  })

  it('node width fixed at DAG.NODE_W', () => {
    const entries = [mk('a', 'decision', 'forge', min(0))]
    const { nodes } = layoutWhiteboardDag(entries, null, min(1))
    expect(nodes[0].width).toBe(DAG.NODE_W)
  })

  it('multi-layer layout totalH covers all nodes', () => {
    const entries = [
      mk('A', 'decision', 'forge', min(0)),
      mk('B', 'artifact', 'shield', min(1), { refs: { entries: ['A'] } }),
      mk('C', 'progress', 'compass', min(2), { refs: { entries: ['B'] } }),
    ]
    const { totalH, nodes } = layoutWhiteboardDag(entries, null, min(5))
    expect(totalH).toBeGreaterThan(0)
    const maxY = Math.max(...nodes.map((n) => n.y + n.height))
    expect(totalH).toBeGreaterThanOrEqual(maxY)
  })
})

// ============================================================
// ============================================================

describe('layoutWhiteboardDag — inferred edges', () => {
  it('rule 1: decision → artifact with shared tag cross-agent generates inferred edge', () => {
    const entries = [
      mk('d1', 'decision', 'forge', min(0), { tags: ['auth'] }),
      mk('a1', 'artifact', 'shield', min(2), { tags: ['auth'] }),
    ]
    const { edges } = layoutWhiteboardDag(entries, null, min(5))
    const inferred = edges.filter((e) => e.type === 'inferred')
    expect(inferred).toHaveLength(1)
    expect(inferred[0].source).toBe('d1')
    expect(inferred[0].target).toBe('a1')
  })

  it('rule 1 inverse: same agent does not generate inferred edge', () => {
    const entries = [
      mk('d1', 'decision', 'forge', min(0), { tags: ['auth'] }),
      mk('a1', 'artifact', 'forge', min(2), { tags: ['auth'] }),
    ]
    const { edges } = layoutWhiteboardDag(entries, null, min(5))
    const inferred = edges.filter((e) => e.type === 'inferred')
    expect(inferred).toHaveLength(0)
  })

  it('rule 2: open_question → decision with same tag generates inferred edge', () => {
    const entries = [
      mk('q1', 'open_question', 'forge', min(0), { tags: ['db'] }),
      mk('d1', 'decision', 'shield', min(3), { tags: ['db'] }),
    ]
    const { edges } = layoutWhiteboardDag(entries, null, min(5))
    const inferred = edges.filter((e) => e.type === 'inferred')
    expect(inferred).toHaveLength(1)
    expect(inferred[0].source).toBe('q1')
    expect(inferred[0].target).toBe('d1')
  })

  it('rule 2: same agent question → decision also generates inferred edge', () => {
    const entries = [
      mk('q1', 'open_question', 'forge', min(0), { tags: ['db'] }),
      mk('d1', 'decision', 'forge', min(3), { tags: ['db'] }),
    ]
    const { edges } = layoutWhiteboardDag(entries, null, min(5))
    const inferred = edges.filter((e) => e.type === 'inferred')
    expect(inferred).toHaveLength(1)
  })

  it('rule 3: tagless decision within 10min cross-agent artifact generates inferred edge', () => {
    const entries = [
      mk('d1', 'decision', 'forge', min(0)),
      mk('a1', 'artifact', 'shield', min(5)),
    ]
    const { edges } = layoutWhiteboardDag(entries, null, min(15))
    const inferred = edges.filter((e) => e.type === 'inferred')
    expect(inferred).toHaveLength(1)
    expect(inferred[0].source).toBe('d1')
    expect(inferred[0].target).toBe('a1')
  })

  it('rule 3 inverse: beyond 10min does not generate inferred edge', () => {
    const entries = [
      mk('d1', 'decision', 'forge', min(0)),
      mk('a1', 'artifact', 'shield', min(11)),
    ]
    const { edges } = layoutWhiteboardDag(entries, null, min(15))
    const inferred = edges.filter((e) => e.type === 'inferred')
    expect(inferred).toHaveLength(0)
  })

  it('deduplicate: does not generate inferred edge when ref edge exists', () => {
    const entries = [
      mk('d1', 'decision', 'forge', min(0), { tags: ['auth'] }),
      mk('a1', 'artifact', 'shield', min(2), { refs: { entries: ['d1'] }, tags: ['auth'] }),
    ]
    const { edges } = layoutWhiteboardDag(entries, null, min(5))
    const inferred = edges.filter((e) => e.type === 'inferred')
    expect(inferred).toHaveLength(0)
    const causal = edges.filter((e) => e.type === 'causal')
    expect(causal).toHaveLength(1)
  })

  it('inferred edges participate in layering: source.layer < target.layer', () => {
    const entries = [
      mk('d1', 'decision', 'forge', min(0), { tags: ['auth'] }),
      mk('a1', 'artifact', 'shield', min(0), { tags: ['auth'] }),
    ]
    const { nodes } = layoutWhiteboardDag(entries, null, min(5))
    const d1 = nodes.find((n) => n.id === 'd1')!
    const a1 = nodes.find((n) => n.id === 'a1')!
    expect(d1.layer).toBeLessThan(a1.layer)
  })

  it('inferred edges participate in critical path', () => {
    const goal = mkGoal('g1', min(0))
    const entries = [
      mk('d1', 'decision', 'forge', min(1), { tags: ['auth'] }),
      mk('a1', 'artifact', 'shield', min(2), { tags: ['auth'] }),
    ]
    const { nodes } = layoutWhiteboardDag(entries, goal, min(5))
    const d1 = nodes.find((n) => n.id === 'd1')!
    const a1 = nodes.find((n) => n.id === 'a1')!
    expect(d1.isCritical).toBe(true)
    expect(a1.isCritical).toBe(true)
  })
})

// ============================================================
// layoutWorkflowDag — workflow-based DAG layout
// ============================================================

const mkTask = (
  taskId: string,
  agentId: string,
  status: string,
  dependsOn: string[] = [],
  entrySummary: Record<string, number> = {},
): WorkflowDagTaskNode => ({
  taskId,
  agentId,
  status,
  description: `Task ${taskId}`,
  dependsOn,
  entryCount: Object.values(entrySummary).reduce((s, c) => s + c, 0),
  entrySummary,
})

describe('layoutWorkflowDag — topological sort', () => {
  it('independent tasks placed in same layer', () => {
    const tasks = [
      mkTask('t1', 'forge', 'running'),
      mkTask('t2', 'shield', 'pending'),
    ]
    const { nodes } = layoutWorkflowDag(tasks, [], [], null)
    const t1 = nodes.find((n) => n.id === 'wf-t1')!
    const t2 = nodes.find((n) => n.id === 'wf-t2')!
    expect(t1.layer).toBe(t2.layer)
  })

  it('dependent task placed in later layer', () => {
    const tasks = [
      mkTask('t1', 'forge', 'completed'),
      mkTask('t2', 'shield', 'running', ['t1']),
    ]
    const { nodes } = layoutWorkflowDag(tasks, [], [], null)
    const t1 = nodes.find((n) => n.id === 'wf-t1')!
    const t2 = nodes.find((n) => n.id === 'wf-t2')!
    expect(t1.layer).toBeLessThan(t2.layer)
  })

  it('diamond dependency: A → B, A → C, B → D, C → D', () => {
    const tasks = [
      mkTask('A', 'forge', 'completed'),
      mkTask('B', 'shield', 'completed', ['A']),
      mkTask('C', 'compass', 'completed', ['A']),
      mkTask('D', 'forge', 'running', ['B', 'C']),
    ]
    const { nodes } = layoutWorkflowDag(tasks, [], [], null)
    const a = nodes.find((n) => n.id === 'wf-A')!
    const b = nodes.find((n) => n.id === 'wf-B')!
    const c = nodes.find((n) => n.id === 'wf-C')!
    const d = nodes.find((n) => n.id === 'wf-D')!
    expect(a.layer).toBe(0)
    expect(b.layer).toBe(c.layer)
    expect(b.layer).toBe(1)
    expect(d.layer).toBe(2)
  })

  it('chain: A → B → C → D in sequential layers', () => {
    const tasks = [
      mkTask('A', 'forge', 'completed'),
      mkTask('B', 'shield', 'completed', ['A']),
      mkTask('C', 'forge', 'running', ['B']),
      mkTask('D', 'shield', 'pending', ['C']),
    ]
    const { nodes } = layoutWorkflowDag(tasks, [], [], null)
    const layers = nodes.map((n) => n.layer).sort()
    expect(layers).toEqual([0, 1, 2, 3])
  })
})

describe('layoutWorkflowDag — node positioning', () => {
  it('nodes within same layer share the same x', () => {
    const tasks = [
      mkTask('t1', 'forge', 'running'),
      mkTask('t2', 'shield', 'running'),
      mkTask('t3', 'compass', 'pending'),
    ]
    const { nodes } = layoutWorkflowDag(tasks, [], [], null)
    const xs = nodes.map((n) => n.x)
    expect(new Set(xs).size).toBe(1)
  })

  it('nodes in different layers have increasing x', () => {
    const tasks = [
      mkTask('t1', 'forge', 'completed'),
      mkTask('t2', 'shield', 'running', ['t1']),
    ]
    const { nodes } = layoutWorkflowDag(tasks, [], [], null)
    const t1 = nodes.find((n) => n.id === 'wf-t1')!
    const t2 = nodes.find((n) => n.id === 'wf-t2')!
    expect(t1.x).toBeLessThan(t2.x)
  })

  it('running task gets expanded height', () => {
    const tasks = [
      mkTask('t1', 'forge', 'running'),
      mkTask('t2', 'shield', 'completed'),
    ]
    const { nodes } = layoutWorkflowDag(tasks, [], [], null)
    const t1 = nodes.find((n) => n.id === 'wf-t1')!
    const t2 = nodes.find((n) => n.id === 'wf-t2')!
    expect(t1.height).toBeGreaterThan(t2.height)
  })

  it('totalW and totalH cover all nodes', () => {
    const tasks = [
      mkTask('t1', 'forge', 'completed'),
      mkTask('t2', 'shield', 'running', ['t1']),
      mkTask('t3', 'compass', 'pending', ['t2']),
    ]
    const { nodes, totalW, totalH } = layoutWorkflowDag(tasks, [], [], null)
    const maxRight = Math.max(...nodes.map((n) => n.x + n.width))
    const maxBottom = Math.max(...nodes.map((n) => n.y + n.height))
    expect(totalW).toBeGreaterThanOrEqual(maxRight)
    expect(totalH).toBeGreaterThanOrEqual(maxBottom)
  })
})

describe('layoutWorkflowDag — edges', () => {
  it('creates edges from dependsOn relationships', () => {
    const tasks = [
      mkTask('t1', 'forge', 'completed'),
      mkTask('t2', 'shield', 'running', ['t1']),
    ]
    const { edges } = layoutWorkflowDag(tasks, [], [], null)
    expect(edges).toHaveLength(1)
    expect(edges[0].source).toBe('wf-t1')
    expect(edges[0].target).toBe('wf-t2')
  })

  it('pending task dependency uses temporal edge type', () => {
    const tasks = [
      mkTask('t1', 'forge', 'completed'),
      mkTask('t2', 'shield', 'pending', ['t1']),
    ]
    const { edges } = layoutWorkflowDag(tasks, [], [], null)
    expect(edges[0].type).toBe('temporal')
  })

  it('non-pending task dependency uses causal edge type', () => {
    const tasks = [
      mkTask('t1', 'forge', 'completed'),
      mkTask('t2', 'shield', 'running', ['t1']),
    ]
    const { edges } = layoutWorkflowDag(tasks, [], [], null)
    expect(edges[0].type).toBe('causal')
  })

  it('multiple dependencies create multiple edges', () => {
    const tasks = [
      mkTask('t1', 'forge', 'completed'),
      mkTask('t2', 'shield', 'completed'),
      mkTask('t3', 'compass', 'running', ['t1', 't2']),
    ]
    const { edges } = layoutWorkflowDag(tasks, [], [], null)
    expect(edges).toHaveLength(2)
    expect(edges.map((e) => e.source).sort()).toEqual(['wf-t1', 'wf-t2'])
  })
})

describe('layoutWorkflowDag — edge cases', () => {
  it('empty tasks → empty layout', () => {
    const { nodes, edges } = layoutWorkflowDag([], [], [], null)
    expect(nodes).toEqual([])
    expect(edges).toEqual([])
  })

  it('single task → one node, zero edges', () => {
    const tasks = [mkTask('solo', 'forge', 'running')]
    const { nodes, edges } = layoutWorkflowDag(tasks, [], [], null)
    expect(nodes).toHaveLength(1)
    expect(nodes[0].id).toBe('wf-solo')
    expect(edges).toHaveLength(0)
  })

  it('running task marked as isLive and isCritical', () => {
    const tasks = [mkTask('t1', 'forge', 'running')]
    const { nodes } = layoutWorkflowDag(tasks, [], [], null)
    expect(nodes[0].isLive).toBe(true)
    expect(nodes[0].isCritical).toBe(true)
  })

  it('completed task not marked isLive', () => {
    const tasks = [mkTask('t1', 'forge', 'completed')]
    const { nodes } = layoutWorkflowDag(tasks, [], [], null)
    expect(nodes[0].isLive).toBe(false)
  })

  it('node IDs are prefixed with wf-', () => {
    const tasks = [mkTask('my-task', 'forge', 'pending')]
    const { nodes } = layoutWorkflowDag(tasks, [], [], null)
    expect(nodes[0].id).toBe('wf-my-task')
  })

  it('uses representative entry timestamp when available', () => {
    const tasks = [mkTask('t1', 'forge', 'running')]
    const entry = mk('e1', 'artifact', 'forge', min(5))
    entry.taskId = 't1'
    const { nodes } = layoutWorkflowDag(tasks, [entry], [], null)
    expect(nodes[0].timestamp).toBe(min(5))
  })
})

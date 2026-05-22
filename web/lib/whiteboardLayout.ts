/**
 * whiteboardLayout —  DAG
 *
 *
 *  1.  refentry.refs.entries
 *  2. Handoffhandoff →  agent  entry
 *  3. Goal goal →  agent  entry
 *  4.  agent  entries
 *
 *  →  →  agent
 */

import {
  type WhiteboardEntry,
  type WhiteboardEntryType,
  normalizeAgentId,
} from '@shared/whiteboard-types'

// ============================================================
// ============================================================

export const DAG = {
  NODE_W: 280,
  NODE_MIN_H: 68,
  NODE_MAX_H: 120,
  GAP_X: 56,
  GAP_Y: 24,
  PADDING_X: 40,
  PADDING_Y: 40,
} as const

const TIME_BUCKET_GAP_MS = 5 * 60_000
const INFERRED_WINDOW_MS = 10 * 60_000

const DIRECTION_TYPES = new Set<WhiteboardEntryType>(['goal', 'decision', 'progress'])
const EXEC_TYPES = new Set<WhiteboardEntryType>(['artifact', 'handoff', 'constraint', 'open_question'])

const isCausalRelation = (source: WhiteboardEntry, target: WhiteboardEntry): boolean =>
  DIRECTION_TYPES.has(source.type) && EXEC_TYPES.has(target.type)

const hasSharedTag = (a: WhiteboardEntry, b: WhiteboardEntry): boolean => {
  if (!a.tags?.length || !b.tags?.length) return false
  const setA = new Set(a.tags)
  return b.tags.some((t) => setA.has(t))
}

// ============================================================
// ============================================================

export type ColorGroup = 'direction' | 'orch' | 'exec' | 'signal'

export const typeColorGroup = (type: WhiteboardEntryType): ColorGroup => {
  switch (type) {
    case 'goal':
    case 'decision':
      return 'direction'
    case 'handoff':
      return 'orch'
    case 'artifact':
    case 'progress':
      return 'exec'
    case 'open_question':
    case 'constraint':
      return 'signal'
  }
}

// ============================================================
// ============================================================

export const normalizeAgent = normalizeAgentId

// ============================================================
// ============================================================

export interface DagNode {
  id: string
  by: string
  agent: string
  type: WhiteboardEntryType
  group: ColorGroup
  x: number
  y: number
  width: number
  height: number
  layer: number
  timestamp: number
  isLive: boolean
  isCritical: boolean
  entry: WhiteboardEntry
  causedBySeq?: number
  causedByType?: WhiteboardEntryType
}

export interface DagEdge {
  id: string
  source: string
  target: string
  type: 'handoff' | 'ref' | 'causal' | 'temporal' | 'inferred'
  isCritical: boolean
}

export interface DagLayout {
  nodes: DagNode[]
  edges: DagEdge[]
  totalW: number
  totalH: number
}

// ============================================================
// ============================================================

const computeTimeBuckets = (
  allEntries: WhiteboardEntry[],
  goal: WhiteboardEntry | null,
): Map<string, number> => {
  const result = new Map<string, number>()
  if (allEntries.length === 0) return result

  const sorted = [...allEntries].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  )

  if (goal) result.set(goal.id, 0)

  const nonGoal = sorted.filter((e) => !(goal && e.id === goal.id))
  if (nonGoal.length === 0) return result

  let bucket = goal ? 1 : 0
  let bucketStartTs = Date.parse(nonGoal[0].timestamp)

  result.set(nonGoal[0].id, bucket)

  for (let i = 1; i < nonGoal.length; i++) {
    const curr = nonGoal[i]
    const ts = Date.parse(curr.timestamp)

    if (ts - bucketStartTs >= TIME_BUCKET_GAP_MS) {
      bucket++
      bucketStartTs = ts
    }

    result.set(curr.id, bucket)
  }

  return result
}

// ============================================================
// ============================================================

export const layoutWhiteboardDag = (
  entries: WhiteboardEntry[],
  goal: WhiteboardEntry | null,
  now: number,
): DagLayout => {
  const active = entries
    .filter((e) => e.status === 'active' && e.type !== 'goal')
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  if (active.length === 0 && !goal) {
    return { nodes: [], edges: [], totalW: 0, totalH: 0 }
  }

  const allEntries = goal ? [goal, ...active] : active
  const entryById = new Map(allEntries.map((e) => [e.id, e]))

  const byAgent = new Map<string, WhiteboardEntry[]>()
  for (const e of allEntries) {
    const a = normalizeAgent(e.by)
    const list = byAgent.get(a) ?? []
    list.push(e)
    byAgent.set(a, list)
  }
  for (const list of byAgent.values()) {
    list.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  }

  const childToParents = new Map<string, string[]>()
  const parentToChildren = new Map<string, string[]>()
  const edgeList: DagEdge[] = []

  const addLayoutEdge = (parentId: string, childId: string) => {
    if (parentId === childId) return
    const parents = childToParents.get(childId) ?? []
    if (!parents.includes(parentId)) parents.push(parentId)
    childToParents.set(childId, parents)
    const children = parentToChildren.get(parentId) ?? []
    if (!children.includes(childId)) children.push(childId)
    parentToChildren.set(parentId, children)
  }

  for (const e of allEntries) {
    for (const refId of e.refs?.entries ?? []) {
      if (!entryById.has(refId)) continue
      if (e.type === 'handoff') continue
      const source = entryById.get(refId)!
      const edgeType = isCausalRelation(source, e) ? 'causal' : 'ref'
      addLayoutEdge(refId, e.id)
      edgeList.push({
        id: `${edgeType}-${refId}-${e.id}`,
        source: refId,
        target: e.id,
        type: edgeType,
        isCritical: false,
      })
    }
  }

  for (const e of allEntries) {
    if (e.type !== 'handoff') continue
    const fromAgent = normalizeAgent(e.by)
    const toAgent = extractToAgent(e, entryById, fromAgent)
    if (!toAgent) continue

    const targetList = byAgent.get(toAgent) ?? []
    const targetEntry = targetList.find(
      (t) =>
        t.timestamp.localeCompare(e.timestamp) > 0 && t.type !== 'handoff',
    )
    if (targetEntry) {
      addLayoutEdge(e.id, targetEntry.id)
      edgeList.push({
        id: `handoff-${e.id}-${targetEntry.id}`,
        source: e.id,
        target: targetEntry.id,
        type: 'handoff',
        isCritical: false,
      })
    }
  }

  if (goal) {
    for (const [agent, list] of byAgent) {
      if (agent === normalizeAgent(goal.by) && list[0]?.id === goal.id) {
        if (list.length > 1) {
          const first = list[1]
          if (!childToParents.get(first.id)?.includes(goal.id)) {
            addLayoutEdge(goal.id, first.id)
            edgeList.push({
              id: `goal-fanout-${goal.id}-${first.id}`,
              source: goal.id,
              target: first.id,
              type: 'ref',
              isCritical: false,
            })
          }
        }
      } else {
        const first = list[0]
        if (
          first &&
          first.id !== goal.id &&
          !childToParents.get(first.id)?.includes(goal.id)
        ) {
          addLayoutEdge(goal.id, first.id)
          edgeList.push({
            id: `goal-fanout-${goal.id}-${first.id}`,
            source: goal.id,
            target: first.id,
            type: 'ref',
            isCritical: false,
          })
        }
      }
    }
  }

  const connectedPairSet = new Set<string>()
  for (const e of edgeList) {
    if (e.type !== 'temporal') {
      connectedPairSet.add(`${e.source}::${e.target}`)
      connectedPairSet.add(`${e.target}::${e.source}`)
    }
  }

  const sorted = [...allEntries].sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  for (let i = 0; i < sorted.length; i++) {
    const src = sorted[i]
    const srcAgent = normalizeAgent(src.by)
    const srcTs = Date.parse(src.timestamp)

    for (let j = i + 1; j < sorted.length; j++) {
      const tgt = sorted[j]
      const tgtAgent = normalizeAgent(tgt.by)
      const tgtTs = Date.parse(tgt.timestamp)

      if (connectedPairSet.has(`${src.id}::${tgt.id}`)) continue

      if (
        srcAgent !== tgtAgent &&
        DIRECTION_TYPES.has(src.type) &&
        EXEC_TYPES.has(tgt.type) &&
        hasSharedTag(src, tgt)
      ) {
        addLayoutEdge(src.id, tgt.id)
        edgeList.push({
          id: `inferred-tag-${src.id}-${tgt.id}`,
          source: src.id,
          target: tgt.id,
          type: 'inferred',
          isCritical: false,
        })
        connectedPairSet.add(`${src.id}::${tgt.id}`)
        connectedPairSet.add(`${tgt.id}::${src.id}`)
        continue
      }

      if (
        src.type === 'open_question' &&
        tgt.type === 'decision' &&
        hasSharedTag(src, tgt)
      ) {
        addLayoutEdge(src.id, tgt.id)
        edgeList.push({
          id: `inferred-qd-${src.id}-${tgt.id}`,
          source: src.id,
          target: tgt.id,
          type: 'inferred',
          isCritical: false,
        })
        connectedPairSet.add(`${src.id}::${tgt.id}`)
        connectedPairSet.add(`${tgt.id}::${src.id}`)
        continue
      }

      if (
        srcAgent !== tgtAgent &&
        DIRECTION_TYPES.has(src.type) &&
        EXEC_TYPES.has(tgt.type) &&
        !src.tags?.length &&
        !tgt.tags?.length &&
        tgtTs - srcTs > 0 &&
        tgtTs - srcTs <= INFERRED_WINDOW_MS
      ) {
        addLayoutEdge(src.id, tgt.id)
        edgeList.push({
          id: `inferred-tw-${src.id}-${tgt.id}`,
          source: src.id,
          target: tgt.id,
          type: 'inferred',
          isCritical: false,
        })
        connectedPairSet.add(`${src.id}::${tgt.id}`)
        connectedPairSet.add(`${tgt.id}::${src.id}`)
      }
    }
  }

  for (const [, list] of byAgent) {
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]
      const curr = list[i]
      if (goal && curr.id === goal.id) continue
      if (childToParents.get(curr.id)?.includes(prev.id)) continue
      edgeList.push({
        id: `temporal-${prev.id}-${curr.id}`,
        source: prev.id,
        target: curr.id,
        type: 'temporal',
        isCritical: false,
      })
    }
  }

  const timeBuckets = computeTimeBuckets(allEntries, goal)

  const layerOf = new Map<string, number>()
  for (const e of allEntries) {
    layerOf.set(e.id, timeBuckets.get(e.id) ?? 0)
  }
  if (goal) layerOf.set(goal.id, 0)

  let changed = true
  let iter = 0
  const maxIter = allEntries.length * 4
  while (changed && iter < maxIter) {
    changed = false
    iter++

    for (const e of allEntries) {
      const myLayer = layerOf.get(e.id)!
      for (const childId of parentToChildren.get(e.id) ?? []) {
        if (goal && childId === goal.id) continue
        const childLayer = layerOf.get(childId)!
        if (myLayer >= childLayer) {
          layerOf.set(childId, myLayer + 1)
          changed = true
        }
      }
    }
  }

  let topLayer = 0
  for (const l of layerOf.values()) topLayer = Math.max(topLayer, l)

  const layers: WhiteboardEntry[][] = Array.from(
    { length: topLayer + 1 },
    () => [],
  )
  for (const e of allEntries) {
    layers[layerOf.get(e.id)!].push(e)
  }
  for (const layer of layers) {
    layer.sort((a, b) => {
      const cmp = a.timestamp.localeCompare(b.timestamp)
      if (cmp !== 0) return cmp
      return normalizeAgent(a.by).localeCompare(normalizeAgent(b.by))
    })
  }

  const nodes: DagNode[] = []

  let maxNodesInLayer = 0
  let nonEmptyLayers = 0
  for (const layer of layers) {
    if (layer.length === 0) continue
    nonEmptyLayers++
    maxNodesInLayer = Math.max(maxNodesInLayer, layer.length)
  }

  const totalH =
    DAG.PADDING_Y * 2 +
    maxNodesInLayer * DAG.NODE_MAX_H +
    Math.max(0, maxNodesInLayer - 1) * DAG.GAP_Y
  const totalW =
    DAG.PADDING_X * 2 +
    nonEmptyLayers * DAG.NODE_W +
    Math.max(0, nonEmptyLayers - 1) * DAG.GAP_X

  let colIdx = 0
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li]
    if (layer.length === 0) continue

    const layerH =
      layer.length * DAG.NODE_MAX_H + (layer.length - 1) * DAG.GAP_Y
    const offsetY = (totalH - layerH) / 2
    const x = DAG.PADDING_X + colIdx * (DAG.NODE_W + DAG.GAP_X)

    for (let ni = 0; ni < layer.length; ni++) {
      const e = layer[ni]
      const y = offsetY + ni * (DAG.NODE_MAX_H + DAG.GAP_Y)
      const ts = Date.parse(e.timestamp)

      nodes.push({
        id: e.id,
        by: e.by,
        agent: normalizeAgent(e.by),
        type: e.type,
        group: typeColorGroup(e.type),
        x,
        y,
        width: DAG.NODE_W,
        height: DAG.NODE_MAX_H,
        layer: li,
        timestamp: ts,
        isLive: now - ts < 5 * 60_000 && !parentToChildren.has(e.id),
        isCritical: false,
        entry: e,
      })
    }
    colIdx++
  }

  for (const n of nodes) {
    const parentId = n.entry.refs?.entries?.[0]
    if (parentId) {
      const parentEntry = entryById.get(parentId)
      if (parentEntry) {
        n.causedBySeq = parentEntry.seq
        n.causedByType = parentEntry.type
      }
    }
  }

  if (goal) {
    const dist = new Map<string, number>()
    dist.set(goal.id, 0)

    for (const layer of layers) {
      for (const e of layer) {
        const d = dist.get(e.id)
        if (d === undefined) continue
        for (const childId of parentToChildren.get(e.id) ?? []) {
          const existing = dist.get(childId) ?? -1
          if (d + 1 > existing) {
            dist.set(childId, d + 1)
          }
        }
      }
    }

    let maxDist = 0
    for (const d of dist.values()) maxDist = Math.max(maxDist, d)

    if (maxDist > 0) {
      const criticalIds = new Set<string>()
      const backQueue = [...dist.entries()]
        .filter(([, d]) => d === maxDist)
        .map(([id]) => id)
      const backSeen = new Set<string>()

      while (backQueue.length > 0) {
        const id = backQueue.shift()!
        if (backSeen.has(id)) continue
        backSeen.add(id)
        criticalIds.add(id)
        const myDist = dist.get(id)!
        for (const parentId of childToParents.get(id) ?? []) {
          const parentDist = dist.get(parentId)
          if (parentDist !== undefined && parentDist === myDist - 1) {
            backQueue.push(parentId)
          }
        }
      }

      for (const n of nodes) {
        n.isCritical = criticalIds.has(n.id)
      }
      for (const e of edgeList) {
        e.isCritical =
          criticalIds.has(e.source) &&
          criticalIds.has(e.target) &&
          e.type !== 'temporal'
      }
    }
  }

  return {
    nodes,
    edges: edgeList,
    totalW: Math.max(totalW, 400),
    totalH: Math.max(totalH, 200),
  }
}

// ============================================================
// Helpers
// ============================================================

const extractToAgent = (
  handoff: WhiteboardEntry,
  entryById: Map<string, WhiteboardEntry>,
  fromAgent: string,
): string | undefined => {
  for (const refId of handoff.refs?.entries ?? []) {
    const ref = entryById.get(refId)
    if (ref && normalizeAgent(ref.by) !== fromAgent)
      return normalizeAgent(ref.by)
  }
  const m = handoff.summary.match(/→\s*([\w\-:]+)/)
  return m?.[1] ? normalizeAgent(m[1]) : undefined
}

// ============================================================
// ============================================================

export type { WhiteboardEntry }

export interface RenderableSpan {
  id: string
  by: string
  agent: string
  type: WhiteboardEntryType
  group: ColorGroup
  laneIdx: number
  rowIdx: number
  startTs: number
  endTs: number
  durationMs: number
  x: number
  width: number
  y: number
  isLive: boolean
  isCritical: boolean
  entry: WhiteboardEntry
}

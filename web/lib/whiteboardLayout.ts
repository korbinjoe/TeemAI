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
  NODE_W: 220,
  NODE_MIN_H: 56,
  NODE_MAX_H: 80,
  GAP_X: 48,
  GAP_Y: 16,
  PADDING_X: 32,
  PADDING_Y: 32,
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
  label?: string
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

  const handoffTargetAgent = new Map<string, string>()
  for (const e of allEntries) {
    if (e.type !== 'handoff') continue
    const toAgent = extractToAgent(e, entryById, normalizeAgent(e.by))
    if (toAgent) handoffTargetAgent.set(e.id, toAgent)
  }

  const agentOf = (e: WhiteboardEntry) =>
    handoffTargetAgent.get(e.id) ?? normalizeAgent(e.by)

  const byAgent = new Map<string, WhiteboardEntry[]>()
  for (const e of allEntries) {
    const a = agentOf(e)
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
    const toAgent = handoffTargetAgent.get(e.id)
    if (!toAgent) continue

    const fromList = byAgent.get(fromAgent) ?? []
    const sourceEntry = [...fromList].reverse().find(
      (s) => s.timestamp.localeCompare(e.timestamp) <= 0,
    )

    if (sourceEntry) {
      addLayoutEdge(sourceEntry.id, e.id)
      edgeList.push({
        id: `handoff-${sourceEntry.id}-${e.id}`,
        source: sourceEntry.id,
        target: e.id,
        type: 'handoff',
        label: 'Handoff',
        isCritical: false,
      })
    }
  }

  if (goal) {
    for (const e of allEntries) {
      if (e.id === goal.id) continue
      if (e.type === 'handoff') {
        if (!childToParents.get(e.id)?.includes(goal.id)) {
          addLayoutEdge(goal.id, e.id)
          edgeList.push({
            id: `goal-fanout-${goal.id}-${e.id}`,
            source: goal.id,
            target: e.id,
            type: 'causal',
            isCritical: false,
          })
        }
      }
    }

    for (const [agent, list] of byAgent) {
      const first = agent === normalizeAgent(goal.by) && list[0]?.id === goal.id
        ? list[1]
        : list[0]
      if (
        first &&
        first.id !== goal.id &&
        first.type !== 'handoff' &&
        !(childToParents.get(first.id)?.length)
      ) {
        addLayoutEdge(goal.id, first.id)
        edgeList.push({
          id: `goal-fanout-${goal.id}-${first.id}`,
          source: goal.id,
          target: first.id,
          type: 'causal',
          isCritical: false,
        })
      }
    }
  }

  for (const e of allEntries) {
    if (e.type !== 'artifact') continue
    if (childToParents.get(e.id)?.length) continue
    const artAgent = agentOf(e)
    const artTs = Date.parse(e.timestamp)

    let bestHandoff: WhiteboardEntry | undefined
    for (const h of allEntries) {
      if (h.type !== 'handoff') continue
      const hTarget = handoffTargetAgent.get(h.id)
      if (hTarget !== artAgent) continue
      const hTs = Date.parse(h.timestamp)
      if (hTs > artTs) continue
      if (!bestHandoff || hTs > Date.parse(bestHandoff.timestamp)) bestHandoff = h
    }
    if (bestHandoff) {
      addLayoutEdge(bestHandoff.id, e.id)
      edgeList.push({
        id: `handoff-artifact-${bestHandoff.id}-${e.id}`,
        source: bestHandoff.id,
        target: e.id,
        type: 'causal',
        isCritical: false,
      })
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
    const srcAgent = agentOf(src)
    const srcTs = Date.parse(src.timestamp)

    for (let j = i + 1; j < sorted.length; j++) {
      const tgt = sorted[j]
      const tgtAgent = agentOf(tgt)
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
      const fromHandoff = prev.type === 'handoff'
      if (fromHandoff) addLayoutEdge(prev.id, curr.id)
      edgeList.push({
        id: `${fromHandoff ? 'causal' : 'temporal'}-${prev.id}-${curr.id}`,
        source: prev.id,
        target: curr.id,
        type: fromHandoff ? 'causal' : 'temporal',
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
      return agentOf(a).localeCompare(agentOf(b))
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
        agent: agentOf(e),
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
  const tags = handoff.tags ?? []
  if (tags.length >= 3 && tags[0] === 'handoff') {
    const tagTo = normalizeAgent(tags[2])
    if (tagTo && tagTo !== fromAgent) return tagTo
  }
  const m = handoff.summary.match(/→\s*([\w\-]+)/)
  return m?.[1] ? normalizeAgent(m[1].toLowerCase()) : undefined
}

// ============================================================
// ============================================================

// ============================================================
// Workflow DAG layout — uses explicit task graph as skeleton
// ============================================================

export interface WorkflowDagTaskNode {
  taskId: string
  agentId: string
  status: string
  description: string
  dependsOn: string[]
  entryCount: number
  entrySummary: Record<string, number>
}

const WORKFLOW_DAG = {
  NODE_W: 240,
  NODE_H: 80,
  NODE_RUNNING_H: 104,
  GAP_X: 60,
  GAP_Y: 24,
  PADDING_X: 40,
  PADDING_Y: 40,
  GOAL_H: 40,
} as const

export const layoutWorkflowDag = (
  workflowTasks: WorkflowDagTaskNode[],
  entries: WhiteboardEntry[],
  _floatingEntries: WhiteboardEntry[],
  goal: WhiteboardEntry | null,
): DagLayout => {
  const nodes: DagNode[] = []
  const edges: DagEdge[] = []

  const layers = topoSort(workflowTasks)
  const taskIndex = new Map(workflowTasks.map((t) => [t.taskId, t]))

  const entriesByTask = new Map<string, WhiteboardEntry[]>()
  for (const e of entries) {
    if (!e.taskId) continue
    const list = entriesByTask.get(e.taskId) ?? []
    list.push(e)
    entriesByTask.set(e.taskId, list)
  }

  let yOffset = WORKFLOW_DAG.PADDING_Y
  if (goal) {
    yOffset += WORKFLOW_DAG.GOAL_H + WORKFLOW_DAG.GAP_Y
  }

  let maxY = yOffset
  const taskPositions = new Map<string, { x: number; y: number; h: number }>()

  for (let col = 0; col < layers.length; col++) {
    const layer = layers[col]
    const x = WORKFLOW_DAG.PADDING_X + col * (WORKFLOW_DAG.NODE_W + WORKFLOW_DAG.GAP_X)
    let y = yOffset

    for (const taskId of layer) {
      const task = taskIndex.get(taskId)
      if (!task) continue

      const h = task.status === 'running'
        ? WORKFLOW_DAG.NODE_RUNNING_H
        : WORKFLOW_DAG.NODE_H

      taskPositions.set(taskId, { x, y, h })

      const taskEntries = entriesByTask.get(taskId) ?? []
      const representative = taskEntries[0]

      nodes.push({
        id: `wf-${taskId}`,
        by: task.agentId,
        agent: task.agentId,
        type: 'progress',
        group: 'exec',
        x,
        y,
        width: WORKFLOW_DAG.NODE_W,
        height: h,
        layer: col,
        timestamp: representative ? Date.parse(representative.timestamp) : Date.now(),
        isLive: task.status === 'running',
        isCritical: task.status === 'running',
        entry: representative ?? {
          id: `wf-${taskId}`,
          chatId: '',
          seq: 0,
          type: 'progress',
          by: task.agentId,
          summary: task.description,
          status: 'active',
          timestamp: new Date().toISOString(),
          taskId,
        } as WhiteboardEntry,
        causedBySeq: undefined,
        causedByType: undefined,
      })

      y += h + WORKFLOW_DAG.GAP_Y
    }
    maxY = Math.max(maxY, y)
  }

  for (const task of workflowTasks) {
    for (const depId of task.dependsOn) {
      if (taskPositions.has(depId) && taskPositions.has(task.taskId)) {
        edges.push({
          id: `wf-edge-${depId}-${task.taskId}`,
          source: `wf-${depId}`,
          target: `wf-${task.taskId}`,
          type: task.status === 'pending' ? 'temporal' : 'causal',
          isCritical: false,
        })
      }
    }
  }

  const totalW = WORKFLOW_DAG.PADDING_X * 2 + layers.length * (WORKFLOW_DAG.NODE_W + WORKFLOW_DAG.GAP_X)
  const totalH = maxY + WORKFLOW_DAG.PADDING_Y

  return { nodes, edges, totalW: Math.max(totalW, 400), totalH: Math.max(totalH, 200) }
}

const topoSort = (tasks: WorkflowDagTaskNode[]): string[][] => {
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const t of tasks) {
    inDegree.set(t.taskId, 0)
    adj.set(t.taskId, [])
  }
  for (const t of tasks) {
    for (const dep of t.dependsOn) {
      if (adj.has(dep)) {
        adj.get(dep)!.push(t.taskId)
        inDegree.set(t.taskId, (inDegree.get(t.taskId) ?? 0) + 1)
      }
    }
  }

  const layers: string[][] = []
  let queue = [...inDegree.entries()].filter(([, d]) => d === 0).map(([id]) => id)

  while (queue.length > 0) {
    layers.push(queue)
    const next: string[] = []
    for (const id of queue) {
      for (const child of adj.get(id) ?? []) {
        const deg = (inDegree.get(child) ?? 1) - 1
        inDegree.set(child, deg)
        if (deg === 0) next.push(child)
      }
    }
    queue = next
  }

  return layers
}

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

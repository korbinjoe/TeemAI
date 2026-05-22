interface DiffEntry {
  file: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  staged?: boolean
  insertions: number
  deletions: number
}

export type ChangeStatus = DiffEntry['status']

export interface DirAggregate {
  count: number
  dominant: ChangeStatus
}

export interface ChangeTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  status?: ChangeStatus
  insertions?: number
  deletions?: number
  children?: ChangeTreeNode[]
}

export const buildChangeMap = (entries: DiffEntry[]): Map<string, DiffEntry> => {
  const map = new Map<string, DiffEntry>()
  for (const e of entries) {
    map.set(e.file, e)
  }
  return map
}

export const buildDirAggregate = (entries: DiffEntry[]): Map<string, DirAggregate> => {
  const dirFiles = new Map<string, ChangeStatus[]>()

  for (const e of entries) {
    const parts = e.file.split('/')
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/')
      const arr = dirFiles.get(dir) || []
      arr.push(e.status)
      dirFiles.set(dir, arr)
    }
  }

  const result = new Map<string, DirAggregate>()
  for (const [dir, statuses] of dirFiles) {
    const allSame = statuses.every(s => s === statuses[0])
    result.set(dir, {
      count: statuses.length,
      dominant: allSame ? statuses[0] : 'modified',
    })
  }
  return result
}

export const buildChangeTree = (entries: DiffEntry[]): ChangeTreeNode[] => {
  const root: ChangeTreeNode[] = []
  const dirMap = new Map<string, ChangeTreeNode>()

  const ensureDir = (dirPath: string): ChangeTreeNode => {
    const existing = dirMap.get(dirPath)
    if (existing) return existing

    const parts = dirPath.split('/')
    const name = parts[parts.length - 1]
    const node: ChangeTreeNode = { name, path: dirPath, type: 'directory', children: [] }
    dirMap.set(dirPath, node)

    if (parts.length === 1) {
      root.push(node)
    } else {
      const parentPath = parts.slice(0, -1).join('/')
      const parent = ensureDir(parentPath)
      parent.children!.push(node)
    }
    return node
  }

  for (const e of entries) {
    const parts = e.file.split('/')
    const name = parts[parts.length - 1]
    const fileNode: ChangeTreeNode = {
      name,
      path: e.file,
      type: 'file',
      status: e.status,
      insertions: e.insertions,
      deletions: e.deletions,
    }

    if (parts.length === 1) {
      root.push(fileNode)
    } else {
      const parentPath = parts.slice(0, -1).join('/')
      const parent = ensureDir(parentPath)
      parent.children!.push(fileNode)
    }
  }

  const sortNodes = (nodes: ChangeTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const n of nodes) {
      if (n.children) sortNodes(n.children)
    }
  }
  sortNodes(root)
  return root
}

export const getChangedDirs = (entries: DiffEntry[]): Set<string> => {
  const dirs = new Set<string>()
  for (const e of entries) {
    const parts = e.file.split('/')
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join('/'))
    }
  }
  return dirs
}

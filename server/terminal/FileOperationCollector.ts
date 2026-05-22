/**
 * FileOperationCollector -  Agent
 *
 *  ActivityDeriver  activity  fileOp
 * 500ms  on('file-operations')
 */

import { EventEmitter } from 'events'
import type { ActivityState } from './ActivityDeriver'

export interface FileOperationEvent {
  timestamp: number
  agentId: string
  tool: string
  filePath: string
  operation: 'create' | 'edit' | 'delete' | 'read'
}

export class FileOperationCollector extends EventEmitter {
  private buffer: FileOperationEvent[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private agentId: string

  constructor(agentId: string) {
    super()
    this.agentId = agentId
  }

  /**  ActivityDeriver  activity  */
  onActivity(activity: ActivityState): void {
    if (activity.phase !== 'tool_running' || !activity.fileOp) return

    const last = this.buffer[this.buffer.length - 1]
    if (last?.filePath === activity.fileOp.path && last?.operation === activity.fileOp.operation) return

    this.buffer.push({
      timestamp: Date.now(),
      agentId: this.agentId,
      tool: activity.currentTool || 'unknown',
      filePath: activity.fileOp.path,
      operation: activity.fileOp.operation,
    })

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 500)
    }
  }

  private flush(): void {
    this.flushTimer = null
    if (this.buffer.length === 0) return
    const ops = [...this.buffer]
    this.buffer = []
    this.emit('file-operations', ops)
  }

  flushNow(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    this.flush()
  }

  destroy(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.removeAllListeners()
  }
}

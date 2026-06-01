/**
 * Whiteboard HTTP  — chat
 *
 *  WS whiteboard:entry-added / archived
 *  -  / chat  getSnapshot
 *  -  WS  store
 */

import { api } from './api'
import type {
  WhiteboardEntry,
  WhiteboardEntryInput,
  WhiteboardSnapshotWithWorkflow,
  WhiteboardQueryOptions,
} from '@shared/whiteboard-types'

const base = (chatId: string) => `/api/chats/${encodeURIComponent(chatId)}/whiteboard`

const buildQuery = (opts?: WhiteboardQueryOptions): string => {
  if (!opts) return ''
  const params = new URLSearchParams()
  if (opts.types?.length) params.set('types', opts.types.join(','))
  if (opts.byAgent) params.set('byAgent', opts.byAgent)
  if (opts.tags?.length) params.set('tags', opts.tags.join(','))
  if (opts.sinceTs) params.set('sinceTs', opts.sinceTs)
  if (opts.status) params.set('status', opts.status)
  if (opts.limit != null) params.set('limit', String(opts.limit))
  const s = params.toString()
  return s ? `?${s}` : ''
}

export const whiteboardService = {
  getSnapshot: (chatId: string, includeWorkflow = true) =>
    api.get<WhiteboardSnapshotWithWorkflow>(
      `${base(chatId)}/snapshot${includeWorkflow ? '?includeWorkflow=true' : ''}`,
    ),

  queryEntries: (chatId: string, opts?: WhiteboardQueryOptions) =>
    api.get<{ entries: WhiteboardEntry[] }>(`${base(chatId)}/entries${buildQuery(opts)}`),

  appendEntry: (chatId: string, input: WhiteboardEntryInput) =>
    api.post<{ entry: WhiteboardEntry }>(`${base(chatId)}/entries`, input),

  supersede: (chatId: string, entryId: string, input: WhiteboardEntryInput) =>
    api.post<{ entry: WhiteboardEntry }>(
      `${base(chatId)}/entries/${encodeURIComponent(entryId)}/supersede`,
      input,
    ),

  archive: (chatId: string, entryId: string, by: string) =>
    api.post<{ ok: true }>(
      `${base(chatId)}/entries/${encodeURIComponent(entryId)}/archive`,
      { by },
    ),
}

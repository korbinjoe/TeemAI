/**
 * WorktreeSessionBadges —  worktree sessions  IDE
 */

import { useState } from 'react'
import { GitBranch, ExternalLink, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorktreeSession } from '@/types/chat'

import { API_BASE, authFetch } from '@/config/api'

interface Repository {
  id: string
  path: string
  name: string
}

interface Props {
  sessions: WorktreeSession[]
  repositories?: Repository[]
  className?: string
}

const statusColor: Record<string, string> = {
  active: 'text-accent-green bg-accent-green/10 border-accent-green/20',
  merged: 'text-accent-brand bg-accent-brand/10 border-accent-brand/20',
  abandoned: 'text-text-secondary bg-bg-hover-muted border-border',
}

const getRepoName = (session: WorktreeSession, repositories?: Repository[]) => {
  if (repositories) {
    const repo = repositories.find((r) => r.id === session.repositoryId)
    if (repo) return repo.name
  }
  const parts = session.worktreePath.split('/.worktrees/')
  if (parts.length >= 2) {
    return parts[0].split('/').pop() || 'repo'
  }
  return 'repo'
}

const WorktreeSessionBadges = ({ sessions, repositories, className }: Props) => {
  if (!sessions || sessions.length === 0) return null

  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {sessions.map((session) => (
        <WorktreeSessionBadge
          key={session.id}
          session={session}
          repoName={getRepoName(session, repositories)}
        />
      ))}
    </div>
  )
}

const WorktreeSessionBadge = ({
  session,
  repoName,
}: {
  session: WorktreeSession
  repoName: string
}) => {
  const [opening, setOpening] = useState(false)

  const handleOpenInIde = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setOpening(true)
    try {
      await authFetch(`${API_BASE}/api/open-in-ide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: session.worktreePath }),
      })
    } catch { /* ignore */ } finally {
      setOpening(false)
    }
  }

  const colors = statusColor[session.status] || statusColor.abandoned

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-mono',
        colors,
      )}
    >
      <GitBranch size={10} className="shrink-0" />
      <span className="text-text-secondary font-sans">{repoName}</span>
      <span className="opacity-30">/</span>
      <span className="truncate max-w-[120px]">{session.branch}</span>
      <button
        onClick={handleOpenInIde}
        onKeyDown={(e) => { if (e.key === 'Enter') handleOpenInIde(e as unknown as React.MouseEvent) }}
        aria-label={`Open ${session.worktreePath} in IDE`}
        tabIndex={0}
        disabled={opening}
        className="shrink-0 p-0.5 rounded-sm hover:bg-white/10 transition-colors disabled:opacity-50"
        title="Open in IDE"
      >
        {opening ? <Loader2 size={9} className="animate-spin" /> : <ExternalLink size={9} />}
      </button>
    </span>
  )
}

export default WorktreeSessionBadges

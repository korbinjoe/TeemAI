import { useParams } from 'react-router-dom'
import { FolderOpen, GitFork } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import AgentAvatar from '@/components/ui/agent-avatar'
import PendingChangesPanel from '@/components/workspace/PendingChangesPanel'
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader'
import RepositorySection from '@/components/workspace/RepositorySection'
import ChatList from '@/components/workspace/ChatList'
import WorkspaceTokenUsage from '@/components/workspace/WorkspaceTokenUsage'
import {
  NewChatDialog,
  DeleteChatDialog,
  AddRepoDialog,
  RemoveRepoDialog,
  CleanWorktreesDialog,
} from '@/components/workspace/WorkspaceDialogs'
import { useWorkspaceDetail } from '@/hooks/useWorkspaceDetail'

/* ── SummaryChip ─────────────────────────────────────────── */

const SummaryChip = ({ icon, label, value }: {
  icon: React.ReactNode; label: string; value: string
}) => (
  <div className="flex items-center gap-1.5 py-1.5 px-3 rounded-[6px] border border-border bg-bg-hover-subtle">
    <span className="text-text-secondary flex shrink-0">{icon}</span>
    <span className="text-xs text-text-secondary">{label}:</span>
    <span className="text-xs text-text-primary font-medium">{value}</span>
  </div>
)

/* ── Page ────────────────────────────────────────────────── */

const WorkspaceDetailPage = () => {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const ws = useWorkspaceDetail(workspaceId)

  if (ws.loading || !ws.workspace) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary">
        {ws.t('workspace:loading')}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      <WorkspaceHeader
        workspaceId={ws.workspace.id}
        workspaceName={ws.workspace.name}
        isEditingName={ws.isEditingName}
        nameDraft={ws.nameDraft}
        setNameDraft={ws.setNameDraft}
        nameInputRef={ws.nameInputRef}
        onStartRename={ws.startRenamingWorkspace}
        onNameSave={ws.handleNameSave}
        onNameCancel={ws.handleNameCancel}
        onNewChat={() => ws.setNewChatModalOpen(true)}
        t={ws.t}
      />

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-[800px] mx-auto">

          {/* Summary bar */}
          <div className="flex gap-3 mb-5 flex-wrap">
            {ws.workspace.agentTeam?.primaryAgentId && (
              <SummaryChip
                icon={<AgentAvatar name={ws.workspace.agentTeam.primaryAgentId} agentId={ws.workspace.agentTeam.primaryAgentId} size="xs" />}
                label={ws.t('workspace:detail.lead')}
                value={ws.workspace.agentTeam.primaryAgentId}
              />
            )}
            {ws.workspace.agentTeam?.teamAgentIds && ws.workspace.agentTeam.teamAgentIds.length > 0 && (
              <SummaryChip
                icon={<AgentAvatar name={ws.workspace.agentTeam.teamAgentIds[0]} agentId={ws.workspace.agentTeam.teamAgentIds[0]} size="xs" />}
                label={ws.t('workspace:detail.expert')}
                value={ws.workspace.agentTeam.teamAgentIds.join(', ')}
              />
            )}
            <SummaryChip
              icon={<FolderOpen size={12} />}
              label={ws.t('workspace:repos')}
              value={`${ws.workspace.repositories.length}`}
            />
          </div>

          {/* Branch Isolation */}
          <div className="border border-border rounded-md mb-5 px-3.5 py-3">
            <div className="flex items-center gap-2">
              <GitFork size={13} className="text-text-secondary shrink-0" />
              <span className="text-xs font-semibold text-text-emphasis">{ws.t('workspace:worktreeIsolation')}</span>
              <span className="flex-1" />
              <Switch
                checked={ws.workspace.worktreeEnabled ?? false}
                onCheckedChange={ws.handleWorktreeToggle}
                aria-label={ws.t('workspace:worktreeIsolation')}
              />
            </div>
            <p className="text-xs text-text-secondary mt-1.5 leading-relaxed pl-[21px]">
              {ws.t('workspace:worktreeIsolationDesc')}
            </p>
          </div>

          {/* Repositories */}
          <RepositorySection
            repositories={ws.workspace.repositories}
            expanded={ws.reposExpanded}
            onToggleExpand={() => ws.setReposExpanded((v) => !v)}
            onAddRepo={ws.handleOpenAddRepo}
            onRemoveRepo={ws.setRemoveRepoConfirm}
            onCleanWorktrees={ws.setCleanRepoConfirm}
            isDefault={ws.workspace.id === 'default'}
            t={ws.t}
          />

          {/* Pending Changes */}
          <PendingChangesPanel
            key={ws.pendingChangesKey}
            repositories={ws.pendingRepos}
            workspaceId={ws.workspace.id}
          />

          {/* Token Usage */}
          <WorkspaceTokenUsage workspaceId={ws.workspace.id} />

          {/* Chat list */}
          <ChatList
            chats={ws.chats}
            repositories={ws.workspace.repositories}
            onOpenChat={(chatId) => ws.navigate(`/workspace/${ws.workspace!.id}/chat/${chatId}`)}
            onDeleteChat={ws.handleDeleteChat}
            t={ws.t}
          />
        </div>
      </div>

      {/* Dialogs */}
      <NewChatDialog
        open={ws.newChatModalOpen}
        onOpenChange={ws.setNewChatModalOpen}
        creating={ws.creating}
        onCreateChat={ws.handleCreateChat}
        t={ws.t}
      />
      <DeleteChatDialog
        open={ws.deleteConfirmOpen}
        onOpenChange={ws.setDeleteConfirmOpen}
        chats={ws.chats}
        deleteChatId={ws.deleteChatId}
        onConfirm={ws.confirmDeleteChat}
        t={ws.t}
      />
      <AddRepoDialog
        open={ws.addRepoOpen}
        onOpenChange={ws.setAddRepoOpen}
        repoSearch={ws.repoSearch}
        onSearchChange={ws.handleRepoSearchChange}
        searchLoading={ws.searchLoading}
        searchResults={ws.searchResults}
        selectedPath={ws.selectedPath}
        detecting={ws.detecting}
        isGitRepo={ws.isGitRepo}
        addingRepo={ws.addingRepo}
        onSelectPath={ws.handleSelectPath}
        onAddRepo={ws.handleAddRepo}
        t={ws.t}
      />
      <RemoveRepoDialog
        repo={ws.removeRepoConfirm}
        onClose={() => ws.setRemoveRepoConfirm(null)}
        onConfirm={ws.handleRemoveRepo}
        t={ws.t}
      />
      <CleanWorktreesDialog
        repo={ws.cleanRepoConfirm}
        cleaning={ws.cleaning}
        onClose={() => ws.setCleanRepoConfirm(null)}
        onConfirm={ws.handleCleanWorktrees}
        t={ws.t}
      />
    </div>
  )
}

export default WorkspaceDetailPage

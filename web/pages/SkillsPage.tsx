import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  Plus, Search, RefreshCw, Trash2, Sparkles, ToggleLeft, ToggleRight, Loader2,
  FolderOpen, Eye, FileText,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { SkillDefinition } from '../types/agentConfig'
import { isElectron, ELECTRON_TITLEBAR_PADDING } from '../utils/env'

import { API_BASE, authFetch } from '@/config/api'

type SourceFilter = 'all' | 'builtin' | 'custom'

const SkillsPage = () => {
  const { t } = useTranslation(['workspace', 'common', 'agents'])
  const [skills, setSkills] = useState<SkillDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SkillDefinition | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newSkill, setNewSkill] = useState({ name: '', description: '', content: '' })

  // Preview Dialog
  const [previewSkill, setPreviewSkill] = useState<SkillDefinition | null>(null)
  const [previewContent, setPreviewContent] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)

  const fetchSkills = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`${API_BASE}/api/skills`)
      if (!res.ok) throw new Error()
      setSkills(await res.json())
    } catch {
      toast.error('Failed to fetch skills')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSkills() }, [fetchSkills])

  const filtered = useMemo(() => {
    let list = skills
    if (sourceFilter !== 'all') {
      list = list.filter((s) => s.source === sourceFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((s) =>
        s.name.toLowerCase().includes(q)
        || s.description.toLowerCase().includes(q),
      )
    }
    return list
  }, [skills, sourceFilter, search])

  const builtinSkills = useMemo(() => filtered.filter((s) => s.source === 'builtin'), [filtered])
  const customSkills = useMemo(() => filtered.filter((s) => s.source === 'custom'), [filtered])

  const handleDelete = (skill: SkillDefinition) => {
    setDeleteTarget(skill)
    setDeleteConfirmOpen(true)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await authFetch(`${API_BASE}/api/skills/${encodeURIComponent(deleteTarget.name)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Skill deleted')
      fetchSkills()
    } catch {
      toast.error('Failed to delete skill')
    } finally {
      setDeleteConfirmOpen(false)
      setDeleteTarget(null)
    }
  }

  const handleCreate = async () => {
    if (!newSkill.name.trim() || !newSkill.description.trim()) return
    try {
      const res = await authFetch(`${API_BASE}/api/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newSkill,
          name: newSkill.name.trim(),
          description: newSkill.description.trim(),
          enabled: true,
          source: 'custom',
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Skill created')
      setCreateOpen(false)
      setNewSkill({ name: '', description: '', content: '' })
      fetchSkills()
    } catch {
      toast.error('Failed to create skill')
    }
  }

  const handlePreview = async (skill: SkillDefinition) => {
    setPreviewSkill(skill)
    setPreviewLoading(true)
    try {
      const res = await authFetch(`${API_BASE}/api/skills/${encodeURIComponent(skill.name)}/content`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setPreviewContent(data.content || skill.content)
    } catch {
      setPreviewContent(skill.content)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleReveal = async (skill: SkillDefinition) => {
    try {
      const res = await authFetch(`${API_BASE}/api/skills/${encodeURIComponent(skill.name)}/reveal`, { method: 'POST' })
      if (!res.ok) throw new Error()
    } catch {
      toast.error('Failed to open directory')
    }
  }

  const sourceFilters: Array<{ label: string; value: SourceFilter }> = [
    { label: t('agents:filter.all'), value: 'all' },
    { label: t('common:source.builtin'), value: 'builtin' },
    { label: t('common:source.custom'), value: 'custom' },
  ]

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* Header */}
      <div
        className={cn(
          'h-9 border-b border-border-subtle flex items-center px-2.5 gap-1.5 shrink-0',
          isElectron && '-webkit-app-region-drag',
        )}
        style={{ paddingLeft: isElectron ? ELECTRON_TITLEBAR_PADDING : 14 }}
      >
        <Sparkles size={14} className="text-text-emphasis" />
        <span className="text-xs font-semibold text-text-emphasis">Skills</span>

        <div className="-webkit-app-region-no-drag flex-1 max-w-[240px] flex items-center gap-[6px] bg-bg-input border border-border rounded-md px-2.5 py-1">
          <Search size={12} className="text-text-secondary shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search skills..."
            className="bg-transparent border-none outline-none text-text-primary text-xs w-full"
          />
        </div>

        <div className="-webkit-app-region-no-drag flex gap-0.5">
          {sourceFilters.map((sf) => (
            <button
              key={sf.value}
              onClick={() => setSourceFilter(sf.value)}
              className={cn(
                'px-2.5 py-[3px] rounded-sm border-none text-xs cursor-pointer transition-all',
                sourceFilter === sf.value
                  ? 'bg-accent-brand/15 text-accent-brand font-medium'
                  : 'bg-transparent text-text-secondary font-normal',
              )}
            >
              {sf.label}
            </button>
          ))}
        </div>

        <span className="flex-1" />

        <div className="-webkit-app-region-no-drag flex gap-1">
          <button
            onClick={fetchSkills}
            title="Refresh"
            aria-label="Refresh"
            tabIndex={0}
            className="inline-flex items-center justify-center rounded px-1.5 py-1 text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
          >
            <RefreshCw size={12} />
          </button>
          <button
            onClick={() => {
              setNewSkill({ name: '', description: '', content: '' })
              setCreateOpen(true)
            }}
            aria-label="Create skill"
            tabIndex={0}
            className="inline-flex items-center gap-1 rounded bg-accent-brand px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 transition-opacity"
          >
            <Plus size={12} />
            Create
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-text-secondary text-sm">
            <Loader2 size={16} className="animate-spin" />
            Loading skills...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center p-10 text-text-secondary text-[13px]">
            {search ? 'No matching skills' : 'No skills found'}
          </div>
        ) : (
          <div className="max-w-[960px] mx-auto">
            {builtinSkills.length > 0 && (
              <SkillGroup
                label={t('workspace:skills.builtinSkills')}
                skills={builtinSkills}
                onDelete={handleDelete}
                onPreview={handlePreview}
                onReveal={handleReveal}
              />
            )}
            {customSkills.length > 0 && (
              <SkillGroup
                label={t('workspace:skills.customSkills')}
                skills={customSkills}
                onDelete={handleDelete}
                onPreview={handlePreview}
                onReveal={handleReveal}
              />
            )}
          </div>
        )}
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewSkill} onOpenChange={(open) => { if (!open) setPreviewSkill(null) }}>
        <DialogContent className="max-w-[720px] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText size={16} />
              {previewSkill?.name}
            </DialogTitle>
            {previewSkill?.filePath && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-text-secondary font-mono truncate flex-1">
                  {previewSkill.filePath}
                </span>
                <button
                  onClick={() => previewSkill && handleReveal(previewSkill)}
                  title="Open in Finder"
                  aria-label="Open in Finder"
                  tabIndex={0}
                  className="shrink-0 inline-flex items-center gap-1 text-xs text-accent-brand hover:text-accent-brand/80 transition-colors"
                >
                  <FolderOpen size={12} />
                  Open
                </button>
              </div>
            )}
          </DialogHeader>
          <div className="flex-1 overflow-y-auto mt-3 rounded-md border border-border bg-bg-input p-4">
            {previewLoading ? (
              <div className="flex items-center justify-center gap-2 p-6 text-text-secondary text-sm">
                <Loader2 size={14} className="animate-spin" />
                Loading...
              </div>
            ) : (
              <pre className="text-xs text-text-primary font-mono whitespace-pre-wrap break-words leading-[1.6]">
                {previewContent}
              </pre>
            )}
          </div>
          <DialogFooter>
            <button
              onClick={() => setPreviewSkill(null)}
              className="rounded px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Skill</DialogTitle>
            <DialogDescription>Define a new custom skill.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 mt-3">
            <div>
              <div className="text-xs mb-1 text-text-secondary">Name</div>
              <input
                value={newSkill.name}
                onChange={(e) => setNewSkill((s) => ({ ...s, name: e.target.value }))}
                placeholder="my-skill"
                className="w-full rounded-md border border-border bg-bg-input px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-brand"
              />
            </div>
            <div>
              <div className="text-xs mb-1 text-text-secondary">Description</div>
              <input
                value={newSkill.description}
                onChange={(e) => setNewSkill((s) => ({ ...s, description: e.target.value }))}
                placeholder="What this skill does..."
                className="w-full rounded-md border border-border bg-bg-input px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-brand"
              />
            </div>
            <div>
              <div className="text-xs mb-1 text-text-secondary">Content</div>
              <textarea
                value={newSkill.content}
                onChange={(e) => setNewSkill((s) => ({ ...s, content: e.target.value }))}
                placeholder="Skill prompt content..."
                rows={6}
                className="w-full rounded-md border border-border bg-bg-input px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-brand resize-y font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setCreateOpen(false)}
              className="rounded px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!newSkill.name.trim() || !newSkill.description.trim()}
              className="rounded bg-accent-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &quot;{deleteTarget?.name}&quot;?</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setDeleteConfirmOpen(false)}
              className="rounded px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              className="rounded bg-accent-red px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity"
            >
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* -- Skill Group ----------------------------------------- */

const SkillGroup = ({ label, skills, onDelete, onPreview, onReveal }: {
  label: string
  skills: SkillDefinition[]
  onDelete: (s: SkillDefinition) => void
  onPreview: (s: SkillDefinition) => void
  onReveal: (s: SkillDefinition) => void
}) => (
  <div className="mb-6">
    <div className="text-xs font-semibold uppercase tracking-[0.8px] text-text-secondary mb-2.5">
      {label} ({skills.length})
    </div>
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2.5">
      {skills.map((skill) => (
        <SkillCard
          key={skill.name}
          skill={skill}
          onDelete={() => onDelete(skill)}
          onPreview={() => onPreview(skill)}
          onReveal={() => onReveal(skill)}
        />
      ))}
    </div>
  </div>
)

/* -- Skill Card ------------------------------------------ */

const SkillCard = ({ skill, onDelete, onPreview, onReveal }: {
  skill: SkillDefinition
  onDelete: () => void
  onPreview: () => void
  onReveal: () => void
}) => {
  const { t } = useTranslation(['common'])
  const isCustom = skill.source === 'custom'

  return (
    <div
      className="group px-4 py-3.5 rounded-md border border-border bg-transparent hover:bg-bg-hover-subtle transition-all relative cursor-pointer"
      onClick={onPreview}
      onKeyDown={(e) => { if (e.key === 'Enter') onPreview() }}
      tabIndex={0}
      role="button"
      aria-label={`Preview ${skill.name}`}
    >
      <div className="flex items-start gap-2.5">
        <Sparkles size={16} className="text-text-secondary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[6px]">
            <span className="text-[13px] font-medium text-text-emphasis">
              {skill.name}
            </span>
            <span className={cn(
              'text-xs px-[5px] py-px rounded-[3px]',
              skill.source === 'builtin'
                ? 'bg-[rgba(82,196,26,0.1)] text-accent-green'
                : 'bg-accent-purple/10 text-accent-purple',
            )}>
              {skill.source === 'builtin' ? t('common:source.builtin') : t('common:source.custom')}
            </span>
            {skill.enabled ? (
              <ToggleRight size={14} className="text-accent-green" />
            ) : (
              <ToggleLeft size={14} className="text-text-secondary" />
            )}
          </div>
          <div className="text-xs text-text-secondary mt-1 leading-[1.5] overflow-hidden text-ellipsis line-clamp-2">
            {skill.description}
          </div>
          {skill.filePath && (
            <div className="text-xs text-text-muted/60 mt-1.5 font-mono truncate">
              {skill.filePath}
            </div>
          )}
        </div>
      </div>

      <div
        className="absolute top-2 right-2 hidden group-hover:flex gap-0.5 bg-bg-primary rounded-sm p-0.5 border border-border-subtle"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onPreview}
          title="Preview"
          aria-label="Preview"
          tabIndex={0}
          className="bg-transparent border-none cursor-pointer text-text-secondary p-[5px] rounded-sm flex items-center transition-all hover:bg-bg-hover-muted hover:text-accent-brand"
        >
          <Eye size={11} />
        </button>
        {skill.filePath && (
          <button
            onClick={onReveal}
            title="Open directory"
            aria-label="Open directory"
            tabIndex={0}
            className="bg-transparent border-none cursor-pointer text-text-secondary p-[5px] rounded-sm flex items-center transition-all hover:bg-bg-hover-muted hover:text-accent-brand"
          >
            <FolderOpen size={11} />
          </button>
        )}
        {isCustom && (
          <button
            onClick={onDelete}
            title="Delete"
            aria-label="Delete"
            tabIndex={0}
            className="bg-transparent border-none cursor-pointer text-text-secondary p-[5px] rounded-sm flex items-center transition-all hover:bg-bg-hover-muted hover:text-accent-red"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>
    </div>
  )
}

export default SkillsPage

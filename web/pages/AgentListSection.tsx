import { useState, useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Users, Search, UserMinus, UserPlus, UserCheck,
  Pencil, Trash2, Copy, ShoppingBag, Palette, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import AgentAvatar from '@/components/ui/agent-avatar'
import type { Agent } from '../types/agentConfig'
import { useAvatarStyle } from '@/contexts/AvatarStyleContext'
import { AVATAR_STYLES } from '@/config/avatarAssets'
import useTeamStats from '@/hooks/useTeamStats'

type TeamFilter = 'all' | 'builtin' | 'user' | 'claude' | 'codex' | 'qoder'

const TEAM_FILTERS: Array<{ value: TeamFilter; labelKey: string }> = [
  { value: 'all', labelKey: 'agents:filter.all' },
  { value: 'builtin', labelKey: 'common:source.builtin' },
  { value: 'user', labelKey: 'common:source.custom' },
  { value: 'claude', labelKey: 'agents:filter.claude' },
  { value: 'codex', labelKey: 'agents:filter.codex' },
  { value: 'qoder', labelKey: 'agents:filter.qoder' },
]

export const TeamTab = ({ members, onFire, onEdit, onGoMarket, onClickAgent }: {
  members: Agent[]
  onFire: (a: Agent) => void
  onEdit: (a: Agent) => void
  onGoMarket: () => void
  onClickAgent: (a: Agent) => void
}) => {
  const { t } = useTranslation(['agents', 'common'])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<TeamFilter>('all')
  const teamStats = useTeamStats()

  const filtered = useMemo(() => {
    let list = members
    if (filter === 'builtin') list = list.filter((a) => a.source === 'builtin')
    else if (filter === 'user') list = list.filter((a) => a.source === 'user')
    else if (filter === 'claude') list = list.filter((a) => !a.provider || a.provider === 'claude')
    else if (filter === 'codex') list = list.filter((a) => a.provider === 'codex')
    else if (filter === 'qoder') list = list.filter((a) => a.provider === 'qoder')

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((a) =>
        a.name.toLowerCase().includes(q)
        || a.description.toLowerCase().includes(q),
      )
    }
    return list
  }, [members, filter, search])

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Users size={40} className="text-text-secondary opacity-20" />
        <div className="text-sm text-text-secondary">{t('agents:team.empty')}</div>
        <div className="text-xs text-text-secondary">{t('agents:team.emptyHint')}</div>
        <button
          onClick={onGoMarket}
          tabIndex={0}
          aria-label={t('agents:team.goMarket')}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-accent-brand px-3.5 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity"
        >
          <ShoppingBag size={12} />
          {t('agents:team.goMarket')}
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 max-w-[240px] flex items-center gap-1.5 bg-bg-input border border-border rounded-md px-2.5 py-[5px]">
          <Search size={12} className="text-text-secondary shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('agents:searchPlaceholder')}
            className="bg-transparent border-none outline-none text-text-primary text-xs w-full"
            aria-label={t('agents:searchLabel')}
          />
        </div>
        <div className="flex gap-0.5">
          {TEAM_FILTERS.map(({ value, labelKey }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              tabIndex={0}
              aria-label={t(labelKey)}
              className={cn(
                'px-2 py-[3px] rounded-sm text-xs cursor-pointer transition-all border-none',
                filter === value
                  ? 'bg-accent-brand/15 text-accent-brand font-medium'
                  : 'bg-transparent text-text-secondary hover:text-text-primary',
              )}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <AvatarStyleSwitcher />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-10 text-text-secondary text-[13px]">
          {t('agents:market.noResults')}
        </div>
      ) : (
        <AgentSection label={t('agents:teamSection', { count: filtered.length })}>
          {filtered.map((agent) => (
            <TeamMemberCard
              key={agent.id}
              agent={agent}
              stats={teamStats[agent.id]}
              onClick={() => onClickAgent(agent)}
              onFire={() => onFire(agent)}
              onEdit={() => onEdit(agent)}
            />
          ))}
        </AgentSection>
      )}
    </div>
  )
}

export const MarketTab = ({ builtinAgents, userAgents, hiredIds, search, onSearchChange, onHire, onFire, onEdit, onDelete, onClone }: {
  builtinAgents: Agent[]
  userAgents: Agent[]
  hiredIds: string[]
  search: string
  onSearchChange: (v: string) => void
  onHire: (a: Agent) => void
  onFire: (a: Agent) => void
  onEdit: (a: Agent) => void
  onDelete: (a: Agent) => void
  onClone: (a: Agent) => void
}) => {
  const { t } = useTranslation(['agents', 'common'])
  const noResults = builtinAgents.length === 0 && userAgents.length === 0

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 max-w-[260px] flex items-center gap-1.5 bg-bg-input border border-border rounded-md px-2.5 py-[5px]">
          <Search size={12} className="text-text-secondary shrink-0" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('agents:market.searchPlaceholder')}
            className="bg-transparent border-none outline-none text-text-primary text-xs w-full"
            aria-label={t('agents:market.searchAriaLabel')}
          />
        </div>
      </div>

      {noResults ? (
        <div className="text-center py-16 text-text-secondary text-[13px]">
          {search ? t('agents:market.noResults') : t('agents:market.empty')}
        </div>
      ) : (
        <>
          {builtinAgents.length > 0 && (
            <AgentSection label={t('agents:market.builtinSection', { count: builtinAgents.length })}>
              {builtinAgents.map((agent) => (
                <MarketAgentCard
                  key={agent.id} agent={agent} hired={hiredIds.includes(agent.id)}
                  onHire={() => onHire(agent)} onFire={() => onFire(agent)} onClone={() => onClone(agent)}
                />
              ))}
            </AgentSection>
          )}
          {userAgents.length > 0 && (
            <AgentSection label={t('agents:market.customSection', { count: userAgents.length })}>
              {userAgents.map((agent) => (
                <MarketAgentCard
                  key={agent.id} agent={agent} hired={hiredIds.includes(agent.id)} isCustom
                  onHire={() => onHire(agent)} onFire={() => onFire(agent)}
                  onEdit={() => onEdit(agent)} onDelete={() => onDelete(agent)} onClone={() => onClone(agent)}
                />
              ))}
            </AgentSection>
          )}
        </>
      )}
    </div>
  )
}

const AgentSection = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-5">
    <div className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-2.5">{label}</div>
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2.5">{children}</div>
  </div>
)

const SourceBadge = ({ source }: { source: 'builtin' | 'user' }) => {
  const { t } = useTranslation('common')
  return (
    <span className={cn(
      'text-xs px-[5px] py-px rounded-[3px]',
      source === 'builtin' ? 'bg-accent-green/10 text-accent-green' : 'bg-purple-500/10 text-purple-400',
    )}>
      {source === 'builtin' ? t('common:source.builtin') : t('common:source.custom')}
    </span>
  )
}

const ProviderBadge = ({ provider }: { provider?: string }) => {
  if (provider === 'codex') {
    return <span className="text-xs px-[5px] py-px rounded-[3px] font-mono bg-sky-500/10 text-sky-400">Codex</span>
  }
  if (provider === 'qoder') {
    return <span className="text-xs px-[5px] py-px rounded-[3px] font-mono bg-emerald-500/10 text-emerald-400">Qoder</span>
  }
  return <span className="text-xs px-[5px] py-px rounded-[3px] font-mono bg-orange-500/10 text-orange-400">Claude Code</span>
}

const TeamMemberCard = ({ agent, stats, onFire, onEdit, onClick }: {
  agent: Agent; stats?: { totalTasks: number; successRate: number }; onFire: () => void; onEdit: () => void; onClick: () => void
}) => {
  const { t } = useTranslation(['agents', 'common'])
  const isCustom = agent.source === 'user'
  return (
    <div onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
      tabIndex={0} role="button" aria-label={t('agents:card.viewDetail', { name: agent.name })}
      className="group relative px-4 py-3.5 rounded-lg border border-border bg-transparent hover:bg-bg-hover-subtle transition-all cursor-pointer">
      <div className="flex items-start gap-2.5">
        <AgentAvatar name={agent.name} agentId={agent.id} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-text-emphasis truncate">{agent.name}</div>
          <div className="flex items-center gap-1.5 mt-1">
            <SourceBadge source={agent.source} />
            <ProviderBadge provider={agent.provider} />
          </div>
          <div className="text-xs text-text-secondary mt-1.5 leading-[1.5] line-clamp-2">{agent.description}</div>
          {stats && stats.totalTasks > 0 && (
            <div className="flex items-center gap-2 mt-1.5 text-[10px] text-text-muted">
              <span>{stats.totalTasks} missions</span>
              <span className="w-px h-2.5 bg-border-subtle" />
              <span>{Math.round(stats.successRate * 100)}% success</span>
            </div>
          )}
          {agent.tags && agent.tags.length > 0 && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {agent.tags.slice(0, 4).map((tag) => (
                <span key={tag} className="text-xs px-1.5 py-px rounded-[3px] bg-bg-hover-muted text-text-secondary">{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="absolute top-2 right-2 hidden group-hover:flex gap-0.5 bg-bg-primary rounded-sm p-0.5 border border-border-subtle">
        {isCustom && <ActionBtn icon={<Pencil size={11} />} title={t('agents:actions.upgrade')} onClick={onEdit} />}
        <ActionBtn icon={<UserMinus size={11} />} title={t('agents:actions.fire')} onClick={onFire} hoverColor="text-red-400" />
      </div>
    </div>
  )
}

const MarketAgentCard = ({ agent, isCustom, hired, onHire, onFire, onEdit, onDelete, onClone }: {
  agent: Agent; isCustom?: boolean; hired?: boolean
  onHire: () => void; onFire?: () => void; onEdit?: () => void; onDelete?: () => void; onClone?: () => void
}) => {
  const { t } = useTranslation(['agents', 'common'])
  return (
    <div className={cn(
      'group relative flex h-full min-h-0 flex-col px-4 py-3.5 rounded-lg border transition-all',
      hired ? 'border-accent-brand/20 bg-accent-brand/[0.04]' : 'border-border bg-transparent hover:bg-bg-hover-subtle',
    )}>
      <div className="flex min-h-0 flex-1 gap-2.5">
        <AgentAvatar name={agent.name} agentId={agent.id} size="lg" className="shrink-0" />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="text-[13px] font-medium text-text-emphasis truncate">{agent.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <SourceBadge source={agent.source} />
            <ProviderBadge provider={agent.provider} />
            {hired && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-accent-brand/15 px-1.5 py-0.5 text-xs font-medium text-accent-brand">
                <UserCheck size={9} />{t('agents:actions.hired')}
              </span>
            )}
          </div>
          <p className="mt-1.5 min-h-[3em] text-xs leading-[1.5] text-text-secondary line-clamp-2">
            {agent.description}
          </p>
          <div className="mt-auto shrink-0 pt-2">
            {hired ? (
              <button onClick={(e) => { e.stopPropagation(); onFire?.() }} tabIndex={0}
                aria-label={t('agents:actions.fireAgent', { name: agent.name })}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-transparent px-2.5 py-1 text-xs font-medium text-text-secondary hover:border-red-500/50 hover:text-red-400 transition-colors">
                <UserMinus size={11} />{t('agents:actions.fire')}
              </button>
            ) : (
              <button onClick={(e) => { e.stopPropagation(); onHire() }} tabIndex={0}
                aria-label={t('agents:actions.hireAgent', { name: agent.name })}
                className="inline-flex items-center gap-1 rounded-md border border-accent-brand bg-transparent px-2.5 py-1 text-xs font-medium text-accent-brand hover:bg-accent-brand hover:text-white transition-colors">
                <UserPlus size={11} />{t('agents:actions.hire')}
              </button>
            )}
          </div>
        </div>
      </div>
      {isCustom && (
        <div className="absolute top-2 right-2 hidden group-hover:flex gap-0.5 bg-bg-primary rounded-sm p-0.5 border border-border-subtle">
          {onEdit && <ActionBtn icon={<Pencil size={11} />} title={t('agents:actions.upgrade')} onClick={onEdit} />}
          {onClone && <ActionBtn icon={<Copy size={11} />} title={t('agents:actions.clone')} onClick={onClone} />}
          {onDelete && <ActionBtn icon={<Trash2 size={11} />} title={t('agents:actions.delete')} onClick={onDelete} hoverColor="text-red-400" />}
        </div>
      )}
    </div>
  )
}

const AvatarStyleSwitcher = () => {
  const { t } = useTranslation('agents')
  const { avatarStyle, setAvatarStyle } = useAvatarStyle()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)}
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-2 py-[3px] text-xs transition-all border-none cursor-pointer',
          open ? 'bg-accent-brand/15 text-accent-brand font-medium' : 'bg-transparent text-text-secondary hover:text-text-primary',
        )}>
        <Palette size={12} />{t('avatarStyle.label')}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-[140px] rounded-lg border border-border bg-bg-primary p-1 shadow-lg">
          {AVATAR_STYLES.map(({ value, labelKey }) => (
            <button key={value} onClick={() => { setAvatarStyle(value); setOpen(false) }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors border-none cursor-pointer',
                avatarStyle === value
                  ? 'bg-accent-brand/10 text-accent-brand font-medium'
                  : 'bg-transparent text-text-secondary hover:bg-bg-hover-subtle hover:text-text-primary',
              )}>
              {avatarStyle === value && <Check size={10} className="shrink-0" />}
              <span className={avatarStyle !== value ? 'pl-[18px]' : ''}>{t(labelKey.replace('agents:', ''))}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const ActionBtn = ({ icon, title, onClick, hoverColor }: {
  icon: React.ReactNode; title: string; onClick: () => void; hoverColor?: string
}) => (
  <button onClick={(e) => { e.stopPropagation(); onClick() }} title={title} aria-label={title} tabIndex={0}
    className={cn(
      'bg-transparent border-none cursor-pointer text-text-secondary p-[5px] rounded-sm flex items-center transition-all hover:bg-bg-hover-muted',
      hoverColor ? `hover:${hoverColor}` : 'hover:text-text-primary',
    )}>
    {icon}
  </button>
)

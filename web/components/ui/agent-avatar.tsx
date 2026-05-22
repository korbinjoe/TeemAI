import { useEffect, useMemo, useState } from 'react'
import Avatar from 'boring-avatars'
import { cn } from '@/lib/utils'
import type { AvatarVariant } from '@/types/agentConfig'
import { useAvatarStyle } from '@/contexts/AvatarStyleContext'
import { getAvatarUrl } from '@/config/avatarAssets'

export type AgentAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export type AvatarAnimationState = 'idle' | 'thinking' | 'working' | 'blocked' | 'completed'

interface AgentAvatarProps {
  name: string
  agentId?: string
  icon?: string
  avatarId?: string
  avatarVariant?: AvatarVariant
  avatarColors?: string[]
  size?: AgentAvatarSize
  className?: string
  active?: boolean
  animationState?: AvatarAnimationState
  version?: number
}

const SIZE_MAP: Record<AgentAvatarSize, { px: number; cls: string; emoji: string }> = {
  xs: { px: 20, cls: 'h-5 w-5', emoji: 'text-xs' },
  sm: { px: 28, cls: 'h-7 w-7', emoji: 'text-sm' },
  md: { px: 36, cls: 'h-9 w-9', emoji: 'text-lg' },
  lg: { px: 48, cls: 'h-12 w-12', emoji: 'text-2xl' },
  xl: { px: 64, cls: 'h-16 w-16', emoji: 'text-[32px]' },
}

const DEFAULT_COLORS = ['#F59E0B', '#6366F1', '#10B981', '#F472B6', '#38BDF8']

const ANIMATION_CLASS_MAP: Record<AvatarAnimationState, string> = {
  idle: '',
  thinking: 'animate-avatar-wobble',
  working: 'animate-avatar-pulse',
  blocked: 'animate-avatar-shake',
  completed: 'animate-avatar-bounce',
}

const AgentAvatar = ({
  name,
  agentId,
  icon: _icon,
  avatarId: _avatarId,
  avatarVariant = 'marble',
  avatarColors,
  size = 'md',
  className,
  active = false,
  animationState,
  version,
}: AgentAvatarProps) => {
  const sizeConfig = SIZE_MAP[size]
  const colors = useMemo(() => avatarColors ?? DEFAULT_COLORS, [avatarColors])
  const { avatarStyle } = useAvatarStyle()
  const [imgError, setImgError] = useState(false)

  const baseUrl = agentId ? getAvatarUrl(agentId, avatarStyle) : null
  const avatarUrl = baseUrl && version ? `${baseUrl}?v=${version}` : baseUrl
  useEffect(() => setImgError(false), [avatarUrl])
  const showImage = avatarUrl && !imgError

  const animClass = animationState
    ? ANIMATION_CLASS_MAP[animationState]
    : (active ? 'animate-breathe' : '')

  return (
    <div
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full overflow-hidden',
        sizeConfig.cls,
        animClass,
        className,
      )}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          src={avatarUrl}
          alt={name}
          className="w-full h-full rounded-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <Avatar
          size={sizeConfig.px}
          name={name}
          variant={avatarVariant}
          colors={colors}
        />
      )}
    </div>
  )
}

export const isActivePhase = (phase: string): boolean => {
  switch (phase) {
    case 'thinking':
    case 'responding':
    case 'tool_running':
    case 'initializing':
    case 'waiting_confirmation':
      return true
    default:
      return false
  }
}

/**  AgentPhase  AvatarAnimationState */
export const phaseToAnimationState = (phase: string): AvatarAnimationState => {
  switch (phase) {
    case 'thinking':
    case 'initializing':
      return 'thinking'
    case 'tool_running':
    case 'responding':
      return 'working'
    case 'waiting_confirmation':
    case 'error':
      return 'blocked'
    case 'completed':
      return 'completed'
    default:
      return 'idle'
  }
}

export default AgentAvatar

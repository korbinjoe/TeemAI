declare module 'boring-avatars' {
  import type { FC, SVGAttributes } from 'react'

  interface AvatarProps extends SVGAttributes<SVGSVGElement> {
    size?: number
    name?: string
    variant?: 'marble' | 'beam' | 'pixel' | 'sunset' | 'ring' | 'bauhaus' | 'geometric' | 'abstract'
    colors?: string[]
    square?: boolean
    title?: boolean
  }

  const Avatar: FC<Partial<AvatarProps> & { variant?: AvatarProps['variant'] }>
  export default Avatar
}

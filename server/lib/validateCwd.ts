import { resolve } from 'path'
import { homedir } from 'os'

const ALLOWED_ROOTS = [
  process.cwd(),
  homedir(),
]

export const isAllowedCwd = (cwd: string): boolean => {
  const resolved = resolve(cwd)
  return ALLOWED_ROOTS.some(root => resolved.startsWith(resolve(root)))
}

import { nanoid } from 'nanoid'
import { createHash } from 'crypto'

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/**
 * Generate a globally unique ID: hashPrefix(userId, prefixLen) + nanoid(randomLen)
 */
export const generateId = (userId: string, prefixLen = 4, randomLen = 8): string => {
  const hash = createHash('sha256').update(userId).digest()
  let prefix = ''
  for (let i = 0; i < prefixLen; i++) {
    prefix += BASE62[hash[i] % 62]
  }
  return prefix + nanoid(randomLen)
}

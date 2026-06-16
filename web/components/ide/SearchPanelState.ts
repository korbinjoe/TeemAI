import type { ContentResult } from '@/hooks/useContentSearch'

export interface SearchCache {
  inputValue: string
  activeQuery: string
  results: ContentResult[]
  truncated: boolean
}

export const emptySearchCache: SearchCache = {
  inputValue: '',
  activeQuery: '',
  results: [],
  truncated: false,
}

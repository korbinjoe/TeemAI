const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript',
  json: 'json', md: 'markdown',
  css: 'css', scss: 'scss', less: 'less',
  html: 'html', xml: 'xml', svg: 'xml',
  py: 'python', rs: 'rust', go: 'go',
  java: 'java', kt: 'kotlin', swift: 'swift',
  rb: 'ruby', php: 'php', sh: 'shell',
  yml: 'yaml', yaml: 'yaml', toml: 'toml',
  sql: 'sql', graphql: 'graphql',
  dockerfile: 'dockerfile',
}

export const getLanguage = (filePath: string): string => {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  return LANG_MAP[ext] || 'plaintext'
}

export type PreviewType = 'image' | 'markdown' | 'binary' | null

const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico',
])

const MARKDOWN_EXTENSIONS = new Set(['md', 'mdx'])

export const getPreviewType = (filePath: string): PreviewType => {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (MARKDOWN_EXTENSIONS.has(ext)) return 'markdown'
  return null
}

export const getFileIcon = (name: string, isDirectory: boolean): string => {
  if (isDirectory) return '\u{1F4C1}'
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const iconMap: Record<string, string> = {
    ts: '\u{1F7E6}', tsx: '\u{1F7E6}',
    js: '\u{1F7E8}', jsx: '\u{1F7E8}',
    json: '{ }', md: '\u{1F4DD}',
    css: '\u{1F3A8}', scss: '\u{1F3A8}',
    py: '\u{1F40D}', rs: '\u{2699}', go: '\u{1F439}',
  }
  return iconMap[ext] || '\u{1F4C4}'
}

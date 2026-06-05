#!/usr/bin/env tsx
/**
 * Bundle
 *
 *  UI + Server bundle manifest.json build-output/
 *
 *   tsx scripts/build-bundle.ts [--version 1.2.0] [--server-url https://cdn.example.com]
 *
 *   build-output/
 *   ├── ui.tar.gz
 *   ├── server.tar.gz
 *   └── manifest.json
 */

import { execSync } from 'child_process'
import { join, resolve } from 'path'
import {
  existsSync, mkdirSync, rmSync, readFileSync, writeFileSync,
  readdirSync, statSync,
} from 'fs'
import { createHash } from 'crypto'
import { PORTS } from '../shared/ports'

const args = process.argv.slice(2)
const getArg = (name: string, fallback: string): string => {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback
}

const ROOT = resolve(__dirname, '..')
const BUILD_OUTPUT = join(ROOT, 'build-output')
const DIST_DIR = join(ROOT, 'dist')
const SERVER_BUNDLE_DIR = join(BUILD_OUTPUT, 'server-bundle')

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'))
const version = getArg('version', pkg.version ?? '1.0.0')
const serverUrl = getArg('server-url', `http://localhost:${PORTS.DEV_SERVER}`)
const shellVersion = getArg('min-shell', '1.0.0')

console.log(`\n📦 Building TeemAI Bundle v${version}\n`)

// ── Step 0: Clean up ──

if (existsSync(BUILD_OUTPUT)) {
  rmSync(BUILD_OUTPUT, { recursive: true, force: true })
}
mkdirSync(BUILD_OUTPUT, { recursive: true })
mkdirSync(SERVER_BUNDLE_DIR, { recursive: true })

console.log('🔨 Building UI (vite build)...')
try {
  execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' })
} catch (err) {
  console.error('❌ UI build failed')
  process.exit(1)
}

if (!existsSync(DIST_DIR)) {
  console.error('❌ dist/ directory not found after UI build')
  process.exit(1)
}

const uiTarPath = join(BUILD_OUTPUT, 'ui.tar.gz')
console.log('📁 Packaging UI bundle...')
execSync(`tar -czf "${uiTarPath}" -C "${DIST_DIR}" .`, { stdio: 'pipe' })

console.log('🔨 Building Server (esbuild)...')

const serverEntry = join(ROOT, 'server', 'index.ts')

try {
  execSync([
    'npx esbuild',
    `"${serverEntry}"`,
    '--bundle',
    '--platform=node',
    '--target=node18',
    `--outdir="${SERVER_BUNDLE_DIR}"`,
    '--format=esm',
    '--external:better-sqlite3',
    '--external:node-pty',
    '--external:electron',
    '--external:ws',
    '--external:express',
    '--external:winston',
    '--sourcemap',
  ].join(' '), { cwd: ROOT, stdio: 'inherit' })
} catch (err) {
  console.error('❌ Server build failed')
  process.exit(1)
}

const serverTarPath = join(BUILD_OUTPUT, 'server.tar.gz')
console.log('📁 Packaging Server bundle...')
execSync(`tar -czf "${serverTarPath}" -C "${SERVER_BUNDLE_DIR}" .`, { stdio: 'pipe' })

// ── Step 3: Calculate SHA256 ──

console.log('🔐 Computing checksums...')

const computeSha256 = (filePath: string): string => {
  const data = readFileSync(filePath)
  return createHash('sha256').update(data).digest('hex')
}

const getFileSize = (filePath: string): number => {
  return statSync(filePath).size
}

const uiSha256 = computeSha256(uiTarPath)
const serverSha256 = computeSha256(serverTarPath)
const uiSize = getFileSize(uiTarPath)
const serverSize = getFileSize(serverTarPath)

// ── Step 4: Generate manifest.json ──

const manifest = {
  version,
  minShellVersion: shellVersion,
  releaseDate: new Date().toISOString(),
  bundles: {
    ui: {
      url: `${serverUrl}/api/update/download/${version}/ui`,
      sha256: uiSha256,
      size: uiSize,
    },
    server: {
      url: `${serverUrl}/api/update/download/${version}/server`,
      sha256: serverSha256,
      size: serverSize,
    },
  },
  changelog: '',
  rollbackTo: undefined as string | undefined,
}

try {
  const log = execSync('git log --oneline -10 --no-decorate', { cwd: ROOT, encoding: 'utf-8' })
  manifest.changelog = log.trim()
} catch {
  manifest.changelog = `Release v${version}`
}

const manifestPath = join(BUILD_OUTPUT, 'manifest.json')
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')

// ── Step 5: GenerateValidateFile ──

const checksumContent = [
  `${uiSha256}  ui.tar.gz`,
  `${serverSha256}  server.tar.gz`,
].join('\n')

writeFileSync(join(BUILD_OUTPUT, 'checksums.sha256'), checksumContent, 'utf-8')

rmSync(SERVER_BUNDLE_DIR, { recursive: true, force: true })

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

console.log('\n✅ Bundle build complete!\n')
console.log('  Output:')
console.log(`    📁 ${BUILD_OUTPUT}/`)
console.log(`    ├── ui.tar.gz      ${formatSize(uiSize)}  sha256:${uiSha256.slice(0, 12)}...`)
console.log(`    ├── server.tar.gz  ${formatSize(serverSize)}  sha256:${serverSha256.slice(0, 12)}...`)
console.log(`    ├── manifest.json`)
console.log(`    └── checksums.sha256`)
console.log()
console.log(`  Version: ${version}`)
console.log(`  Min Shell: ${shellVersion}`)
console.log()
console.log(`  Next: tsx scripts/publish-release.ts --server ${serverUrl}`)
console.log()

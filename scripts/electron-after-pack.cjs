/**
 * electron-builder afterPack hook
 *
 * `extraResources` copies `ai-assets` verbatim, preserving the `skills/*`
 * symlinks that point into a sibling repo (browser-agent-plugin). Those links
 * are relative (`../../../browser-agent-plugin/...`) and resolve against their
 * SOURCE location, not their location inside the bundle — so once copied into
 * `Resources/ai-assets/skills/` they dangle, and a per-link `realpath()` in the
 * bundle silently drops every skill (the app then ships with skills missing).
 *
 * Fix: discard whatever electron-builder copied and re-copy `ai-assets` from the
 * project source tree with `dereference: true`. Relative symlinks resolve from
 * their real source location, so the bundle gets real skill content. A genuinely
 * broken link makes `fs.cp` throw and fails the build loudly instead of shipping
 * an app that is missing skills.
 */

const { promises: fs } = require('fs')
const path = require('path')

exports.default = async function afterPack(context) {
  const resourcesDir = context.packager.getResourcesDir(context.appOutDir)
  const projectDir = context.packager.projectDir || process.cwd()

  const srcAiAssets = path.join(projectDir, 'ai-assets')
  const destAiAssets = path.join(resourcesDir, 'ai-assets')

  await fs.rm(destAiAssets, { recursive: true, force: true })
  await fs.cp(srcAiAssets, destAiAssets, { recursive: true, dereference: true })
  console.log(`[afterPack] materialized ai-assets (dereferenced) ${srcAiAssets} -> ${destAiAssets}`)
}

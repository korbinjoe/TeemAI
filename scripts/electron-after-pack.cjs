/**
 * electron-builder afterPack hook
 *
 * `extraResources` copies symlinks verbatim. Bundled `ai-assets/skills/*` are
 * symlinks into a sibling repo (browser-agent-plugin) that does not exist inside
 * the app bundle, so they land as dangling links and crash boot. Replace every
 * symlink under Resources/ai-assets with a real, dereferenced copy of its target.
 */

const { promises: fs } = require('fs')
const path = require('path')

const dereferenceSymlinks = async (dir) => {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name)

    if (entry.isSymbolicLink()) {
      let realPath
      try {
        realPath = await fs.realpath(full)
      } catch (err) {
        // Genuinely broken link with no resolvable target — drop it.
        await fs.rm(full, { force: true })
        console.warn(`[afterPack] dropped broken symlink: ${full} (${err})`)
        continue
      }
      await fs.rm(full, { recursive: true, force: true })
      await fs.cp(realPath, full, { recursive: true, dereference: true })
      console.log(`[afterPack] dereferenced ${full} -> ${realPath}`)
    } else if (entry.isDirectory()) {
      await dereferenceSymlinks(full)
    }
  }
}

exports.default = async function afterPack(context) {
  const resourcesDir = context.packager.getResourcesDir(context.appOutDir)
  await dereferenceSymlinks(path.join(resourcesDir, 'ai-assets'))
}

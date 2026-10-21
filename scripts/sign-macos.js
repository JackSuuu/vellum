/**
 * Ad-hoc code signing for the macOS build.
 *
 * electron-builder only signs the app when it finds a "Developer ID
 * Application" certificate in the keychain. Without one it skips signing
 * entirely, which leaves the bundle with the bare linker signature of the
 * executable: no `Contents/_CodeSignature`, no sealed resources. On Apple
 * silicon macOS refuses to launch such a bundle and reports
 *
 *     "Vellum" is damaged and can't be opened.
 *
 * An ad-hoc signature (`codesign --sign -`) is enough to make the bundle
 * valid: it seals the resources and binds the Info.plist, so the app starts.
 * It carries no identity, so Gatekeeper still asks the user to confirm the
 * first launch (right-click → Open) — but it is never "damaged".
 *
 * When a real certificate is available (CSC_LINK / CSC_NAME), electron-builder
 * signs properly and this script does nothing.
 *
 * electron-builder imports this file as a module and calls the exported
 * `afterPack` function with an AfterPackContext.
 */
const { execFileSync } = require('node:child_process')
const { existsSync, readdirSync } = require('node:fs')
const { join } = require('node:path')

/** The .app bundle inside the packager output directory. */
function findAppBundle(appOutDir) {
  for (const entry of readdirSync(appOutDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.endsWith('.app')) return join(appOutDir, entry.name)
  }
  return null
}

/** True when a real Developer ID certificate is installed. */
function hasDeveloperIdentity() {
  try {
    const identities = execFileSync('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning'], {
      encoding: 'utf8'
    })
    return /Developer ID Application/.test(identities)
  } catch {
    return false
  }
}

async function afterPack(context) {
  // Only macOS bundles need this; the other platforms have no .app.
  if (process.platform !== 'darwin') return
  if (!context || !context.appOutDir || !existsSync(context.appOutDir)) return

  const appPath = findAppBundle(context.appOutDir)
  if (!appPath) {
    console.log('[sign] no .app bundle found, nothing to sign')
    return
  }

  // A real identity means electron-builder already did the work.
  if (hasDeveloperIdentity()) {
    console.log('[sign] a Developer ID certificate is available, keeping the electron-builder signature')
    return
  }

  console.log(`[sign] no Developer ID certificate, applying an ad-hoc signature to ${appPath}`)
  execFileSync(
    '/usr/bin/codesign',
    ['--force', '--deep', '--sign', '-', '--timestamp=none', appPath],
    { stdio: 'inherit' }
  )

  // Fail the build loudly if the result is still not a valid bundle.
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
  console.log('[sign] ad-hoc signature verified')
}

module.exports = afterPack
module.exports.afterPack = afterPack
module.exports.default = afterPack

/**
 * The Package tab's form must reach the project profile as it changes, not
 * only when Pack All is pressed.
 *
 * Auto-package runs in the build hook (hooks.onAfterBuild), which never sees
 * the panel — it reads selectedNetworks / orientation / outputDir / template
 * from the SAVED settings. While Pack All was the only writer, ticking a
 * network and pressing Build packaged the list an earlier Pack All had saved:
 * observed in the wild as "Build did not package tiktok" while the profile
 * showed selectedNetworks: ['tiktok'] — because Pack All wrote that value
 * AFTER the build had already run with the previous four networks.
 *
 * Saving inside the Build button would not be enough: the hook fires for ANY
 * build, including one started from Cocos's own build panel.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const SRC = join(__dirname, '../..', 'src/panels/default.ts')
const src = readFileSync(SRC, 'utf-8')

/** Body of the arrow/handler that follows `anchor`, up to `chars` ahead. */
function after(anchor: string, chars = 700): string {
  const i = src.indexOf(anchor)
  expect(i, `anchor not found: ${anchor}`).toBeGreaterThan(-1)
  return src.slice(i, i + chars)
}

describe('Package form persistence', () => {
  it('defines one helper that writes the form to settings', () => {
    expect(src).toContain('const persistPackageForm = ()')
    const body = after('const persistPackageForm = ()', 1800)
    // It must write the same keys Pack All writes, or the two paths diverge again.
    for (const key of [
      'selectedNetworks',
      'orientation',
      'buildDir',
      'outputDir',
      'outputTemplate',
      'templateVariables',
    ]) {
      expect(body, `persistPackageForm does not write ${key}`).toContain(key)
    }
    expect(body).toContain("'save-settings'")
  })

  it('persists when a network checkbox is toggled', () => {
    const body = after("cb.addEventListener('change'", 220)
    expect(body).toContain('persistPackageForm()')
  })

  it('persists when the All/None/HTML/ZIP filters set checkboxes programmatically', () => {
    // Assigning .checked does not fire 'change', so the per-checkbox listener
    // never runs for these buttons.
    const body = after("const action = btn.dataset.netAction", 900)
    expect(body).toContain('_persistPackageForm')
  })

  it('persists when orientation changes — it feeds the packager config', () => {
    expect(src).toMatch(
      /querySelectorAll\('input\[name="orientation"\]'\)[\s\S]{0,200}persistPackageForm/,
    )
  })

  it('persists when the output directory changes', () => {
    expect(src).toMatch(
      /pkgOutputDir as HTMLInputElement\)\?\.addEventListener\('change'[\s\S]{0,120}persistPackageForm/,
    )
  })

  it('no longer leaves Pack All as the only writer of selectedNetworks', () => {
    const writes = src.match(/selectedNetworks[:,]/g) ?? []
    // Pack All's own save plus the shared helper — the regression was exactly
    // one write site.
    expect(writes.length).toBeGreaterThan(1)
  })
})

/**
 * The build modal lists what auto-package produced.
 *
 * The Package tab's results table already had this, but it sits behind the
 * modal: a build that packaged the wrong set — or nothing — looked identical
 * to one that packaged the right set. That is exactly how a stale network
 * selection went unnoticed.
 */
describe('Build modal packaged list', () => {
  const TEMPLATE = readFileSync(join(__dirname, '../..', 'static/template/index.html'), 'utf-8')
  const CSS = readFileSync(join(__dirname, '../..', 'static/style/index.css'), 'utf-8')
  const LOCALES = readFileSync(join(__dirname, '../..', 'src/core/i18n/locales.ts'), 'utf-8')

  it('has the container in the build modal, not in the Package tab', () => {
    expect(TEMPLATE).toContain('id="build-packed"')
    const modal = TEMPLATE.slice(
      TEMPLATE.indexOf('id="build-overlay"'),
      TEMPLATE.indexOf('id="build-overlay"') + 2000,
    )
    expect(modal).toContain('id="build-packed"')
  })

  it('is wired into the panel selector map', () => {
    expect(src).toContain("buildPacked:       '#build-packed'")
  })

  it('decides success by outputPath, not by a status field', () => {
    // PackageResult has no `status`; the packager's per-network catch pushes a
    // row with an empty outputPath. Filtering on r.status === 'success' is what
    // made the hook's own summary always read "0 success, 0 failed".
    const body = after('const renderPackedList =', 1200)
    expect(body).toContain('r.outputPath')
    expect(body).not.toContain("status === 'success'")
  })

  it('flags an artifact that packaged but exceeds the network limit', () => {
    const body = after('const renderPackedList =', 2400)
    expect(body).toContain('withinLimit')
  })

  it('clears the list when the modal is reopened', () => {
    const body = after('const open = () => {', 400)
    expect(body).toContain('packedEl')
  })

  it('styles the rows', () => {
    expect(CSS).toContain('.build-packed-row')
    expect(CSS).toContain('.build-packed-row.is-warn')
    expect(CSS).toContain('.build-packed-row.is-fail')
  })

  it('has the strings in every locale', () => {
    for (const key of ['build.packedTitle', 'build.packedNone', 'build.packedOverLimit']) {
      const hits = LOCALES.match(new RegExp(`'${key.replace('.', '\\.')}'`, 'g')) ?? []
      expect(hits.length, `${key} is missing from a locale`).toBe(3)
    }
  })
})

/**
 * Auto-package results must reach the panel's store without an IPC round-trip
 * through the extension's own message bus.
 */
describe('auto-package result delivery', () => {
  const MAIN = readFileSync(join(__dirname, '../..', 'src/main.ts'), 'utf-8')

  it('stores the result directly instead of messaging itself', () => {
    const i = MAIN.indexOf('onAutoPackageDone(')
    expect(i).toBeGreaterThan(-1)
    const body = MAIN.slice(i, i + 1200)
    expect(body).toContain('lastBuildResult =')
    // The old shape sent 'on-build-finished' from this module to a method in
    // the same module, and pulled in its Editor.Panel.open() side effect.
    expect(body).not.toContain("Editor.Message.send('plbx-cocos-extension', 'on-build-finished'")
  })

  it('merges rather than replaces, so dest survives the second message', () => {
    const i = MAIN.indexOf('onBuildFinished(')
    const body = MAIN.slice(i, i + 900)
    expect(body).toContain('...(lastBuildResult || {})')
  })
})

/**
 * Validate must not be offered until packaging has actually finished.
 *
 * The build task reporting success means the BUILD finished; it does not prove
 * the auto-package hook has written the artifacts. The button used to appear in
 * the same breath, next to a status line already claiming "and packaged", so
 * the validator could be opened against artifacts still being written.
 */
describe('Validate gating', () => {
  const LOCALES = readFileSync(join(__dirname, '../..', 'src/core/i18n/locales.ts'), 'utf-8')

  it('hides Validate while auto-package is still running', () => {
    const body = after("const autoPacked = (this.$.pkgAutoPackage", 1800)
    expect(body).toContain("validateBtn.style.display = 'none'")
    expect(body).toContain('build.packaging')
  })

  it('reveals it only after the results are in hand', () => {
    const body = after("const autoPacked = (this.$.pkgAutoPackage", 1800)
    // The reveal must sit inside the continuation of the results pull, not
    // beside the build-success branch.
    expect(body).toMatch(
      /_pullAutoPackageResults\?\.\(\)\.then\([\s\S]{0,300}validateBtn\.style\.display = ''/,
    )
  })

  it('still offers it immediately when auto-package is off', () => {
    const body = after('if (!autoPacked) {', 260)
    expect(body).toContain("validateBtn.style.display = ''")
  })

  it('has the packaging string in every locale', () => {
    const hits = LOCALES.match(/'build\.packaging'/g) ?? []
    expect(hits.length).toBe(3)
  })
})

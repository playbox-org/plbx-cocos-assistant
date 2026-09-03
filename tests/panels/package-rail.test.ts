/**
 * Package tab: full-height results rail and the selected-first Networks list.
 *
 * The rail replaced a full-width table under the settings, and the Networks
 * grid replaced 30 checkbox cards plus four filter buttons. Both are wired by
 * id across template / CSS / panel, so these check the three stay in step.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '../..')
const TEMPLATE = readFileSync(join(ROOT, 'static/template/index.html'), 'utf-8')
const CSS = readFileSync(join(ROOT, 'static/style/index.css'), 'utf-8')
const SRC = readFileSync(join(ROOT, 'src/panels/default.ts'), 'utf-8')
const MAIN = readFileSync(join(ROOT, 'src/main.ts'), 'utf-8')
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'))

/** Slice of SRC following `anchor`, for asserting on one handler's body. */
function after(anchor: string, chars = 600): string {
  const i = SRC.indexOf(anchor)
  expect(i, `anchor not found: ${anchor}`).toBeGreaterThan(-1)
  return SRC.slice(i, i + chars)
}

describe('results rail', () => {
  it('spans the pane rather than sitting under the settings', () => {
    // .pkg-body is the horizontal split; the rail is its second child, so it
    // is full height by construction.
    expect(TEMPLATE).toContain('<div class="pkg-body">')
    expect(TEMPLATE).toContain('<div class="pkg-rail" id="pkg-rail">')
    expect(CSS).toMatch(/\.pkg-body\s*\{[^}]*display:\s*flex/)
    expect(CSS).toMatch(/\.pkg-rail\s*\{[^}]*width:\s*\d{3}px/)
  })

  it('opens from anywhere on the folded strip, chevron included', () => {
    // Only the caption used to respond: the chevron is a ~6px glyph and the
    // rest of the strip had no handler at all.
    expect(SRC).toContain("?.querySelector('.rail-head')")
    expect(SRC).toContain("if (rail?.classList.contains('folded')) this._toggleRail(false)")
    // The chevron keeps its own handler and must not let the strip's fire too.
    expect(SRC).toContain('e.stopPropagation()')
    // The caption must not swallow the strip's click.
    expect(CSS).toMatch(/\.rail-folded-label\s*\{[^}]*pointer-events:\s*none/)
    // ...and the chevron gets a real hit area rather than glyph-sized.
    expect(CSS).toMatch(/\.pkg-rail\.folded \.rail-fold\s*\{[^}]*width:\s*22px/)
  })

  it('folds to a strip that still says what it is', () => {
    expect(CSS).toMatch(/\.pkg-rail\.folded\s*\{[^}]*width:\s*3\dpx/)
    expect(CSS).toContain('.pkg-rail.folded .rail-folded-label { display: block; }')
    expect(SRC).toContain('this._toggleRail')
  })

  it('opens itself when fresh results arrive', () => {
    // Both packaging paths — Pack All and the build hook's auto-package.
    const opens = SRC.match(/this\._openRail\?\.\(\)/g) ?? []
    expect(opens.length).toBeGreaterThanOrEqual(2)
  })

  it('drops the Format and Limit columns', () => {
    // Size already carries the limit (bar + title); Format is a suffix now.
    expect(TEMPLATE).not.toContain('data-i18n="package.colLimit"')
    expect(TEMPLATE).not.toContain('id="pkg-results-tbody"')
    // Format left the rail too: it does not inform the choice, and the
    // artifact's extension is visible in the output folder anyway.
    expect(SRC).not.toContain('rail-fmt')
  })

  it('pins the actions in a footer that does not scroll away', () => {
    expect(TEMPLATE).toContain('<div class="pkg-left-scroll">')
    expect(TEMPLATE).toContain('class="toolbar pkg-footer"')
    // Inside the left column, so the rail keeps its full height.
    const left = TEMPLATE.slice(TEMPLATE.indexOf('<div class="pkg-left">'),
                                TEMPLATE.indexOf('<div class="pkg-rail"'))
    expect(left).toContain('pkg-footer')
    expect(CSS).toMatch(/\.pkg-footer\s*\{[^}]*flex-shrink:\s*0/)
    expect(CSS).toMatch(/\.pkg-left-scroll\s*\{[^}]*overflow-y:\s*auto/)
  })

  it('fills Created for artifacts packed in this session', () => {
    // PackageResult has no timestamp, so these used to show a dash;
    // validateOutputs stats the file anyway and hands the label back.
    expect(MAIN).toContain('createdAtLabel: compactDate(statCreatedAt(filePath))')
    expect(SRC).toContain("this._validation?.[r.networkId ?? r.id]?.createdAtLabel")
  })

  it('formats dates through the kit, not a second local formatter', () => {
    // buildOutputRows labels the on-disk artifacts; a private formatter here
    // would put two date styles in one column.
    expect(MAIN).toContain('buildOutputRows([{ path:')
  })

  it('names the build the artifacts came from', () => {
    expect(MAIN).toContain('async getBuildInfo(')
    expect(PKG.contributions.messages['get-build-info'].methods).toContain('getBuildInfo')
    expect(SRC).toContain('package.railFromBuild')
    expect(SRC).toContain('this._buildCreatedAtLabel')
  })

  it('keeps the full date and time in Created', () => {
    // A bare clock time cannot tell today's artifact from last week's.
    expect(SRC).toContain("tdCreated.className = 'col-created'")
    expect(SRC).toContain('r.createdAtLabel')
  })

  it('fills the rail the same way whoever produced the rows', () => {
    // Artifacts found on disk used to be muted and statusless purely because
    // nothing validated them — a gap in the code, not a fact about the files.
    // Both entry points now render, then validate, through one path.
    expect(SRC).not.toContain('fromDisk')
    expect(SRC).not.toContain('rail-disk')
    expect(SRC).toMatch(
      /list-output-builds[\s\S]{0,600}this\._renderPackageResults\(rows\)[\s\S]{0,120}this\._validateResults/,
    )
    // The signature no longer takes a per-caller flag.
    expect(SRC).toContain('_renderPackageResults(this: any, results: any[]) {')
  })

  it('shows a dash only while the checks have not answered yet', () => {
    expect(SRC).toContain('rail-nostatus')
    expect(SRC).toContain('package.railNotValidated')
    // The dash is the else of "we have a verdict of some kind".
    expect(SRC).toContain('if (kind) {')
  })

  it('says what failed on hover, whatever produced the verdict', () => {
    // The reason string is built by the shared verdict (unit-tested in
    // rail-verdict.test.ts against both row shapes); the panel only renders it.
    expect(SRC).toContain("import { railVerdict } from './rail-verdict'")
    expect(SRC).toContain('const verdict = railVerdict(r, v)')
    expect(SRC).toContain('reasons.join')
    // The badge is a small target — the whole row carries the same text.
    expect(SRC).toContain('tr.title = b.title')
    // ...and no cell title may shadow it.
    expect(SRC).not.toContain('tdNet.title =')
  })

  it('derives size and limit from the same verdict the badge uses', () => {
    // Two readings of "is it over the limit" is how the bar and the badge
    // came to disagree.
    expect(SRC).toContain('const fileSize = verdict.sizeBytes')
    expect(SRC).toContain('const overLimit = verdict.overLimit')
  })

  it('still has a zero state', () => {
    expect(SRC).toContain('package.railEmpty')
  })

  it('rebuilds the verdict map instead of merging into a stale one', () => {
    const body = after('validate-outputs', 500)
    expect(body).toContain('this._validation = {}')
  })

  it('shows the zero state when the output directory is empty', () => {
    expect(SRC).toMatch(/} else \{[\s\S]{0,240}this\._renderPackageResults\(\[\]\)/)
  })
})

describe('static checks in Status', () => {
  it('runs the kit validator over the packed artifacts', () => {
    expect(MAIN).toContain('async validateOutputs(')
    expect(MAIN).toContain('validateArtifact({')
    expect(MAIN).toContain('summarizeChecks(checks)')
    expect(PKG.contributions.messages['validate-outputs'].methods).toContain('validateOutputs')
  })

  it('never lets one unreadable artifact take the table down', () => {
    const body = MAIN.slice(MAIN.indexOf('async validateOutputs('), MAIN.indexOf('async startPreview('))
    expect(body).toContain('catch')
    expect(body).toContain("overall: 'failed'")
  })

  it('prefers the validator verdict over packaging-time hints', () => {
    expect(SRC).toContain('this._validation?.[')
    expect(SRC).toContain('_validateResults')
  })
})

describe('networks selector', () => {
  it('shows real checkboxes, not a text summary', () => {
    expect(TEMPLATE).toContain('id="net-selected"')
    expect(SRC).toContain("cb.type = 'checkbox'")
    expect(CSS).toContain(".net-item input[type='checkbox']")
  })

  it('has All / None inside the expanded list', () => {
    expect(TEMPLATE).toContain('id="net-select-all"')
    expect(TEMPLATE).toContain('id="net-select-none"')
    const allWrap = TEMPLATE.slice(TEMPLATE.indexOf('id="net-all-wrap"'))
    expect(allWrap.slice(0, 700)).toContain('id="net-select-all"')
  })

  it('drops the header filter chips and the format labels', () => {
    expect(TEMPLATE).not.toContain('data-net-action')
    expect(TEMPLATE).not.toContain('network-format-tag')
    expect(SRC).not.toContain('network-format-tag')
  })

  it('keeps selection in state, not in the DOM', () => {
    // A selected network renders in BOTH lists, so counting checked inputs
    // would report it twice.
    expect(SRC).toContain('this._netSel = new Set<string>()')
    expect(SRC).toContain('this._selectedNetworks = ()')
    expect(SRC).not.toMatch(/querySelectorAll\('input\[name="network"\]:checked'\)/)
  })

  it('shows a newly ticked network in the resting list at once', () => {
    // Ticking in the expanded list must not wait for a collapse — an action
    // that leaves the screen unchanged reads as an action that did nothing.
    expect(SRC).toContain("if (cb.checked && !this._netShown.includes(net.id)) renderSelected()")
  })

  it('does not yank a row out from under the cursor when unticked', () => {
    // Asymmetric on purpose: adds are immediate, removals wait for an explicit
    // refresh (collapse, All/None, restore).
    expect(SRC).toContain('this._netShown')
    expect(SRC).toMatch(/renderSelected = \(opts\?: \{ prune\?: boolean \}\)/)
    const prunes = SRC.match(/renderSelected\(\{ prune: true \}\)/g) ?? []
    expect(prunes.length).toBeGreaterThanOrEqual(4)
  })
})

/**
 * One network can emit several artifacts — Google's three orientation
 * archives, an html+zip pair, a base64 variant. The packager mints synthetic
 * ids for them (`google-portrait`, `<id>-zip`, `<id>-b64`), which are NOT
 * networks: passing them to getNetwork() returns null, and two of Google's
 * three archives came back "failed" for that reason alone.
 */
describe('artifact variants', () => {
  it('resolves the real network by longest prefix, not by the row id', () => {
    const body = MAIN.slice(MAIN.indexOf('async validateOutputs('),
                            MAIN.indexOf('async startPreview('))
    expect(body).toContain('const baseNetwork = (rowId: string)')
    expect(body).toContain("rowId.startsWith(`${n.id}-`)")
    expect(body).toContain('n.id.length > best.id.length')
  })

  it('validates the file the row points at', () => {
    const body = MAIN.slice(MAIN.indexOf('async validateOutputs('),
                            MAIN.indexOf('async startPreview('))
    // Re-deriving the path from the network id would validate one archive
    // three times over.
    expect(body).toContain('if (item.path)')
    expect(SRC).toContain('path: r.outputPath || r.path || undefined')
  })

  it('names the variant so the rail does not repeat one row', () => {
    expect(SRC).toContain('rail-variant')
    expect(CSS).toContain('.rail-variant')
  })
})

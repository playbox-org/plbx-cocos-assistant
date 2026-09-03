/**
 * Tab order and the panel shortcut.
 *
 * Tab order lives in two places that must agree: the buttons in the template
 * (what the operator sees) and the `tabs` array in the panel (what index a
 * click maps to). They are wired by position, so a change to one alone
 * silently mislabels every tab.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '../..')
const TEMPLATE = readFileSync(join(ROOT, 'static/template/index.html'), 'utf-8')
const SRC = readFileSync(join(ROOT, 'src/panels/default.ts'), 'utf-8')
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'))

const ORDER = ['package', 'deploy', 'build-report', 'compress']

describe('tab order', () => {
  it('renders the buttons in the intended order', () => {
    const ids = [...TEMPLATE.matchAll(/<button id="tab-([a-z-]+)"/g)].map((m) => m[1])
    expect(ids).toEqual(ORDER)
  })

  it('lists them in the same order in the panel', () => {
    const block = SRC.slice(SRC.indexOf('const tabs = ['), SRC.indexOf('const activateTab'))
    const ids = [...block.matchAll(/id: '([a-z-]+)'/g)].map((m) => m[1])
    expect(ids).toEqual(ORDER)
  })

  it('starts on Package with every other pane hidden', () => {
    expect(TEMPLATE).toMatch(/<button id="tab-package"[^>]*class="tab-btn active"/)
    expect(TEMPLATE).toContain('<div id="content-package" class="tab-pane">')
    for (const pane of ['build-report', 'compress', 'deploy']) {
      expect(TEMPLATE, `${pane} pane should start hidden`).toContain(
        `<div id="content-${pane}" class="tab-pane" style="display:none;">`,
      )
    }
  })

  it('re-checks the deploy build by tab id, not by position', () => {
    // This was `index === 3`, which pointed at Compress the moment the tabs
    // were reordered.
    const block = SRC.slice(SRC.indexOf('const activateTab'), SRC.indexOf('const activateTab') + 900)
    expect(block).toContain("tabs[index]?.id === 'deploy'")
    // The comment above the check names the old shape, so match the code.
    expect(block).not.toMatch(/if \(index === \d/)
  })
})

describe('panel shortcut', () => {
  it('binds ctrl/cmd+shift+P to the panel', () => {
    const shortcuts = PKG.contributions?.shortcuts ?? []
    const entry = shortcuts.find((s: any) => s.message === 'open-panel')
    expect(entry, 'no open-panel shortcut registered').toBeDefined()
    expect(entry.win).toBe('ctrl+shift+p')
    expect(entry.mac).toBe('cmd+shift+p')
  })

  it('fires a message that actually exists and opens the panel', () => {
    // Cocos resolves contributions.shortcuts[].message through
    // contributions.messages; an unregistered name binds the key to nothing.
    for (const s of PKG.contributions?.shortcuts ?? []) {
      expect(PKG.contributions.messages[s.message], `${s.message} is not a declared message`).toBeDefined()
    }
    expect(PKG.contributions.messages['open-panel'].methods).toContain('openPanel')
  })

  it('is not scoped to our own panel being focused', () => {
    // A `when` clause naming this panel would only fire once it is already
    // open — the opposite of the point.
    for (const s of PKG.contributions?.shortcuts ?? []) {
      if (s.message === 'open-panel') expect(s.when).toBeUndefined()
    }
  })
})

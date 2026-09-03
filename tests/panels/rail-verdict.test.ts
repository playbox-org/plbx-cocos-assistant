/**
 * The rail is fed by two producers with different shapes, and mixing them up
 * has now gone wrong three times. These are the shapes, verbatim:
 *
 *   PackageResult  — a fresh pack:  outputPath, outputSize, maxSize, warnings
 *   OutputBuildRow — a directory scan: path, outputSize, maxSize, createdAtLabel
 *                                      and NO outputPath
 */
import { describe, expect, it } from 'vitest'
import { railVerdict, hasArtifact } from '../../src/panels/rail-verdict'

const MB = 1024 * 1024
const packed = {
  networkId: 'applovin',
  outputPath: '/abs/build/plbx-html/applovin/index.html',
  outputSize: 4.9 * MB,
  maxSize: 5 * MB,
  withinLimit: true,
}
const onDisk = {
  networkId: 'applovin',
  path: 'applovin/index.html',
  outputSize: 4.9 * MB,
  maxSize: 5 * MB,
  withinLimit: true,
  createdAtLabel: '03 Sep 19:29',
}
const ok = { overall: 'passed', checks: [{ status: 'passed', label: 'size' }] }

describe('artifact presence', () => {
  it('accepts either shape', () => {
    expect(hasArtifact(packed)).toBe(true)
    expect(hasArtifact(onDisk)).toBe(true)
    expect(hasArtifact({ networkId: 'x' })).toBe(false)
  })

  it('does not call an artifact found on disk a failed pack', () => {
    // The regression: `!row.outputPath` marked every pre-existing artifact
    // as fail the moment the panel opened.
    expect(railVerdict(onDisk, ok).kind).toBe('pass')
    expect(railVerdict(onDisk, ok).reasons).toEqual([])
  })
})

describe('verdict', () => {
  it('passes a clean fresh pack', () => {
    expect(railVerdict(packed, ok).kind).toBe('pass')
  })

  it('withholds a verdict until the checks answer', () => {
    // Nothing is wrong and nothing has been checked — a dash, not a badge.
    expect(railVerdict(packed).kind).toBe('')
    expect(railVerdict(onDisk).kind).toBe('')
  })

  it('fails a plainly broken row without waiting for checks', () => {
    expect(railVerdict({ networkId: 'x' }).kind).toBe('fail')
    expect(railVerdict({ networkId: 'x' }).reasons).toContain('not packaged')
    expect(railVerdict({ ...packed, error: 'boom' }).kind).toBe('fail')
    expect(railVerdict({ ...packed, error: 'boom' }).reasons).toContain('boom')
  })

  it('fails on size and says both numbers', () => {
    const v = railVerdict({ ...packed, outputSize: 5.31 * MB, withinLimit: false }, ok)
    expect(v.kind).toBe('fail')
    expect(v.overLimit).toBe(true)
    expect(v.reasons.join(' ')).toContain('5.31 MB of 5.00 MB')
  })

  it('treats a missing limit as no ceiling, not a zero one', () => {
    const v = railVerdict({ ...packed, maxSize: 0, withinLimit: true }, ok)
    expect(v.overLimit).toBe(false)
    expect(v.kind).toBe('pass')
  })

  it('reports every failed and warning check, with details', () => {
    const v = railVerdict(packed, {
      overall: 'failed',
      checks: [
        { status: 'passed', label: 'size' },
        { status: 'failed', label: 'No forbidden strings', details: 'Found: window.top' },
        { status: 'warning', label: 'iOS-risky audio', details: '2 ogg files' },
      ],
    })
    expect(v.kind).toBe('fail')
    expect(v.reasons).toContain('✗ No forbidden strings — Found: window.top')
    expect(v.reasons).toContain('! iOS-risky audio — 2 ogg files')
    // Passing checks are not noise in the tooltip.
    expect(v.reasons.join(' ')).not.toContain('size')
  })

  it('warns on packaging warnings alone', () => {
    const v = railVerdict({ ...packed, warnings: ['no Google Play URL'] }, ok)
    expect(v.kind).toBe('warn')
    expect(v.reasons).toContain('! no Google Play URL')
  })

  it('lets a failure outrank a warning', () => {
    const v = railVerdict({ ...packed, warnings: ['minor'], withinLimit: false }, ok)
    expect(v.kind).toBe('fail')
  })
})

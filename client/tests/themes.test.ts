import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CATEGORIES, PRESET_THEMES, contrastRatio, ensureReadableTheme,
  minContrast, resolveTheme, sampleThemeColor, themeBackground,
} from '../src/shared/themes'
import type { ThemeDefinition } from '../src/shared/types'

function independentLuminance(color: readonly number[]): number {
  return color.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
}

function hexLuminance(color: string): number {
  return independentLuminance([1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16) / 255))
}

function denseContrast(theme: ThemeDefinition): number {
  const ink = hexLuminance(theme.ink)
  let worst = 21
  for (let index = 0; index <= 1024; index += 1) {
    const background = independentLuminance(sampleThemeColor(theme, index / 1024))
    worst = Math.min(worst, (Math.max(ink, background) + 0.05) / (Math.min(ink, background) + 0.05))
  }
  return worst
}

function custom(colors: string[]): ThemeDefinition {
  return {
    id: 'custom-test',
    name: '测试配色',
    category: '我的配色',
    stops: colors.map((color, index) => ({ color, position: index / (colors.length - 1) })),
    angle: 135,
    ink: '#000000',
  }
}

test('240 presets have stable unique identities, names and genuinely distinct color sets', () => {
  assert.equal(PRESET_THEMES.length, 240)
  assert.equal(new Set(PRESET_THEMES.map((theme) => theme.id)).size, 240)
  assert.equal(new Set(PRESET_THEMES.map((theme) => theme.name)).size, 240)
  assert.equal(new Set(PRESET_THEMES.map((theme) => theme.stops.map((stop) => stop.color).sort().join(','))).size, 240)
  for (const category of CATEGORIES) {
    assert.equal(PRESET_THEMES.filter((theme) => theme.category === category).length, 30, category)
  }
})

test('legacy colors and IDs remain exact and resolve without a migration mapping', () => {
  const originals = {
    lilac: ['#F4E8F3', '#DFDDF6', '#D5EBF1'],
    apricot: ['#FBEDD7', '#F5DFD5', '#EDD9E9'],
    sage: ['#F0EFD8', '#DCE9DB', '#D4E8E7'],
  }
  for (const [id, colors] of Object.entries(originals)) {
    const theme = resolveTheme(id)
    assert.equal(theme.id, id)
    assert.deepEqual(theme.stops.map((stop) => stop.color), colors)
    assert.equal(theme.overlay, undefined)
  }
})

test('all preset bodies pass 4.5:1 across the complete rendered gradient', () => {
  for (const theme of PRESET_THEMES) {
    assert.ok(minContrast(theme) >= 4.5, `${theme.name}: ${minContrast(theme)}`)
    assert.ok(denseContrast(theme) >= 4.5, `${theme.name} dense sampling`)
    assert.ok(theme.stops.every((stop) => /^#[\dA-F]{6}$/.test(stop.color)))
    assert.ok(theme.stops.every((stop) => stop.position >= 0 && stop.position <= 1))
  }
})

test('WCAG known reference values and interior luminance minima are handled', () => {
  assert.equal(contrastRatio('#000000', '#FFFFFF'), 21)
  assert.equal(contrastRatio('#f00', '#FF0000'), 1)
  const redGreen = custom(['#FF0000', '#00FF00'])
  const endpointOnly = Math.min(contrastRatio('#000000', '#FF0000'), contrastRatio('#000000', '#00FF00'))
  assert.ok(minContrast(redGreen) < endpointOnly - 0.5, 'must detect darker interpolated colors')
  const blackWhite = custom(['#000000', '#FFFFFF'])
  blackWhite.ink = '#888888'
  assert.equal(minContrast(blackWhite), 1, 'gradient crosses the ink luminance')
})

test('extreme custom palettes receive a minimal reading layer and survive serialization', () => {
  for (const colors of [
    ['#000000', '#FFFFFF'],
    ['#FF0000', '#00FF00', '#0000FF'],
    ['#FFFF00', '#000000', '#FFFFFF', '#0000FF'],
    ['#444444', '#888888'],
    ['#FFFFFF', '#FFFFFF'],
    ['#000000', '#000000'],
  ]) {
    const original = custom(colors)
    const snapshot = structuredClone(original)
    const readable = ensureReadableTheme(original)
    assert.deepEqual(original, snapshot, 'must not modify a saved palette in place')
    assert.ok(minContrast(readable) >= 4.5, colors.join(','))
    assert.ok(denseContrast(readable) >= 4.5, colors.join(','))
    assert.deepEqual(JSON.parse(JSON.stringify(readable)).stops, original.stops)
    if (readable.overlay) {
      assert.ok(readable.overlay.opacity <= 0.6, 'reading layer should preserve visible color')
      const lessLayer = { ...readable, overlay: { ...readable.overlay, opacity: readable.overlay.opacity - 0.002 } }
      assert.ok(minContrast(lessLayer) < 4.55, 'do not add a needlessly strong layer')
    }
  }
})

test('deterministic random custom palettes including hard edges remain readable', () => {
  let seed = 0x2410cafe
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 0x100000000
  }
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const colors = Array.from({ length: 2 + Math.floor(random() * 3) }, () =>
      `#${Math.floor(random() * 0x1000000).toString(16).padStart(6, '0').toUpperCase()}`)
    const candidate = custom(colors)
    if (attempt % 2 === 0) candidate.stops[1].position = candidate.stops[0].position
    candidate.angle = random() * 720 - 360
    const result = ensureReadableTheme(candidate)
    assert.ok(result.angle >= 0 && result.angle < 360)
    assert.ok(minContrast(result) >= 4.5, `custom ${attempt}`)
    assert.ok(denseContrast(result) >= 4.5, `custom ${attempt} dense sampling`)
  }
})

test('custom colors and positions normalize; resolution and CSS preserve user settings', () => {
  const value = custom(['#abc', '#def', '#123'])
  value.stops[0].position = 1.2
  value.stops[1].position = -0.2
  value.angle = -45
  const normalized = ensureReadableTheme(value)
  assert.deepEqual(normalized.stops.map((stop) => stop.position), [0, 1, 1])
  assert.equal(normalized.angle, 315)
  assert.ok(normalized.stops.every((stop) => /^#[\dA-F]{6}$/.test(stop.color)))
  assert.strictEqual(resolveTheme(normalized.id, [normalized]), normalized)
  assert.equal(resolveTheme('missing-id').id, 'lilac')
  assert.match(themeBackground(normalized), /^linear-gradient\(315deg in srgb,/)
  assert.match(themeBackground(normalized), /#DDEEFF 0%/)
  assert.match(themeBackground(normalized), /#AABBCC 100%/)
})

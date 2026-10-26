import assert from 'node:assert/strict'
import test from 'node:test'
import { PRESET_THEMES, ensureReadableTheme, minContrast, themeBackground } from '../src/shared/themes'
import { colorCycleKeyframes, dynamicGradientLayers, ensureDynamicReadableTheme, minDynamicContrast } from '../src/shared/dynamic-gradient'
import type { ThemeDefinition } from '../src/shared/types'

function custom(colors: string[], ink = '#252B3C'): ThemeDefinition {
  return { id:'test-motion', name:'动态测试', category:'我的配色', angle:123, ink,
    stops:colors.map((color,index) => ({ color, position:index / (colors.length - 1) })) }
}

function luminance(rgb: readonly number[]): number {
  return rgb.reduce((sum, channel, index) => sum + [0.2126,0.7152,0.0722][index] *
    (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4), 0)
}

function independentMixtureContrast(theme: ThemeDefinition, weights: readonly number[]): number {
  const total = weights.reduce((sum,value) => sum + value,0)
  const color = [0,0,0]
  const hex = (value:string) => [1,3,5].map(start => parseInt(value.slice(start,start+2),16) / 255)
  theme.stops.forEach((stop,index) => hex(stop.color).forEach((channel,k) => { color[k] += channel * weights[index] / total }))
  if (theme.overlay) {
    const over = hex(theme.overlay.color)
    color.forEach((channel,k) => { color[k] = channel * (1 - theme.overlay!.opacity) + over[k] * theme.overlay!.opacity })
  }
  const ink = luminance(hex(theme.ink))
  const background = luminance(color)
  return (Math.max(ink,background) + .05) / (Math.min(ink,background) + .05)
}

test('all 240 animated palettes stay readable across arbitrary node mixtures', () => {
  for (const original of PRESET_THEMES) {
    const snapshot = structuredClone(original)
    const theme = ensureDynamicReadableTheme(original)
    assert.ok(minDynamicContrast(theme) >= 4.5, original.name)
    assert.deepEqual(theme.stops, original.stops)
    assert.equal(theme.angle, original.angle)
    assert.deepEqual(original, snapshot, 'animation must not rewrite stored palettes')
    for (let a=0; a<=8; a++) for (let b=0; b<=8-a; b++) {
      assert.ok(independentMixtureContrast(theme,[a,b,8-a-b]) >= 4.5, `${original.name}: ${a},${b}`)
    }
  }
})

test('animation detects a dark non-adjacent blend missed by a static gradient', () => {
  // Static red -> green -> blue never mixes red with blue. During crossfade,
  // that non-adjacent mixture can become darker and invalidate the old ink.
  const theme = custom(['#FF0000','#00FF00','#0000FF'], '#000000')
  theme.stops[1].position = theme.stops[0].position
  theme.stops[2].position = theme.stops[0].position
  assert.ok(minContrast(theme) > minDynamicContrast(theme) + .1)
  const safe = ensureDynamicReadableTheme(theme)
  assert.ok(minDynamicContrast(safe) >= 4.5)
  for (let a=0; a<=20; a++) for (let b=0; b<=20-a; b++) {
    assert.ok(independentMixtureContrast(safe,[a,b,20-a-b]) >= 4.5)
  }
})

test('black-white and saturated four-node custom palettes retain color with a safe reading layer', () => {
  for (const colors of [
    ['#000000','#FFFFFF'],
    ['#FF0000','#00FF00','#0000FF'],
    ['#FF0000','#00FF00','#0000FF','#FFFFFF'],
    ['#000000','#FFFF00','#FFFFFF','#0000FF'],
  ]) {
    const original = ensureReadableTheme(custom(colors))
    const snapshot = structuredClone(original)
    const safe = ensureDynamicReadableTheme(original)
    assert.ok(minDynamicContrast(safe) >= 4.5)
    assert.deepEqual(safe.stops, original.stops)
    assert.deepEqual(original,snapshot)
    assert.ok(!safe.overlay || safe.overlay.opacity <= .6, 'keep the animated colors visible')
    for (let a=0; a<=8; a++) for (let b=0; b<=8-a; b++) for (let c=0; c<=8-a-b; c++) {
      const weights = colors.length === 2 ? [a,8-a] : colors.length === 3 ? [a,b,8-a-b] : [a,b,c,8-a-b-c]
      assert.ok(independentMixtureContrast(safe,weights) >= 4.5)
    }
    if (original.overlay && minDynamicContrast(original) >= 4.55) assert.deepEqual(safe.overlay,original.overlay)
  }
})

test('plain gradients retain palette nodes, positions and direction without localized lighting', () => {
  const theme = custom(['#102030','#A0B0C0','#506070','#D0E0F0'])
  theme.stops[1].position = .13
  theme.stops[2].position = .86
  const layers = dynamicGradientLayers(theme)
  const snapshot = structuredClone(theme)
  assert.equal(layers.length,4)
  assert.equal(new Set(layers).size,4)
  for (const background of layers) {
    assert.ok(background.startsWith('linear-gradient(123deg'))
    assert.ok(background.includes(' in srgb,'))
    const renderedColors = background.match(/#[\dA-F]{6}(?:[\dA-F]{2})?/g)!
    for (const color of renderedColors) assert.ok(theme.stops.some(stop => color.slice(0,7) === stop.color))
    assert.ok(background.includes('13%'))
    assert.ok(background.includes('86%'))
  }
  for (const color of theme.stops.map(stop => stop.color)) assert.ok(layers.some(layer => layer.includes(color)))
  assert.ok(themeBackground(theme).startsWith('linear-gradient(123deg in srgb,'))
  assert.ok(themeBackground(theme).includes('13%'))
  assert.ok(themeBackground(theme).includes('86%'))
  assert.deepEqual(theme,snapshot)
  for (const colors of [['#FF0000','#0000FF'],['#abc','#def']]) {
    assert.equal(dynamicGradientLayers(custom(colors)).length,2)
    assert.ok(dynamicGradientLayers(custom(colors)).every(background => !background.includes('undefined')))
  }
})

test('two, three and four-color cycles reach every stage and wrap without a visible reset', () => {
  for (const colors of [[.1,.9],[.1,.5,.9],[.1,.35,.65,.9]]) {
    const count = colors.length
    const animations = colors.slice(1).map((_, index) => colorCycleKeyframes(index + 1, count))
    const alphaAt = (frames: Keyframe[], time: number) => {
      let previous = frames[0]
      for (const frame of frames.slice(1)) {
        if (Number(frame.offset) > time) {
          const fraction = (time - Number(previous.offset)) / (Number(frame.offset) - Number(previous.offset))
          // The actual easing is symmetric, so midpoint and continuity checks
          // do not depend on the browser's cubic-bezier implementation.
          return Number(previous.opacity) + fraction * (Number(frame.opacity) - Number(previous.opacity))
        }
        previous = frame
      }
      return Number(previous.opacity)
    }
    const pixelAt = (time: number) => animations.reduce((pixel, frames, index) => {
      const alpha = alphaAt(frames, time)
      assert.ok(alpha >= 0 && alpha <= 1)
      return colors[index + 1] * alpha + pixel * (1 - alpha)
    }, colors[0])
    for (let stage = 0; stage < count; stage++) {
      assert.ok(Math.abs(pixelAt(stage / count) - colors[stage]) < 1e-9)
      const midpoint = pixelAt((stage + .5) / count)
      assert.ok(Math.abs(midpoint - (colors[stage] + colors[(stage + 1) % count]) / 2) < 1e-9)
      if (stage > 0) assert.ok(Math.abs(pixelAt(stage / count - 1e-8) - pixelAt(stage / count + 1e-8)) < 1e-6)
    }
    assert.equal(pixelAt(0), pixelAt(1))
    assert.ok(Math.abs(pixelAt(1 - 1e-8) - pixelAt(1e-8)) < 1e-6)
  }
})

import type { ThemeDefinition } from './types'
import { ensureReadableTheme, themeBackground } from './themes'

type RGB = readonly [number, number, number]
const WEIGHTS: RGB = [0.2126, 0.7152, 0.0722]
const DARK_INK = '#252B3C'
const LIGHT_INK = '#F6F7FF'
const TARGET = 4.55

function rgb(value: string): RGB {
  const hex = value.replace('#', '')
  const full = hex.length === 3 ? hex.split('').map(channel => channel + channel).join('') : hex
  if (!/^[\da-f]{6}$/i.test(full)) return [1, 1, 1]
  return [0, 2, 4].map(start => parseInt(full.slice(start, start + 2), 16) / 255) as unknown as RGB
}

function mix(a: RGB, b: RGB, amount: number): RGB {
  return a.map((value, index) => value + (b[index] - value) * amount) as unknown as RGB
}

function luminance(color: RGB): number {
  return color.reduce((sum, channel, index) => sum + WEIGHTS[index] * (channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4), 0)
}

function gradient(color: RGB): RGB {
  return color.map((channel, index) => WEIGHTS[index] * (channel <= 0.04045
    ? 1 / 12.92
    : 2.4 / 1.055 * ((channel + 0.055) / 1.055) ** 1.4)) as unknown as RGB
}

const dot = (a: RGB, b: RGB) => a.reduce((sum, channel, index) => sum + channel * b[index], 0)
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/**
 * Every animation layer uses ordinary sRGB gradients and source-over alpha.
 * Consequently every rendered pixel is in the convex hull of the palette,
 * including mixtures between non-adjacent and coincident color stops.
 *
 * Luminance is convex in encoded sRGB. Its maximum is at a palette vertex.
 * For the minimum, a Frank-Wolfe supporting plane supplies a conservative
 * lower bound, rather than trusting a finite pixel/time sample. The small
 * subtraction also covers the sRGB transfer function's rounded breakpoint.
 */
function hullLuminanceBounds(colors: readonly RGB[]): readonly [number, number] {
  let point = colors.reduce((best, candidate) => luminance(candidate) < luminance(best) ? candidate : best)
  let lower = 0
  for (let iteration = 0; iteration < 96; iteration += 1) {
    const derivative = gradient(point)
    const vertex = colors.reduce((best, candidate) => dot(derivative, candidate) < dot(derivative, best) ? candidate : best)
    const gap = dot(derivative, point) - dot(derivative, vertex)
    lower = Math.max(lower, luminance(point) - gap - 1e-7)
    if (gap < 1e-9) break
    let low = 0
    let high = 1
    for (let step = 0; step < 32; step += 1) {
      const left = low + (high - low) / 3
      const right = high - (high - low) / 3
      if (luminance(mix(point, vertex, left)) < luminance(mix(point, vertex, right))) high = right
      else low = left
    }
    point = mix(point, vertex, (low + high) / 2)
  }
  return [Math.max(0, lower), Math.max(...colors.map(luminance))]
}

/** Conservative contrast bound for every possible animated palette mixture. */
export function minDynamicContrast(theme: ThemeDefinition): number {
  if (!theme.stops.length) return 1
  const overlay = theme.overlay
  const colors = theme.stops.map(stop => overlay
    ? mix(rgb(stop.color), rgb(overlay.color), Math.max(0, Math.min(1, overlay.opacity)))
    : rgb(stop.color))
  const [low, high] = hullLuminanceBounds(colors)
  const ink = luminance(rgb(theme.ink))
  if (ink >= low && ink <= high) return 1
  return Math.min(ratio(ink, low), ratio(ink, high))
}

/**
 * Retains a safe saved ink/reading layer. Only palettes that need protection
 * receive a slightly stronger black/white layer or a different default ink.
 * Color nodes, positions, direction and saved theme data are never mutated.
 */
export function ensureDynamicReadableTheme(theme: ThemeDefinition): ThemeDefinition {
  const normalized = ensureReadableTheme(theme)
  const original: ThemeDefinition = {
    ...normalized,
    ink: /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(theme.ink) ? theme.ink : normalized.ink,
    overlay: theme.overlay && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(theme.overlay.color)
      && Number.isFinite(theme.overlay.opacity)
      ? { color: theme.overlay.color, opacity: Math.max(0, Math.min(1, theme.overlay.opacity)) }
      : normalized.overlay,
  }
  if (minDynamicContrast(original) >= TARGET) return original
  const base = { ...normalized, overlay: undefined }
  const dark = { ...base, ink: DARK_INK }
  const light = { ...base, ink: LIGHT_INK }
  const darkContrast = minDynamicContrast(dark)
  const lightContrast = minDynamicContrast(light)
  if (Math.max(darkContrast, lightContrast) >= TARGET) return darkContrast >= lightContrast ? dark : light
  const readable = (ink: string, color: string): ThemeDefinition => {
    let low = 0
    let high = 1
    for (let step = 0; step < 20; step += 1) {
      const opacity = (low + high) / 2
      if (minDynamicContrast({ ...base, ink, overlay: { color, opacity } }) >= TARGET) high = opacity
      else low = opacity
    }
    return { ...base, ink, overlay: { color, opacity: Math.ceil(high * 10000) / 10000 } }
  }
  const darkLayer = readable(DARK_INK, '#FFFFFF')
  const lightLayer = readable(LIGHT_INK, '#000000')
  return darkLayer.overlay!.opacity <= lightLayer.overlay!.opacity ? darkLayer : lightLayer
}

/** Plain full-window gradients only; no localized pools, glow or curved bands. */
export function dynamicGradientLayers(theme: ThemeDefinition): readonly string[] {
  const stops = [...theme.stops].sort((a, b) => a.position - b.position)
  if (!stops.length) return []
  return stops.map((_, offset) => themeBackground({
    ...theme,
    stops: stops.map((stop, index) => ({ ...stop, color: stops[(index + offset) % stops.length].color })),
  }))
}

export const COLOR_CYCLE_SEGMENT_MS = 12_000

/**
 * Crossfade complete gradients, then reset a covered layer only while its
 * successor is opaque. The last layer fades directly back to the opaque base,
 * so the loop has no visible reset or transparent gap.
 */
export function colorCycleKeyframes(stage: number, count: number): Keyframe[] {
  if (stage < 1 || stage >= count || count < 2) return []
  const frames: Keyframe[] = [
    { offset: 0, opacity: 0 },
    { offset: (stage - 1) / count, opacity: 0 },
    { offset: stage / count, opacity: 1 },
  ]
  if (stage < count - 1) {
    frames.push(
      { offset: (stage + 1) / count, opacity: 1 },
      { offset: (stage + 1) / count, opacity: 0 },
      { offset: 1, opacity: 0 },
    )
  } else frames.push({ offset: 1, opacity: 0 })
  return frames.map(frame => ({ ...frame, easing: 'ease-in-out' }))
}

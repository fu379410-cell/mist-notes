import { useEffect, useMemo, useRef } from 'react'
import type { ThemeDefinition } from './shared/types'
import { COLOR_CYCLE_SEGMENT_MS, colorCycleKeyframes, dynamicGradientLayers, ensureDynamicReadableTheme } from './shared/dynamic-gradient'
import './dynamic-background.css'

/** Place first inside .note-shell. This layer owns the uniform reading overlay. */
export function DynamicBackground({ theme }: { theme: ThemeDefinition }) {
  const readable = useMemo(() => ensureDynamicReadableTheme(theme), [theme])
  const layers = useMemo(() => dynamicGradientLayers(readable), [readable])
  const root = useRef<HTMLDivElement>(null)
  // The parent also renders on keystrokes and saves. Content, rather than
  // object identity, owns the timeline so those renders never restart it.
  const cycleSignature = JSON.stringify(layers)
  useEffect(() => {
    const elements = root.current?.querySelectorAll<HTMLElement>('.dynamic-gradient-layer')
    if (!elements?.length) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const count = elements.length + 1
    const startTime = document.timeline.currentTime
    const animations = Array.from(elements, (element, index) => {
      const animation = element.animate(colorCycleKeyframes(index + 1, count), {
        duration: count * COLOR_CYCLE_SEGMENT_MS, iterations: Infinity,
      })
      animation.playbackRate = reducedMotion.matches ? 1 / 3 : 1
      animation.startTime = startTime
      return animation
    })
    const changeSpeed = () => {
      const currentTime = animations[0].currentTime
      for (const animation of animations) {
        animation.playbackRate = reducedMotion.matches ? 1 / 3 : 1
        animation.currentTime = currentTime
      }
    }
    reducedMotion.addEventListener('change', changeSpeed)
    return () => {
      reducedMotion.removeEventListener('change', changeSpeed)
      animations.forEach(animation => animation.cancel())
    }
  }, [cycleSignature])
  return <div ref={root} className="dynamic-background" aria-hidden="true" data-motion="continuous-color-cycle" data-cycle-seconds={layers.length * COLOR_CYCLE_SEGMENT_MS / 1000}>
    <div className="dynamic-gradient-base" style={{ background: layers[0] }}/>
    {layers.slice(1).map((background, index) => <div
      key={index}
      className="dynamic-gradient-layer"
      style={{ background }}
    />)}
    {readable.overlay && <div className="dynamic-reading-layer" style={{ background: readable.overlay.color, opacity: readable.overlay.opacity }}/>}
  </div>
}

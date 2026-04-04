/**
 * useSensors – manages DeviceMotion and DeviceOrientation event listeners.
 *
 * Usage:
 *   const { requestPermission, startListening, stopListening, latestSample } = useSensors(sessionId)
 */

import { useRef, useState, useCallback } from 'react'
import type { RawMotionSample, RawOrientationSample } from '../types/sensors'
import { appendMotion, appendOrientation } from '../db/database'

export type PermissionState = 'unknown' | 'granted' | 'denied' | 'unsupported'

export interface LatestMotion {
  gTotal: number   // magnitude in G
  gLateral: number
  gLongitudinal: number
  gVertical: number
}

export function useSensors(sessionId: string | null) {
  const [permState, setPermState] = useState<PermissionState>('unknown')
  const [latest, setLatest] = useState<LatestMotion>({ gTotal: 0, gLateral: 0, gLongitudinal: 0, gVertical: 0 })
  const activeRef = useRef(false)
  // Throttle UI updates to ~10 Hz to avoid excessive re-renders
  const lastUiUpdate = useRef(0)

  /** iOS Safari requires requestPermission to be called from a user gesture. */
  const requestPermission = useCallback(async (): Promise<PermissionState> => {
    if (typeof DeviceMotionEvent === 'undefined') {
      setPermState('unsupported')
      return 'unsupported'
    }
    // @ts-expect-error – requestPermission is iOS-only
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        // @ts-expect-error
        const result: string = await DeviceMotionEvent.requestPermission()
        const state: PermissionState = result === 'granted' ? 'granted' : 'denied'
        setPermState(state)
        return state
      } catch {
        setPermState('denied')
        return 'denied'
      }
    }
    // Non-iOS: permission not required
    setPermState('granted')
    return 'granted'
  }, [])

  const handleMotion = useCallback((e: DeviceMotionEvent) => {
    if (!activeRef.current || !sessionId) return
    const t = performance.now()

    const axG = e.accelerationIncludingGravity?.x ?? 0
    const ayG = e.accelerationIncludingGravity?.y ?? 0
    const azG = e.accelerationIncludingGravity?.z ?? 0

    const sample: RawMotionSample = {
      t,
      axG, ayG, azG,
      ax: e.acceleration?.x ?? null,
      ay: e.acceleration?.y ?? null,
      az: e.acceleration?.z ?? null,
      alpha: e.rotationRate?.alpha ?? null,
      beta:  e.rotationRate?.beta  ?? null,
      gamma: e.rotationRate?.gamma ?? null,
    }

    // Fire-and-forget write to IndexedDB
    appendMotion(sessionId, sample)

    // Throttle UI state updates
    const now = performance.now()
    if (now - lastUiUpdate.current > 100) {
      lastUiUpdate.current = now
      const G = 9.80665
      const gLateral      = axG / G
      const gLongitudinal = ayG / G
      const gVertical     = (azG + G) / G  // rough vertical (device frame)
      const gTotal = Math.sqrt(gLateral ** 2 + gLongitudinal ** 2 + gVertical ** 2)
      setLatest({ gTotal, gLateral, gLongitudinal, gVertical })
    }
  }, [sessionId])

  const handleOrientation = useCallback((e: DeviceOrientationEvent) => {
    if (!activeRef.current || !sessionId) return
    const sample: RawOrientationSample = {
      t:       performance.now(),
      alpha:   e.alpha,
      beta:    e.beta,
      gamma:   e.gamma,
      absolute: (e as DeviceOrientationEvent & { absolute: boolean }).absolute ?? false,
    }
    appendOrientation(sessionId, sample)
  }, [sessionId])

  const startListening = useCallback(() => {
    activeRef.current = true
    window.addEventListener('devicemotion',      handleMotion)
    window.addEventListener('deviceorientation', handleOrientation)
  }, [handleMotion, handleOrientation])

  const stopListening = useCallback(() => {
    activeRef.current = false
    window.removeEventListener('devicemotion',      handleMotion)
    window.removeEventListener('deviceorientation', handleOrientation)
  }, [handleMotion, handleOrientation])

  return { permState, requestPermission, startListening, stopListening, latest }
}

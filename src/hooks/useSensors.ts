/**
 * useSensors – manages DeviceMotion and DeviceOrientation event listeners.
 *
 * Design note: handleMotion / handleOrientation are intentionally created ONCE
 * (empty dependency array) and read sessionId through a ref to avoid the
 * classic "stale closure + event listener" bug. If we closed over sessionId
 * directly, the event listener would be registered with the pre-setState value
 * of sessionId (null) and the DB writes / UI updates would never fire.
 */

import { useRef, useState, useCallback } from 'react'
import type { RawMotionSample, RawOrientationSample } from '../types/sensors'
import { appendMotion, appendOrientation } from '../db/database'
import { GravityFilter } from '../processing/fusion'

export type PermissionState = 'unknown' | 'granted' | 'denied' | 'unsupported'

export interface LatestMotion {
  gTotal: number
  gLateral: number
  gLongitudinal: number
  gVertical: number
}

export function useSensors() {
  const [permState, setPermState] = useState<PermissionState>('unknown')
  const [latest, setLatest] = useState<LatestMotion>({
    gTotal: 0, gLateral: 0, gLongitudinal: 0, gVertical: 0,
  })

  const activeRef    = useRef(false)
  const sessionIdRef = useRef<string | null>(null)  // always current, no re-render lag
  const lastUiUpdate = useRef(0)
  // Gravity filter for live display — works at any phone orientation
  const gravFilter   = useRef(new GravityFilter(0.8))

  // ── iOS permission request (must be called from a user gesture) ─────────────
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
    // Non-iOS: no permission needed
    setPermState('granted')
    return 'granted'
  }, [])

  // ── Stable event handlers (created once, read sessionId via ref) ────────────
  const handleMotion = useCallback((e: DeviceMotionEvent) => {
    if (!activeRef.current) return

    const t   = performance.now()
    const axG = e.accelerationIncludingGravity?.x ?? 0
    const ayG = e.accelerationIncludingGravity?.y ?? 0
    const azG = e.accelerationIncludingGravity?.z ?? 0

    // Fire-and-forget DB write only when a session is active
    const sid = sessionIdRef.current
    if (sid) {
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
      appendMotion(sid, sample) // intentionally not awaited
    }

    // Throttled UI update (always, so realtime G shows during recording)
    const now = performance.now()
    if (now - lastUiUpdate.current > 100) {
      lastUiUpdate.current = now
      const G = 9.80665

      // Always update gravity filter with raw accel (needed for gVertical)
      gravFilter.current.update(axG, ayG, azG)
      const gf = gravFilter.current

      // Linear acceleration: prefer OS-provided (Core Motion on iOS), fall back to EMA filter
      const ax = e.acceleration?.x ?? null
      const ay = e.acceleration?.y ?? null
      const az = e.acceleration?.z ?? null
      const linX = ax ?? (axG - gf.gx)
      const linY = ay ?? (ayG - gf.gy)
      const linZ = az ?? (azG - gf.gz)

      // gTotal: magnitude of linear accel (orientation-independent, always correct)
      const gTotal = Math.sqrt(linX ** 2 + linY ** 2 + linZ ** 2) / G

      // gVertical: projection onto the "up" direction (opposite to gravity estimate)
      // Works correctly at any phone orientation — no compass needed
      const gravMag = Math.sqrt(gf.gx ** 2 + gf.gy ** 2 + gf.gz ** 2) || G
      const upX = -gf.gx / gravMag
      const upY = -gf.gy / gravMag
      const upZ = -gf.gz / gravMag
      const gVertical = (linX * upX + linY * upY + linZ * upZ) / G

      // gLateral / gLongitudinal: device-frame components (already gravity-free)
      // Device X ≈ right (lateral), Device Y ≈ toward top of screen (longitudinal)
      const gLateral      = linX / G
      const gLongitudinal = linY / G

      setLatest({ gTotal, gLateral, gLongitudinal, gVertical })
    }
  }, []) // stable – no deps, reads via refs

  const handleOrientation = useCallback((e: DeviceOrientationEvent) => {
    if (!activeRef.current) return
    const sid = sessionIdRef.current
    if (!sid) return

    const sample: RawOrientationSample = {
      t:        performance.now(),
      alpha:    e.alpha,
      beta:     e.beta,
      gamma:    e.gamma,
      absolute: (e as DeviceOrientationEvent & { absolute: boolean }).absolute ?? false,
    }
    appendOrientation(sid, sample) // intentionally not awaited
  }, []) // stable

  // ── Start / stop ─────────────────────────────────────────────────────────────
  const startListening = useCallback((sessionId: string) => {
    sessionIdRef.current = sessionId   // set BEFORE activating, synchronously
    activeRef.current    = true
    gravFilter.current   = new GravityFilter(0.8)  // re-initialize for current orientation
    window.addEventListener('devicemotion',      handleMotion)
    window.addEventListener('deviceorientation', handleOrientation)
  }, [handleMotion, handleOrientation])

  const stopListening = useCallback(() => {
    activeRef.current    = false
    sessionIdRef.current = null
    window.removeEventListener('devicemotion',      handleMotion)
    window.removeEventListener('deviceorientation', handleOrientation)
  }, [handleMotion, handleOrientation])

  return { permState, requestPermission, startListening, stopListening, latest }
}

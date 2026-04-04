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
      // Raw device-frame approximation for live display
      // iOS: accelerationIncludingGravity.z ≈ -9.81 when face-up, so +G cancels it
      const gLateral      = axG / G
      const gLongitudinal = ayG / G
      const gVertical     = (azG + G) / G
      const gTotal = Math.sqrt(gLateral ** 2 + gLongitudinal ** 2 + gVertical ** 2)
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

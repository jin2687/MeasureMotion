import { useRef, useCallback } from 'react'
import type { RawGpsSample } from '../types/sensors'
import { appendGps } from '../db/database'

export function useGeolocation() {
  const watchIdRef   = useRef<number | null>(null)
  const sessionIdRef = useRef<string | null>(null)

  const startTracking = useCallback((sessionId: string) => {
    if (!('geolocation' in navigator)) return
    sessionIdRef.current = sessionId

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const sid = sessionIdRef.current
        if (!sid) return
        const sample: RawGpsSample = {
          t:           performance.now(),
          lat:         pos.coords.latitude,
          lng:         pos.coords.longitude,
          alt:         pos.coords.altitude,
          accuracy:    pos.coords.accuracy,
          altAccuracy: pos.coords.altitudeAccuracy,
          speed:       pos.coords.speed,
          heading:     pos.coords.heading,
        }
        appendGps(sid, sample)
      },
      () => { /* GPS error – non-fatal */ },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10_000,
      },
    )
  }, [])

  const stopTracking = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    sessionIdRef.current = null
  }, [])

  return { startTracking, stopTracking }
}

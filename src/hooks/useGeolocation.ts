import { useRef, useCallback } from 'react'
import type { RawGpsSample } from '../types/sensors'
import { appendGps } from '../db/database'

export function useGeolocation(sessionId: string | null) {
  const watchIdRef = useRef<number | null>(null)

  const startTracking = useCallback(() => {
    if (!('geolocation' in navigator)) return
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (!sessionId) return
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
        appendGps(sessionId, sample)
      },
      () => { /* GPS error – non-fatal */ },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10_000,
      },
    )
  }, [sessionId])

  const stopTracking = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [])

  return { startTracking, stopTracking }
}

/**
 * Main processing pipeline.
 *
 * Input:  raw motion, orientation, GPS samples from IndexedDB
 * Output: ProcessedSession with trajectory and G-force time series
 *
 * Pipeline:
 *   1. Interpolate orientation at each motion sample timestamp
 *   2. Convert device-frame accel → ENU world frame via quaternion rotation
 *   3. Remove gravity (0, 0, +9.80665 m/s² in ENU Up direction)
 *   4. Integrate: accel → velocity → position (trapezoidal rule)
 *   5. GPS sensor fusion: correct accumulated drift at each GPS anchor
 */

import type {
  RawMotionSample,
  RawOrientationSample,
  RawGpsSample,
  ProcessedSample,
  ProcessedSession,
} from '../types/sensors'
import {
  orientationToQuaternion,
  rotateVector,
  slerp,
  type Quaternion,
} from './quaternion'

const G = 9.80665 // m/s²

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Convert WGS84 lat/lng to ENU metres relative to origin. */
function latlngToEnu(
  lat: number, lng: number, alt: number,
  originLat: number, originLng: number, originAlt: number,
): { east: number; north: number; up: number } {
  const R = 6_378_137 // metres (WGS84 semi-major axis)
  const dLat = (lat - originLat) * (Math.PI / 180)
  const dLng = (lng - originLng) * (Math.PI / 180)
  const latMid = ((lat + originLat) / 2) * (Math.PI / 180)
  return {
    east:  R * dLng * Math.cos(latMid),
    north: R * dLat,
    up:    alt - originAlt,
  }
}

/** Find the orientation sample bracket for time t and return slerp'd quaternion. */
function interpolateOrientation(
  orientSamples: (RawOrientationSample & { q: Quaternion })[],
  t: number,
): Quaternion {
  if (orientSamples.length === 0) return { w: 1, x: 0, y: 0, z: 0 }
  if (t <= orientSamples[0].t) return orientSamples[0].q
  const last = orientSamples[orientSamples.length - 1]
  if (t >= last.t) return last.q

  // Binary search for bracket
  let lo = 0, hi = orientSamples.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (orientSamples[mid].t <= t) lo = mid; else hi = mid
  }
  const t0 = orientSamples[lo].t, t1 = orientSamples[hi].t
  const frac = t1 === t0 ? 0 : (t - t0) / (t1 - t0)
  return slerp(orientSamples[lo].q, orientSamples[hi].q, frac)
}

// ─── main ─────────────────────────────────────────────────────────────────────

export function processSession(
  sessionId: string,
  motionRaw: RawMotionSample[],
  orientRaw: RawOrientationSample[],
  gpsRaw: RawGpsSample[],
): ProcessedSession {
  if (motionRaw.length === 0) {
    return {
      sessionId,
      samples: [],
      originLat: null,
      originLng: null,
      peakG: 0,
      avgG: 0,
      duration: 0,
    }
  }

  const t0 = motionRaw[0].t  // reference timestamp [ms]

  // ── Step 1: pre-compute quaternions for each orientation sample ─────────────
  const orientWithQ = orientRaw
    .filter(s => s.alpha != null && s.beta != null && s.gamma != null)
    .map(s => ({
      ...s,
      q: orientationToQuaternion(s.alpha!, s.beta!, s.gamma!),
    }))

  // ── Step 2: GPS origin ──────────────────────────────────────────────────────
  const originLat = gpsRaw.length > 0 ? gpsRaw[0].lat : null
  const originLng = gpsRaw.length > 0 ? gpsRaw[0].lng : null
  const originAlt = gpsRaw.length > 0 ? (gpsRaw[0].alt ?? 0) : 0

  // ── Step 3: integrate motion samples ──────────────────────────────────────
  let vEast = 0, vNorth = 0, vUp = 0
  let pEast = 0, pNorth = 0, pUp = 0
  let prevT = motionRaw[0].t

  const samples: ProcessedSample[] = []

  // GPS anchor lookup: pre-convert GPS to ENU
  const gpsAnchors = originLat != null
    ? gpsRaw.map(g => ({
        t: g.t,
        east:  latlngToEnu(g.lat, g.lng, g.alt ?? originAlt, originLat!, originLng!, originAlt).east,
        north: latlngToEnu(g.lat, g.lng, g.alt ?? originAlt, originLat!, originLng!, originAlt).north,
        up:    latlngToEnu(g.lat, g.lng, g.alt ?? originAlt, originLat!, originLng!, originAlt).up,
      }))
    : []

  let gpsIdx = 0
  // Drift correction state (reset when GPS update arrives)
  let driftCorrEast = 0, driftCorrNorth = 0, driftCorrUp = 0

  for (let i = 0; i < motionRaw.length; i++) {
    const m = motionRaw[i]
    const dt = (m.t - prevT) / 1000  // seconds
    prevT = m.t

    // Use accelerationIncludingGravity (always available on iOS)
    // iOS reports in m/s², device frame: X=right, Y=up, Z=toward user
    const axD = m.axG; const ayD = m.ayG; const azD = m.azG

    // Rotate device-frame accel to ENU world frame
    const q = interpolateOrientation(orientWithQ, m.t)
    const aWorld = rotateVector(q, axD, ayD, azD)

    // Remove gravity (ENU: gravity is along -Up = -z_world)
    const aEast  = aWorld.x
    const aNorth = aWorld.y
    const aUp    = aWorld.z + G  // add G to cancel gravity in Up direction

    // Trapezoidal integration: velocity
    if (i > 0 && dt > 0 && dt < 0.5) {
      vEast  += aEast  * dt
      vNorth += aNorth * dt
      vUp    += aUp    * dt

      // position from velocity
      pEast  += vEast  * dt
      pNorth += vNorth * dt
      pUp    += vUp    * dt
    }

    // ── GPS drift correction ─────────────────────────────────────────────────
    while (gpsIdx < gpsAnchors.length && gpsAnchors[gpsIdx].t <= m.t) {
      const gps = gpsAnchors[gpsIdx]
      // Compute drift between GPS and integrated position
      driftCorrEast  = gps.east  - pEast
      driftCorrNorth = gps.north - pNorth
      driftCorrUp    = gps.up    - pUp
      // Snap velocity to zero when a GPS fix arrives (simple reset)
      // — prevents velocity drift accumulating between fixes
      vEast = 0; vNorth = 0; vUp = 0
      gpsIdx++
    }
    // Apply accumulated correction (complementary filter, α=0.2 towards GPS)
    const alpha = 0.2
    const correctedEast  = pEast  + driftCorrEast  * alpha
    const correctedNorth = pNorth + driftCorrNorth * alpha
    const correctedUp    = pUp    + driftCorrUp    * alpha

    // G-force (divide by g)
    const gLateral      = aEast  / G
    const gLongitudinal = aNorth / G
    const gVertical     = aUp    / G
    const gTotal        = Math.sqrt(gLateral ** 2 + gLongitudinal ** 2 + gVertical ** 2)

    samples.push({
      t: (m.t - t0) / 1000,
      aEast, aNorth, aUp,
      gLateral, gLongitudinal, gVertical, gTotal,
      posEast:  correctedEast,
      posNorth: correctedNorth,
      posUp:    correctedUp,
    })
  }

  // ── Step 4: statistics ──────────────────────────────────────────────────────
  const gValues = samples.map(s => s.gTotal)
  const peakG = Math.max(...gValues)
  const avgG  = gValues.reduce((a, b) => a + b, 0) / gValues.length
  const duration = samples.length > 0 ? samples[samples.length - 1].t : 0

  return {
    sessionId,
    samples,
    originLat,
    originLng,
    peakG,
    avgG,
    duration,
  }
}

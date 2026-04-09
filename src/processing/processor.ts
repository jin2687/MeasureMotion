/**
 * Main processing pipeline.
 *
 * Input:  raw motion, orientation, GPS samples from IndexedDB
 * Output: ProcessedSession with trajectory and G-force time series
 *
 * Pipeline:
 *   1. Complementary gravity filter: track gravity vector in device frame via EMA
 *   2. Extract linear acceleration: prefer OS-provided (Core Motion) over software filter
 *   3. Rotate linear accel to ENU world frame via quaternion (orientation samples)
 *   4. Integrate: accel → velocity → position (Euler integration)
 *   5. GPS sensor fusion: set velocity from GPS Doppler speed at each fix;
 *      apply position correction to reduce accumulated drift
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
import { GravityFilter, extractLinearAccel } from './fusion'

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

  // ── Step 3: GPS anchors (ENU positions + Doppler velocity) ─────────────────
  const gpsAnchors = originLat != null
    ? gpsRaw.map(g => {
        const enu = latlngToEnu(g.lat, g.lng, g.alt ?? originAlt, originLat!, originLng!, originAlt)
        // GPS speed + heading → ENU velocity vector
        // heading: degrees from North, clockwise (matches navigator.geolocation spec)
        const hasVelocity = g.speed != null && g.heading != null
        const headingRad = (g.heading ?? 0) * (Math.PI / 180)
        return {
          t:       g.t,
          east:    enu.east,
          north:   enu.north,
          up:      enu.up,
          vEast:   hasVelocity ? g.speed! * Math.sin(headingRad) : null,
          vNorth:  hasVelocity ? g.speed! * Math.cos(headingRad) : null,
        }
      })
    : []

  // ── Step 4: integrate motion samples ──────────────────────────────────────
  const gravFilter = new GravityFilter(0.8)

  let vEast = 0, vNorth = 0, vUp = 0
  let pEast = 0, pNorth = 0, pUp = 0
  let prevT = motionRaw[0].t

  let gpsIdx = 0
  let driftCorrEast = 0, driftCorrNorth = 0, driftCorrUp = 0

  const samples: ProcessedSample[] = []

  for (let i = 0; i < motionRaw.length; i++) {
    const m = motionRaw[i]
    const dt = (m.t - prevT) / 1000  // seconds
    prevT = m.t

    // ── Extract gravity-free linear acceleration in device frame ──────────────
    // Prefer OS-provided (iOS Core Motion does hardware sensor fusion).
    // Fall back to EMA gravity filter subtraction.
    const { linX, linY, linZ } = extractLinearAccel(
      m.axG, m.ayG, m.azG,
      m.ax,  m.ay,  m.az,
      gravFilter,
    )

    // ── Rotate linear accel to ENU world frame ────────────────────────────────
    // The quaternion from DeviceOrientation maps device frame → ENU.
    // Since linX/Y/Z is already gravity-free, no gravity subtraction needed.
    const q = interpolateOrientation(orientWithQ, m.t)
    const aWorld = rotateVector(q, linX, linY, linZ)
    const aEast  = aWorld.x
    const aNorth = aWorld.y
    const aUp    = aWorld.z

    // ── Velocity and position integration ─────────────────────────────────────
    if (i > 0 && dt > 0 && dt < 0.5) {
      vEast  += aEast  * dt
      vNorth += aNorth * dt
      vUp    += aUp    * dt

      pEast  += vEast  * dt
      pNorth += vNorth * dt
      pUp    += vUp    * dt
    }

    // Travel heading from velocity vector (0°=North, 90°=East, clockwise)
    const heading = vEast === 0 && vNorth === 0
      ? 0
      : ((Math.atan2(vEast, vNorth) * 180 / Math.PI) + 360) % 360
    const speed = Math.sqrt(vEast ** 2 + vNorth ** 2 + vUp ** 2)

    // ── GPS drift correction ─────────────────────────────────────────────────
    while (gpsIdx < gpsAnchors.length && gpsAnchors[gpsIdx].t <= m.t) {
      const gps = gpsAnchors[gpsIdx]

      // Position drift: difference between GPS fix and integrated position
      driftCorrEast  = gps.east  - pEast
      driftCorrNorth = gps.north - pNorth
      driftCorrUp    = gps.up    - pUp

      // Velocity correction: use GPS Doppler speed+heading when available
      // (Doppler velocity is ~0.1 m/s accurate vs ~1-3 m/s for position differencing)
      if (gps.vEast != null && gps.vNorth != null) {
        vEast  = gps.vEast
        vNorth = gps.vNorth
        // Keep vUp from IMU — GPS vertical speed is rarely reliable
      } else {
        // No GPS velocity: snap to zero to prevent unbounded drift
        vEast = 0; vNorth = 0; vUp = 0
      }

      gpsIdx++
    }

    // Apply position correction with a complementary filter (α=0.3 towards GPS)
    // Higher α = stronger GPS pull, lower = smoother trajectory
    const alpha = 0.3
    const correctedEast  = pEast  + driftCorrEast  * alpha
    const correctedNorth = pNorth + driftCorrNorth * alpha
    const correctedUp    = pUp    + driftCorrUp    * alpha

    // ── G-force computation ───────────────────────────────────────────────────
    // gTotal from linear accel magnitude — orientation-independent, always correct.
    const gTotal = Math.sqrt(linX ** 2 + linY ** 2 + linZ ** 2) / G

    // Gravity direction in device frame (from EMA filter)
    const gravMag = Math.sqrt(gravFilter.gx ** 2 + gravFilter.gy ** 2 + gravFilter.gz ** 2) || G
    // "Up" unit vector in device frame (opposite to gravity)
    const upX = -gravFilter.gx / gravMag
    const upY = -gravFilter.gy / gravMag
    const upZ = -gravFilter.gz / gravMag

    // gVertical: projection of linear accel onto the rider "up" direction
    // This works at any phone orientation without needing compass.
    const gVertical = (linX * upX + linY * upY + linZ * upZ) / G

    // gLateral / gLongitudinal: ENU-based decomposition for geographic consistency.
    // East = lateral, North = longitudinal (correct when heading is North;
    // for arbitrary heading use GPS heading to rotate if needed).
    const gLateral      = aEast  / G
    const gLongitudinal = aNorth / G

    samples.push({
      t: (m.t - t0) / 1000,
      aEast, aNorth, aUp,
      gLateral, gLongitudinal, gVertical, gTotal,
      posEast:  correctedEast,
      posNorth: correctedNorth,
      posUp:    correctedUp,
      heading,
      speed,
    })
  }

  // ── Step 5: statistics ──────────────────────────────────────────────────────
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

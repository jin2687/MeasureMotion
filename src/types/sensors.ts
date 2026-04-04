// ─── Raw sensor sample (written to IndexedDB at measurement time) ───────────

export interface RawMotionSample {
  t: number          // performance.now() timestamp [ms]
  // DeviceMotionEvent.accelerationIncludingGravity
  axG: number; ayG: number; azG: number
  // DeviceMotionEvent.acceleration (gravity removed by OS, may be null)
  ax: number | null; ay: number | null; az: number | null
  // DeviceMotionEvent.rotationRate
  alpha: number | null; beta: number | null; gamma: number | null
}

export interface RawOrientationSample {
  t: number          // performance.now() timestamp [ms]
  // DeviceOrientationEvent – all in degrees
  alpha: number | null  // compass heading (0–360)
  beta: number | null   // front/back tilt (-180–180)
  gamma: number | null  // left/right tilt (-90–90)
  absolute: boolean
}

export interface RawGpsSample {
  t: number          // performance.now() timestamp [ms]
  lat: number
  lng: number
  alt: number | null
  accuracy: number
  altAccuracy: number | null
  speed: number | null
  heading: number | null
}

// ─── Recording session metadata ──────────────────────────────────────────────

export type SessionStatus = 'recording' | 'processing' | 'done' | 'error'

export interface Session {
  id: string                 // uuid v4
  name: string
  startTime: number          // Date.now() when recording started
  endTime: number | null
  status: SessionStatus
  sampleCount: number        // total motion samples
  gpsSampleCount: number
}

// ─── Processed data (computed after recording) ───────────────────────────────

export interface Vec3 { x: number; y: number; z: number }

export interface ProcessedSample {
  t: number          // seconds from session start
  // World-frame (ENU) linear acceleration [m/s²] — gravity removed
  aEast: number; aNorth: number; aUp: number
  // G-force components (divided by 9.81)
  gLateral: number   // left/right
  gLongitudinal: number // forward/backward
  gVertical: number  // up/down
  gTotal: number     // magnitude
  // Integrated trajectory (ENU, metres from origin)
  posEast: number; posNorth: number; posUp: number
  // Heading: travel direction in degrees from North (0=N, 90=E, 180=S, 270=W)
  // Derived from the instantaneous velocity vector (atan2(vEast, vNorth))
  heading: number
  // Instantaneous speed [m/s] from velocity magnitude
  speed: number
}

export interface ProcessedSession {
  sessionId: string
  samples: ProcessedSample[]
  originLat: number | null
  originLng: number | null
  peakG: number
  avgG: number
  duration: number   // seconds
}

// ─── Export format ───────────────────────────────────────────────────────────

export interface ExportData {
  version: 1
  session: Session
  processed: ProcessedSession
  raw?: {
    motion: RawMotionSample[]
    orientation: RawOrientationSample[]
    gps: RawGpsSample[]
  }
}

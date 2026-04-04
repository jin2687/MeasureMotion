/**
 * Quaternion math utilities for sensor fusion.
 *
 * Coordinate conventions:
 *   Device frame: X = right, Y = up (screen), Z = toward user
 *   World frame:  East-North-Up (ENU)
 *     E = east,  N = north,  U = up
 *
 * DeviceOrientationEvent angles (all in degrees):
 *   alpha – compass azimuth, 0 = north, clockwise
 *   beta  – pitch, front up = positive
 *   gamma – roll,  right side down = positive
 */

export interface Quaternion {
  w: number; x: number; y: number; z: number
}

/** Return unit quaternion from axis-angle (radians). */
export function fromAxisAngle(ax: number, ay: number, az: number, angle: number): Quaternion {
  const s = Math.sin(angle / 2)
  return { w: Math.cos(angle / 2), x: ax * s, y: ay * s, z: az * s }
}

/** Hamilton product q1 * q2. */
export function multiply(q1: Quaternion, q2: Quaternion): Quaternion {
  return {
    w: q1.w * q2.w - q1.x * q2.x - q1.y * q2.y - q1.z * q2.z,
    x: q1.w * q2.x + q1.x * q2.w + q1.y * q2.z - q1.z * q2.y,
    y: q1.w * q2.y - q1.x * q2.z + q1.y * q2.w + q1.z * q2.x,
    z: q1.w * q2.z + q1.x * q2.y - q1.y * q2.x + q1.z * q2.w,
  }
}

/** Conjugate (= inverse for unit quaternions). */
export function conjugate(q: Quaternion): Quaternion {
  return { w: q.w, x: -q.x, y: -q.y, z: -q.z }
}

/**
 * Rotate vector v by quaternion q: v' = q * v * q*
 * Returns { x, y, z }.
 */
export function rotateVector(
  q: Quaternion,
  vx: number, vy: number, vz: number,
): { x: number; y: number; z: number } {
  const qv: Quaternion = { w: 0, x: vx, y: vy, z: vz }
  const r = multiply(multiply(q, qv), conjugate(q))
  return { x: r.x, y: r.y, z: r.z }
}

const DEG = Math.PI / 180

/**
 * Build a quaternion from DeviceOrientation angles (degrees) that maps the
 * device frame to the ENU world frame.
 *
 * Following the W3C DeviceOrientation spec rotation sequence:
 *   1. Rotate around Z by –alpha  (azimuth correction, to align with North)
 *   2. Rotate around X by beta    (pitch)
 *   3. Rotate around Y by gamma   (roll)
 *
 * Reference implementation based on Chrome's device orientation fusion:
 * https://github.com/w3c/deviceorientation
 */
export function orientationToQuaternion(
  alpha: number, // degrees, compass azimuth
  beta: number,  // degrees, pitch
  gamma: number, // degrees, roll
): Quaternion {
  const a = -alpha * DEG
  const b = beta  * DEG
  const g = gamma * DEG

  // ZXY rotation decomposition (intrinsic, applied in reverse for extrinsic)
  const cA = Math.cos(a / 2), sA = Math.sin(a / 2)
  const cB = Math.cos(b / 2), sB = Math.sin(b / 2)
  const cG = Math.cos(g / 2), sG = Math.sin(g / 2)

  // q = q_z(a) * q_x(b) * q_y(g)
  const qZ: Quaternion = { w: cA, x: 0, y: 0, z: sA }
  const qX: Quaternion = { w: cB, x: sB, y: 0, z: 0 }
  const qY: Quaternion = { w: cG, x: 0, y: sG, z: 0 }

  return multiply(qZ, multiply(qX, qY))
}

/**
 * Interpolate between two quaternions using SLERP.
 * t ∈ [0, 1], returns q0 at t=0 and q1 at t=1.
 */
export function slerp(q0: Quaternion, q1: Quaternion, t: number): Quaternion {
  let dot = q0.w * q1.w + q0.x * q1.x + q0.y * q1.y + q0.z * q1.z
  let q1s = { ...q1 }
  if (dot < 0) {
    q1s = { w: -q1.w, x: -q1.x, y: -q1.y, z: -q1.z }
    dot = -dot
  }
  if (dot > 0.9995) {
    // Nearly identical — linear interpolation
    return normalize({
      w: q0.w + t * (q1s.w - q0.w),
      x: q0.x + t * (q1s.x - q0.x),
      y: q0.y + t * (q1s.y - q0.y),
      z: q0.z + t * (q1s.z - q0.z),
    })
  }
  const theta0 = Math.acos(dot)
  const theta = theta0 * t
  const s0 = Math.cos(theta) - dot * Math.sin(theta) / Math.sin(theta0)
  const s1 = Math.sin(theta) / Math.sin(theta0)
  return {
    w: s0 * q0.w + s1 * q1s.w,
    x: s0 * q0.x + s1 * q1s.x,
    y: s0 * q0.y + s1 * q1s.y,
    z: s0 * q0.z + s1 * q1s.z,
  }
}

function normalize(q: Quaternion): Quaternion {
  const n = Math.sqrt(q.w ** 2 + q.x ** 2 + q.y ** 2 + q.z ** 2)
  return { w: q.w / n, x: q.x / n, y: q.y / n, z: q.z / n }
}

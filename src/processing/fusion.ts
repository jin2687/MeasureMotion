/**
 * Gravity filter and linear acceleration extraction for improved G-force accuracy.
 *
 * Low-pass EMA filter tracks the gravity vector in device frame. This lets us:
 *  1. Subtract gravity from accelerationIncludingGravity without needing compass.
 *  2. Determine the "up" direction for gVertical decomposition.
 *
 * iOS DeviceMotionEvent.acceleration (gravity already removed by Core Motion) is
 * more accurate when available. We prefer that and use this filter as fallback.
 */

/** Exponential moving average filter for gravity estimation in device frame. */
export class GravityFilter {
  gx = 0
  gy = 0
  gz = -9.80665
  private readonly alpha: number
  private first = true

  /**
   * @param alpha EMA smoothing factor (0–1).
   *   Higher → slower response → steadier gravity estimate.
   *   Lower  → tracks phone reorientations faster.
   *   0.8 works well at ~60 Hz (time constant ≈ 0.2 s).
   */
  constructor(alpha = 0.8) {
    this.alpha = alpha
  }

  /** Feed a new accelerationIncludingGravity sample and update the estimate. */
  update(rawX: number, rawY: number, rawZ: number): void {
    if (this.first) {
      this.gx = rawX; this.gy = rawY; this.gz = rawZ
      this.first = false
    } else {
      this.gx = this.alpha * this.gx + (1 - this.alpha) * rawX
      this.gy = this.alpha * this.gy + (1 - this.alpha) * rawY
      this.gz = this.alpha * this.gz + (1 - this.alpha) * rawZ
    }
  }
}

/**
 * Extract gravity-free linear acceleration in device frame.
 * Prefers the OS-provided gravity-removed signal when all three components are
 * non-null (iOS Core Motion does hardware sensor fusion — far more accurate
 * than any software approach).
 *
 * @param axG/ayG/azG  DeviceMotionEvent.accelerationIncludingGravity [m/s²]
 * @param ax/ay/az     DeviceMotionEvent.acceleration (gravity removed by OS, or null)
 * @param filter       GravityFilter to update and use as fallback
 */
export function extractLinearAccel(
  axG: number, ayG: number, azG: number,
  ax: number | null, ay: number | null, az: number | null,
  filter: GravityFilter,
): { linX: number; linY: number; linZ: number } {
  // Always update the filter — needed for gVertical decomposition even when OS accel is available
  filter.update(axG, ayG, azG)

  if (ax != null && ay != null && az != null) {
    // Use hardware-fused gravity removal (iOS Core Motion, Android sensor stack)
    return { linX: ax, linY: ay, linZ: az }
  }

  // Fallback: subtract EMA gravity estimate from raw accel
  return {
    linX: axG - filter.gx,
    linY: ayG - filter.gy,
    linZ: azG - filter.gz,
  }
}

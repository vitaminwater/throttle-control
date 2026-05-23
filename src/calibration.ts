export interface ChannelMapping {
  throttleAxis: number;
  throttleInvert: boolean;
  yawAxis: number;
  yawInvert: boolean;
}

const ENDPOINT = 0.92;
const MIN_MOVE = 0.5;
const CENTER = 0.25;

export class AxisCalibrator {
  private baseline: number[] | null = null;

  begin(axes: readonly number[]): void {
    this.baseline = Array.from(axes);
  }

  reset(): void {
    this.baseline = null;
  }

  isActive(): boolean {
    return this.baseline !== null;
  }

  poll(
    axes: readonly number[],
    excludeIndex: number | null = null,
  ): { index: number; invert: boolean } | null {
    if (!this.baseline) return null;

    for (let i = 0; i < axes.length; i++) {
      if (i === excludeIndex) continue;

      const raw = axes[i] ?? 0;
      const base = this.baseline[i] ?? 0;

      if (movedToEndpoint(raw, base)) {
        return { index: i, invert: raw < 0 };
      }
    }

    return null;
  }

  getProgress(axes: readonly number[], excludeIndex: number | null = null): number {
    if (!this.baseline) return 0;

    let best = 0;
    for (let i = 0; i < axes.length; i++) {
      if (i === excludeIndex) continue;
      const raw = axes[i] ?? 0;
      const base = this.baseline[i] ?? 0;
      if (isNearCenter(raw)) continue;

      const move = Math.abs(raw - base) / MIN_MOVE;
      const edge = Math.abs(raw) / ENDPOINT;
      best = Math.max(best, Math.min(move, edge));
    }
    return Math.min(1, best);
  }
}

function isNearCenter(value: number): boolean {
  return Math.abs(value) <= CENTER;
}

function isAtEndpoint(value: number): boolean {
  return Math.abs(value) >= ENDPOINT;
}

/** True only when the stick hits an edge, not when returning to center. */
function movedToEndpoint(raw: number, base: number): boolean {
  if (!isAtEndpoint(raw) || isNearCenter(raw)) return false;
  if (Math.abs(raw - base) < MIN_MOVE) return false;

  // Started near center → must reach an edge.
  if (isNearCenter(base)) {
    return isAtEndpoint(raw);
  }

  // Started off-center → must reach an edge farther out, not move back toward center.
  return Math.abs(raw) > Math.abs(base) + 0.35;
}

export function buildMapping(
  throttle: { index: number; invert: boolean },
  yaw: { index: number; invert: boolean },
): ChannelMapping {
  return {
    throttleAxis: throttle.index,
    throttleInvert: throttle.invert,
    yawAxis: yaw.index,
    yawInvert: yaw.invert,
  };
}

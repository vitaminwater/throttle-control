export interface ChannelMapping {
  throttleAxis: number;
  throttleInvert: boolean;
  yawAxis: number;
  yawInvert: boolean;
}

const MAX_THRESHOLD = 0.85;

/** Returns the axis at full deflection, if any. */
export function detectStickAtMax(
  axes: readonly number[],
  excludeIndex: number | null = null,
): { index: number; invert: boolean } | null {
  let bestIndex = -1;
  let bestValue = 0;
  let bestRaw = 0;

  for (let i = 0; i < axes.length; i++) {
    if (i === excludeIndex) continue;
    const raw = axes[i] ?? 0;
    const value = Math.abs(raw);
    if (value > bestValue) {
      bestValue = value;
      bestIndex = i;
      bestRaw = raw;
    }
  }

  if (bestIndex < 0 || bestValue < MAX_THRESHOLD) {
    return null;
  }

  return { index: bestIndex, invert: bestRaw < 0 };
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

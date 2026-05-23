const STORAGE_KEY = "throttle-control-channel-mapping";

export interface ChannelMapping {
  throttleAxis: number;
  throttleInvert: boolean;
  yawAxis: number;
  yawInvert: boolean;
}

export type CalibrationStep = "throttle" | "yaw" | "done";

const CAL_HOLD = 0.8;
const CAL_THRESHOLD = 0.75;

export function loadMapping(): ChannelMapping | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as ChannelMapping;
    if (
      typeof data.throttleAxis !== "number" ||
      typeof data.yawAxis !== "number" ||
      typeof data.throttleInvert !== "boolean" ||
      typeof data.yawInvert !== "boolean"
    ) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function saveMapping(mapping: ChannelMapping): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mapping));
}

export class CalibrationSession {
  step: CalibrationStep = "throttle";
  holdProgress = 0;
  private throttleAxis: number | null = null;
  private throttleInvert = false;

  isComplete(): boolean {
    return this.step === "done";
  }

  getInstruction(): string {
    if (this.step === "throttle") {
      return "Move your throttle stick to 100% and hold it.";
    }
    if (this.step === "yaw") {
      return "Move your yaw stick to 100% and hold it.";
    }
    return "Calibration complete.";
  }

  update(dt: number, gamepad: Gamepad | null): ChannelMapping | null {
    if (this.step === "done" || !gamepad) {
      this.holdProgress = 0;
      return null;
    }

    const exclude = this.step === "yaw" ? this.throttleAxis : null;
    const axis = findStrongestAxis(gamepad.axes, exclude);

    if (axis === null || axis.value < CAL_THRESHOLD) {
      this.holdProgress = 0;
      return null;
    }

    this.holdProgress = Math.min(CAL_HOLD, this.holdProgress + dt);
    if (this.holdProgress < CAL_HOLD) {
      return null;
    }

    if (this.step === "throttle") {
      this.throttleAxis = axis.index;
      this.throttleInvert = axis.raw < 0;
      this.step = "yaw";
      this.holdProgress = 0;
      return null;
    }

    const mapping: ChannelMapping = {
      throttleAxis: this.throttleAxis!,
      throttleInvert: this.throttleInvert,
      yawAxis: axis.index,
      yawInvert: axis.raw < 0,
    };
    saveMapping(mapping);
    this.step = "done";
    return mapping;
  }
}

function findStrongestAxis(
  axes: readonly number[],
  exclude: number | null,
): { index: number; value: number; raw: number } | null {
  let bestIndex = -1;
  let bestValue = 0;
  let bestRaw = 0;

  for (let i = 0; i < axes.length; i++) {
    if (i === exclude) continue;
    const raw = axes[i] ?? 0;
    const value = Math.abs(raw);
    if (value > bestValue) {
      bestValue = value;
      bestIndex = i;
      bestRaw = raw;
    }
  }

  if (bestIndex < 0) return null;
  return { index: bestIndex, value: bestValue, raw: bestRaw };
}

export function getCalHoldDuration(): number {
  return CAL_HOLD;
}

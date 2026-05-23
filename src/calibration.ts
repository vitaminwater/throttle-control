export interface ChannelMapping {
  throttleAxis: number;
  throttleInvert: boolean;
  yawAxis: number;
  yawInvert: boolean;
}

export type CalibrationStep = "throttle" | "center" | "yaw" | "done";

const CAL_HOLD = 1.5;
const CENTER_HOLD = 1.2;
const MAX_THRESHOLD = 0.9;
const CENTER_THRESHOLD = 0.12;

export class CalibrationSession {
  step: CalibrationStep = "throttle";
  holdProgress = 0;
  private throttleAxis: number | null = null;
  private throttleInvert = false;
  private lockedAxis: number | null = null;

  isComplete(): boolean {
    return this.step === "done";
  }

  getStepLabel(): string {
    if (this.step === "throttle") return "Step 1 of 2 — Throttle";
    if (this.step === "center") return "Re-center sticks";
    if (this.step === "yaw") return "Step 2 of 2 — Yaw";
    return "Done";
  }

  getInstruction(): string {
    if (this.step === "throttle") {
      return "Move your throttle stick fully to 100% and hold it there.";
    }
    if (this.step === "center") {
      return "Return all sticks to center and hold them steady.";
    }
    if (this.step === "yaw") {
      return "Move your yaw stick fully to 100% and hold it there.";
    }
    return "Calibration complete.";
  }

  getHint(): string {
    if (this.step === "center") {
      return "All sticks must be centered before the next step.";
    }
    return "Keep the stick at 100% until the bar fills completely.";
  }

  getHoldTarget(): number {
    return this.step === "center" ? CENTER_HOLD : CAL_HOLD;
  }

  update(dt: number, gamepad: Gamepad | null): ChannelMapping | null {
    if (this.step === "done" || !gamepad) {
      this.holdProgress = 0;
      this.lockedAxis = null;
      return null;
    }

    if (this.step === "center") {
      return this.updateCenterStep(dt, gamepad.axes);
    }

    return this.updateMaxStep(dt, gamepad.axes);
  }

  private updateCenterStep(dt: number, axes: readonly number[]): ChannelMapping | null {
    if (!allAxesCentered(axes)) {
      this.holdProgress = 0;
      return null;
    }

    this.holdProgress = Math.min(CENTER_HOLD, this.holdProgress + dt);
    if (this.holdProgress < CENTER_HOLD) {
      return null;
    }

    this.step = "yaw";
    this.holdProgress = 0;
    this.lockedAxis = null;
    return null;
  }

  private updateMaxStep(dt: number, axes: readonly number[]): ChannelMapping | null {
    const exclude = this.step === "yaw" ? this.throttleAxis : null;
    const axis = findStrongestAxis(axes, exclude);

    if (axis === null || axis.value < MAX_THRESHOLD) {
      this.holdProgress = 0;
      this.lockedAxis = null;
      return null;
    }

    if (this.lockedAxis !== null && axis.index !== this.lockedAxis) {
      this.holdProgress = 0;
    }
    this.lockedAxis = axis.index;

    this.holdProgress = Math.min(CAL_HOLD, this.holdProgress + dt);
    if (this.holdProgress < CAL_HOLD) {
      return null;
    }

    if (this.step === "throttle") {
      this.throttleAxis = axis.index;
      this.throttleInvert = axis.raw < 0;
      this.step = "center";
      this.holdProgress = 0;
      this.lockedAxis = null;
      return null;
    }

    const mapping: ChannelMapping = {
      throttleAxis: this.throttleAxis!,
      throttleInvert: this.throttleInvert,
      yawAxis: axis.index,
      yawInvert: axis.raw < 0,
    };
    this.step = "done";
    return mapping;
  }
}

function allAxesCentered(axes: readonly number[]): boolean {
  for (let i = 0; i < axes.length; i++) {
    if (Math.abs(axes[i] ?? 0) > CENTER_THRESHOLD) {
      return false;
    }
  }
  return axes.length > 0;
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

export function getCenterHoldDuration(): number {
  return CENTER_HOLD;
}

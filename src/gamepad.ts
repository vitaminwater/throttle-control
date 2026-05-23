import type { ChannelMapping } from "./calibration";

export interface StickInput {
  throttle: number;
  yaw: number;
}

export interface ProcessedInput extends StickInput {
  /** Throttle as 0–1 stick position. 0.5 = center / hover. */
  throttlePosition: number;
  /** Distance from 50% target (0 = perfect). */
  throttleDeviation: number;
}

export interface GamepadState {
  connected: boolean;
  id: string;
}

const DEADZONE = 0.08;
export const TARGET_THROTTLE = 0.5;

function applyDeadzone(value: number, deadzone = DEADZONE): number {
  if (Math.abs(value) < deadzone) return 0;
  const sign = Math.sign(value);
  return sign * ((Math.abs(value) - deadzone) / (1 - deadzone));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeAxis(value: number): number {
  return clamp(applyDeadzone(value), -1, 1);
}

function readThrottle(raw: number): number {
  return clamp(raw, -1, 1);
}

function readMappedAxis(axes: readonly number[], index: number, invert: boolean): number {
  const raw = axes[index] ?? 0;
  return invert ? -raw : raw;
}

function readGamepadAxes(gamepad: Gamepad, mapping: ChannelMapping): StickInput {
  const axes = gamepad.axes;

  return {
    throttle: readThrottle(
      readMappedAxis(axes, mapping.throttleAxis, mapping.throttleInvert),
    ),
    yaw: normalizeAxis(readMappedAxis(axes, mapping.yawAxis, mapping.yawInvert)),
  };
}

export class InputManager {
  private mapping: ChannelMapping | null;
  private keyboardInput: StickInput = { throttle: 0, yaw: 0 };
  private keysDown = new Set<string>();

  constructor(mapping: ChannelMapping | null = null) {
    this.mapping = mapping;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
  }

  hasMapping(): boolean {
    return this.mapping !== null;
  }

  setMapping(mapping: ChannelMapping): void {
    this.mapping = mapping;
  }

  getActiveGamepad(): Gamepad | null {
    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
      if (gp?.connected) return gp;
    }
    return null;
  }

  getGamepadState(): GamepadState {
    const gp = this.getActiveGamepad();
    return {
      connected: gp !== null,
      id: gp?.id ?? "No controller",
    };
  }

  poll(): ProcessedInput {
    const gp = this.getActiveGamepad();
    let input: StickInput;

    if (gp && this.mapping) {
      input = readGamepadAxes(gp, this.mapping);
    } else {
      input = { ...this.keyboardInput };
    }

    const throttlePosition = (input.throttle + 1) / 2;
    const throttleDeviation = throttlePosition - TARGET_THROTTLE;

    return {
      ...input,
      throttlePosition,
      throttleDeviation,
    };
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keysDown.add(e.code);
    this.updateKeyboardInput();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keysDown.delete(e.code);
    this.updateKeyboardInput();
  };

  private onBlur = (): void => {
    this.keysDown.clear();
    this.updateKeyboardInput();
  };

  private updateKeyboardInput(): void {
    const step = 0.04;
    let { throttle, yaw } = this.keyboardInput;

    if (this.keysDown.has("KeyW")) throttle = clamp(throttle + step, -1, 1);
    if (this.keysDown.has("KeyS")) throttle = clamp(throttle - step, -1, 1);
    if (this.keysDown.has("KeyA")) yaw = clamp(yaw + step, -1, 1);
    if (this.keysDown.has("KeyD")) yaw = clamp(yaw - step, -1, 1);

    const decay = 0.92;
    if (!this.keysDown.has("KeyW") && !this.keysDown.has("KeyS")) throttle *= decay;
    if (!this.keysDown.has("KeyA") && !this.keysDown.has("KeyD")) yaw *= decay;

    this.keyboardInput = { throttle, yaw };
  }
}

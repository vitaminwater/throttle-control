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

/** Throttle uses raw axis — no deadzone, stick may not self-center. */
function readThrottle(raw: number): number {
  return clamp(raw, -1, 1);
}

/**
 * RC channel mapping:
 *   CH3 (axis 2) = throttle
 *   CH4 (axis 3) = yaw
 */
function readGamepadAxes(gamepad: Gamepad): StickInput {
  const axes = gamepad.axes;

  return {
    yaw: normalizeAxis(axes[2] ?? 0),
    throttle: readThrottle(axes[4] ?? 0),
  };
}

export class InputManager {
  private keyboardInput: StickInput = { throttle: 0, yaw: 0 };
  private keysDown = new Set<string>();

  constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
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
    const input = gp ? readGamepadAxes(gp) : { ...this.keyboardInput };

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
    if (this.keysDown.has("KeyA")) yaw = clamp(yaw - step, -1, 1);
    if (this.keysDown.has("KeyD")) yaw = clamp(yaw + step, -1, 1);

    const decay = 0.92;
    if (!this.keysDown.has("KeyW") && !this.keysDown.has("KeyS")) throttle *= decay;
    if (!this.keysDown.has("KeyA") && !this.keysDown.has("KeyD")) yaw *= decay;

    this.keyboardInput = { throttle, yaw };
  }
}

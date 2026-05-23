import { type ProcessedInput } from "./gamepad";
import { MAX_ALTITUDE, MIN_ALTITUDE, type PlayerState } from "./quadcopter";

export const GAME_DURATION = 30;
const MAX_PENALTY_PER_SECOND = 25;
const MAX_DEVIATION = 0.5;
export const ALT_MATCH = 0.08;
export const YAW_MATCH = 0.06;
export const MAX_MATCH_VERTICAL_SPEED = 0.12;
export const MAX_MATCH_YAW_RATE = 0.05;
export const MATCH_HOLD = 3;
const MATCH_POINTS = 100;
const MIN_GHOST_ALT_SEPARATION = 0.9;
const GHOST_ALT_SPEED = 1.8;
const GHOST_YAW_SPEED = 1.4;
const YAW_ONLY_CHANCE = 0.45;

export type GamePhase = "idle" | "playing" | "finished";

export interface GhostState {
  altitude: number;
  yaw: number;
  targetAltitude: number;
  targetYaw: number;
}

export class GameSession {
  phase: GamePhase = "idle";
  timeLeft = GAME_DURATION;
  score = 0;
  penalizing = false;
  ghostsMatched = 0;
  ghost: GhostState | null = null;
  aligning = false;
  matchHold = 0;
  altError = 0;
  yawError = 0;
  positionMatched = false;

  start(): void {
    this.phase = "playing";
    this.timeLeft = GAME_DURATION;
    this.score = 0;
    this.penalizing = false;
    this.ghostsMatched = 0;
    this.matchHold = 0;
    this.aligning = false;
    this.positionMatched = false;
    this.ghost = null;
  }

  update(dt: number, input: ProcessedInput, player: PlayerState): boolean {
    if (this.phase !== "playing") return false;

    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.timeLeft <= 0) {
      this.phase = "finished";
      this.penalizing = false;
      this.aligning = false;
      return false;
    }

    if (!this.ghost) {
      this.ghost = createInitialGhost();
    }

    this.moveGhost(dt);

    const deviation = Math.abs(input.throttleDeviation);
    const penaltyRate = (deviation / MAX_DEVIATION) * MAX_PENALTY_PER_SECOND;
    this.penalizing = penaltyRate > 0;
    if (this.penalizing) {
      this.score = Math.max(0, this.score - dt * penaltyRate);
    }

    this.altError = Math.abs(player.altitude - this.ghost.altitude);
    this.yawError = angleDiff(player.yaw, this.ghost.yaw);
    const inRange = this.altError <= ALT_MATCH && this.yawError <= YAW_MATCH;
    const isStill =
      Math.abs(player.verticalSpeed) <= MAX_MATCH_VERTICAL_SPEED &&
      Math.abs(player.yawRate) <= MAX_MATCH_YAW_RATE;

    this.positionMatched = inRange;

    if (inRange && isStill) {
      this.matchHold += dt;
      this.aligning = true;
      if (this.matchHold >= MATCH_HOLD) {
        this.score += MATCH_POINTS;
        this.ghostsMatched += 1;
        this.matchHold = 0;
        setNextGhostTarget(this.ghost);
        return true;
      }
    } else {
      this.matchHold = 0;
      this.aligning = false;
    }

    return false;
  }

  private moveGhost(dt: number): void {
    if (!this.ghost) return;

    const altDelta = this.ghost.targetAltitude - this.ghost.altitude;
    if (Math.abs(altDelta) > 0.01) {
      const step = Math.sign(altDelta) * GHOST_ALT_SPEED * dt;
      this.ghost.altitude =
        Math.abs(step) >= Math.abs(altDelta)
          ? this.ghost.targetAltitude
          : this.ghost.altitude + step;
    }

    const yawDelta = shortestSignedDelta(this.ghost.yaw, this.ghost.targetYaw);
    if (Math.abs(yawDelta) > 0.01) {
      const step = Math.sign(yawDelta) * GHOST_YAW_SPEED * dt;
      if (Math.abs(step) >= Math.abs(yawDelta)) {
        this.ghost.yaw = this.ghost.targetYaw;
      } else {
        this.ghost.yaw = normalizeAngle(this.ghost.yaw + step);
      }
    }
  }
}

function createInitialGhost(): GhostState {
  const altitude = MIN_ALTITUDE + Math.random() * (MAX_ALTITUDE - MIN_ALTITUDE);
  const yaw = Math.random() * Math.PI * 2;
  const ghost: GhostState = { altitude, yaw, targetAltitude: altitude, targetYaw: yaw };
  setNextGhostTarget(ghost);
  return ghost;
}

function setNextGhostTarget(ghost: GhostState): void {
  const yawOnly = Math.random() < YAW_ONLY_CHANCE;

  let targetAltitude = ghost.altitude;
  if (!yawOnly) {
    let attempts = 0;
    do {
      targetAltitude = MIN_ALTITUDE + Math.random() * (MAX_ALTITUDE - MIN_ALTITUDE);
      attempts += 1;
    } while (Math.abs(targetAltitude - ghost.altitude) < MIN_GHOST_ALT_SEPARATION && attempts < 20);
  }

  let targetYaw = ghost.yaw + (0.5 + Math.random()) * Math.PI * (Math.random() < 0.5 ? 1 : -1);
  if (angleDiff(targetYaw, ghost.yaw) < 0.5) {
    targetYaw = ghost.yaw + Math.PI * 0.75;
  }

  ghost.targetAltitude = targetAltitude;
  ghost.targetYaw = normalizeAngle(targetYaw);
}

function angleDiff(a: number, b: number): number {
  return Math.abs(shortestSignedDelta(a, b));
}

function shortestSignedDelta(from: number, to: number): number {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function normalizeAngle(a: number): number {
  let angle = a;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

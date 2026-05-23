import {
  CalibrationSession,
  getCalHoldDuration,
  loadMapping,
} from "./calibration";
import { GameSession, MATCH_HOLD } from "./game";
import { InputManager, type ProcessedInput } from "./gamepad";
import { QuadcopterScene } from "./quadcopter";
import "./style.css";

function formatTime(seconds: number): string {
  return `${Math.ceil(seconds)}s`;
}

function radToDeg(rad: number): string {
  return `${Math.round(rad * (180 / Math.PI))}°`;
}

export function initApp(root: HTMLElement): () => void {
  const savedMapping = loadMapping();
  let calibrating = savedMapping === null;

  root.innerHTML = `
    <div id="canvas-container"></div>
    <div id="scoreboard">
      <div class="score-item">
        <span class="score-label">Time</span>
        <span class="score-value" id="val-time">30s</span>
      </div>
      <div class="score-item">
        <span class="score-label">Score</span>
        <span class="score-value" id="val-score">0</span>
      </div>
      <div class="score-item">
        <span class="score-label">Matched</span>
        <span class="score-value" id="val-matched">0</span>
      </div>
    </div>
    <div id="hud">
      <p class="goal">Match the <strong>ghost</strong> — same height and facing</p>
      <div class="hud-row">
        <div class="stick-box">
          <div class="stick-area">
            <div class="stick-crosshair-h"></div>
            <div class="stick-crosshair-v"></div>
            <div class="stick-target" title="50% throttle target"></div>
            <div id="stick-dot" class="stick-dot"></div>
          </div>
        </div>
        <div class="hud-stats">
          <div class="stat">
            <span class="stat-label">Height Δ</span>
            <span class="stat-value" id="val-alt-error">—</span>
          </div>
          <div class="stat">
            <span class="stat-label">Yaw Δ</span>
            <span class="stat-value" id="val-yaw-error">—</span>
          </div>
          <div class="stat">
            <span class="stat-label">Status</span>
            <span class="stat-value small" id="val-status">—</span>
          </div>
        </div>
      </div>
      <div class="throttle-bar">
        <div class="bar-target"></div>
        <div id="bar-marker" class="bar-marker"></div>
      </div>
    </div>
    <div id="overlay-cal" class="overlay${calibrating ? "" : " is-hidden"}">
      <div class="overlay-card">
        <h1>Controller Setup</h1>
        <p class="cal-step" id="cal-step">Step 1 of 2</p>
        <p id="cal-text">Move your throttle stick to 100% and hold it.</p>
        <p class="cal-hint" id="cal-hint">Connect your controller and move a stick to activate it.</p>
        <div class="cal-progress">
          <div id="cal-progress-fill" class="cal-progress-fill"></div>
        </div>
      </div>
    </div>
    <div id="overlay" class="overlay${calibrating ? " is-hidden" : ""}">
      <div class="overlay-card">
        <h1>Throttle Hold</h1>
        <p id="overlay-text">Fly to the ghost drone and match its height and rotation. Hold for ${MATCH_HOLD} seconds to score.</p>
        <p class="overlay-score" id="overlay-score" hidden></p>
        <button type="button" id="btn-start" class="btn-start">Start</button>
      </div>
    </div>
  `;

  const canvasContainer = root.querySelector("#canvas-container") as HTMLElement;
  const inputManager = new InputManager(savedMapping);
  const calibration = calibrating ? new CalibrationSession() : null;
  const scene = new QuadcopterScene(canvasContainer);
  const game = new GameSession();

  const stickDot = root.querySelector("#stick-dot") as HTMLElement;
  const valAltError = root.querySelector("#val-alt-error") as HTMLElement;
  const valYawError = root.querySelector("#val-yaw-error") as HTMLElement;
  const valStatus = root.querySelector("#val-status") as HTMLElement;
  const valTime = root.querySelector("#val-time") as HTMLElement;
  const valScore = root.querySelector("#val-score") as HTMLElement;
  const valMatched = root.querySelector("#val-matched") as HTMLElement;
  const barMarker = root.querySelector("#bar-marker") as HTMLElement;
  const overlayCal = root.querySelector("#overlay-cal") as HTMLElement;
  const calStep = root.querySelector("#cal-step") as HTMLElement;
  const calText = root.querySelector("#cal-text") as HTMLElement;
  const calHint = root.querySelector("#cal-hint") as HTMLElement;
  const calProgressFill = root.querySelector("#cal-progress-fill") as HTMLElement;
  const overlay = root.querySelector("#overlay") as HTMLElement;
  const overlayText = root.querySelector("#overlay-text") as HTMLElement;
  const overlayScore = root.querySelector("#overlay-score") as HTMLElement;
  const btnStart = root.querySelector("#btn-start") as HTMLButtonElement;

  const calHoldDuration = getCalHoldDuration();

  const syncCalibrationUI = (): void => {
    if (!calibrating || !calibration) return;

    calStep.textContent = calibration.step === "yaw" ? "Step 2 of 2" : "Step 1 of 2";
    calText.textContent = calibration.getInstruction();

    const gp = inputManager.getGamepadState();
    calHint.textContent = gp.connected
      ? "Keep the stick at 100% until the bar fills."
      : "Connect your controller and move a stick to activate it.";

    calProgressFill.style.width = `${(calibration.holdProgress / calHoldDuration) * 100}%`;
  };

  const finishCalibration = (mapping: ReturnType<typeof loadMapping>): void => {
    if (!mapping) return;
    inputManager.setMapping(mapping);
    calibrating = false;
    overlayCal.classList.add("is-hidden");
    overlay.classList.remove("is-hidden");
  };

  const syncOverlay = (): void => {
    if (calibrating) return;

    const show = game.phase === "idle" || game.phase === "finished";
    overlay.classList.toggle("is-hidden", !show);

    if (game.phase === "idle") {
      overlayText.textContent =
        `Fly to the ghost drone and match its height and rotation. Hold for ${MATCH_HOLD} seconds to score.`;
      overlayScore.hidden = true;
      btnStart.textContent = "Start";
    } else if (game.phase === "finished") {
      overlayText.textContent = "Time's up!";
      overlayScore.hidden = false;
      overlayScore.textContent = `Score: ${Math.floor(game.score)} · ${game.ghostsMatched} matched`;
      btnStart.textContent = "Play again";
    }
  };

  let lastTime = performance.now();
  let frameId = 0;
  let prevPhase = game.phase;

  syncOverlay();
  syncCalibrationUI();

  btnStart.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    game.start();
    prevPhase = "playing";
    syncOverlay();
  });

  const updateUI = (input: ProcessedInput): void => {
    if (calibrating) {
      syncCalibrationUI();
      return;
    }

    const gp = inputManager.getGamepadState();

    if (game.phase !== "playing") {
      valStatus.textContent = gp.connected ? "Ready" : "W/S throttle · A/D yaw";
      valAltError.textContent = "—";
      valYawError.textContent = "—";
    } else if (game.aligning) {
      valStatus.textContent = `Hold steady… ${Math.max(0, MATCH_HOLD - game.matchHold).toFixed(1)}s`;
      valAltError.textContent = game.altError.toFixed(2) + "m";
      valAltError.className = "stat-value good";
      valYawError.textContent = radToDeg(game.yawError);
      valYawError.className = "stat-value good";
    } else if (game.ghost) {
      valStatus.textContent = game.penalizing ? "− Points" : "Align to ghost";
      valAltError.textContent = game.altError.toFixed(2) + "m";
      valAltError.className = `stat-value ${game.altError <= 0.25 ? "good" : game.altError <= 0.6 ? "warn" : "bad"}`;
      valYawError.textContent = radToDeg(game.yawError);
      valYawError.className = `stat-value ${game.yawError <= 0.25 ? "good" : game.yawError <= 0.6 ? "warn" : "bad"}`;
    }

    const yawPct = ((input.yaw + 1) / 2) * 100;
    const thrPct = input.throttlePosition * 100;
    stickDot.style.left = `${yawPct}%`;
    stickDot.style.top = `${100 - thrPct}%`;

    barMarker.style.left = `${input.throttlePosition * 100}%`;
    valTime.textContent = formatTime(game.timeLeft);
    valScore.textContent = String(Math.floor(game.score));
    valMatched.textContent = String(game.ghostsMatched);
    valScore.classList.toggle("scoring", game.aligning);
    valScore.classList.toggle("penalizing", game.penalizing && !game.aligning);
  };

  const loop = (time: number): void => {
    const dt = Math.min((time - lastTime) / 1000, 0.05);
    lastTime = time;

    if (calibrating && calibration) {
      const mapping = calibration.update(dt, inputManager.getActiveGamepad());
      if (mapping) {
        finishCalibration(mapping);
      }
      syncCalibrationUI();
    }

    const input = inputManager.poll();

    scene.update(
      {
        yaw: calibrating ? 0 : input.yaw,
        throttlePosition: calibrating ? 0.5 : input.throttlePosition,
      },
      dt,
    );

    if (!calibrating) {
      const player = scene.getPlayerState();
      game.update(dt, input, player);
      scene.setGhostTarget(game.ghost);

      if (game.phase === "finished" && prevPhase === "playing") {
        syncOverlay();
      }
      prevPhase = game.phase;
    }

    updateUI(input);
    frameId = requestAnimationFrame(loop);
  };
  frameId = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(frameId);
    inputManager.dispose();
    scene.dispose();
  };
}

const app = document.querySelector<HTMLElement>("#app");
if (app) {
  initApp(app);
}

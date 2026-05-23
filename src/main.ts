import {
  AxisCalibrator,
  buildMapping,
  type ChannelMapping,
} from "./calibration";
import { GameSession, MATCH_HOLD } from "./game";
import { InputManager, type ProcessedInput } from "./gamepad";
import { QuadcopterScene } from "./quadcopter";
import "./style.css";

type SetupPhase =
  | "intro"
  | "cal-throttle"
  | "center-yaw"
  | "cal-yaw"
  | "ready";

function formatTime(seconds: number): string {
  return `${Math.ceil(seconds)}s`;
}

function radToDeg(rad: number): string {
  return `${Math.round(rad * (180 / Math.PI))}°`;
}

export function initApp(root: HTMLElement): () => void {
  let setupPhase: SetupPhase = "intro";
  let throttleChannel: { index: number; invert: boolean } | null = null;
  const throttleCalibrator = new AxisCalibrator();
  const yawCalibrator = new AxisCalibrator();

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

    <div id="overlay-intro" class="overlay">
      <div class="overlay-card">
        <h1>Controller Setup</h1>
        <p>Center all sticks on your controller.</p>
        <p class="cal-hint" id="intro-hint">Connect your controller and move a stick to activate it.</p>
        <button type="button" id="btn-calibrate-throttle" class="btn-start">Calibrate</button>
      </div>
    </div>

    <div id="overlay-cal-throttle" class="overlay is-hidden">
      <div class="overlay-card">
        <h1>Throttle</h1>
        <p>Move your <strong>throttle</strong> stick to 100%.</p>
        <p class="cal-hint" id="cal-throttle-hint">Waiting for input…</p>
      </div>
    </div>

    <div id="overlay-center-yaw" class="overlay is-hidden">
      <div class="overlay-card">
        <h1>Controller Setup</h1>
        <p>Center all sticks on your controller.</p>
        <p class="cal-hint">Throttle channel recorded.</p>
        <button type="button" id="btn-calibrate-yaw" class="btn-start">Calibrate yaw</button>
      </div>
    </div>

    <div id="overlay-cal-yaw" class="overlay is-hidden">
      <div class="overlay-card">
        <h1>Yaw</h1>
        <p>Move your <strong>yaw</strong> stick to 100%.</p>
        <p class="cal-hint" id="cal-yaw-hint">Waiting for input…</p>
      </div>
    </div>

    <div id="overlay" class="overlay is-hidden">
      <div class="overlay-card">
        <h1>Throttle Hold</h1>
        <p id="overlay-text">Fly to the ghost drone and match its height and rotation. Hold for ${MATCH_HOLD} seconds to score.</p>
        <p class="overlay-score" id="overlay-score" hidden></p>
        <button type="button" id="btn-start" class="btn-start">Start</button>
      </div>
    </div>
  `;

  const canvasContainer = root.querySelector("#canvas-container") as HTMLElement;
  const inputManager = new InputManager();
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

  const overlayIntro = root.querySelector("#overlay-intro") as HTMLElement;
  const introHint = root.querySelector("#intro-hint") as HTMLElement;
  const btnCalibrateThrottle = root.querySelector("#btn-calibrate-throttle") as HTMLButtonElement;

  const overlayCalThrottle = root.querySelector("#overlay-cal-throttle") as HTMLElement;
  const calThrottleHint = root.querySelector("#cal-throttle-hint") as HTMLElement;

  const overlayCenterYaw = root.querySelector("#overlay-center-yaw") as HTMLElement;
  const btnCalibrateYaw = root.querySelector("#btn-calibrate-yaw") as HTMLButtonElement;

  const overlayCalYaw = root.querySelector("#overlay-cal-yaw") as HTMLElement;
  const calYawHint = root.querySelector("#cal-yaw-hint") as HTMLElement;

  const overlay = root.querySelector("#overlay") as HTMLElement;
  const overlayText = root.querySelector("#overlay-text") as HTMLElement;
  const overlayScore = root.querySelector("#overlay-score") as HTMLElement;
  const btnStart = root.querySelector("#btn-start") as HTMLButtonElement;

  const hideAllOverlays = (): void => {
    overlayIntro.classList.add("is-hidden");
    overlayCalThrottle.classList.add("is-hidden");
    overlayCenterYaw.classList.add("is-hidden");
    overlayCalYaw.classList.add("is-hidden");
    overlay.classList.add("is-hidden");
  };

  const showOverlay = (el: HTMLElement): void => {
    hideAllOverlays();
    el.classList.remove("is-hidden");
  };

  const finishCalibration = (mapping: ChannelMapping): void => {
    inputManager.setMapping(mapping);
    setupPhase = "ready";
    showOverlay(overlay);
    syncOverlay();
  };

  const syncOverlay = (): void => {
    if (setupPhase !== "ready") return;

    const show = game.phase === "idle" || game.phase === "finished";
    overlay.classList.toggle("is-hidden", !show);
    if (!show) return;

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

  btnCalibrateThrottle.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const gp = inputManager.getActiveGamepad();
    if (!gp) {
      introHint.textContent = "Connect your controller first, then click Calibrate.";
      return;
    }
    throttleCalibrator.begin(gp.axes);
    setupPhase = "cal-throttle";
    showOverlay(overlayCalThrottle);
  });

  btnCalibrateYaw.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const gp = inputManager.getActiveGamepad();
    if (!gp) {
      return;
    }
    yawCalibrator.begin(gp.axes);
    setupPhase = "cal-yaw";
    showOverlay(overlayCalYaw);
  });

  btnStart.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    game.start();
    syncOverlay();
  });

  let prevPhase = game.phase;

  const updateUI = (input: ProcessedInput): void => {
    const gp = inputManager.getGamepadState();

    if (setupPhase === "intro") {
      introHint.textContent = gp.connected
        ? "When ready, click Calibrate."
        : "Connect your controller and move a stick to activate it.";
      return;
    }

    if (setupPhase === "cal-throttle") {
      const gp = inputManager.getActiveGamepad();
      if (gp) {
        const pct = Math.round(throttleCalibrator.getProgress(gp.axes) * 100);
        calThrottleHint.textContent = gp.connected
          ? `Move one stick to 100%… (${pct}% of the way)`
          : "Connect your controller and move a stick to activate it.";
      } else {
        calThrottleHint.textContent = "Connect your controller and move a stick to activate it.";
      }
      return;
    }

    if (setupPhase === "cal-yaw") {
      const gp = inputManager.getActiveGamepad();
      if (gp) {
        const pct = Math.round(yawCalibrator.getProgress(gp.axes, throttleChannel?.index ?? null) * 100);
        calYawHint.textContent = gp.connected
          ? `Move one stick to 100%… (${pct}% of the way)`
          : "Connect your controller and move a stick to activate it.";
      } else {
        calYawHint.textContent = "Connect your controller and move a stick to activate it.";
      }
      return;
    }

    if (setupPhase !== "ready") return;

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

  let lastTime = performance.now();
  let frameId = 0;

  const loop = (time: number): void => {
    const dt = Math.min((time - lastTime) / 1000, 0.05);
    lastTime = time;

    const gp = inputManager.getActiveGamepad();

    if (setupPhase === "cal-throttle" && gp && throttleCalibrator.isActive()) {
      const detected = throttleCalibrator.poll(gp.axes);
      if (detected) {
        throttleChannel = detected;
        throttleCalibrator.reset();
        setupPhase = "center-yaw";
        showOverlay(overlayCenterYaw);
      }
    }

    if (setupPhase === "cal-yaw" && gp && throttleChannel && yawCalibrator.isActive()) {
      const detected = yawCalibrator.poll(gp.axes, throttleChannel.index);
      if (detected) {
        yawCalibrator.reset();
        finishCalibration(buildMapping(throttleChannel, detected));
      }
    }

    const input = inputManager.poll();
    const controlsLocked = setupPhase !== "ready" || game.phase !== "playing";

    scene.update(
      { yaw: controlsLocked ? 0 : input.yaw, throttlePosition: controlsLocked ? 0.5 : input.throttlePosition },
      dt,
    );

    if (setupPhase === "ready") {
      game.update(dt, input, scene.getPlayerState());
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

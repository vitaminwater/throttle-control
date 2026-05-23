import { InputManager, type ProcessedInput } from "./gamepad";
import { QuadcopterScene } from "./quadcopter";
import "./style.css";

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function deviationClass(deviation: number): string {
  const abs = Math.abs(deviation);
  if (abs < 0.03) return "good";
  if (abs < 0.08) return "warn";
  return "bad";
}

export function initApp(root: HTMLElement): () => void {
  root.innerHTML = `
    <div id="canvas-container"></div>
    <div id="hud">
      <p class="goal">Keep throttle at <strong>50%</strong> while yawing</p>
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
            <span class="stat-label">Throttle</span>
            <span class="stat-value" id="val-throttle">50%</span>
          </div>
          <div class="stat">
            <span class="stat-label">Drift</span>
            <span class="stat-value" id="val-drift">±0%</span>
          </div>
          <div class="stat">
            <span class="stat-label">Controller</span>
            <span class="stat-value small" id="val-controller">—</span>
          </div>
        </div>
      </div>
      <div class="throttle-bar">
        <div class="bar-target"></div>
        <div id="bar-marker" class="bar-marker"></div>
      </div>
    </div>
  `;

  const canvasContainer = root.querySelector("#canvas-container") as HTMLElement;
  const inputManager = new InputManager();
  const scene = new QuadcopterScene(canvasContainer);

  const stickDot = root.querySelector("#stick-dot") as HTMLElement;
  const valThrottle = root.querySelector("#val-throttle") as HTMLElement;
  const valDrift = root.querySelector("#val-drift") as HTMLElement;
  const valController = root.querySelector("#val-controller") as HTMLElement;
  const barMarker = root.querySelector("#bar-marker") as HTMLElement;

  const updateUI = (input: ProcessedInput): void => {
    const gp = inputManager.getGamepadState();
    valController.textContent = gp.connected ? "Connected" : "W/S throttle · A/D yaw";

    const yawPct = ((input.yaw + 1) / 2) * 100;
    const thrPct = input.throttlePosition * 100;
    stickDot.style.left = `${yawPct}%`;
    stickDot.style.top = `${100 - thrPct}%`;

    valThrottle.textContent = pct(input.throttlePosition);
    valThrottle.className = `stat-value ${deviationClass(input.throttleDeviation)}`;

    const dev = input.throttleDeviation;
    valDrift.textContent = `${dev >= 0 ? "+" : ""}${pct(dev)}`;
    valDrift.className = `stat-value ${deviationClass(dev)}`;

    barMarker.style.left = `${input.throttlePosition * 100}%`;
  };

  let lastTime = performance.now();
  let frameId = 0;

  const loop = (time: number): void => {
    const dt = Math.min((time - lastTime) / 1000, 0.05);
    lastTime = time;

    const input = inputManager.poll();
    scene.update(
      {
        yaw: input.yaw,
        throttlePosition: input.throttlePosition,
      },
      dt,
    );
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

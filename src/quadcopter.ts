import * as THREE from "three";
import { TARGET_THROTTLE } from "./gamepad";

export interface DroneState {
  yaw: number;
  throttlePosition: number;
}

export interface GhostTarget {
  altitude: number;
  yaw: number;
}

export interface PlayerState {
  altitude: number;
  yaw: number;
}

export const HOVER_ALTITUDE = 2;
export const MIN_ALTITUDE = 0.6;
export const MAX_ALTITUDE = 6;
const CLIMB_SPEED = 7;
const CAMERA_HEIGHT_OFFSET = 1.2;
const CAMERA_DISTANCE = 7;

export class QuadcopterScene {
  readonly container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private drone: THREE.Group;
  private ghost: THREE.Group;
  private propellers: THREE.Group[] = [];
  private animationId = 0;

  private yawAngle = 0;
  private altitude = HOVER_ALTITUDE;
  private ghostTarget: GhostTarget | null = null;
  private holdRing: THREE.Mesh | null = null;
  private alignRingPlayer: THREE.Mesh;
  private alignRingGhost: THREE.Mesh;
  private matchParticles: THREE.Points;
  private particlePositions: Float32Array;
  private particleVelocities: Float32Array;
  private particleLifetimes: Float32Array;
  private particleTime = 0;
  private alignPulse = 0;

  constructor(container: HTMLElement) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.background = this.createSkyGradient();

    this.camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100,
    );
    this.camera.position.set(0, HOVER_ALTITUDE + CAMERA_HEIGHT_OFFSET, CAMERA_DISTANCE);
    this.camera.lookAt(0, HOVER_ALTITUDE, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.setupLights();
    this.createGround();
    this.drone = this.buildDrone(false);
    this.ghost = this.buildDrone(true);
    this.ghost.visible = false;
    this.scene.add(this.drone);
    this.scene.add(this.ghost);

    this.alignRingPlayer = this.createAlignRing(0x4ade80);
    this.alignRingGhost = this.createAlignRing(0x4fc3f7);
    this.drone.add(this.alignRingPlayer);
    this.ghost.add(this.alignRingGhost);

    const particleCount = 80;
    this.particlePositions = new Float32Array(particleCount * 3);
    this.particleVelocities = new Float32Array(particleCount * 3);
    this.particleLifetimes = new Float32Array(particleCount);
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute("position", new THREE.BufferAttribute(this.particlePositions, 3));
    this.matchParticles = new THREE.Points(
      particleGeo,
      new THREE.PointsMaterial({
        color: 0x4ade80,
        size: 0.12,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(this.matchParticles);

    window.addEventListener("resize", this.onResize);
    this.animate();
  }

  getPlayerState(): PlayerState {
    return { altitude: this.altitude, yaw: this.yawAngle };
  }

  setGhostTarget(target: GhostTarget | null): void {
    this.ghostTarget = target;
    if (!target) {
      this.ghost.visible = false;
      return;
    }
    this.ghost.visible = true;
    this.ghost.position.y = target.altitude;
    this.ghost.rotation.y = target.yaw;
  }

  setMatchFeedback(aligning: boolean, holdProgress: number): void {
    const progress = Math.min(1, Math.max(0, holdProgress));
    this.alignRingPlayer.visible = aligning;
    this.alignRingGhost.visible = aligning;

    if (aligning) {
      this.alignPulse += 0.08;
      const pulse = 0.55 + Math.sin(this.alignPulse) * 0.2;
      (this.alignRingPlayer.material as THREE.MeshBasicMaterial).opacity = pulse;
      (this.alignRingGhost.material as THREE.MeshBasicMaterial).opacity = pulse * 0.7;
      this.updateHoldRing(progress);
    } else {
      this.clearHoldRing();
    }
  }

  triggerMatchCelebration(): void {
    const origin = new THREE.Vector3(
      (this.drone.position.x + this.ghost.position.x) / 2,
      (this.drone.position.y + this.ghost.position.y) / 2 + 0.2,
      (this.drone.position.z + this.ghost.position.z) / 2,
    );

    for (let i = 0; i < this.particleLifetimes.length; i++) {
      const i3 = i * 3;
      this.particlePositions[i3] = origin.x + (Math.random() - 0.5) * 0.3;
      this.particlePositions[i3 + 1] = origin.y + (Math.random() - 0.5) * 0.2;
      this.particlePositions[i3 + 2] = origin.z + (Math.random() - 0.5) * 0.3;

      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 2.5;
      this.particleVelocities[i3] = Math.cos(angle) * speed;
      this.particleVelocities[i3 + 1] = 0.8 + Math.random() * 2.2;
      this.particleVelocities[i3 + 2] = Math.sin(angle) * speed;
      this.particleLifetimes[i] = 0.45 + Math.random() * 0.55;
    }

    this.particleTime = 0;
    (this.matchParticles.material as THREE.PointsMaterial).opacity = 1;
    this.matchParticles.geometry.attributes.position.needsUpdate = true;
  }

  update(state: DroneState, dt: number): void {
    this.yawAngle += state.yaw * 2.5 * dt;

    const throttleDelta = state.throttlePosition - TARGET_THROTTLE;
    const verticalSpeed =
      Math.sign(throttleDelta) *
      Math.pow(Math.abs(throttleDelta) * 2, 1.1) *
      CLIMB_SPEED *
      0.55;
    this.altitude = clamp(this.altitude + verticalSpeed * dt, MIN_ALTITUDE, MAX_ALTITUDE);

    this.drone.position.y = this.altitude;
    this.drone.rotation.y = this.yawAngle;

    const propSpeed = 0.4 + Math.abs(state.throttlePosition - TARGET_THROTTLE) * 1.2 + 0.5;
    for (const prop of this.propellers) {
      prop.rotation.y += propSpeed;
    }

    const lookY = this.ghostTarget
      ? (this.altitude + this.ghost.position.y) / 2
      : this.altitude;
    this.camera.position.set(0, lookY + CAMERA_HEIGHT_OFFSET, CAMERA_DISTANCE);
    this.camera.lookAt(0, lookY, 0);

    this.updateParticles(dt);
  }

  dispose(): void {
    cancelAnimationFrame(this.animationId);
    window.removeEventListener("resize", this.onResize);
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }

  private buildDrone(isGhost: boolean): THREE.Group {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: isGhost ? 0x4fc3f7 : 0x37474f,
      roughness: 0.4,
      metalness: 0.5,
      transparent: isGhost,
      opacity: isGhost ? 0.4 : 1,
      emissive: isGhost ? 0x0288d1 : 0x000000,
      emissiveIntensity: isGhost ? 0.6 : 0,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: isGhost ? 0x81d4fa : 0xff7043,
      roughness: 0.3,
      metalness: 0.6,
      transparent: isGhost,
      opacity: isGhost ? 0.45 : 1,
      emissive: isGhost ? 0x039be5 : 0xbf360c,
      emissiveIntensity: isGhost ? 0.5 : 0.15,
    });
    const armMat = new THREE.MeshStandardMaterial({
      color: isGhost ? 0x4fc3f7 : 0x263238,
      roughness: 0.5,
      metalness: 0.4,
      transparent: isGhost,
      opacity: isGhost ? 0.35 : 1,
    });
    const motorMat = new THREE.MeshStandardMaterial({
      color: isGhost ? 0x29b6f6 : 0x111820,
      roughness: 0.6,
      metalness: 0.7,
      transparent: isGhost,
      opacity: isGhost ? 0.4 : 1,
    });
    const propMat = new THREE.MeshStandardMaterial({
      color: isGhost ? 0xb3e5fc : 0xeeeeee,
      transparent: true,
      opacity: isGhost ? 0.35 : 0.75,
      side: THREE.DoubleSide,
    });
    const noseMat = new THREE.MeshStandardMaterial({
      color: isGhost ? 0xe1f5fe : 0xffeb3b,
      emissive: isGhost ? 0x4fc3f7 : 0xf57f17,
      emissiveIntensity: isGhost ? 0.8 : 0.4,
      transparent: isGhost,
      opacity: isGhost ? 0.5 : 1,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), bodyMat);
    body.castShadow = !isGhost;
    group.add(body);

    const topPlate = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.03, 0.35), accentMat);
    topPlate.position.y = 0.075;
    group.add(topPlate);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 4), noseMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.04, -0.32);
    group.add(nose);

    const armPositions: [number, number][] = [
      [1, -1],
      [-1, -1],
      [-1, 1],
      [1, 1],
    ];

    for (const [sx, sz] of armPositions) {
      const mx = sx * 0.85;
      const mz = sz * 0.85;
      const angle = Math.atan2(sx, sz);

      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.9), armMat);
      arm.position.set(sx * 0.45, 0, sz * 0.45);
      arm.rotation.y = angle;
      arm.castShadow = !isGhost;
      group.add(arm);

      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.1, 16), motorMat);
      motor.position.set(mx, 0.05, mz);
      motor.castShadow = !isGhost;
      group.add(motor);

      const propHub = new THREE.Group();
      propHub.position.set(mx, 0.12, mz);

      const bladeGeo = new THREE.BoxGeometry(0.55, 0.012, 0.08);
      const bladeA = new THREE.Mesh(bladeGeo, propMat);
      const bladeB = new THREE.Mesh(bladeGeo, propMat);
      bladeB.rotation.y = Math.PI / 2;
      propHub.add(bladeA, bladeB);

      if (!isGhost) {
        this.propellers.push(propHub);
      }
      group.add(propHub);
    }

    return group;
  }

  private createAlignRing(color: number): THREE.Mesh {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.72, 48),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.08;
    ring.visible = false;
    return ring;
  }

  private updateHoldRing(progress: number): void {
    this.clearHoldRing();
    if (progress <= 0) return;

    const start = -Math.PI / 2;
    this.holdRing = new THREE.Mesh(
      new THREE.RingGeometry(0.78, 0.95, 64, 1, start, Math.PI * 2 * progress),
      new THREE.MeshBasicMaterial({
        color: 0x4ade80,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.holdRing.rotation.x = -Math.PI / 2;
    this.holdRing.position.y = -0.06;
    this.drone.add(this.holdRing);
  }

  private clearHoldRing(): void {
    if (!this.holdRing) return;
    this.drone.remove(this.holdRing);
    this.holdRing.geometry.dispose();
    (this.holdRing.material as THREE.Material).dispose();
    this.holdRing = null;
  }

  private updateParticles(dt: number): void {
    const mat = this.matchParticles.material as THREE.PointsMaterial;
    let anyAlive = false;

    for (let i = 0; i < this.particleLifetimes.length; i++) {
      if (this.particleLifetimes[i] <= 0) continue;

      this.particleLifetimes[i] -= dt;
      const i3 = i * 3;
      this.particlePositions[i3] += this.particleVelocities[i3] * dt;
      this.particlePositions[i3 + 1] += this.particleVelocities[i3 + 1] * dt;
      this.particlePositions[i3 + 2] += this.particleVelocities[i3 + 2] * dt;
      this.particleVelocities[i3 + 1] -= 2.5 * dt;
      anyAlive = true;
    }

    if (anyAlive) {
      this.particleTime += dt;
      mat.opacity = Math.max(0, 1 - this.particleTime / 1.1);
      this.matchParticles.geometry.attributes.position.needsUpdate = true;
    } else {
      mat.opacity = 0;
    }
  }

  private createSkyGradient(): THREE.Color {
    return new THREE.Color(0x5eb8ff);
  }

  private setupLights(): void {
    const ambient = new THREE.HemisphereLight(0x87ceeb, 0x3d8b40, 0.85);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff5e0, 1.4);
    sun.position.set(4, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 30;
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    this.scene.add(sun);
  }

  private createGround(): void {
    const skyGeo = new THREE.SphereGeometry(50, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x1e90ff) },
        midColor: { value: new THREE.Color(0x6ec6ff) },
        bottomColor: { value: new THREE.Color(0xffb347) },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPos;
        void main() {
          float h = normalize(vWorldPos).y;
          vec3 col = h > 0.0
            ? mix(midColor, topColor, smoothstep(0.0, 0.7, h))
            : mix(midColor, bottomColor, smoothstep(0.0, -0.3, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.scene.add(new THREE.Mesh(skyGeo, skyMat));

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.85, metalness: 0.05 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(40, 40, 0x2e7d32, 0x66bb6a);
    grid.position.y = 0.02;
    this.scene.add(grid);
  }

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);
    this.renderer.render(this.scene, this.camera);
  };

  private onResize = (): void => {
    const { clientWidth, clientHeight } = this.container;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight);
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

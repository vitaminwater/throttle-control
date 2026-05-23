import * as THREE from "three";
import { TARGET_THROTTLE } from "./gamepad";

export interface DroneState {
  yaw: number;
  throttlePosition: number;
}

const HOVER_ALTITUDE = 2;
const MIN_ALTITUDE = 0.6;
const MAX_ALTITUDE = 6;
const CLIMB_SPEED = 2.5;

export class QuadcopterScene {
  readonly container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private drone: THREE.Group;
  private propellers: THREE.Mesh[] = [];
  private animationId = 0;

  private yawAngle = 0;
  private altitude = HOVER_ALTITUDE;

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
    this.camera.position.set(0, HOVER_ALTITUDE + 0.5, 7);
    this.camera.lookAt(0, HOVER_ALTITUDE, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.setupLights();
    this.createGround();
    this.drone = this.createQuadcopter();
    this.scene.add(this.drone);

    window.addEventListener("resize", this.onResize);
    this.animate();
  }

  update(state: DroneState, dt: number): void {
    this.yawAngle += state.yaw * 2.5 * dt;

    const verticalSpeed = (state.throttlePosition - TARGET_THROTTLE) * CLIMB_SPEED;
    this.altitude = clamp(this.altitude + verticalSpeed * dt, MIN_ALTITUDE, MAX_ALTITUDE);

    this.drone.position.y = this.altitude;
    this.drone.rotation.y = this.yawAngle;

    const propSpeed = 0.4 + Math.abs(state.throttlePosition - TARGET_THROTTLE) * 1.2 + 0.5;
    for (const prop of this.propellers) {
      prop.rotation.z += propSpeed;
    }

    this.camera.position.set(0, this.altitude + 0.5, 7);
    this.camera.lookAt(0, this.altitude, 0);
  }

  dispose(): void {
    cancelAnimationFrame(this.animationId);
    window.removeEventListener("resize", this.onResize);
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
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
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);

    const groundGeo = new THREE.PlaneGeometry(40, 40);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x4caf50,
      roughness: 0.85,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(40, 40, 0x2e7d32, 0x66bb6a);
    grid.position.y = 0.02;
    this.scene.add(grid);
  }

  private createQuadcopter(): THREE.Group {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x37474f,
      roughness: 0.4,
      metalness: 0.5,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0xff7043,
      roughness: 0.3,
      metalness: 0.6,
      emissive: 0xbf360c,
      emissiveIntensity: 0.15,
    });
    const armMat = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.5, metalness: 0.4 });
    const motorMat = new THREE.MeshStandardMaterial({ color: 0x111820, roughness: 0.6, metalness: 0.7 });
    const propMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), bodyMat);
    body.castShadow = true;
    group.add(body);

    const topPlate = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.03, 0.35), accentMat);
    topPlate.position.y = 0.075;
    group.add(topPlate);

    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.18, 4),
      new THREE.MeshStandardMaterial({ color: 0xffeb3b, emissive: 0xf57f17, emissiveIntensity: 0.4 }),
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.04, -0.32);
    group.add(nose);

    const armPositions: [number, number][] = [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ];

    for (const [sx, sz] of armPositions) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.06), armMat);
      arm.position.set(sx * 0.45, 0, sz * 0.45);
      arm.rotation.y = Math.atan2(sz, sx);
      arm.castShadow = true;
      group.add(arm);

      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.1, 16), motorMat);
      motor.position.set(sx * 0.85, 0.05, sz * 0.85);
      motor.castShadow = true;
      group.add(motor);

      const prop = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.015, 0.06), propMat);
      prop.position.set(sx * 0.85, 0.12, sz * 0.85);
      prop.rotation.y = Math.atan2(sz, sx);
      this.propellers.push(prop);
      group.add(prop);
    }

    group.position.y = this.altitude;
    return group;
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

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createWorld, makeProp, PROP_SPAWNS } from './world.js';
import { Particles, createDust, createRain } from './particles.js';
import { AudioEngine } from './audio.js';
import { environmentTexture } from './materials.js';

const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

const isTouch = (window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches)
  || new URLSearchParams(location.search).has('touch');
document.body.classList.toggle('touch-ui', isTouch);

// ---------------------------------------------------------------- renderer
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  alpha: false,
  stencil: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 400);
camera.rotation.order = 'YXZ';
scene.add(camera);

// suit lamp — keeps the foreground readable without flattening the scene
const suitLight = new THREE.PointLight(0xffd2a4, 12, 14, 2);
suitLight.position.set(0.3, -0.15, -1.5);
camera.add(suitLight);

// dedicated soft key for the first-person models, from behind the player's shoulder
const viewLight = new THREE.PointLight(0xffe2c8, 3.4, 3.2, 2);
viewLight.position.set(0.22, 0.28, 0.2);
camera.add(viewLight);

// image-based lighting: a procedural night-city panorama drives metal and wet reflections
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
const envSource = environmentTexture();
envSource.mapping = THREE.EquirectangularReflectionMapping;
const envTarget = pmrem.fromEquirectangular(envSource);
scene.environment = envTarget.texture;
scene.environmentIntensity = 0.85;
envSource.dispose();
pmrem.dispose();

// post stack: subtle bloom for emissive signs and plasma, MSAA for clean edges
const usePost = !isTouch;
let composer = null;
let bloomPass = null;
let gtaoPass = null;
if (usePost) {
  const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    type: THREE.HalfFloatType,
    samples: 2,
  });
  composer = new EffectComposer(renderer, renderTarget);
  composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  composer.addPass(new RenderPass(scene, camera));
  // Contact shadows and crevice darkening. Kept subtle so the night scene does
  // not lose its readable silhouettes.
  gtaoPass = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
  gtaoPass.output = GTAOPass.OUTPUT.Default;
  gtaoPass.blendIntensity = 0.5;
  gtaoPass.updateGtaoMaterial({
    radius: 0.55,
    distanceExponent: 1.8,
    thickness: 1.0,
    scale: 1.0,
    samples: 8,
  });
  gtaoPass.updatePdMaterial({
    lumaPhi: 10,
    depthPhi: 2,
    normalPhi: 3,
    radius: 6,
    rings: 2,
    samples: 8,
  });
  composer.addPass(gtaoPass);
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.34,
    0.55,
    0.82
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
}

const clock = new THREE.Clock();

// ---------------------------------------------------------------- world
const world = createWorld(scene);
const particles = new Particles(scene);
const dust = createDust(scene);
const rain = createRain(scene);
const audio = new AudioEngine();

// ---------------------------------------------------------------- player
const player = {
  pos: new THREE.Vector3(0, 0, 20),
  vel: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  eye: 1.68,
  radius: 0.52,
  onGround: true,
  bobPhase: 0,
  bob: 0,
  roll: 0,
};

const game = {
  mode: 'menu',
  health: 100,
  maxHealth: 100,
  ammo: 12,
  mag: 12,
  reloading: false,
  reloadTimer: 0,
  fireCd: 0,
  score: 0,
  kills: 0,
  shots: 0,
  hits: 0,
  wave: 0,
  phase: 'idle',
  waveTimer: 0,
  spawnTimer: 0,
  spawnQueue: [],
  winTimer: 0,
  shake: 0,
  recoil: 0,
  recoilYaw: 0,
  holding: null,
  hoverProp: null,
  hoverEnemy: false,
  lookDx: 0,
  lookDy: 0,
  hasLocked: false,
  best: loadBest(),
  deathTimer: 0,
};

function loadBest() {
  try { return Number(localStorage.getItem('gravity-protocol-best')) || 0; } catch { return 0; }
}
function saveBest() {
  if (game.score > game.best) {
    game.best = game.score;
    try { localStorage.setItem('gravity-protocol-best', String(game.best)); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------- props
const props = [];
const propGroups = [];
for (const spawn of PROP_SPAWNS) {
  const built = makeProp(spawn.type);
  built.group.position.set(spawn.x, built.halfHeight, spawn.z);
  built.group.rotation.y = spawn.rot;
  built.held = false;
  built.velocity = new THREE.Vector3();
  built.angular = new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
  built.hitCooldown = 0;
  built.group.userData.prop = built;
  built.baseEmissive = [];
  built.group.traverse((o) => {
    if (o.isMesh && o.material && o.material.emissive) {
      built.baseEmissive.push({ material: o.material, color: o.material.emissive.clone(), intensity: o.material.emissiveIntensity });
    }
  });
  scene.add(built.group);
  props.push(built);
  propGroups.push(built.group);
}

// ---------------------------------------------------------------- enemies
const enemies = [];
const enemyGroups = [];
const DRONE = {
  body: new THREE.IcosahedronGeometry(0.55, 1),
  eye: new THREE.SphereGeometry(0.17, 12, 10),
  eyeRing: new THREE.TorusGeometry(0.25, 0.026, 5, 20),
  ring: new THREE.TorusGeometry(0.82, 0.022, 4, 30),
  pod: new THREE.BoxGeometry(0.26, 0.16, 0.48),
};

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const glowTexture = makeGlowTexture();
const droneGlowMat = new THREE.SpriteMaterial({
  map: glowTexture, color: 0xff8a30, transparent: true, opacity: 0.75,
  blending: THREE.AdditiveBlending, depthWrite: false,
});

class Drone {
  constructor(position, wave, heavy = false) {
    this.heavy = heavy;
    this.dead = false;
    this.age = 0;
    this.seed = Math.random() * 10;
    this.radius = heavy ? 1.15 : 0.76;
    this.health = heavy ? 145 + wave * 14 : 28 + wave * 7;
    this.maxHealth = this.health;
    this.speed = heavy ? 1.75 : 2.25 + wave * 0.1;
    this.baseScale = heavy ? 1.5 : 1;
    this.vel = new THREE.Vector3();
    this.flash = 0;
    this.fireTimer = 1.4 + Math.random() * 1.6;
    this.eyePulse = Math.random() * 6;

    const group = new THREE.Group();
    group.position.copy(position);
    group.scale.setScalar(0.02);
    this.group = group;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: heavy ? 0x4a362c : 0x3a4650,
      metalness: 0.82,
      roughness: 0.32,
      emissive: 0x26323c,
      emissiveIntensity: 0.55,
    });
    this.bodyMat = bodyMat;
    this.baseEmissive = new THREE.Color(0x26323c);
    this.baseEmissiveIntensity = 0.55;
    const body = new THREE.Mesh(DRONE.body, bodyMat);
    group.add(body);

    const trimMat = new THREE.MeshStandardMaterial({ color: 0x525c66, metalness: 0.9, roughness: 0.3 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.035, 5, 22), trimMat);
    band.rotation.x = Math.PI / 2;
    group.add(band);

    const eyeMat = new THREE.MeshBasicMaterial({ color: heavy ? 0xff4030 : 0xffa04a, toneMapped: false });
    this.eyeMat = eyeMat;
    const eye = new THREE.Mesh(DRONE.eye, eyeMat);
    eye.position.set(0, 0.05, 0.49);
    group.add(eye);
    const eyeRing = new THREE.Mesh(
      DRONE.eyeRing,
      new THREE.MeshStandardMaterial({ color: 0x3b444d, metalness: 0.8, roughness: 0.3 })
    );
    eyeRing.position.set(0, 0.05, 0.5);
    group.add(eyeRing);

    const ringMat = new THREE.MeshBasicMaterial({
      color: heavy ? 0xff5540 : 0xff9d2e, transparent: true, opacity: 0.68,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const ring1 = new THREE.Mesh(DRONE.ring, ringMat);
    ring1.rotation.x = Math.PI / 2;
    this.ring1 = ring1;
    group.add(ring1);
    const ring2 = new THREE.Mesh(DRONE.ring, ringMat);
    ring2.rotation.y = Math.PI / 2;
    ring2.scale.setScalar(0.82);
    this.ring2 = ring2;
    group.add(ring2);

    if (heavy) {
      for (const sx of [-1, 1]) {
        const pod = new THREE.Mesh(DRONE.pod, bodyMat);
        pod.position.set(sx * 0.7, -0.1, 0);
        pod.rotation.z = sx * 0.2;
        group.add(pod);
        const podLight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.32), new THREE.MeshBasicMaterial({ color: 0xff4030 }));
        podLight.position.set(sx * 0.85, -0.02, 0);
        group.add(podLight);
      }
    }

    const glow = new THREE.Sprite(droneGlowMat.clone());
    glow.material.color.set(heavy ? 0xff3b2a : 0xff8a30);
    glow.material.opacity = 0.45;
    glow.scale.setScalar(heavy ? 1.9 : 1.25);
    glow.position.set(0, 0.05, 0.52);
    group.add(glow);

    group.traverse((o) => {
      if (o.isMesh) {
        o.userData.enemy = this;
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    group.userData.enemy = this;
    scene.add(group);
    this.spawnPoint = position.clone();
    this.eyeWorld = new THREE.Vector3();
  }

  hit(amount, point) {
    if (this.dead) return false;
    this.health -= amount;
    this.flash = 0.14;
    this.bodyMat.emissive.setHex(0xff7a3a);
    if (point) {
      particles.spawn(point, 0xffb066, { count: 7, speed: 3.5, life: 0.4, size: 0.1, gravity: 2, spread: 0.15 });
      particles.spawn(point, 0x2b3138, { count: 3, speed: 1.4, life: 0.7, size: 0.16, gravity: -0.4, spread: 0.2 });
    }
    return this.health <= 0;
  }

  update(dt, time, otherEnemies) {
    this.age += dt;
    const target = camera.position;
    const group = this.group;
    const scale = lerp(group.scale.x, this.baseScale, 1 - Math.exp(-8 * dt));
    group.scale.setScalar(scale);

    const toX = target.x - group.position.x;
    const toZ = target.z - group.position.z;
    const flatDist = Math.max(0.001, Math.hypot(toX, toZ));
    const nx = toX / flatDist;
    const nz = toZ / flatDist;
    const orbit = (this.heavy ? 13 : 10) + Math.sin(this.age * 0.55 + this.seed) * 2.5;
    const strafe = Math.sin(this.age * 0.42 + this.seed * 1.7) * (this.heavy ? 2.2 : 3.2);

    let tx = group.position.x + nx * (flatDist - orbit) - nz * strafe;
    let tz = group.position.z + nz * (flatDist - orbit) + nx * strafe;
    let ty = (this.heavy ? 2.45 : 2.05) + Math.sin(this.age * 1.7 + this.seed) * 0.22;

    // separation
    for (const other of otherEnemies) {
      if (other === this || other.dead) continue;
      const dx = group.position.x - other.group.position.x;
      const dz = group.position.z - other.group.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.001 && d < this.radius + other.radius + 0.9) {
        const push = (this.radius + other.radius + 0.9 - d) * 3.2;
        tx += (dx / d) * push;
        tz += (dz / d) * push;
      }
    }

    this.vel.x += (tx - group.position.x) * 1.4 * dt;
    this.vel.z += (tz - group.position.z) * 1.4 * dt;
    this.vel.y += (ty - group.position.y) * 2.2 * dt;
    const damp = Math.exp(-1.25 * dt);
    this.vel.x *= damp;
    this.vel.z *= damp;
    this.vel.y *= damp;
    const maxSpeed = this.speed;
    if (this.vel.length() > maxSpeed) this.vel.setLength(maxSpeed);
    group.position.addScaledVector(this.vel, dt);
    group.position.x = clamp(group.position.x, -29, 29);
    group.position.z = clamp(group.position.z, -29, 29);
    group.position.y = clamp(group.position.y, 1.15, 6.5);

    group.lookAt(target);
    this.ring1.rotation.z += dt * 1.7;
    this.ring2.rotation.x += dt * 2.3;
    this.eyePulse += dt * 5;
    const pulse = 0.86 + Math.sin(this.eyePulse) * 0.14;
    this.eyeMat.color.setRGB(
      (this.heavy ? 1 : 1) * pulse,
      (this.heavy ? 0.25 : 0.62) * pulse,
      (this.heavy ? 0.18 : 0.28) * pulse
    );
    if (this.flash > 0) {
      this.flash -= dt;
      this.bodyMat.emissiveIntensity = Math.max(0, this.flash / 0.14) * 2.4;
    } else {
      this.bodyMat.emissiveIntensity = this.baseEmissiveIntensity;
      this.bodyMat.emissive.copy(this.baseEmissive);
    }

    this.fireTimer -= dt;
    let shouldFire = false;
    if (this.fireTimer <= 0 && flatDist < 38 && this.age > 1.2) {
      shouldFire = true;
      this.fireTimer = Math.max(1.05, 2.9 - game.wave * 0.14) + Math.random() * 0.8;
    }
    this.eyeWorld.set(0, 0.05, 0.55);
    group.updateMatrixWorld(true);
    group.localToWorld(this.eyeWorld);
    return shouldFire;
  }
}

// ---------------------------------------------------------------- view models
const viewModels = new THREE.Group();
camera.add(viewModels);

function viewMaterial(color, roughness = 0.44, metalness = 0.38) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    envMapIntensity: 1.0,
    emissive: 0x080d12,
    emissiveIntensity: 0.6,
  });
}

function buildGun() {
  const g = new THREE.Group();
  const dark = viewMaterial(0x11161b, 0.52, 0.28);
  const mid = viewMaterial(0x303b45, 0.38, 0.5);
  const light = viewMaterial(0x5b6b77, 0.28, 0.62);
  const gripMat = viewMaterial(0x161b20, 0.78, 0.08);
  const gripPanel = viewMaterial(0x242c33, 0.7, 0.18);
  const glove = viewMaterial(0x241e17, 0.86, 0.04);
  const glovePad = viewMaterial(0x46392a, 0.8, 0.06);
  const gloveCuff = viewMaterial(0x1b1915, 0.62, 0.28);
  const glow = new THREE.MeshBasicMaterial({ color: 0x66d9ff, toneMapped: false });
  const orangeGlow = new THREE.MeshBasicMaterial({ color: 0xff9d2e, toneMapped: false });

  // Per-face values keep the silhouette readable even when the suit lamp is behind it.
  // Box material order is +x, -x, +y, -y, +z, -z.
  const shaded = (topColor, sideColor, bottomColor, frontColor) => {
    const topM = viewMaterial(topColor, 0.34, 0.5);
    const sideM = viewMaterial(sideColor, 0.42, 0.45);
    const bottomM = viewMaterial(bottomColor, 0.52, 0.35);
    const frontM = viewMaterial(frontColor, 0.38, 0.48);
    return [sideM, sideM, topM, bottomM, frontM, frontM];
  };
  const box = (w, h, d, mats, x, y, z, rx = 0) => {
    const radius = Math.min(w, h, d) * 0.18;
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, radius), mats);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    g.add(m);
    return m;
  };

  // The slide is extruded from a proper pistol side profile instead of being a
  // single rounded box. This gives the front nose, rear taper and top chamfer
  // that read immediately as a handgun silhouette.
  const slideShape = new THREE.Shape();
  slideShape.moveTo(-0.255, 0.028);
  slideShape.lineTo(0.118, 0.028);
  slideShape.lineTo(0.118, 0.095);
  slideShape.lineTo(0.075, 0.114);
  slideShape.lineTo(-0.188, 0.11);
  slideShape.lineTo(-0.232, 0.09);
  slideShape.lineTo(-0.255, 0.064);
  slideShape.lineTo(-0.255, 0.028);
  const slideGeo = new THREE.ExtrudeGeometry(slideShape, {
    depth: 0.09,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelSegments: 2,
    curveSegments: 1,
  });
  slideGeo.translate(0, 0, -0.045);
  slideGeo.rotateY(-Math.PI / 2);
  const slideMats = [viewMaterial(0x171e24, 0.5, 0.44), viewMaterial(0x2b353e, 0.42, 0.48)];
  const slide = new THREE.Mesh(slideGeo, slideMats);
  slide.position.set(0, 0.012, -0.01);
  g.add(slide);

  const frameMats = shaded(0x2d3842, 0x192128, 0x0b0f13, 0x131a20);
  const bodyMats = shaded(0x27323b, 0x171e24, 0x090d10, 0x11181e);
  box(0.074, 0.05, 0.30, frameMats, 0, 0.005, -0.02);
  box(0.064, 0.032, 0.205, bodyMats, 0, -0.021, -0.13);
  box(0.076, 0.014, 0.11, bodyMats, 0, 0.001, 0.075);

  // under-barrel accessory rail
  for (let i = 0; i < 3; i++) {
    box(0.058, 0.007, 0.012, shaded(0x0a0e11, 0x0a0e11, 0x0a0e11, 0x0a0e11), 0, -0.041, -0.155 + i * 0.052);
  }

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.12, 12), mid);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.055, -0.27);
  g.add(barrel);
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.045, 12), light);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, 0.055, -0.335);
  g.add(muzzle);
  const muzzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.0045, 4, 16), dark);
  muzzleRing.position.set(0, 0.055, -0.358);
  g.add(muzzleRing);

  // left-side detail: ejection port, serrations, slide-stop and takedown pin
  box(0.002, 0.026, 0.075, dark, -0.048, 0.082, -0.035);
  box(0.002, 0.007, 0.085, light, -0.049, 0.069, -0.035);
  for (let i = 0; i < 5; i++) {
    box(0.002, 0.035, 0.006, light, -0.048, 0.078, 0.038 + i * 0.014);
  }
  box(0.009, 0.012, 0.062, mid, -0.05, 0.044, 0.018);
  const takedown = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.01, 10), light);
  takedown.rotation.z = Math.PI / 2;
  takedown.position.set(-0.048, 0.045, -0.065);
  g.add(takedown);

  // slide-top rib, rear sight and front sight
  box(0.028, 0.007, 0.24, shaded(0x303b44, 0x1c242b, 0x0e1418, 0x171e24), 0, 0.132, -0.045);
  box(0.012, 0.024, 0.014, shaded(0x303b45, 0x192128, 0x0d1115, 0x151d23), -0.029, 0.15, 0.075);
  box(0.012, 0.024, 0.014, shaded(0x303b45, 0x192128, 0x0d1115, 0x151d23), 0.029, 0.15, 0.075);
  box(0.07, 0.006, 0.012, dark, 0, 0.153, 0.075);
  box(0.009, 0.026, 0.012, shaded(0x46545f, 0x27323b, 0x12181d, 0x1e262d), 0, 0.15, -0.185);
  const sightDot = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.007, 0.003), orangeGlow);
  sightDot.position.set(0, 0.152, -0.192);
  g.add(sightDot);

  // small cyan status strip and a rear indicator keep the Combine styling subtle
  box(0.002, 0.01, 0.072, glow, -0.049, 0.058, -0.035);
  const indicator = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.003), orangeGlow);
  indicator.position.set(0.035, 0.118, 0.112);
  g.add(indicator);

  // grip, magazine floorplate and checkering
  const grip = new THREE.Mesh(new RoundedBoxGeometry(0.082, 0.2, 0.105, 3, 0.018), gripMat);
  grip.position.set(0, -0.12, 0.10);
  grip.rotation.x = -0.22;
  g.add(grip);
  box(0.078, 0.016, 0.108, shaded(0x2a333b, 0x171e24, 0x0b0f13, 0x12191f), 0, -0.219, 0.125, -0.22);
  box(0.04, 0.145, 0.008, gripPanel, -0.042, -0.115, 0.145, -0.22);
  for (let i = 0; i < 5; i++) {
    box(0.046, 0.006, 0.005, dark, -0.043, -0.065 - i * 0.022, 0.15, -0.22);
  }

  // trigger guard and trigger
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.007, 5, 16, Math.PI), dark);
  guard.rotation.set(0, Math.PI / 2, Math.PI);
  guard.position.set(0, -0.062, 0.012);
  g.add(guard);
  const trigger = new THREE.Mesh(new RoundedBoxGeometry(0.012, 0.036, 0.012, 2, 0.004), light);
  trigger.position.set(0, -0.062, 0.012);
  trigger.rotation.x = -0.3;
  g.add(trigger);

  // hammer and beavertail
  box(0.026, 0.026, 0.022, mid, 0, 0.07, 0.125, 0.35);
  box(0.05, 0.018, 0.06, bodyMats, 0, 0.035, 0.125, 0.12);

  // gloved hand: palm behind the grip, fingers wrapping the near side, cuff
  // and forearm continuing off the bottom of the frame.
  const hand = new THREE.Group();
  hand.scale.setScalar(0.9);
  hand.position.set(0, -0.018, 0.012);
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.14, 0.115, 3, 0.03), glove);
  palm.position.set(0.004, -0.15, 0.185);
  palm.rotation.x = -0.22;
  hand.add(palm);
  for (let i = 0; i < 4; i++) {
    const finger = new THREE.Mesh(
      new RoundedBoxGeometry(0.032, 0.023, 0.096, 2, 0.009),
      glove
    );
    finger.position.set(-0.054, -0.074 - i * 0.024, 0.10);
    finger.rotation.x = -0.22;
    hand.add(finger);
    const knuckle = new THREE.Mesh(new RoundedBoxGeometry(0.026, 0.02, 0.026, 2, 0.007), glovePad);
    knuckle.position.set(-0.064, -0.074 - i * 0.024, 0.152);
    knuckle.rotation.x = -0.22;
    hand.add(knuckle);
  }
  const thumb = new THREE.Mesh(new RoundedBoxGeometry(0.032, 0.03, 0.09, 2, 0.009), glove);
  thumb.position.set(-0.055, -0.045, 0.165);
  thumb.rotation.set(-0.2, 0.18, 0.1);
  hand.add(thumb);
  const thumbPad = new THREE.Mesh(new RoundedBoxGeometry(0.022, 0.014, 0.05, 2, 0.005), glovePad);
  thumbPad.position.set(-0.067, -0.038, 0.18);
  thumbPad.rotation.set(-0.2, 0.18, 0.1);
  hand.add(thumbPad);
  const sleeve = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.22, 0.14, 3, 0.035), gloveCuff);
  sleeve.position.set(0.02, -0.3, 0.23);
  sleeve.rotation.x = -0.34;
  hand.add(sleeve);
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.006, 4, 20), orangeGlow);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.set(0.02, -0.215, 0.205);
  hand.add(cuff);
  const gloveLight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.012), orangeGlow);
  gloveLight.position.set(0.004, -0.118, 0.245);
  hand.add(gloveLight);
  g.add(hand);

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0, 0.055, -0.37);
  g.add(muzzlePoint);
  g.userData.muzzle = muzzlePoint;

  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture, color: 0xffc06a, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  flash.position.set(0, 0.055, -0.39);
  flash.scale.set(0.2, 0.2, 1);
  flash.visible = false;
  g.add(flash);
  g.userData.flash = flash;

  g.position.set(0.31, -0.2, -0.64);
  g.rotation.set(-0.06, 0.26, 0.02);
  g.scale.setScalar(0.8);
  return g;
}

function buildGlove() {
  const g = new THREE.Group();
  const shell = viewMaterial(0x261f18, 0.86, 0.04);
  const pad = viewMaterial(0x463725, 0.8, 0.06);
  const darkMetal = viewMaterial(0x191713, 0.6, 0.32);
  const glow = new THREE.MeshBasicMaterial({ color: 0xff9d2e, toneMapped: false });

  // Palm and articulated fingers, built from rounded volumes so the glove reads
  // as a hand rather than a floating tan block.
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.135, 0.062, 0.18, 3, 0.024), shell);
  palm.position.set(0, 0, 0);
  g.add(palm);
  const backPad = new THREE.Mesh(new RoundedBoxGeometry(0.082, 0.012, 0.085, 2, 0.006), pad);
  backPad.position.set(0, 0.038, 0.015);
  g.add(backPad);
  for (let i = 0; i < 4; i++) {
    const finger = new THREE.Mesh(new RoundedBoxGeometry(0.028, 0.03, 0.115, 2, 0.011), i === 0 ? pad : shell);
    finger.position.set(-0.045 + i * 0.03, 0, -0.135);
    finger.rotation.x = -0.3;
    g.add(finger);
    const tip = new THREE.Mesh(new RoundedBoxGeometry(0.026, 0.026, 0.035, 2, 0.009), shell);
    tip.position.set(-0.045 + i * 0.03, -0.026, -0.19);
    tip.rotation.x = -0.5;
    g.add(tip);
  }
  const thumb = new THREE.Mesh(new RoundedBoxGeometry(0.034, 0.04, 0.095, 2, 0.012), pad);
  thumb.position.set(0.078, -0.008, -0.045);
  thumb.rotation.set(-0.1, -0.5, 0.08);
  g.add(thumb);

  const cuff = new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.075, 0.095, 3, 0.024), darkMetal);
  cuff.position.z = 0.13;
  g.add(cuff);
  const sleeve = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.13, 0.26, 3, 0.04), darkMetal);
  sleeve.position.set(0, -0.01, 0.27);
  sleeve.rotation.x = 0.08;
  g.add(sleeve);
  const sleeveBand = new THREE.Mesh(new RoundedBoxGeometry(0.155, 0.018, 0.03, 2, 0.006), pad);
  sleeveBand.position.set(0, 0.045, 0.22);
  g.add(sleeveBand);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 4, 20), glow);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.036, 0.005);
  g.add(ring);
  const chip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.014, 0.045), glow);
  chip.position.set(0, 0.038, 0.075);
  g.add(chip);
  const cuffLight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.06), glow);
  cuffLight.position.set(0, 0.042, 0.145);
  g.add(cuffLight);
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture, color: 0xff9d2e, transparent: true, opacity: 0.38,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  aura.position.set(0, 0.035, -0.005);
  aura.scale.set(0.24, 0.24, 1);
  g.add(aura);

  g.position.set(-0.26, -0.27, -0.45);
  g.rotation.set(0.25, 0.15, 0.1);
  g.visible = false;
  return g;
}

const gun = buildGun();
const glove = buildGlove();
viewModels.add(gun, glove);
viewModels.visible = false;

// glove beam
const beamGeo = new THREE.BufferGeometry();
beamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
const beamMat = new THREE.LineBasicMaterial({
  color: 0xffb469, transparent: true, opacity: 0.85,
  blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
});
const beam = new THREE.Line(beamGeo, beamMat);
beam.frustumCulled = false;
beam.visible = false;
scene.add(beam);

const holdGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTexture, color: 0xffa040, transparent: true, opacity: 0.5,
  blending: THREE.AdditiveBlending, depthWrite: false,
}));
holdGlow.scale.set(2.4, 2.4, 1);
holdGlow.visible = false;
scene.add(holdGlow);

// ---------------------------------------------------------------- projectiles / pickups / effects
const projectileGeo = new THREE.SphereGeometry(0.13, 8, 6);
const projectileMat = new THREE.MeshBasicMaterial({ color: 0xffb060, toneMapped: false });
const projectileGlowMat = new THREE.SpriteMaterial({
  map: glowTexture, color: 0xff7a28, transparent: true, opacity: 0.9,
  blending: THREE.AdditiveBlending, depthWrite: false,
});
const projectiles = [];

function spawnProjectile(position, velocity, damage) {
  const group = new THREE.Group();
  group.position.copy(position);
  const ball = new THREE.Mesh(projectileGeo, projectileMat);
  group.add(ball);
  const glow = new THREE.Sprite(projectileGlowMat);
  glow.scale.set(1.25, 1.25, 1);
  group.add(glow);
  scene.add(group);
  projectiles.push({ group, velocity: velocity.clone(), damage, life: 5.5, trail: 0 });
}

const pickups = [];
function spawnMedkit(position) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.24, 0.32),
    new THREE.MeshLambertMaterial({ color: 0xd7dde1, emissive: 0x224433, emissiveIntensity: 0.4 })
  );
  group.add(body);
  const crossMat = new THREE.MeshBasicMaterial({ color: 0x6ef2a8, toneMapped: false });
  const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.05, 0.02), crossMat);
  c1.position.set(0, 0, 0.17);
  group.add(c1);
  const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.02), crossMat);
  c2.position.set(0, 0, 0.17);
  group.add(c2);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture, color: 0x6ef2a8, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.set(1.5, 1.5, 1);
  group.add(glow);
  group.position.set(position.x, 0.48, position.z);
  scene.add(group);
  pickups.push({ group, life: 24, phase: Math.random() * 6, glow });
}

const effects = [];
const flashPool = [];
for (let i = 0; i < 3; i++) {
  const light = new THREE.PointLight(0xff8a3c, 0, 26, 2);
  scene.add(light);
  flashPool.push({ light, life: 0, max: 0.3, base: 0 });
}
let flashCursor = 0;

function flashLight(position, intensity = 160) {
  const slot = flashPool[flashCursor];
  flashCursor = (flashCursor + 1) % flashPool.length;
  slot.light.position.copy(position);
  slot.life = 0.32;
  slot.max = 0.32;
  slot.base = intensity;
}

function addTracer(from, to, color = 0x9fe6ff, life = 0.075) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineBasicMaterial({
    color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  effects.push({ type: 'line', obj: line, life, max: life });
}

function addRing(position, color = 0xff9d2e, size = 1, life = 0.55) {
  const geo = new THREE.RingGeometry(0.55, 0.75, 32);
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.scale.setScalar(size);
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(position);
  ring.position.y = Math.max(0.05, position.y);
  scene.add(ring);
  effects.push({ type: 'ring', obj: ring, life, max: life, growth: 3.6 });
}

function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.life -= dt;
    const t = 1 - Math.max(0, e.life) / e.max;
    if (e.type === 'line') {
      e.obj.material.opacity = (1 - t) * 0.9;
    } else if (e.type === 'ring') {
      e.obj.scale.setScalar(1 + t * e.growth);
      e.obj.material.opacity = (1 - t) * 0.85;
    }
    if (e.life <= 0) {
      scene.remove(e.obj);
      e.obj.geometry.dispose();
      e.obj.material.dispose();
      effects.splice(i, 1);
    }
  }
  for (const slot of flashPool) {
    if (slot.life > 0) {
      slot.life -= dt;
      slot.light.intensity = Math.max(0, slot.life / slot.max) * slot.base;
    }
  }
}

// ---------------------------------------------------------------- UI
const ui = {
  boot: $('boot'), menu: $('menu'), hud: $('hud'), pause: $('pause'), end: $('end'), touch: $('touch'),
  toast: $('toast'), waveLabel: $('wave-label'), enemyCount: $('enemy-count'), waveFill: $('wave-fill'),
  score: $('score'), best: $('best'), healthFill: $('health-fill'), healthNum: $('health-num'),
  healthState: $('health-state'), ammo: $('ammo'), ammoSub: $('ammo-sub'), gloveState: $('glove-state'),
  gloveText: $('glove-text'), hint: $('hint'), crosshair: $('crosshair'), hitmarker: $('hitmarker'),
  damage: $('damage'), lockPrompt: $('lock-prompt'),
  endTitle: $('end-title'), endEyebrow: $('end-eyebrow'), endCopy: $('end-copy'),
  endWave: $('end-wave'), endKills: $('end-kills'), endAccuracy: $('end-accuracy'), endScore: $('end-score'),
  endBest: $('end-best'),
};

let toastTimeout = 0;
function toast(text, duration = 2600) {
  ui.toast.textContent = text;
  ui.toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => ui.toast.classList.remove('show'), duration);
}

let damageTimeout = 0;
function damageFlash() {
  ui.damage.classList.add('on');
  clearTimeout(damageTimeout);
  damageTimeout = setTimeout(() => ui.damage.classList.remove('on'), 110);
}

const hudCache = {};
function setText(el, key, value) {
  if (hudCache[key] === value) return;
  hudCache[key] = value;
  el.textContent = value;
}

function refreshHUD() {
  const health = Math.max(0, Math.round(game.health));
  const healthPct = `${(health / game.maxHealth) * 100}%`;
  if (hudCache.healthPct !== healthPct) {
    hudCache.healthPct = healthPct;
    ui.healthFill.style.width = healthPct;
  }
  setText(ui.healthNum, 'health', String(health));
  setText(ui.healthState, 'healthState', health > 55 ? 'NOMINAL' : health > 25 ? 'COMPROMISED' : 'CRITICAL');
  ui.healthFill.classList.toggle('low', health <= 30);
  ui.healthState.classList.toggle('low', health <= 30);

  setText(ui.ammo, 'ammo', game.reloading ? '--' : String(game.ammo));
  setText(ui.score, 'score', String(game.score).padStart(6, '0'));
  setText(ui.best, 'best', `BEST ${String(Math.max(game.best, game.score)).padStart(6, '0')}`);
  setText(ui.waveLabel, 'wave', `WAVE ${String(Math.max(1, game.wave)).padStart(2, '0')} / 08`);
  setText(ui.enemyCount, 'enemy', `${enemies.length + game.spawnQueue.length} HOSTILES`);
  const wavePct = `${clamp((game.wave / 8) * 100, 0, 100)}%`;
  if (hudCache.wavePct !== wavePct) {
    hudCache.wavePct = wavePct;
    ui.waveFill.style.width = wavePct;
  }

  let sub = 'RMB // GRAVITY GLOVE';
  if (game.reloading) sub = `RELOADING // ${Math.max(0, game.reloadTimer).toFixed(1)}s`;
  else if (game.holding) sub = 'LMB // HURL PROP';
  else if (game.hoverProp) sub = 'RMB // GRAVITY PULL';
  setText(ui.ammoSub, 'ammoSub', sub);
  ui.ammoSub.classList.toggle('low', game.ammo <= 2 || game.reloading);

  let gloveText = 'GLOVE READY';
  let gloveClass = 'glove-state';
  if (game.holding) { gloveText = 'PROP FIELD ACTIVE'; gloveClass += ' held'; }
  else if (game.hoverProp) { gloveText = 'PULL IN RANGE'; gloveClass += ' ready'; }
  setText(ui.gloveText, 'gloveText', gloveText);
  if (ui.gloveState.className !== gloveClass) ui.gloveState.className = gloveClass;

  let hintText = '';
  if (game.holding) hintText = 'LMB // HURL    RMB // DROP';
  else if (game.hoverProp) hintText = 'HOLD RMB // GRAVITY PULL';
  const hintVisible = Boolean(hintText);
  if (hudCache.hint !== hintText) {
    hudCache.hint = hintText;
    if (hintText) ui.hint.innerHTML = `<span class="hint-key">${game.holding ? 'LMB' : 'RMB'}</span>${hintText.replace(/^(LMB|RMB) \/\/ /, '')}`;
    ui.hint.classList.toggle('hidden', !hintVisible);
  }
  ui.crosshair.classList.toggle('target', Boolean(game.hoverProp) || game.hoverEnemy);
  ui.crosshair.classList.toggle('reload', game.reloading);
}

function showHitmarker(kill = false) {
  ui.hitmarker.classList.remove('show', 'kill');
  void ui.hitmarker.offsetWidth;
  ui.hitmarker.classList.add('show');
  if (kill) ui.hitmarker.classList.add('kill');
}

// ---------------------------------------------------------------- input
const keys = new Set();
let touchMove = { x: 0, y: 0 };
let touchLookId = null;
let touchLookLast = { x: 0, y: 0 };
let stickId = null;
let stickCenter = { x: 0, y: 0 };

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'Escape') {
    if (game.mode === 'playing') setPaused(true);
    else if (game.mode === 'paused') setPaused(false);
  }
  if (e.code === 'KeyR' && game.mode === 'playing') startReload();
  if (e.code === 'Space' && game.mode === 'playing') tryJump();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  if (isTouch) return;
  if (game.mode !== 'playing') return;
  if (!document.pointerLockElement) {
    canvas.requestPointerLock?.();
    return;
  }
  if (e.button === 0) shootOrThrow();
  if (e.button === 2) beginGrab();
});
window.addEventListener('mouseup', (e) => {
  if (isTouch) return;
  if (e.button === 2 && game.holding) throwHeld(20);
});
window.addEventListener('mousemove', (e) => {
  if (game.mode !== 'playing' || isTouch) return;
  if (!document.pointerLockElement) return;
  const sens = 0.00215;
  player.yaw -= e.movementX * sens;
  player.pitch -= e.movementY * sens;
  player.pitch = clamp(player.pitch, -1.35, 1.32);
  game.lookDx += e.movementX;
  game.lookDy += e.movementY;
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    game.hasLocked = true;
    ui.lockPrompt.classList.add('hidden');
  } else if (game.mode === 'playing' && !isTouch && game.hasLocked) {
    setPaused(true);
  }
});

// ---------------------------------------------------------------- touch
if (isTouch) {
  document.body.classList.add('touch-device');
  const stick = $('stick-base');
  const knob = $('stick-knob');
  stick.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    stickId = e.pointerId;
    const rect = stick.getBoundingClientRect();
    stickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    try { stick.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    moveStick(e.clientX, e.clientY);
  });
  const moveStick = (x, y) => {
    let dx = x - stickCenter.x;
    let dy = y - stickCenter.y;
    const max = 38;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    touchMove.x = dx / max;
    touchMove.y = dy / max;
  };
  stick.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    moveStick(e.clientX, e.clientY);
  });
  const endStick = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    touchMove.x = 0;
    touchMove.y = 0;
    knob.style.transform = 'translate(0,0)';
  };
  stick.addEventListener('pointerup', endStick);
  stick.addEventListener('pointercancel', endStick);

  canvas.addEventListener('pointerdown', (e) => {
    if (game.mode !== 'playing') return;
    if (touchLookId !== null) return;
    touchLookId = e.pointerId;
    touchLookLast = { x: e.clientX, y: e.clientY };
    try { canvas.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== touchLookId || game.mode !== 'playing') return;
    const dx = e.clientX - touchLookLast.x;
    const dy = e.clientY - touchLookLast.y;
    touchLookLast = { x: e.clientX, y: e.clientY };
    player.yaw -= dx * 0.0042;
    player.pitch = clamp(player.pitch - dy * 0.0042, -1.3, 1.25);
  });
  const endLook = (e) => {
    if (e.pointerId === touchLookId) touchLookId = null;
  };
  canvas.addEventListener('pointerup', endLook);
  canvas.addEventListener('pointercancel', endLook);

  const bind = (id, down, up) => {
    const el = $(id);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { el.setPointerCapture?.(e.pointerId); } catch { /* synthetic or stale pointer */ }
      down();
    });
    if (up) el.addEventListener('pointerup', (e) => { e.preventDefault(); up(); });
  };
  bind('btn-fire', () => { if (game.mode === 'playing') shootOrThrow(); });
  bind('btn-glove', () => {
    if (game.mode !== 'playing') return;
    if (game.holding) throwHeld(22);
    else beginGrab();
  });
  bind('btn-reload', () => { if (game.mode === 'playing') startReload(); });
  bind('btn-jump', () => { if (game.mode === 'playing') tryJump(); });
}

// ---------------------------------------------------------------- start / pause / end
function startGame() {
  if (game.mode !== 'menu') return;
  audio.init();
  audio.ui();
  audio.duck(0.24);
  game.mode = 'playing';
  game.phase = 'pre';
  game.waveTimer = 1.7;
  game.wave = 0;
  game.score = 0;
  game.kills = 0;
  game.shots = 0;
  game.hits = 0;
  game.health = 100;
  game.ammo = game.mag;
  game.reloading = false;
  game.spawnQueue = [];
  player.pos.set(0, 0, 20);
  player.vel.set(0, 0, 0);
  player.yaw = 0;
  player.pitch = -0.02;
  player.bob = 0;
  game.best = loadBest();
  viewModels.visible = true;
  ui.menu.classList.add('hidden');
  ui.end.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  ui.lockPrompt.classList.add('hidden');
  if (isTouch) {
    ui.touch.classList.remove('hidden');
    if (window.innerHeight > window.innerWidth) $('rotate-note').classList.remove('hidden');
  } else {
    canvas.requestPointerLock?.();
  }
  applyCamera(0);
  refreshHUD();
  toast('SECTOR 9 // LOCKDOWN ACTIVE', 2400);
}

function setPaused(paused) {
  if (paused && game.mode === 'playing') {
    game.mode = 'paused';
    ui.pause.classList.remove('hidden');
    ui.lockPrompt.classList.add('hidden');
    audio.duck(0.05);
    audio.gloveHum(false);
    document.exitPointerLock?.();
  } else if (!paused && game.mode === 'paused') {
    game.mode = 'playing';
    ui.pause.classList.add('hidden');
    audio.duck(0.24);
    audio.ui();
    if (!isTouch) canvas.requestPointerLock?.();
  }
}

function endGame(win) {
  if (game.mode === 'dead' || game.mode === 'won') return;
  game.mode = win ? 'won' : 'dead';
  if (game.holding) {
    game.holding.held = false;
    game.holding.velocity.set(0, 0, 0);
    game.holding = null;
  }
  beam.visible = false;
  holdGlow.visible = false;
  audio.gloveHum(false);
  audio.duck(0.08);
  ui.touch.classList.add('hidden');
  ui.lockPrompt.classList.add('hidden');
  document.exitPointerLock?.();
  saveBest();
  if (win) {
    audio.victory();
    ui.endEyebrow.textContent = 'SECTOR 9 CLEARED // EXTRACTION CONFIRMED';
    ui.endTitle.textContent = 'EXTRACTION COMPLETE';
    ui.endTitle.className = 'compact-title win';
    ui.endCopy.textContent = 'Eight waves down. The resistance owes you one. Now get off the roof.';
  } else {
    audio.gameover();
    ui.endEyebrow.textContent = 'EXTRACTION WINDOW CLOSED';
    ui.endTitle.textContent = 'SIGNAL LOST';
    ui.endTitle.className = 'compact-title lose';
    ui.endCopy.textContent = 'The Combine found you first. The resistance will remember.';
  }
  ui.endWave.textContent = String(Math.max(1, game.wave)).padStart(2, '0');
  ui.endKills.textContent = String(game.kills);
  ui.endAccuracy.textContent = `${game.shots > 0 ? Math.round((game.hits / game.shots) * 100) : 0}%`;
  ui.endScore.textContent = String(game.score).padStart(6, '0');
  ui.endBest.textContent = `PERSONAL BEST ${String(game.best).padStart(6, '0')}`;
  ui.end.classList.remove('hidden');
}

$('start-btn').addEventListener('click', startGame);
$('resume-btn').addEventListener('click', () => setPaused(false));
$('restart-btn').addEventListener('click', () => { audio.ui(); location.reload(); });
$('restart-pause-btn').addEventListener('click', () => { audio.ui(); location.reload(); });

// ---------------------------------------------------------------- player systems
function applyCamera(dt) {
  if (dt > 0) {
    game.shake = Math.max(0, game.shake - dt * 2.8);
    game.recoil *= Math.exp(-10 * dt);
    game.recoilYaw *= Math.exp(-8 * dt);
  }
  const speed = Math.hypot(player.vel.x, player.vel.z);
  if (player.onGround) {
    player.bobPhase += dt * speed * 1.65;
    player.bob = Math.sin(player.bobPhase * 2) * 0.026 * Math.min(1, speed / 4);
  }
  const shake = game.shake * game.shake;
  const sx = (Math.random() - 0.5) * shake * 0.22;
  const sy = (Math.random() - 0.5) * shake * 0.22;
  const sz = (Math.random() - 0.5) * shake * 0.12;
  camera.position.set(player.pos.x + sx, player.pos.y + player.eye + player.bob + sy, player.pos.z + sz);
  const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const targetRoll = -strafe * 0.012;
  player.roll = lerp(player.roll, targetRoll, 1 - Math.exp(-8 * dt));
  camera.rotation.set(
    player.pitch + game.recoil + sy * 0.15,
    player.yaw + game.recoilYaw + sx * 0.15,
    player.roll + (Math.random() - 0.5) * shake * 0.03
  );
  camera.updateMatrixWorld(true);
}

function tryJump() {
  if (player.onGround) {
    player.vel.y = 6.2;
    player.onGround = false;
  }
}

function resolveCollisions() {
  for (const c of world.colliders) {
    if (c.type === 'circle') {
      const dx = player.pos.x - c.x;
      const dz = player.pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + player.radius;
      if (d < min && d > 0.0001) {
        player.pos.x = c.x + (dx / d) * min;
        player.pos.z = c.z + (dz / d) * min;
      }
    } else {
      const cos = Math.cos(c.rot);
      const sin = Math.sin(c.rot);
      const dx = player.pos.x - c.x;
      const dz = player.pos.z - c.z;
      const lx = dx * cos + dz * sin;
      const lz = -dx * sin + dz * cos;
      const hx = c.halfW + player.radius;
      const hz = c.halfD + player.radius;
      if (Math.abs(lx) < hx && Math.abs(lz) < hz) {
        const ox = hx - Math.abs(lx);
        const oz = hz - Math.abs(lz);
        let nlx = lx;
        let nlz = lz;
        if (ox < oz) nlx = Math.sign(lx || 1) * hx;
        else nlz = Math.sign(lz || 1) * hz;
        player.pos.x = c.x + nlx * cos - nlz * sin;
        player.pos.z = c.z + nlx * sin + nlz * cos;
      }
    }
  }
  player.pos.x = clamp(player.pos.x, -29.2, 29.2);
  player.pos.z = clamp(player.pos.z, -29.2, 29.2);
}

function updatePlayer(dt) {
  const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  let mx = strafe;
  let mz = -forward;
  if (isTouch) {
    mx += touchMove.x;
    mz += touchMove.y;
    if (Math.hypot(mx, mz) > 1) {
      const l = Math.hypot(mx, mz);
      mx /= l; mz /= l;
    }
  }
  const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const speed = sprint ? 7.4 : 5.1;
  const cos = Math.cos(player.yaw);
  const sin = Math.sin(player.yaw);
  // forward is -Z, right is +X
  const desiredX = (mx * cos + mz * sin) * speed;
  const desiredZ = (-mx * sin + mz * cos) * speed;
  const accel = player.onGround ? 12 : 3;
  player.vel.x = lerp(player.vel.x, desiredX, 1 - Math.exp(-accel * dt));
  player.vel.z = lerp(player.vel.z, desiredZ, 1 - Math.exp(-accel * dt));
  player.vel.y -= 18 * dt;
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  player.pos.y += player.vel.y * dt;
  if (player.pos.y <= 0) {
    player.pos.y = 0;
    player.vel.y = 0;
    player.onGround = true;
  }
  resolveCollisions();

  // nudge props out of the way
  for (const prop of props) {
    if (prop.held) continue;
    const dx = prop.group.position.x - player.pos.x;
    const dz = prop.group.position.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    const min = prop.radius + player.radius;
    if (d < min && d > 0.001) {
      const push = (min - d) * 0.7;
      prop.group.position.x += (dx / d) * push;
      prop.group.position.z += (dz / d) * push;
      if (Math.hypot(player.vel.x, player.vel.z) > 1) {
        prop.velocity.x += (dx / d) * 1.2;
        prop.velocity.z += (dz / d) * 1.2;
      }
    }
  }
}

// ---------------------------------------------------------------- weapons
const raycaster = new THREE.Raycaster();
raycaster.camera = camera;
const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _vec = new THREE.Vector3();

function startReload() {
  if (game.reloading || game.ammo >= game.mag || game.mode !== 'playing') return;
  game.reloading = true;
  game.reloadTimer = 1.05;
  audio.reload();
  refreshHUD();
}

function shootOrThrow() {
  if (game.mode !== 'playing') return;
  if (game.holding) { throwHeld(30); return; }
  if (game.reloading || game.fireCd > 0) return;
  if (game.ammo <= 0) {
    game.fireCd = 0.3;
    audio.dry();
    startReload();
    return;
  }
  game.ammo--;
  game.fireCd = 0.145;
  game.shots++;
  game.recoil += 0.018;
  game.recoilYaw += (Math.random() - 0.5) * 0.012;
  game.shake = Math.min(1, game.shake + 0.16);
  audio.shoot();

  gun.userData.flash.visible = true;
  gun.userData.flash.material.rotation = Math.random() * Math.PI;
  gun.userData.flash.scale.setScalar(0.22 + Math.random() * 0.14);
  game.flashTimer = 0.045;

  camera.getWorldPosition(_origin);
  camera.getWorldDirection(_dir);
  _dir.x += (Math.random() - 0.5) * 0.01;
  _dir.y += (Math.random() - 0.5) * 0.01;
  _dir.normalize();
  raycaster.set(_origin, _dir);
  raycaster.far = 90;
  const targets = [...enemyGroups, ...propGroups, ...world.occluders];
  const hits = raycaster.intersectObjects(targets, true).filter((h) => h.distance > 0.15);

  gun.userData.muzzle.getWorldPosition(_muzzle);
  const end = hits.length ? hits[0].point : _origin.clone().addScaledVector(_dir, 70);
  addTracer(_muzzle, end, 0xaee9ff, 0.06);

  if (hits.length) {
    const hit = hits[0];
    let node = hit.object;
    let drone = null;
    let prop = null;
    while (node) {
      if (node.userData.enemy) { drone = node.userData.enemy; break; }
      if (node.userData.prop) { prop = node.userData.prop; break; }
      node = node.parent;
    }
    if (drone && !drone.dead) {
      game.hits++;
      const killed = drone.hit(30, hit.point);
      showHitmarker(killed);
      audio.hitmark();
      if (killed) killDrone(drone, hit.point);
    } else if (prop) {
      prop.velocity.addScaledVector(_dir, 2.2);
      prop.velocity.y += 0.8;
      prop.hitCooldown = 0.05;
      particles.spawn(hit.point, 0xffc27a, { count: 5, speed: 2.5, life: 0.35, size: 0.07, gravity: 3, spread: 0.1 });
      audio.impact(0.35);
    } else {
      particles.spawn(hit.point, 0xffd2a0, { count: 6, speed: 3.4, life: 0.4, size: 0.07, gravity: 5, spread: 0.08 });
      particles.spawn(hit.point, 0x7d858c, { count: 3, speed: 1.4, life: 0.7, size: 0.1, gravity: -0.5, spread: 0.1 });
      audio.impact(0.25);
    }
  }
  refreshHUD();
}

function findGrabTarget() {
  camera.getWorldPosition(_origin);
  camera.getWorldDirection(_dir);
  raycaster.set(_origin, _dir);
  raycaster.far = 23;
  const hits = raycaster.intersectObjects([...propGroups, ...world.occluders], true);
  if (hits.length) {
    let node = hits[0].object;
    while (node) {
      if (node.userData.prop) return node.userData.prop;
      if (world.occluders.includes(node)) return null;
      node = node.parent;
    }
  }
  // forgiving aim assist
  let best = null;
  let bestScore = Infinity;
  for (const prop of props) {
    if (prop.held) continue;
    _vec.copy(prop.group.position).sub(_origin);
    const dist = _vec.length();
    if (dist > 22) continue;
    _vec.normalize();
    const angle = _vec.angleTo(_dir);
    if (angle < 0.17) {
      const score = angle * 18 + dist * 0.015;
      if (score < bestScore) { bestScore = score; best = prop; }
    }
  }
  return best;
}

function beginGrab() {
  if (game.mode !== 'playing' || game.holding) return;
  const target = findGrabTarget();
  if (!target) { audio.dry(); return; }
  game.holding = target;
  target.held = true;
  target.heldTime = 0;
  target.velocity.set(0, 0, 0);
  target.angular.set(0, 0, 0);
  audio.grab();
  audio.gloveHum(true);
  beam.visible = true;
  holdGlow.visible = true;
  particles.spawn(target.group.position, 0xffb060, { count: 12, speed: 2.5, life: 0.45, size: 0.1, gravity: -1, spread: 0.5 });
  refreshHUD();
}

function throwHeld(power = 24) {
  const prop = game.holding;
  if (!prop) return;
  game.holding = null;
  prop.held = false;
  camera.getWorldDirection(_dir);
  prop.velocity.copy(_dir).multiplyScalar(power);
  prop.velocity.y += 1.2;
  prop.angular.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9);
  prop.hitCooldown = 0.2;
  beam.visible = false;
  holdGlow.visible = false;
  audio.gloveHum(false);
  audio.throwSound();
  particles.spawn(prop.group.position, 0xffc27a, { count: 9, speed: 3, life: 0.35, size: 0.09, gravity: 0, spread: 0.35 });
  refreshHUD();
}

function dropHeld() {
  const prop = game.holding;
  if (!prop) return;
  game.holding = null;
  prop.held = false;
  prop.velocity.set(0, 0, 0);
  beam.visible = false;
  holdGlow.visible = false;
  audio.gloveHum(false);
  refreshHUD();
}

function updateGrab(dt) {
  if (!game.holding) { beam.visible = false; holdGlow.visible = false; return; }
  const prop = game.holding;
  prop.heldTime = (prop.heldTime || 0) + dt;
  camera.getWorldPosition(_origin);
  camera.getWorldDirection(_dir);
  const right = _vec.set(_dir.z, 0, -_dir.x).normalize();
  const target = new THREE.Vector3()
    .copy(_origin)
    .addScaledVector(_dir, 3.15)
    .addScaledVector(right, 0.45);
  target.y -= 0.28;
  prop.group.position.lerp(target, 1 - Math.exp(-14 * dt));
  prop.group.rotation.y += dt * 0.9;
  holdGlow.position.copy(prop.group.position);
  prop.group.getWorldPosition(_vec);
  const glovePos = glove.localToWorld(new THREE.Vector3(0.02, 0, -0.16));
  const pos = beamGeo.attributes.position;
  pos.setXYZ(0, glovePos.x, glovePos.y, glovePos.z);
  pos.setXYZ(1, _vec.x, _vec.y, _vec.z);
  pos.needsUpdate = true;
  beam.visible = true;
  holdGlow.visible = true;
}

function updateWeapons(dt) {
  if (game.fireCd > 0) game.fireCd -= dt;
  if (game.flashTimer > 0) {
    game.flashTimer -= dt;
    if (game.flashTimer <= 0) gun.userData.flash.visible = false;
  }
  if (game.reloading) {
    game.reloadTimer -= dt;
    if (game.reloadTimer <= 0) {
      game.reloading = false;
      game.ammo = game.mag;
      refreshHUD();
    }
  }

  game.lookDx *= Math.exp(-9 * dt);
  game.lookDy *= Math.exp(-9 * dt);

  const reloadProgress = game.reloading ? 1 - game.reloadTimer / 1.05 : 0;
  const reloadArc = Math.sin(reloadProgress * Math.PI);
  const bobX = Math.sin(player.bobPhase) * 0.008;
  const bobY = Math.abs(Math.cos(player.bobPhase)) * 0.006;
  const holding = Boolean(game.holding);
  gun.visible = !holding;
  glove.visible = holding;
  gun.position.set(
    0.30 + bobX - game.lookDx * 0.0005,
    -0.19 - bobY + reloadArc * -0.11 + game.recoil * -0.3,
    -0.62 + reloadArc * 0.04 + game.recoil * 1.4
  );
  gun.rotation.set(
    -0.06 + reloadArc * -0.55 + game.recoil * 2.4,
    0.26 + game.lookDx * 0.0007,
    0.02 - reloadArc * 0.3
  );
  glove.position.set(
    -0.26 + bobX * 0.6,
    -0.27 - bobY * 0.5 + (holding ? 0.09 : 0),
    -0.45 + (holding ? -0.02 : 0)
  );
  glove.rotation.set(
    0.25 + (holding ? -0.18 : 0),
    0.15 + (holding ? -0.1 : 0),
    0.1
  );

  // hover detection (throttled)
  game.hoverTimer = (game.hoverTimer || 0) - dt;
  if (game.hoverTimer <= 0 && game.mode === 'playing') {
    game.hoverTimer = 0.09;
    if (game.holding) {
      game.hoverProp = null;
    } else {
      game.hoverProp = findGrabTarget();
    }
    camera.getWorldDirection(_dir);
    camera.getWorldPosition(_origin);
    raycaster.set(_origin, _dir);
    raycaster.far = 40;
    const enemyHits = raycaster.intersectObjects(enemyGroups, true);
    game.hoverEnemy = enemyHits.length > 0;
    refreshHUD();
  }
}

// ---------------------------------------------------------------- prop physics
function updateProps(dt) {
  for (const prop of props) {
    prop.hitCooldown = Math.max(0, prop.hitCooldown - dt);
    if (prop.held) continue;
    const prevX = prop.group.position.x;
    const prevY = prop.group.position.y;
    const prevZ = prop.group.position.z;
    prop.velocity.y -= 19 * dt;
    prop.group.position.addScaledVector(prop.velocity, dt);
    if (prop.group.position.y - prop.halfHeight <= 0.005) {
      prop.group.position.y = prop.halfHeight;
      if (prop.velocity.y < 0) prop.velocity.y *= -0.28;
      if (Math.abs(prop.velocity.y) < 0.7) prop.velocity.y = 0;
      prop.velocity.x *= Math.pow(0.1, dt * 3);
      prop.velocity.z *= Math.pow(0.1, dt * 3);
      prop.angular.multiplyScalar(Math.exp(-2.4 * dt));
    }
    if (Math.abs(prop.group.position.x) > 32) {
      prop.group.position.x = Math.sign(prop.group.position.x) * 32;
      prop.velocity.x *= -0.35;
    }
    if (Math.abs(prop.group.position.z) > 32) {
      prop.group.position.z = Math.sign(prop.group.position.z) * 32;
      prop.velocity.z *= -0.35;
    }

    // bounce off static cover
    if (prop.group.position.y < 3.1) {
      for (const c of world.colliders) {
        if (c.type === 'circle') {
          const dx = prop.group.position.x - c.x;
          const dz = prop.group.position.z - c.z;
          const d = Math.hypot(dx, dz);
          const min = c.r + prop.radius;
          if (d < min && d > 0.0001) {
            const nx = dx / d;
            const nz = dz / d;
            prop.group.position.x = c.x + nx * min;
            prop.group.position.z = c.z + nz * min;
            const dot = prop.velocity.x * nx + prop.velocity.z * nz;
            if (dot < 0) {
              prop.velocity.x -= 1.55 * dot * nx;
              prop.velocity.z -= 1.55 * dot * nz;
              prop.velocity.multiplyScalar(0.62);
            }
          }
        } else {
          const cos = Math.cos(c.rot);
          const sin = Math.sin(c.rot);
          const dx = prop.group.position.x - c.x;
          const dz = prop.group.position.z - c.z;
          const lx = dx * cos + dz * sin;
          const lz = -dx * sin + dz * cos;
          const hx = c.halfW + prop.radius;
          const hz = c.halfD + prop.radius;
          if (Math.abs(lx) < hx && Math.abs(lz) < hz) {
            const ox = hx - Math.abs(lx);
            const oz = hz - Math.abs(lz);
            let nlx = 0;
            let nlz = 0;
            let nlxPos = lx;
            let nlzPos = lz;
            if (ox < oz) { nlx = Math.sign(lx || 1); nlxPos = nlx * hx; }
            else { nlz = Math.sign(lz || 1); nlzPos = nlz * hz; }
            prop.group.position.x = c.x + nlxPos * cos - nlzPos * sin;
            prop.group.position.z = c.z + nlxPos * sin + nlzPos * cos;
            const nx = nlx * cos - nlz * sin;
            const nz = nlx * sin + nlz * cos;
            const dot = prop.velocity.x * nx + prop.velocity.z * nz;
            if (dot < 0) {
              prop.velocity.x -= 1.55 * dot * nx;
              prop.velocity.z -= 1.55 * dot * nz;
              prop.velocity.multiplyScalar(0.62);
            }
          }
        }
      }
    }

    prop.group.rotation.x += prop.angular.x * dt;
    prop.group.rotation.y += prop.angular.y * dt;
    prop.group.rotation.z += prop.angular.z * dt;
    if (prop.group.position.y <= prop.halfHeight + 0.02) {
      prop.group.rotation.x *= Math.exp(-1.2 * dt);
      prop.group.rotation.z *= Math.exp(-1.2 * dt);
      // settle upright slowly
      prop.group.rotation.x = lerp(prop.group.rotation.x, 0, 1 - Math.exp(-1.5 * dt));
      prop.group.rotation.z = lerp(prop.group.rotation.z, 0, 1 - Math.exp(-1.5 * dt));
    }

    const speed = prop.velocity.length();
    if (speed > 6 && prop.hitCooldown <= 0) {
      const segX = prop.group.position.x - prevX;
      const segY = prop.group.position.y - prevY;
      const segZ = prop.group.position.z - prevZ;
      const segLenSq = segX * segX + segY * segY + segZ * segZ;
      for (const drone of enemies) {
        if (drone.dead) continue;
        let t = 0;
        if (segLenSq > 0.00001) {
          t = ((drone.group.position.x - prevX) * segX
            + (drone.group.position.y - prevY) * segY
            + (drone.group.position.z - prevZ) * segZ) / segLenSq;
          t = clamp(t, 0, 1);
        }
        const cx = prevX + segX * t;
        const cy = prevY + segY * t;
        const cz = prevZ + segZ * t;
        const dx = drone.group.position.x - cx;
        const dy = drone.group.position.y - cy;
        const dz = drone.group.position.z - cz;
        const d = Math.hypot(dx, dy, dz);
        if (d < drone.radius + prop.radius + 0.15) {
          const dmg = Math.min(150, Math.max(18, speed * 2.4 * prop.mass));
          const killed = drone.hit(dmg, drone.group.position);
          showHitmarker(killed);
          audio.impact(Math.min(1, speed / 20));
          particles.spawn(drone.group.position, 0xffb066, { count: 14, speed: 4.5, life: 0.5, size: 0.12, gravity: 2, spread: 0.45 });
          prop.velocity.multiplyScalar(0.32);
          prop.angular.set((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7);
          prop.hitCooldown = 0.35;
          game.shake = Math.min(1, game.shake + 0.2);
          if (killed) killDrone(drone, drone.group.position);
          break;
        }
      }
    }
  }
}

// ---------------------------------------------------------------- enemies
const enemySpawnPoints = [];
for (let i = 0; i < 16; i++) {
  const a = (i / 16) * Math.PI * 2;
  enemySpawnPoints.push(new THREE.Vector3(Math.cos(a) * 26, 2.2, Math.sin(a) * 26));
}

function spawnDrone(type = 'drone') {
  let point = enemySpawnPoints[Math.floor(Math.random() * enemySpawnPoints.length)].clone();
  // keep spawn away from the player
  for (let attempt = 0; attempt < 5; attempt++) {
    if (point.distanceTo(player.pos) > 13) break;
    point = enemySpawnPoints[Math.floor(Math.random() * enemySpawnPoints.length)].clone();
  }
  point.x += (Math.random() - 0.5) * 4;
  point.z += (Math.random() - 0.5) * 4;
  const heavy = type === 'heavy';
  const drone = new Drone(point, game.wave, heavy);
  enemies.push(drone);
  enemyGroups.push(drone.group);
  addRing(point, heavy ? 0xff5030 : 0xff9d2e, 0.8, 0.7);
  particles.spawn(point, heavy ? 0xff5030 : 0xffa040, { count: 18, speed: 3.5, life: 0.7, size: 0.16, gravity: -1, spread: 0.9 });
  audio.spawn();
  refreshHUD();
}

function killDrone(drone, point) {
  if (drone.dead) return;
  drone.dead = true;
  const index = enemies.indexOf(drone);
  if (index >= 0) enemies.splice(index, 1);
  const gi = enemyGroups.indexOf(drone.group);
  if (gi >= 0) enemyGroups.splice(gi, 1);
  const pos = point ? point.clone() : drone.group.position.clone();
  scene.remove(drone.group);
  if (game.holding === drone) game.holding = null;

  const heavy = drone.heavy;
  particles.spawn(pos, 0xffa040, {
    count: heavy ? 70 : 34, speed: heavy ? 10 : 6.5, life: 1.15, size: heavy ? 0.4 : 0.26, gravity: 3.2, spread: 0.7,
  });
  particles.spawn(pos, 0xfff0c0, { count: heavy ? 22 : 10, speed: 7, life: 0.55, size: 0.18, gravity: 0, spread: 0.4 });
  particles.spawn(pos, 0x3a4148, { count: heavy ? 24 : 12, speed: 2.2, life: 1.5, size: 0.55, gravity: -1.2, spread: 0.9 });
  addRing(new THREE.Vector3(pos.x, 0.08, pos.z), 0xff6a30, heavy ? 1.5 : 1, 0.65);
  flashLight(pos, heavy ? 300 : 170);
  game.shake = Math.min(1, game.shake + (heavy ? 0.5 : 0.25));
  audio.explode();
  game.kills++;
  game.score += heavy ? 250 : 100;
  if (Math.random() < (heavy ? 0.75 : 0.34)) spawnMedkit(pos);
  refreshHUD();
  if (heavy) toast('HEAVY UNIT DOWN // +250', 1800);
}

function updateEnemies(dt, time) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const drone = enemies[i];
    if (drone.dead) continue;
    const shouldFire = drone.update(dt, time, enemies);
    if (shouldFire) {
      const origin = drone.eyeWorld.clone();
      const dir = camera.position.clone().sub(origin).normalize();
      dir.x += (Math.random() - 0.5) * 0.055;
      dir.y += (Math.random() - 0.5) * 0.04;
      dir.z += (Math.random() - 0.5) * 0.055;
      dir.normalize();
      const speed = 13 + game.wave * 0.9;
      spawnProjectile(origin, dir.multiplyScalar(speed), drone.heavy ? 14 : 8 + game.wave * 0.4);
      particles.spawn(origin, 0xff9a40, { count: 5, speed: 1.8, life: 0.25, size: 0.08, gravity: 0, spread: 0.12 });
      audio.impact(0.3);
    }
  }
  // soft player collision push
  for (const prop of props) {
    if (prop.held) continue;
    for (const drone of enemies) {
      const dx = prop.group.position.x - drone.group.position.x;
      const dz = prop.group.position.z - drone.group.position.z;
      const d = Math.hypot(dx, dz);
      if (d < prop.radius + drone.radius && prop.group.position.y < drone.group.position.y + 0.8) {
        const push = (prop.radius + drone.radius - d) * 1.5;
        prop.group.position.x += (dx / (d || 1)) * push;
        prop.group.position.z += (dz / (d || 1)) * push;
      }
    }
  }
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    const prevX = p.group.position.x;
    const prevY = p.group.position.y;
    const prevZ = p.group.position.z;
    p.group.position.addScaledVector(p.velocity, dt);
    p.trail -= dt;
    if (p.trail <= 0) {
      p.trail = 0.045;
      particles.spawn(p.group.position, 0xff7a28, { count: 1, speed: 0.4, life: 0.25, size: 0.12, gravity: 0, spread: 0.04 });
    }
    let remove = false;
    const segX = p.group.position.x - prevX;
    const segY = p.group.position.y - prevY;
    const segZ = p.group.position.z - prevZ;
    const segLenSq = segX * segX + segY * segY + segZ * segZ;
    let t = 0;
    if (segLenSq > 0.00001) {
      t = ((camera.position.x - prevX) * segX + (camera.position.y - prevY) * segY + (camera.position.z - prevZ) * segZ) / segLenSq;
      t = clamp(t, 0, 1);
    }
    const cx = prevX + segX * t;
    const cy = prevY + segY * t;
    const cz = prevZ + segZ * t;
    const playerDist = Math.hypot(camera.position.x - cx, camera.position.y - cy, camera.position.z - cz);
    if (playerDist < 0.72) {
      damagePlayer(p.damage);
      particles.spawn(new THREE.Vector3(cx, cy, cz), 0xff6030, { count: 12, speed: 4, life: 0.4, size: 0.12, gravity: 2, spread: 0.2 });
      remove = true;
    } else if (p.group.position.y < 0.16 || Math.abs(p.group.position.x) > 40 || Math.abs(p.group.position.z) > 40 || p.life <= 0) {
      particles.spawn(p.group.position, 0xff8a40, { count: 6, speed: 2, life: 0.35, size: 0.09, gravity: 2, spread: 0.1 });
      remove = true;
    }
    if (remove) {
      scene.remove(p.group);
      projectiles.splice(i, 1);
    }
  }
}

function updatePickups(dt, time) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pickup = pickups[i];
    pickup.life -= dt;
    pickup.phase += dt;
    pickup.group.rotation.y += dt * 1.4;
    pickup.group.position.y = 0.48 + Math.sin(pickup.phase * 2.1) * 0.08;
    pickup.glow.material.opacity = 0.3 + Math.sin(pickup.phase * 3) * 0.1;
    let remove = pickup.life <= 0;
    if (!remove && pickup.group.position.distanceTo(camera.position) < 1.75) {
      const before = game.health;
      game.health = Math.min(game.maxHealth, game.health + 20);
      if (game.health > before) {
        audio.pickup();
        toast('VITALS RESTORED // +20', 1500);
        particles.spawn(camera.position.clone().add(new THREE.Vector3(0, -0.7, 0)), 0x6ef2a8, { count: 16, speed: 2.4, life: 0.6, size: 0.1, gravity: -1, spread: 0.5 });
      } else {
        game.score += 25;
        audio.ui();
      }
      remove = true;
    }
    if (remove) {
      scene.remove(pickup.group);
      pickups.splice(i, 1);
    }
  }
}

function damagePlayer(amount) {
  if (game.mode !== 'playing') return;
  game.health = Math.max(0, game.health - amount);
  game.shake = Math.min(1, game.shake + 0.55);
  damageFlash();
  audio.hurt();
  refreshHUD();
  if (game.health <= 0) {
    setTimeout(() => endGame(false), 350);
    game.mode = 'dying';
    for (let i = 0; i < 18; i++) {
      particles.spawn(camera.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.6)), 0xff4030, { count: 4, speed: 2, life: 0.8, size: 0.12, gravity: 2, spread: 0.2 });
    }
    audio.duck(0.04);
  }
}

// ---------------------------------------------------------------- waves
function startWave() {
  game.wave++;
  if (game.wave > 8) {
    game.mode = 'won';
    return;
  }
  game.phase = 'active';
  const count = 5 + game.wave * 2;
  game.spawnQueue = [];
  for (let i = 0; i < count; i++) {
    game.spawnQueue.push(game.wave >= 4 && i === 0 ? 'heavy' : 'drone');
  }
  game.spawnTimer = 0.65;
  toast(`WAVE ${String(game.wave).padStart(2, '0')} // HOSTILES INBOUND`, 2600);
  audio.waveAlarm();
  refreshHUD();
}

function updateWaves(dt) {
  if (game.phase === 'pre') {
    game.waveTimer -= dt;
    if (game.waveTimer <= 0) startWave();
    return;
  }
  if (game.phase === 'active') {
    game.spawnTimer -= dt;
    if (game.spawnQueue.length > 0 && game.spawnTimer <= 0 && enemies.length < 9) {
      spawnDrone(game.spawnQueue.shift());
      game.spawnTimer = Math.max(0.45, 0.95 - game.wave * 0.05);
    }
    if (game.spawnQueue.length === 0 && enemies.length === 0) {
      game.score += 150 + game.wave * 75;
      refreshHUD();
      if (game.wave >= 8) {
        game.phase = 'complete';
        game.winTimer = 2.2;
        toast('EXTRACTION WINDOW OPEN // HOLD', 2800);
        audio.waveAlarm();
      } else {
        game.phase = 'intermission';
        game.waveTimer = 6;
        const med = new THREE.Vector3(0, 0.5, 0);
        spawnMedkit(med);
        toast(`WAVE ${String(game.wave).padStart(2, '0')} CLEARED // NEXT IN 6`, 2600);
        audio.pickup();
      }
    }
  } else if (game.phase === 'intermission') {
    game.waveTimer -= dt;
    if (game.waveTimer <= 0) startWave();
  } else if (game.phase === 'complete') {
    game.winTimer -= dt;
    if (game.winTimer <= 0 && game.mode === 'playing') endGame(true);
  }
}

// ---------------------------------------------------------------- menu camera / loop
let menuTime = 0;
function updateMenuCamera(dt) {
  menuTime += dt;
  const a = 0.8 + menuTime * 0.035;
  const radius = 27;
  camera.position.set(Math.cos(a) * radius, 6.2 + Math.sin(menuTime * 0.15) * 0.5, Math.sin(a) * radius);
  camera.lookAt(0, 3.4, -6);
  camera.updateMatrixWorld(true);
}

function updateAmbient(dt, time) {
  particles.update(dt, time);
  dust.update(time, dt);
  rain.update(dt, time);
  updateEffects(dt);
  if (world.beams) {
    world.beams[0].rotation.y += dt * 0.08;
    world.beams[1].rotation.y -= dt * 0.06;
  }
  if (world.emblem) world.emblem.material.opacity = 0.58 + Math.sin(time * 1.4) * 0.08;
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  const time = clock.elapsedTime;

  if (game.mode === 'menu') {
    updateMenuCamera(dt);
    updateProps(dt);
  } else if (game.mode === 'playing') {
    updatePlayer(dt);
    applyCamera(dt);
    updateWeapons(dt);
    updateGrab(dt);
    updateProps(dt);
    updateEnemies(dt, time);
    updateProjectiles(dt);
    updatePickups(dt, time);
    updateWaves(dt);
    refreshHUD();
  } else if (game.mode === 'dying') {
    updateProjectiles(dt);
    applyCamera(dt);
  } else {
    applyCamera(dt);
  }

  updateAmbient(dt, time);
  if (composer) composer.render();
  else renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) {
    composer.setPixelRatio(pixelRatio);
    composer.setSize(window.innerWidth, window.innerHeight);
  }
  if (isTouch) $('rotate-note').classList.toggle('hidden', window.innerHeight <= window.innerWidth || game.mode !== 'playing');
});

// kick off
refreshHUD();
ui.touch.classList.add('hidden');

requestAnimationFrame(() => {
  setTimeout(() => ui.boot.classList.add('done'), 500);
});

window.__gravity = {
  THREE,
  game,
  player,
  enemies,
  props,
  spawnDrone,
  startWave,
  startGame,
  endGame,
  setPaused,
  damagePlayer,
  shootOrThrow,
  beginGrab,
  throwHeld,
  startReload,
  findGrabTarget,
  camera,
  scene,
  renderer,
  gun,
  glove,
  composer,
  gtaoPass,
  bloomPass,
  audio,
  isTouch,
};

frame();

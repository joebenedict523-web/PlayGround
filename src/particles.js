import * as THREE from 'three';

const MAX = 1600;

export class Particles {
  constructor(scene) {
    this.positions = new Float32Array(MAX * 3);
    this.colors = new Float32Array(MAX * 3);
    this.sizes = new Float32Array(MAX);
    this.alphas = new Float32Array(MAX);
    this.velocities = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.gravity = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.cursor = 0;

    for (let i = 0; i < MAX; i++) {
      this.positions[i * 3 + 1] = -999;
      this.sizes[i] = 0;
      this.alphas[i] = 0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float size;
        attribute float alpha;
        attribute vec3 color;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = color;
          vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (340.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv);
          if (d > 0.5) discard;
          float soft = smoothstep(0.5, 0.02, d);
          gl_FragColor = vec4(vColor, vAlpha * soft);
        }
      `,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geometry = geometry;
  }

  spawn(position, color, options = {}) {
    const {
      count = 10,
      speed = 4,
      spread = 0.4,
      life = 0.7,
      size = 0.16,
      gravity = 5,
      drag = 1.6,
      up = 0.5,
      directional = null,
    } = options;
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      const i3 = i * 3;
      this.positions[i3] = position.x + (Math.random() - 0.5) * spread;
      this.positions[i3 + 1] = position.y + (Math.random() - 0.5) * spread * 0.7;
      this.positions[i3 + 2] = position.z + (Math.random() - 0.5) * spread;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const s = speed * (0.25 + Math.random() * 0.75);
      let vx = Math.sin(phi) * Math.cos(theta) * s;
      let vy = Math.cos(phi) * s + up * speed * 0.4;
      let vz = Math.sin(phi) * Math.sin(theta) * s;
      if (directional) {
        vx += directional.x * speed;
        vy += directional.y * speed;
        vz += directional.z * speed;
      }
      this.velocities[i3] = vx;
      this.velocities[i3 + 1] = vy;
      this.velocities[i3 + 2] = vz;
      const tint = 0.65 + Math.random() * 0.35;
      this.colors[i3] = c.r * tint;
      this.colors[i3 + 1] = c.g * tint;
      this.colors[i3 + 2] = c.b * tint;
      this.life[i] = life * (0.55 + Math.random() * 0.7);
      this.maxLife[i] = this.life[i];
      this.sizes[i] = size * (0.5 + Math.random() * 0.9);
      this.alphas[i] = 1;
      this.gravity[i] = gravity;
      this.drag[i] = drag;
    }
  }

  update(dt, time) {
    const pos = this.positions;
    const vel = this.velocities;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.life[i] <= 0) {
        this.alphas[i] = 0;
        pos[i3 + 1] = -999;
        continue;
      }
      const drag = Math.max(0, 1 - this.drag[i] * dt);
      vel[i3] *= drag;
      vel[i3 + 1] *= drag;
      vel[i3 + 2] *= drag;
      vel[i3 + 1] -= this.gravity[i] * dt;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      if (pos[i3 + 1] < 0.04) {
        pos[i3 + 1] = 0.04;
        vel[i3 + 1] *= -0.28;
        vel[i3] *= 0.7;
        vel[i3 + 2] *= 0.7;
      }
      const t = this.life[i] / this.maxLife[i];
      this.alphas[i] = Math.min(1, t * 2.2);
      this.sizes[i] *= Math.max(0.985, 1 - dt * 0.18);
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
  }
}

export function createRain(scene, count = 1400) {
  const positions = new Float32Array(count * 6);
  const drops = new Float32Array(count * 4); // x, z, y, speed
  for (let i = 0; i < count; i++) {
    const i4 = i * 4;
    drops[i4] = (Math.random() - 0.5) * 76;
    drops[i4 + 1] = (Math.random() - 0.5) * 76;
    drops[i4 + 2] = Math.random() * 24;
    drops[i4 + 3] = 11 + Math.random() * 9;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0xa8c8e4,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  scene.add(lines);

  return {
    lines,
    update(dt, time) {
      const pos = geometry.attributes.position.array;
      const wind = 1.6 + Math.sin(time * 0.21) * 0.8;
      for (let i = 0; i < count; i++) {
        const i4 = i * 4;
        const i6 = i * 6;
        drops[i4 + 2] -= drops[i4 + 3] * dt;
        drops[i4] += wind * dt;
        if (drops[i4 + 2] < 0) {
          drops[i4 + 2] = 18 + Math.random() * 8;
          drops[i4] = (Math.random() - 0.5) * 76;
          drops[i4 + 1] = (Math.random() - 0.5) * 76;
        }
        if (drops[i4] > 38) drops[i4] = -38;
        const len = 0.32 + drops[i4 + 3] * 0.018;
        pos[i6] = drops[i4];
        pos[i6 + 1] = drops[i4 + 2];
        pos[i6 + 2] = drops[i4 + 1];
        pos[i6 + 3] = drops[i4] - wind * 0.018;
        pos[i6 + 4] = drops[i4 + 2] - len;
        pos[i6 + 5] = drops[i4 + 1];
      }
      geometry.attributes.position.needsUpdate = true;
    },
  };
}

export function createDust(scene) {
  const count = 320;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 74;
    positions[i * 3 + 1] = Math.random() * 22;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 74;
    seeds[i * 3] = Math.random() * Math.PI * 2;
    seeds[i * 3 + 1] = 0.3 + Math.random() * 0.8;
    seeds[i * 3 + 2] = 0.2 + Math.random() * 0.5;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const sprite = document.createElement('canvas');
  sprite.width = 32; sprite.height = 32;
  const ctx = sprite.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const texture = new THREE.CanvasTexture(sprite);

  const material = new THREE.PointsMaterial({
    map: texture,
    color: 0x9ab6cc,
    size: 0.17,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  return {
    points,
    update(time, dt) {
      const arr = geometry.attributes.position.array;
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        arr[i3] += Math.sin(time * 0.18 + seeds[i3]) * seeds[i3 + 2] * dt;
        arr[i3 + 1] += Math.cos(time * 0.23 + seeds[i3 + 1] * 6) * 0.08 * dt;
        arr[i3 + 2] += Math.cos(time * 0.15 + seeds[i3]) * seeds[i3 + 2] * dt;
        if (arr[i3 + 1] > 23) arr[i3 + 1] = 0.2;
        if (arr[i3 + 1] < 0.1) arr[i3 + 1] = 23;
        if (arr[i3] > 38) arr[i3] = -38;
        if (arr[i3] < -38) arr[i3] = 38;
        if (arr[i3 + 2] > 38) arr[i3 + 2] = -38;
        if (arr[i3 + 2] < -38) arr[i3 + 2] = 38;
      }
      geometry.attributes.position.needsUpdate = true;
    },
  };
}

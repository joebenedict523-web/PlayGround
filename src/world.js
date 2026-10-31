import * as THREE from 'three';
import {
  asphaltTextures,
  barrelTextures,
  concreteTextures,
  containerTextures,
  crateTextures,
  windowTextures,
} from './materials.js';

export const ARENA = 30;
const BOUNDS = 33;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(width, height, draw, { srgb = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function signTexture(text, sub, accent = '#ff9d2e') {
  return canvasTexture(512, 160, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(5,8,11,0.82)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = accent;
    ctx.fillRect(8, 8, 8, h - 16);
    ctx.font = 'bold 62px "Arial Narrow", Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#edf2f5';
    ctx.fillText(text, 34, h * 0.46);
    ctx.font = '18px monospace';
    ctx.fillStyle = accent;
    ctx.fillText(sub, 36, h * 0.76);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  });
}

function emblemTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2);
    ctx.strokeStyle = 'rgba(255,157,46,0.6)';
    for (const [r, lw] of [[212, 4], [196, 1.5], [152, 1]]) {
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.lineWidth = 3;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const len = i % 4 === 0 ? 18 : 8;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 222, Math.sin(a) * 222);
      ctx.lineTo(Math.cos(a) * (222 + len), Math.sin(a) * (222 + len));
      ctx.stroke();
    }
    // lambda
    ctx.strokeStyle = 'rgba(255,157,46,0.8)';
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-44, -76);
    ctx.lineTo(10, 76);
    ctx.moveTo(6, 20);
    ctx.lineTo(62, -76);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,157,46,0.62)';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SECTOR 9', 0, 146);
    ctx.font = '16px monospace';
    ctx.fillText('CIVIL PROTECTION / 04', 0, 178);
  });
}

function cloneRepeat(texture, x, y) {
  const clone = texture.clone();
  clone.needsUpdate = true;
  clone.wrapS = clone.wrapT = THREE.RepeatWrapping;
  clone.repeat.set(x, y);
  return clone;
}

function facadeMaterial(tex, repeatX, repeatY) {
  return new THREE.MeshStandardMaterial({
    map: cloneRepeat(tex.map, repeatX, repeatY),
    emissiveMap: cloneRepeat(tex.emissive, repeatX, repeatY),
    roughnessMap: cloneRepeat(tex.roughness, repeatX, repeatY),
    emissive: 0xffffff,
    emissiveIntensity: 0.38,
    roughness: 0.92,
    metalness: 0.12,
    envMapIntensity: 0.35,
  });
}

function makeBuilding(scene, occluders, rand, angle, radius, index) {
  const width = 8 + rand() * 16;
  const depth = 8 + rand() * 12;
  const height = 11 + rand() * 30;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  const tex = windowTextures(100 + index);
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x171c22, roughness: 0.96, metalness: 0.08,
  });
  // One texture tile spans roughly 10 m, so window size stays believable on every face.
  const matX = facadeMaterial(tex, Math.max(0.6, depth / 10), Math.max(0.35, height / 58));
  const matZ = facadeMaterial(tex, Math.max(0.6, width / 10), Math.max(0.35, height / 58));
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    [matX, matX, roofMat, roofMat, matZ, matZ]
  );
  mesh.position.set(x, height / 2, z);
  mesh.rotation.y = -angle + (rand() - 0.5) * 0.4;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  occluders.push(mesh);

  // roof cap, parapet and rooftop clutter
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.6, 0.5, depth + 0.6),
    roofMat
  );
  roof.position.set(x, height + 0.25, z);
  roof.rotation.y = mesh.rotation.y;
  roof.castShadow = true;
  roof.receiveShadow = true;
  scene.add(roof);
  occluders.push(roof);

  const detailMat = new THREE.MeshStandardMaterial({
    color: 0x222a32, roughness: 0.68, metalness: 0.45, envMapIntensity: 0.5,
  });
  const local = (dx, dz, y) => {
    const cos = Math.cos(mesh.rotation.y);
    const sin = Math.sin(mesh.rotation.y);
    return new THREE.Vector3(x + dx * cos - dz * sin, y, z + dx * sin + dz * cos);
  };
  for (let i = 0; i < 3; i++) {
    const w = 1 + rand() * 2.4;
    const d = 1 + rand() * 2.2;
    const h = 0.5 + rand() * 1.2;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), detailMat);
    const pos = local((rand() - 0.5) * width * 0.62, (rand() - 0.5) * depth * 0.62, height + 0.5 + h / 2);
    box.position.copy(pos);
    box.rotation.y = mesh.rotation.y;
    box.castShadow = true;
    box.receiveShadow = true;
    scene.add(box);
  }

  if (rand() > 0.45) {
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.14, 5 + rand() * 7, 5),
      detailMat
    );
    mast.position.set(x + (rand() - 0.5) * width * 0.3, height + 3, z + (rand() - 0.5) * depth * 0.3);
    mast.castShadow = true;
    scene.add(mast);
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff4530, toneMapped: false })
    );
    beacon.position.copy(mast.position).add(new THREE.Vector3(0, 3.6, 0));
    scene.add(beacon);
  }
}

export function createWorld(scene) {
  const occluders = [];
  const colliders = [];
  const rand = mulberry32(4117);

  scene.fog = new THREE.FogExp2(0x0a1018, 0.0068);
  scene.background = new THREE.Color(0x05080d);

  // ---------------- sky ----------------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(230, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x03050a) },
        bottom: { value: new THREE.Color(0x16202c) },
        glow: { value: new THREE.Color(0x5d2c12) },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 top;
        uniform vec3 bottom;
        uniform vec3 glow;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, -1.0, 1.0);
          vec3 col = mix(bottom, top, smoothstep(-0.05, 0.72, h));
          float horizon = exp(-abs(h) * 5.5);
          col += glow * horizon * 0.55;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  );
  scene.add(sky);

  const starGeo = new THREE.BufferGeometry();
  const starCount = 650;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(0.08 + rand() * 0.9);
    const r = 215;
    starPos[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
    starPos[i * 3 + 1] = Math.cos(phi) * r;
    starPos[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0x9fc4e8, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.65, depthWrite: false,
  })));

  const moon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasTexture(128, 128, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,244,224,1)');
      g.addColorStop(0.23, 'rgba(232,235,226,0.85)');
      g.addColorStop(0.34, 'rgba(160,190,220,0.22)');
      g.addColorStop(1, 'rgba(100,140,190,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.9,
  }));
  moon.position.set(-85, 105, -120);
  moon.scale.set(26, 26, 1);
  scene.add(moon);

  // ---------------- ground ----------------
  const asphalt = asphaltTextures(34);
  const groundMat = new THREE.MeshStandardMaterial({
    map: asphalt.map,
    normalMap: asphalt.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: asphalt.roughnessMap,
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0.28,
    envMapIntensity: 0.7,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  occluders.push(ground);

  // irregular wet patches; low roughness picks up the city environment
  const puddleAlpha = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 7; i++) {
      const x = w * (0.3 + rand() * 0.4);
      const y = h * (0.3 + rand() * 0.4);
      const rx = 40 + rand() * 60;
      const ry = 22 + rand() * 45;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { srgb: false });
  const puddleMat = new THREE.MeshStandardMaterial({
    color: 0x1a232d,
    roughness: 0.24,
    metalness: 0.5,
    transparent: true,
    opacity: 0.2,
    alphaMap: puddleAlpha,
    envMapIntensity: 1.35,
    depthWrite: false,
  });
  for (let i = 0; i < 12; i++) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(1.6 + rand() * 3.8, 20), puddleMat);
    p.rotation.x = -Math.PI / 2;
    p.scale.y = 0.5 + rand() * 0.5;
    p.rotation.z = rand() * Math.PI;
    p.position.set((rand() - 0.5) * 50, 0.014 + i * 0.0004, (rand() - 0.5) * 50);
    scene.add(p);
  }

  // centre emblem, painted and faintly lit rather than a flat additive decal
  const emblemTex = emblemTexture();
  const emblem = new THREE.Mesh(
    new THREE.PlaneGeometry(19, 19),
    new THREE.MeshStandardMaterial({
      map: emblemTex,
      emissive: 0xff7a24,
      emissiveMap: emblemTex,
      emissiveIntensity: 0.3,
      roughness: 0.45,
      metalness: 0.25,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    })
  );
  emblem.rotation.x = -Math.PI / 2;
  emblem.rotation.z = Math.PI;
  emblem.position.set(0, 0.025, -2);
  scene.add(emblem);

  // ---------------- buildings ----------------
  const buildingCount = 26;
  for (let i = 0; i < buildingCount; i++) {
    const angle = (i / buildingCount) * Math.PI * 2 + (rand() - 0.5) * 0.13;
    const radius = 42 + rand() * 26;
    makeBuilding(scene, occluders, rand, angle, radius, i);
  }

  // deeper skyline for parallax and silhouettes between the near rooftops
  const farTex = windowTextures(900);
  const farFacades = [0, 1, 2].map(() => {
    const mat = facadeMaterial(farTex, 2.4, 2.8);
    mat.emissiveIntensity = 0.12;
    mat.envMapIntensity = 0.2;
    return mat;
  });
  for (let i = 0; i < 44; i++) {
    const angle = (i / 44) * Math.PI * 2 + (rand() - 0.5) * 0.22;
    const radius = 78 + rand() * 52;
    const w = 9 + rand() * 22;
    const d = 9 + rand() * 22;
    const h = 18 + rand() * 62;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      farFacades[i % farFacades.length]
    );
    mesh.position.set(Math.cos(angle) * radius, h / 2, Math.sin(angle) * radius);
    mesh.rotation.y = -angle + (rand() - 0.5) * 0.5;
    scene.add(mesh);
  }

  // citadel
  const citadel = new THREE.Group();
  citadel.position.set(0, 0, -96);
  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x0d141c,
    roughness: 0.38,
    metalness: 0.94,
    emissive: 0x0b1724,
    emissiveIntensity: 0.5,
    envMapIntensity: 1.25,
  });
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffb066, toneMapped: false });
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(8, 28, 110, 10, 1), darkMetal);
  shell.position.y = 55;
  citadel.add(shell);
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 8, 34, 8, 1), darkMetal);
  upper.position.y = 127;
  citadel.add(upper);
  const spike = new THREE.Mesh(new THREE.ConeGeometry(2.6, 18, 8), darkMetal);
  spike.position.y = 153;
  citadel.add(spike);

  const bandMats = [
    new THREE.MeshBasicMaterial({ color: 0xff7b28, transparent: true, opacity: 0.62, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }),
    new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.4, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }),
  ];
  for (let i = 0; i < 8; i++) {
    const y = 12 + i * 14;
    const t = y / 110;
    const radius = 28 + (8 - 28) * t;
    const band = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.03, 0.22 + rand() * 0.14, 4, 40), bandMats[i % 2]);
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    citadel.add(band);
  }

  // vertical ribs and lit windows on the facing side
  const ribMat = new THREE.MeshBasicMaterial({
    color: 0xff8a32, transparent: true, opacity: 0.55, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  for (const [x, y, h] of [[-13, 50, 78], [-6.5, 58, 96], [0, 62, 104], [6.5, 58, 96], [13, 50, 78]]) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.38, h, 0.3), ribMat);
    const midR = 28 + (8 - 28) * (y / 110);
    rib.position.set(x, y, Math.sqrt(Math.max(1, midR * midR - x * x)) + 0.3);
    citadel.add(rib);
  }
  const winGeo = new THREE.BoxGeometry(0.42, 0.3, 0.12);
  const winMats = [
    new THREE.MeshBasicMaterial({ color: 0xffa04a, toneMapped: false }),
    new THREE.MeshBasicMaterial({ color: 0x8fd8ff, toneMapped: false }),
  ];
  for (let i = 0; i < 46; i++) {
    if (rand() > 0.62) continue;
    const y = 8 + rand() * 98;
    const r = 28 + (8 - 28) * (y / 110);
    const x = (rand() * 2 - 1) * r * 0.88;
    const z = Math.sqrt(Math.max(1, r * r - x * x));
    const win = new THREE.Mesh(winGeo, winMats[rand() > 0.35 ? 0 : 1]);
    win.position.set(x, y, z + 0.1);
    citadel.add(win);
  }

  const citadelHaze = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasTexture(128, 256, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h * 0.55, 4, w / 2, h * 0.55, w / 2);
      g.addColorStop(0, 'rgba(255,125,50,0.16)');
      g.addColorStop(0.5, 'rgba(255,90,30,0.06)');
      g.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6,
  }));
  citadelHaze.position.set(0, 55, 10);
  citadelHaze.scale.set(46, 110, 1);
  citadel.add(citadelHaze);

  const coreY = 58;
  const coreR = 28 + (8 - 28) * (coreY / 110);
  const core = new THREE.Mesh(new THREE.SphereGeometry(2.1, 16, 12), coreMat);
  core.position.set(0, coreY, coreR + 0.6);
  citadel.add(core);
  for (let i = 0; i < 3; i++) {
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(3.1 + i * 1.1, 0.06, 4, 40),
      new THREE.MeshBasicMaterial({
        color: i === 1 ? 0x9fd8ff : 0xff8a32, transparent: true, opacity: 0.55, toneMapped: false,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    halo.position.copy(core.position);
    halo.rotation.z = i * 0.6;
    citadel.add(halo);
  }
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasTexture(128, 128, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,190,120,0.95)');
      g.addColorStop(0.25, 'rgba(255,120,40,0.5)');
      g.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  coreGlow.position.copy(core.position);
  coreGlow.scale.set(8, 8, 1);
  citadel.add(coreGlow);
  scene.add(citadel);

  // cables between rooftops
  const cableMat = new THREE.LineBasicMaterial({ color: 0x1e2730, transparent: true, opacity: 0.65 });
  for (let i = 0; i < 4; i++) {
    const a = rand() * Math.PI * 2;
    const b = a + 0.6 + rand() * 0.8;
    const ra = 42 + rand() * 8;
    const rb = 46 + rand() * 10;
    const points = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      const ang = a + (b - a) * t;
      const radius = ra + (rb - ra) * t;
      points.push(new THREE.Vector3(
        Math.cos(ang) * radius,
        24 + Math.sin(t * Math.PI) * -4 + rand() * 1.5,
        Math.sin(ang) * radius
      ));
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), cableMat));
  }

  // ---------------- arena barriers ----------------
  const concrete = concreteTextures(77, '#3b4249', 3);
  const barrierMat = new THREE.MeshStandardMaterial({
    map: concrete.map,
    normalMap: concrete.normalMap,
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughnessMap: concrete.roughnessMap,
    roughness: 0.9,
    metalness: 0.08,
    envMapIntensity: 0.45,
  });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xff9128, toneMapped: false });
  const hazardTex = canvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#1a1d21';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ff9d2e';
    for (let x = -h; x < w + h; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + 18, h);
      ctx.lineTo(x + 18 + h, 0);
      ctx.lineTo(x + h, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, w, 10);
  });
  hazardTex.wrapS = THREE.RepeatWrapping;
  hazardTex.repeat.set(2, 1);
  const hazardMat = new THREE.MeshStandardMaterial({
    map: hazardTex,
    emissive: 0xff9d2e,
    emissiveMap: hazardTex,
    emissiveIntensity: 0.18,
    roughness: 0.72,
    metalness: 0.2,
  });
  for (let side = 0; side < 4; side++) {
    for (let i = -2; i <= 2; i++) {
      if (i === 0) continue;
      const along = i * 12;
      const group = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(9, 0.95, 0.8), barrierMat);
      base.position.y = 0.48;
      base.castShadow = true;
      base.receiveShadow = true;
      group.add(base);
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(9, 0.18), hazardMat);
      stripe.position.set(0, 0.72, 0.41);
      group.add(stripe);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.1), lampMat);
      lamp.position.set(-3.6, 0.72, 0.44);
      group.add(lamp);
      const lamp2 = lamp.clone();
      lamp2.position.x = 3.6;
      group.add(lamp2);
      if (side === 0) { group.position.set(along, 0, -BOUNDS); }
      if (side === 1) { group.position.set(along, 0, BOUNDS); group.rotation.y = Math.PI; }
      if (side === 2) { group.position.set(-BOUNDS, 0, along); group.rotation.y = Math.PI / 2; }
      if (side === 3) { group.position.set(BOUNDS, 0, along); group.rotation.y = -Math.PI / 2; }
      scene.add(group);
      base.userData.static = true;
      occluders.push(base);
    }
  }

  // ---------------- containers ----------------
  function addContainer(x, z, rot, base, w = 7, h = 2.9, d = 2.8, seed = 9) {
    const group = new THREE.Group();
    const tex = containerTextures(base, seed);
    const mat = new THREE.MeshStandardMaterial({
      map: tex.map,
      normalMap: tex.normalMap,
      normalScale: new THREE.Vector2(1.1, 0.5),
      roughnessMap: tex.roughnessMap,
      roughness: 0.58,
      metalness: 0.62,
      envMapIntensity: 0.9,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x232b32, roughness: 0.5, metalness: 0.7, envMapIntensity: 0.8,
    });
    const doorA = new THREE.Mesh(new THREE.BoxGeometry(w * 0.42, h * 0.84, 0.12), doorMat);
    doorA.position.set(-w * 0.23, h / 2, d / 2 + 0.03);
    doorA.castShadow = true;
    group.add(doorA);
    const doorB = doorA.clone();
    doorB.position.x = w * 0.23;
    group.add(doorB);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, h * 0.7, 0.08), doorMat);
    bar.position.set(0, h / 2, d / 2 + 0.12);
    group.add(bar);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.06), lampMat);
    lamp.position.set(w * 0.4, h - 0.25, d / 2 + 0.1);
    group.add(lamp);
    group.position.set(x, 0, z);
    group.rotation.y = rot;
    scene.add(group);
    occluders.push(body);
    colliders.push({ type: 'box', x, z, halfW: w / 2 + 0.15, halfD: d / 2 + 0.15, rot });
    return group;
  }
  addContainer(-17, -13, 0.32, '#39495a', 7.4, 2.9, 2.8, 91);
  addContainer(16.5, 10.5, -0.42, '#5a3c2c', 6.6, 2.7, 2.8, 137);
  addContainer(22, -22, 0.9, '#2e4a42', 7.2, 2.9, 2.8, 203);

  // ---------------- pillars / generator ----------------
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x171e26, roughness: 0.42, metalness: 0.78, envMapIntensity: 0.9,
  });
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xff9d2e, toneMapped: false });
  const cyanStrip = new THREE.MeshBasicMaterial({ color: 0x54c8f0, toneMapped: false });
  function addPillar(x, z, h = 7.5, cyan = false) {
    const group = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.66, h, 8), pillarMat);
    shaft.position.y = h / 2;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    group.add(shaft);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.6, 0.28, 8), pillarMat);
    cap.position.y = h;
    cap.castShadow = true;
    group.add(cap);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.11, h * 0.62, 0.11), cyan ? cyanStrip : stripMat);
    strip.position.set(0, h * 0.42, 0.86);
    group.add(strip);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.035, 4, 20), cyan ? cyanStrip : stripMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.1;
    group.add(ring);
    group.position.set(x, 0, z);
    group.rotation.y = rand() * Math.PI;
    scene.add(group);
    occluders.push(shaft);
    colliders.push({ type: 'circle', x, z, r: 0.82 });
    return group;
  }
  addPillar(-12, 8.5, 8);
  addPillar(12.5, -8.5, 9, true);
  addPillar(-4, -20, 7);
  addPillar(21, 20, 8, true);

  // generator block
  const gen = new THREE.Group();
  const genMat = new THREE.MeshStandardMaterial({
    color: 0x2b333b, roughness: 0.55, metalness: 0.65, envMapIntensity: 0.8,
  });
  const genBody = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.5, 2.2), genMat);
  genBody.position.y = 0.75;
  genBody.castShadow = true;
  genBody.receiveShadow = true;
  gen.add(genBody);
  const vent = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.7, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x0b0f13, roughness: 0.9, metalness: 0.3 })
  );
  vent.position.set(0, 0.85, 1.13);
  gen.add(vent);
  const genLight = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.06), cyanStrip);
  genLight.position.set(0, 1.3, 1.14);
  gen.add(genLight);
  gen.position.set(-23, 0, -6);
  gen.rotation.y = 0.5;
  scene.add(gen);
  occluders.push(genBody);
  colliders.push({ type: 'box', x: -23, z: -6, halfW: 1.85, halfD: 1.3, rot: 0.5 });

  // ---------------- rooftop machinery ----------------
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x2c353e, roughness: 0.48, metalness: 0.72, envMapIntensity: 0.9,
  });
  const grilleMat = new THREE.MeshStandardMaterial({
    color: 0x0d1115, roughness: 0.82, metalness: 0.3,
  });
  function addACUnit(x, z, rot, scale = 1) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2 * scale, 1.25 * scale, 1.5 * scale), metalMat);
    body.position.y = 0.625 * scale;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.7 * scale, 0.9 * scale, 0.06), grilleMat);
    grille.position.set(0, 0.62 * scale, 0.77 * scale);
    group.add(grille);
    for (let i = 0; i < 7; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(1.55 * scale, 0.045 * scale, 0.03), metalMat);
      slat.position.set(0, (0.3 + i * 0.1) * scale, 0.81 * scale);
      group.add(slat);
    }
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.42 * scale, 0.42 * scale, 0.08, 18), grilleMat);
    fan.rotation.x = Math.PI / 2;
    fan.position.set(0.62 * scale, 0.78 * scale, 0.79 * scale);
    group.add(fan);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * scale, 0.07 * scale, 2.4 * scale, 8), metalMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, 0.22 * scale, -0.88 * scale);
    group.add(pipe);
    group.position.set(x, 0, z);
    group.rotation.y = rot;
    scene.add(group);
    occluders.push(body);
    colliders.push({ type: 'box', x, z, halfW: 1.2 * scale, halfD: 0.85 * scale, rot });
  }
  addACUnit(-8.5, 15.5, 0.18, 1);
  addACUnit(9.5, -18.5, -0.35, 1.15);
  addACUnit(-23, 12.5, 0.9, 0.9);

  const ventMat = new THREE.MeshStandardMaterial({
    color: 0x252d35, roughness: 0.55, metalness: 0.68, envMapIntensity: 0.8,
  });
  for (const [x, z, h] of [[-27, -17, 2.2], [26, 2, 1.7], [-2, 27, 1.9], [14, 24, 2.4]]) {
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, h, 12), ventMat);
    stack.position.set(x, h / 2, z);
    stack.castShadow = true;
    stack.receiveShadow = true;
    scene.add(stack);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.28, 12), ventMat);
    cap.position.set(x, h + 0.12, z);
    cap.castShadow = true;
    scene.add(cap);
    colliders.push({ type: 'circle', x, z, r: 0.5 });
  }

  // ---------------- neon signs ----------------
  function addSign(text, sub, x, y, z, rotY, color) {
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 2.8),
      new THREE.MeshBasicMaterial({
        map: signTexture(text, sub, color), transparent: true, side: THREE.DoubleSide, toneMapped: false,
      })
    );
    sign.position.set(x, y, z);
    sign.rotation.y = rotY;
    scene.add(sign);
    return sign;
  }
  addSign('SECTOR 9', 'CIVIL PROTECTION // 04', -39, 13, 6, Math.PI / 2, '#ff9d2e');
  addSign('C17', 'RESISTANCE CELL // 17', 39, 16, -6, -Math.PI / 2, '#66d9ff');
  addSign('COMBINE', 'COMPLIANCE IS PEACE', 12, 18, -40, 0, '#ff5545');

  // ---------------- lighting ----------------
  scene.add(new THREE.AmbientLight(0x41566e, 1.5));
  scene.add(new THREE.HemisphereLight(0x6284a8, 0x0b0e12, 1.15));

  const moonLight = new THREE.DirectionalLight(0xb6d1f2, 3.2);
  moonLight.position.set(-34, 52, 22);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  moonLight.shadow.camera.left = -44;
  moonLight.shadow.camera.right = 44;
  moonLight.shadow.camera.top = 44;
  moonLight.shadow.camera.bottom = -44;
  moonLight.shadow.camera.near = 1;
  moonLight.shadow.camera.far = 140;
  moonLight.shadow.bias = -0.0004;
  moonLight.shadow.normalBias = 0.035;
  moonLight.shadow.radius = 3.5;
  scene.add(moonLight);
  scene.add(moonLight.target);

  // cool bounce fill keeps shadowed rooftops readable without erasing the night mood
  const bounce = new THREE.DirectionalLight(0x6f8fb0, 0.55);
  bounce.position.set(34, 26, 28);
  scene.add(bounce);

  const warm = new THREE.PointLight(0xff8a3c, 680, 52, 2);
  warm.position.set(-19, 5.5, 17);
  scene.add(warm);
  const cyan = new THREE.PointLight(0x49bff2, 420, 50, 2);
  cyan.position.set(20, 6, -17);
  scene.add(cyan);
  // central courtyard fill so cover and props stay readable away from the corner lamps
  const fill = new THREE.PointLight(0xa8c4dd, 420, 58, 2);
  fill.position.set(0, 13, 1);
  scene.add(fill);

  // focused pools under the two main rooftop lamps
  const warmSpot = new THREE.SpotLight(0xffa255, 480, 40, Math.PI / 5.2, 0.62, 1.8);
  warmSpot.position.set(-19, 7.5, 17);
  warmSpot.target.position.set(-9, 0, 7);
  scene.add(warmSpot, warmSpot.target);
  const coolSpot = new THREE.SpotLight(0x7fd0ff, 220, 38, Math.PI / 5.6, 0.68, 1.8);
  coolSpot.position.set(20, 8, -17);
  coolSpot.target.position.set(10, 0, -8);
  scene.add(coolSpot, coolSpot.target);

  // moving search beam cones
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x7fc9ff, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(2.6, 46, 12, 1, true), beamMat);
  beam.position.set(-24, 22, -26);
  beam.rotation.z = 0.32;
  beam.rotation.x = -0.18;
  scene.add(beam);
  const beam2 = new THREE.Mesh(new THREE.ConeGeometry(2.0, 38, 12, 1, true), beamMat);
  beam2.position.set(26, 19, 24);
  beam2.rotation.z = -0.3;
  beam2.rotation.x = 0.16;
  scene.add(beam2);

  // distant fog glow sprites
  const haze = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasTexture(128, 128, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,130,60,0.26)');
      g.addColorStop(1, 'rgba(255,100,30,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  // Keep the glow behind the skyline so it reads as distant city light rather than
  // a warm wash across the mid-ground facades.
  haze.position.set(0, 16, -124);
  haze.scale.set(150, 82, 1);
  haze.material.opacity = 0.42;
  scene.add(haze);

  return { occluders, colliders, beams: [beam, beam2], citadel, emblem };
}

export const PROP_SPAWNS = [
  { type: 'crate', x: 3.2, z: 9.4, rot: 0.2 },
  { type: 'barrel', x: 6.1, z: 7.2, rot: 0 },
  { type: 'crate', x: -4.2, z: 6.5, rot: -0.4 },
  { type: 'barrel', x: -8.5, z: 2.2, rot: 0 },
  { type: 'crate', x: 10.5, z: 1.5, rot: 0.8 },
  { type: 'crate', x: -9.6, z: -8.6, rot: 0.1 },
  { type: 'barrel', x: 7.2, z: -7.4, rot: 0 },
  { type: 'crate', x: -1.2, z: -13.2, rot: -0.6 },
  { type: 'crate', x: 14.4, z: 14.8, rot: 0.5 },
  { type: 'barrel', x: -16.6, z: 8.6, rot: 0 },
  { type: 'crate', x: 3.6, z: -18.4, rot: 0.3 },
  { type: 'barrel', x: -13.4, z: 14.6, rot: 0 },
  { type: 'crate', x: 19.8, z: -3.4, rot: -0.2 },
  { type: 'barrel', x: -6.4, z: 18.2, rot: 0 },
  { type: 'crate', x: 12.6, z: -15.6, rot: 0.9 },
  { type: 'barrel', x: 0.8, z: -4.6, rot: 0 },
  { type: 'crate', x: -19.8, z: 2.4, rot: 0.4 },
  { type: 'barrel', x: 24.2, z: 12.2, rot: 0 },
];

const crateTex = crateTextures(31);
const barrelTex = barrelTextures('#ff9d2e', 31);
const crateMaterial = new THREE.MeshStandardMaterial({
  map: crateTex.map,
  normalMap: crateTex.normalMap,
  normalScale: new THREE.Vector2(0.8, 0.8),
  roughnessMap: crateTex.roughnessMap,
  roughness: 0.86,
  metalness: 0.04,
  envMapIntensity: 0.45,
});
const barrelMaterial = new THREE.MeshStandardMaterial({
  map: barrelTex.map,
  normalMap: barrelTex.normalMap,
  normalScale: new THREE.Vector2(0.7, 0.7),
  roughnessMap: barrelTex.roughnessMap,
  roughness: 0.52,
  metalness: 0.58,
  envMapIntensity: 0.9,
});

export const PROP_MATERIALS = {
  crate: () => crateMaterial,
  barrel: () => barrelMaterial,
};

export function makeProp(type) {
  const group = new THREE.Group();
  let radius;
  let mass;
  if (type === 'crate') {
    const size = 0.95;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), PROP_MATERIALS.crate());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x191512, roughness: 0.8, metalness: 0.2,
    });
    for (const sx of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.09, size + 0.04, 0.09), frameMat);
      strip.position.set(sx * (size / 2 - 0.03), 0, size / 2 - 0.03);
      strip.castShadow = true;
      group.add(strip);
    }
    radius = 0.68;
    mass = 1;
    group.traverse((o) => { if (o.isMesh) o.userData.propGroup = group; });
    return { group, radius, mass, halfHeight: size / 2 };
  }
  const h = 1.08;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, h, 16), PROP_MATERIALS.barrel());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  const topMat = new THREE.MeshStandardMaterial({
    color: 0x2a333b, roughness: 0.48, metalness: 0.7, envMapIntensity: 0.9,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.035, 6, 20), topMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = h / 2 - 0.02;
  ring.castShadow = true;
  group.add(ring);
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.03, 12),
    new THREE.MeshBasicMaterial({ color: 0xff9d2e, toneMapped: false })
  );
  glow.position.y = h / 2 + 0.02;
  group.add(glow);
  radius = 0.5;
  mass = 0.82;
  group.traverse((o) => { if (o.isMesh) o.userData.propGroup = group; });
  return { group, radius, mass, halfHeight: h / 2 };
}

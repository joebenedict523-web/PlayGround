import * as THREE from 'three';

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

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function groundTexture() {
  const tex = canvasTexture(512, 512, (ctx, w, h) => {
    const rand = mulberry32(11);
    ctx.fillStyle = '#161b21';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 5200; i++) {
      const g = 18 + rand() * 32;
      ctx.fillStyle = `rgba(${g},${g + 2},${g + 5},${0.24 + rand() * 0.5})`;
      const s = rand() * 2.4 + 0.4;
      ctx.fillRect(rand() * w, rand() * h, s, s);
    }
    for (let i = 0; i < 26; i++) {
      ctx.strokeStyle = `rgba(8,10,13,${0.25 + rand() * 0.4})`;
      ctx.lineWidth = 1 + rand() * 2;
      ctx.beginPath();
      let x = rand() * w;
      let y = rand() * h;
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (rand() - 0.5) * 46;
        y += (rand() - 0.5) * 46;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(120,132,142,0.07)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.strokeRect(i * 128 + 2, 2, 124, 124);
    }
    ctx.fillStyle = 'rgba(10,13,17,0.5)';
    for (let i = 0; i < 18; i++) {
      ctx.beginPath();
      ctx.ellipse(rand() * w, rand() * h, 10 + rand() * 55, 6 + rand() * 28, rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  return tex;
}

function windowTextures(seed) {
  const width = 128;
  const height = 256;
  const rand = mulberry32(seed);
  const cols = 5 + Math.floor(rand() * 2);
  const rows = 10 + Math.floor(rand() * 4);
  const color = document.createElement('canvas');
  color.width = width; color.height = height;
  const c = color.getContext('2d');
  const emit = document.createElement('canvas');
  emit.width = width; emit.height = height;
  const e = emit.getContext('2d');
  c.fillStyle = '#151a20';
  c.fillRect(0, 0, width, height);
  e.fillStyle = '#000';
  e.fillRect(0, 0, width, height);
  for (let i = 0; i < 900; i++) {
    const g = 16 + rand() * 20;
    c.fillStyle = `rgba(${g},${g + 2},${g + 4},0.35)`;
    c.fillRect(rand() * width, rand() * height, 1 + rand() * 2, 1 + rand() * 8);
  }
  const padX = 10;
  const padY = 12;
  const cw = (width - padX * 2) / cols;
  const ch = (height - padY * 2) / rows;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = padX + col * cw + 3;
      const y = padY + row * ch + 4;
      const ww = cw - 6;
      const hh = ch - 8;
      const lit = rand() > 0.43;
      const warm = rand() > 0.42;
      const alpha = 0.35 + rand() * 0.65;
      c.fillStyle = lit
        ? warm ? `rgba(255, ${140 + rand() * 60}, 70, ${alpha})` : `rgba(90, 190, 235, ${alpha * 0.8})`
        : 'rgba(7, 10, 14, 0.92)';
      c.fillRect(x, y, ww, hh);
      c.fillStyle = 'rgba(2,3,5,0.55)';
      c.fillRect(x, y, ww, 1.5);
      if (lit) {
        e.fillStyle = warm ? `rgba(255, ${125 + rand() * 70}, 55, ${alpha})` : `rgba(70, 160, 220, ${alpha * 0.8})`;
        e.fillRect(x, y, ww, hh);
        if (rand() > 0.7) {
          e.fillStyle = 'rgba(0,0,0,0.7)';
          e.fillRect(x + ww * 0.4, y, ww * 0.13, hh);
        }
      }
    }
  }
  c.fillStyle = 'rgba(8,11,15,0.5)';
  for (let i = 0; i < 10; i++) {
    c.fillRect(0, rand() * height, width, 1 + rand() * 3);
  }
  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  const emissive = new THREE.CanvasTexture(emit);
  emissive.colorSpace = THREE.SRGBColorSpace;
  return { map, emissive };
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

function concreteTexture() {
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    const rand = mulberry32(77);
    ctx.fillStyle = '#2a3038';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      const g = 32 + rand() * 28;
      ctx.fillStyle = `rgba(${g},${g + 3},${g + 7},${0.3 + rand() * 0.4})`;
      ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 3, 1 + rand() * 3);
    }
    ctx.strokeStyle = 'rgba(18,21,26,0.7)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.moveTo(rand() * w, 0);
      ctx.lineTo(rand() * w, h);
      ctx.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function containerTexture(base) {
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x, 0, 3, h);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(x + 3, 0, 1, h);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, h - 22, w, 22);
    ctx.fillRect(0, 0, w, 14);
    ctx.fillStyle = 'rgba(255,157,46,0.65)';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('C17', 18, 44);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '12px monospace';
    ctx.fillText('SECTOR 9 / 04', 18, h - 34);
    const rand = mulberry32(9);
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = `rgba(20,14,8,${0.15 + rand() * 0.3})`;
      ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 14, 1 + rand() * 6);
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  return tex;
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

function crateTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const rand = mulberry32(31);
    ctx.fillStyle = '#3a3026';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 34) {
      ctx.fillStyle = `rgba(${52 + rand() * 18},${42 + rand() * 12},${30 + rand() * 10},1)`;
      ctx.fillRect(0, y + 2, w, 30);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, y, w, 3);
    }
    ctx.strokeStyle = '#171310';
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.strokeStyle = 'rgba(255,157,46,0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(26, 26, w - 52, h - 52);
    ctx.fillStyle = 'rgba(255,157,46,0.75)';
    ctx.font = 'bold 28px monospace';
    ctx.fillText('λ', 108, 118);
    ctx.font = '11px monospace';
    ctx.fillText('RESISTANCE', 92, 142);
    ctx.fillText('C17 // 09', 100, 158);
  });
}

function barrelTexture(accent) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#222a31';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 28) {
      ctx.fillStyle = 'rgba(0,0,0,0.24)';
      ctx.fillRect(0, y, w, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(0, y + 6, w, 2);
    }
    ctx.fillStyle = accent;
    ctx.fillRect(0, 92, w, 14);
    ctx.fillRect(0, 150, w, 6);
    ctx.fillStyle = 'rgba(8,10,13,0.82)';
    ctx.fillRect(0, 106, w, 44);
    ctx.fillStyle = accent;
    ctx.font = 'bold 22px monospace';
    ctx.fillText('λ', 18, 138);
    ctx.font = '14px monospace';
    ctx.fillText('FLAMMABLE', 52, 135);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.font = '10px monospace';
    ctx.fillText('C17 / 04', 92, 196);
  });
}

function makeBuilding(scene, occluders, rand, angle, radius, index) {
  const width = 8 + rand() * 16;
  const depth = 8 + rand() * 12;
  const height = 11 + rand() * 30;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  const tex = windowTextures(100 + index);
  const mat = new THREE.MeshLambertMaterial({
    map: tex.map,
    emissiveMap: tex.emissive,
    emissive: 0xffffff,
    emissiveIntensity: 0.75,
    color: 0x9aa3ab,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
  mesh.position.set(x, height / 2, z);
  mesh.rotation.y = -angle + (rand() - 0.5) * 0.4;
  scene.add(mesh);
  occluders.push(mesh);

  // roof cap and antenna
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.6, 0.5, depth + 0.6),
    new THREE.MeshLambertMaterial({ color: 0x11161c })
  );
  roof.position.set(x, height + 0.25, z);
  roof.rotation.y = mesh.rotation.y;
  scene.add(roof);
  occluders.push(roof);

  if (rand() > 0.45) {
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.14, 5 + rand() * 7, 5),
      new THREE.MeshLambertMaterial({ color: 0x222a32 })
    );
    mast.position.set(x + (rand() - 0.5) * width * 0.3, height + 3, z + (rand() - 0.5) * depth * 0.3);
    scene.add(mast);
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff4530 })
    );
    beacon.position.copy(mast.position).add(new THREE.Vector3(0, 3.6, 0));
    scene.add(beacon);
  }
}

export function createWorld(scene) {
  const occluders = [];
  const colliders = [];
  const rand = mulberry32(4117);

  scene.fog = new THREE.Fog(0x0a0f16, 32, 210);
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
  const groundMat = new THREE.MeshStandardMaterial({
    map: groundTexture(),
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0.18,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = false;
  scene.add(ground);
  occluders.push(ground);

  // wet patches
  const puddleMat = new THREE.MeshStandardMaterial({
    color: 0x05090e, roughness: 0.08, metalness: 0.95, transparent: true, opacity: 0.72,
  });
  for (let i = 0; i < 9; i++) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(1.4 + rand() * 3.6, 14), puddleMat);
    p.rotation.x = -Math.PI / 2;
    p.scale.y = 0.35 + rand() * 0.5;
    p.rotation.z = rand() * Math.PI;
    p.position.set((rand() - 0.5) * 48, 0.012 + i * 0.0004, (rand() - 0.5) * 48);
    scene.add(p);
  }

  // centre emblem
  const emblem = new THREE.Mesh(
    new THREE.PlaneGeometry(19, 19),
    new THREE.MeshBasicMaterial({
      map: emblemTexture(), transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending,
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

  // citadel
  const citadel = new THREE.Group();
  citadel.position.set(0, 0, -96);
  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x0d141c, roughness: 0.55, metalness: 0.8, emissive: 0x0e1c2a, emissiveIntensity: 0.85,
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
  const concrete = concreteTexture();
  concrete.repeat.set(3, 1);
  const barrierMat = new THREE.MeshLambertMaterial({ map: concrete, color: 0x9aa0a6 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xff9128 });
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
  const hazardMat = new THREE.MeshBasicMaterial({ map: hazardTex, color: 0xffb060 });
  for (let side = 0; side < 4; side++) {
    for (let i = -2; i <= 2; i++) {
      if (i === 0) continue;
      const along = i * 12;
      const group = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(9, 0.95, 0.8), barrierMat);
      base.position.y = 0.48;
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
  function addContainer(x, z, rot, base, w = 7, h = 2.9, d = 2.8) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ map: containerTexture(base), color: 0xbfc4c8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    body.position.y = h / 2;
    group.add(body);
    const doorMat = new THREE.MeshLambertMaterial({ color: 0x1a2026 });
    const doorA = new THREE.Mesh(new THREE.BoxGeometry(w * 0.42, h * 0.84, 0.12), doorMat);
    doorA.position.set(-w * 0.23, h / 2, d / 2 + 0.03);
    group.add(doorA);
    const doorB = doorA.clone();
    doorB.position.x = w * 0.23;
    group.add(doorB);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, h * 0.7, 0.08), new THREE.MeshLambertMaterial({ color: 0x3a434c }));
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
  addContainer(-17, -13, 0.32, '#39495a', 7.4);
  addContainer(16.5, 10.5, -0.42, '#5a3c2c', 6.6, 2.7);
  addContainer(22, -22, 0.9, '#2e4a42', 7.2, 2.9);

  // ---------------- pillars / generator ----------------
  const pillarMat = new THREE.MeshLambertMaterial({ color: 0x171e26 });
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xff9d2e });
  const cyanStrip = new THREE.MeshBasicMaterial({ color: 0x54c8f0 });
  function addPillar(x, z, h = 7.5, cyan = false) {
    const group = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.66, h, 8), pillarMat);
    shaft.position.y = h / 2;
    group.add(shaft);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.6, 0.28, 8), pillarMat);
    cap.position.y = h;
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
  const genBody = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 1.5, 2.2),
    new THREE.MeshLambertMaterial({ color: 0x262d34 })
  );
  genBody.position.y = 0.75;
  gen.add(genBody);
  const vent = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 0.08), new THREE.MeshLambertMaterial({ color: 0x0b0f13 }));
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
  scene.add(new THREE.AmbientLight(0x2b3947, 1.15));
  scene.add(new THREE.HemisphereLight(0x47627f, 0x0a0c10, 1.1));

  const moonLight = new THREE.DirectionalLight(0x9fc4ee, 1.05);
  moonLight.position.set(-28, 44, 18);
  scene.add(moonLight);

  const warm = new THREE.PointLight(0xff8a3c, 320, 48, 2);
  warm.position.set(-19, 5.5, 17);
  scene.add(warm);
  const cyan = new THREE.PointLight(0x49bff2, 260, 46, 2);
  cyan.position.set(20, 6, -17);
  scene.add(cyan);
  // central courtyard fill so cover and props stay readable away from the corner lamps
  const fill = new THREE.PointLight(0xa8c4dd, 165, 52, 2);
  fill.position.set(0, 13, 1);
  scene.add(fill);

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
  haze.position.set(0, 6, -55);
  haze.scale.set(80, 46, 1);
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

export const PROP_MATERIALS = {
  crate: () => new THREE.MeshLambertMaterial({ map: crateTexture() }),
  barrel: () => new THREE.MeshLambertMaterial({ map: barrelTexture('#ff9d2e') }),
};

export function makeProp(type) {
  const group = new THREE.Group();
  let radius;
  let mass;
  if (type === 'crate') {
    const size = 0.95;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), PROP_MATERIALS.crate());
    group.add(mesh);
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x191512 });
    for (const sx of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.09, size + 0.04, 0.09), frameMat);
      strip.position.set(sx * (size / 2 - 0.03), 0, size / 2 - 0.03);
      group.add(strip);
    }
    radius = 0.68;
    mass = 1;
    group.traverse((o) => { if (o.isMesh) o.userData.propGroup = group; });
    return { group, radius, mass, halfHeight: size / 2 };
  }
  const h = 1.08;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, h, 12), PROP_MATERIALS.barrel());
  group.add(mesh);
  const topMat = new THREE.MeshLambertMaterial({ color: 0x2a333b });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.035, 5, 16), topMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = h / 2 - 0.02;
  group.add(ring);
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 10), new THREE.MeshBasicMaterial({ color: 0xff9d2e }));
  glow.position.y = h / 2 + 0.02;
  group.add(glow);
  radius = 0.5;
  mass = 0.82;
  group.traverse((o) => { if (o.isMesh) o.userData.propGroup = group; });
  return { group, radius, mass, halfHeight: h / 2 };
}

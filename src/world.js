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
  texture.anisotropy = 8;
  return texture;
}

function drawCanvas(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  return canvas;
}

// Turn a greyscale height canvas into a tangent-space normal map. It is cheap to
// generate and makes flat procedural surfaces catch the moonlight properly.
function normalFromCanvas(source, strength = 2.2, repeat = 1) {
  const width = source.width;
  const height = source.height;
  const src = source.getContext('2d').getImageData(0, 0, width, height).data;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(width, height);
  const lum = (x, y) => {
    const ix = ((x + width) % width);
    const iy = ((y + height) % height);
    const i = (iy * width + ix) * 4;
    return (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (lum(x + 1, y) - lum(x - 1, y)) * strength;
      const dy = (lum(x, y + 1) - lum(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * width + x) * 4;
      out.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 8;
  return texture;
}

function makeNoiseGrid(size, seed) {
  const rand = mulberry32(seed);
  const values = new Float32Array(size * size);
  for (let i = 0; i < values.length; i++) values[i] = rand();
  return { size, values };
}

function sampleNoise(grid, u, v) {
  const s = grid.size;
  const x = u * s;
  const y = v * s;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const at = (ix, iy) => grid.values[((iy % s) + s) % s * s + ((ix % s) + s) % s];
  const a = at(x0, y0);
  const b = at(x0 + 1, y0);
  const c = at(x0, y0 + 1);
  const d = at(x0 + 1, y0 + 1);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}

function fbm(grid, u, v, octaves = 4) {
  let sum = 0;
  let amp = 0.55;
  let norm = 0;
  let scale = 1;
  for (let i = 0; i < octaves; i++) {
    sum += sampleNoise(grid, u * scale + i * 0.17, v * scale + i * 0.31) * amp;
    norm += amp;
    amp *= 0.5;
    scale *= 2.03;
  }
  return sum / norm;
}

function angleDelta(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Equirectangular night sky used both as the scene background and, through
// PMREM, as the reflection source for wet asphalt and brushed metal.
function skyTexture() {
  const width = 1024;
  const height = 512;
  const noise = makeNoiseGrid(96, 7719);
  const cloudNoise = makeNoiseGrid(64, 4127);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);

  const lobes = [
    { angle: 0.55, width: 0.55, power: 1.0, warm: [255, 116, 48] },
    { angle: 2.35, width: 0.7, power: 0.55, warm: [70, 138, 196] },
    { angle: 4.35, width: 0.62, power: 0.8, warm: [255, 138, 58] },
    { angle: 5.55, width: 0.5, power: 0.42, warm: [72, 132, 180] },
  ];

  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    const altitude = 1 - v * 2;
    const t = Math.max(0, altitude);

    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      const angle = u * Math.PI * 2;

      // zenith -> horizon gradient
      let r = 2 + t * 3;
      let g = 4 + t * 7;
      let b = 10 + t * 17;
      const low = Math.max(0, 1 - t * 3.2);
      r += low * 6;
      g += low * 10;
      b += low * 15;

      // sodium/cyan light pollution hugging the horizon
      const band = Math.exp(-Math.pow((v - 0.455) / 0.075, 2));
      for (const lobe of lobes) {
        const d = angleDelta(angle, lobe.angle);
        const glow = Math.exp(-Math.pow(d / lobe.width, 2)) * band * lobe.power;
        r += lobe.warm[0] * glow * 0.16;
        g += lobe.warm[1] * glow * 0.16;
        b += lobe.warm[2] * glow * 0.16;
      }

      // high cloud deck, lit from below by the city
      if (altitude > -0.02) {
        const nx = u * 5.5;
        const ny = v * 4.2;
        const baseCloud = fbm(cloudNoise, nx, ny, 5);
        const detail = fbm(noise, nx * 2.1, ny * 2.4, 3);
        let cloud = (baseCloud * 0.72 + detail * 0.28 - 0.5) * 3.4;
        cloud = Math.max(0, Math.min(1, cloud));
        cloud *= Math.max(0, Math.min(1, (altitude + 0.04) * 4.2));
        cloud *= Math.max(0, Math.min(1, (0.96 - t) * 5.0));
        if (cloud > 0.001) {
          const cityLight = Math.pow(band, 0.55) * 0.72 + 0.2;
          const cr = 18 + cityLight * 62;
          const cg = 21 + cityLight * 45;
          const cb = 28 + cityLight * 36;
          const a = cloud * 0.72;
          r = r * (1 - a) + cr * a;
          g = g * (1 - a) + cg * a;
          b = b * (1 - a) + cb * a;
        }
      }

      // below the horizon fades into the city haze
      if (altitude < 0) {
        const d = Math.min(1, -altitude * 3.4);
        r = r * (1 - d) + 5 * d;
        g = g * (1 - d) + 8 * d;
        b = b * (1 - d) + 12 * d;
      }

      const i = (y * width + x) * 4;
      image.data[i] = Math.min(255, r);
      image.data[i + 1] = Math.min(255, g);
      image.data[i + 2] = Math.min(255, b);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  // stars
  const rand = mulberry32(551);
  for (let i = 0; i < 900; i++) {
    const u = rand();
    const vv = rand() * 0.46;
    const x = u * width;
    const y = vv * height;
    const bright = 90 + rand() * 165;
    const size = rand() > 0.93 ? 1.5 : 0.7;
    ctx.fillStyle = `rgba(${bright * 0.82},${bright * 0.9},${bright},${0.35 + rand() * 0.5})`;
    ctx.fillRect(x, y, size, size);
  }

  // moon at roughly the direction of the key light
  const mx = width * 0.312;
  const my = height * 0.299;
  const halo = ctx.createRadialGradient(mx, my, 2, mx, my, 86);
  halo.addColorStop(0, 'rgba(234,242,255,0.9)');
  halo.addColorStop(0.08, 'rgba(210,228,255,0.5)');
  halo.addColorStop(0.28, 'rgba(140,175,220,0.13)');
  halo.addColorStop(1, 'rgba(90,130,190,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(mx - 88, my - 88, 176, 176);
  const disc = ctx.createRadialGradient(mx - 3, my - 4, 1, mx, my, 13);
  disc.addColorStop(0, 'rgba(255,252,240,1)');
  disc.addColorStop(0.7, 'rgba(226,232,232,0.98)');
  disc.addColorStop(1, 'rgba(190,205,215,0.9)');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(mx, my, 13, 0, Math.PI * 2);
  ctx.fill();

  // a couple of faint craters so the disc is not a perfect white dot
  ctx.fillStyle = 'rgba(165,180,192,0.32)';
  for (const [dx, dy, rr] of [[-4, 2, 3.2], [3, -2, 2.2], [1, 5, 1.6]]) {
    ctx.beginPath();
    ctx.arc(mx + dx, my + dy, rr, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.anisotropy = 4;
  return texture;
}

function radialTexture(inner = 'rgba(0,0,0,1)', outer = 'rgba(0,0,0,0)') {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.55, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

function groundTexture() {
  const size = 512;
  const rand = mulberry32(11);
  const stains = [];
  for (let i = 0; i < 22; i++) {
    stains.push({
      x: rand() * size,
      y: rand() * size,
      rx: 8 + rand() * 58,
      ry: 5 + rand() * 30,
      rot: rand() * Math.PI,
      alpha: 0.16 + rand() * 0.34,
      wet: rand() > 0.55,
    });
  }

  const map = drawCanvas(size, size, (ctx, w, h) => {
    const r = mulberry32(11);
    ctx.fillStyle = '#262c34';
    ctx.fillRect(0, 0, w, h);
    // fine aggregate
    for (let i = 0; i < 8500; i++) {
      const g = 22 + r() * 38;
      ctx.fillStyle = `rgba(${g},${g + 2},${g + 5},${0.2 + r() * 0.5})`;
      const s = r() * 2.6 + 0.4;
      ctx.fillRect(r() * w, r() * h, s, s);
    }
    // expansion joints every quarter tile
    ctx.strokeStyle = 'rgba(5,7,10,0.9)';
    ctx.lineWidth = 4;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 128, 0);
      ctx.lineTo(i * 128, h);
      ctx.moveTo(0, i * 128);
      ctx.lineTo(w, i * 128);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(128,138,148,0.10)';
    ctx.lineWidth = 1.5;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 128 + 3, 0);
      ctx.lineTo(i * 128 + 3, h);
      ctx.moveTo(0, i * 128 + 3);
      ctx.lineTo(w, i * 128 + 3);
      ctx.stroke();
    }
    // hairline cracks
    for (let i = 0; i < 30; i++) {
      ctx.strokeStyle = `rgba(6,8,11,${0.26 + r() * 0.5})`;
      ctx.lineWidth = 0.7 + r() * 1.6;
      ctx.beginPath();
      let x = r() * w;
      let y = r() * h;
      ctx.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (r() - 0.5) * 42;
        y += (r() - 0.5) * 42;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // grime, oil and standing water darken the surface
    for (const s of stains) {
      const grad = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, Math.max(s.rx, s.ry));
      grad.addColorStop(0, `rgba(4,7,10,${s.alpha + 0.18})`);
      grad.addColorStop(0.7, `rgba(6,9,12,${s.alpha * 0.6})`);
      grad.addColorStop(1, 'rgba(6,9,12,0)');
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.scale(1, s.ry / s.rx);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, s.rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });

  // greyscale height: joints, aggregate and shallow standing water
  const height = drawCanvas(size, size, (ctx, w, h) => {
    const r = mulberry32(23);
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 6000; i++) {
      const g = 96 + r() * 56;
      ctx.fillStyle = `rgba(${g},${g},${g},${0.25 + r() * 0.4})`;
      ctx.fillRect(r() * w, r() * h, 1 + r() * 2.4, 1 + r() * 2.4);
    }
    ctx.fillStyle = 'rgba(22,22,22,0.85)';
    for (let i = 1; i < 4; i++) {
      ctx.fillRect(i * 128 - 2, 0, 4, h);
      ctx.fillRect(0, i * 128 - 2, w, 4);
    }
    for (const s of stains) {
      const grad = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, s.rx);
      grad.addColorStop(0, `rgba(70,70,70,${s.wet ? 0.7 : 0.35})`);
      grad.addColorStop(1, 'rgba(70,70,70,0)');
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.scale(1, s.ry / s.rx);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, s.rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });

  // roughness: puddles are smooth mirrors, dry concrete is rough
  const roughness = drawCanvas(size, size, (ctx, w, h) => {
    ctx.fillStyle = '#bcbcbc';
    ctx.fillRect(0, 0, w, h);
    for (const s of stains) {
      if (!s.wet) continue;
      const grad = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, s.rx);
      grad.addColorStop(0, 'rgba(22,22,22,0.95)');
      grad.addColorStop(0.6, 'rgba(48,48,48,0.72)');
      grad.addColorStop(1, 'rgba(120,120,120,0)');
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.scale(1, s.ry / s.rx);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, s.rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });

  const mapTex = new THREE.CanvasTexture(map);
  mapTex.colorSpace = THREE.SRGBColorSpace;
  const roughTex = new THREE.CanvasTexture(roughness);
  roughTex.colorSpace = THREE.NoColorSpace;
  const normalTex = normalFromCanvas(height, 1.5);
  for (const tex of [mapTex, roughTex, normalTex]) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(18, 18);
    tex.anisotropy = 8;
  }
  return { map: mapTex, normalMap: normalTex, roughnessMap: roughTex };
}

function windowTextures(seed) {
  const width = 256;
  const height = 512;
  const rand = mulberry32(seed);
  const cols = 5 + Math.floor(rand() * 2);
  const rows = 14 + Math.floor(rand() * 5);
  const emit = document.createElement('canvas');
  emit.width = width;
  emit.height = height;
  const e = emit.getContext('2d');
  e.fillStyle = '#000';
  e.fillRect(0, 0, width, height);
  const color = drawCanvas(width, height, (c) => {
    c.fillStyle = '#171b20';
    c.fillRect(0, 0, width, height);

    // concrete panels and grime
    for (let i = 0; i < 1600; i++) {
      const g = 18 + rand() * 24;
      c.fillStyle = `rgba(${g},${g + 2},${g + 5},0.22)`;
      c.fillRect(rand() * width, rand() * height, 1 + rand() * 3, 1 + rand() * 10);
    }
    c.strokeStyle = 'rgba(6,8,11,0.55)';
    c.lineWidth = 2;
    for (let y = 0; y < height; y += height / rows) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(width, y);
      c.stroke();
    }
    for (let x = 0; x < width; x += width / cols) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, height);
      c.stroke();
    }

    const padX = 8;
    const padY = 10;
    const cw = (width - padX * 2) / cols;
    const ch = (height - padY * 2) / rows;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = padX + col * cw + 3;
        const y = padY + row * ch + 4;
        const ww = cw - 6;
        const hh = ch - 8;
        const lit = rand() > 0.58;
        const warm = rand() > 0.4;
        const alpha = 0.24 + rand() * 0.58;

        // recessed frame
        c.fillStyle = 'rgba(4,6,9,0.9)';
        c.fillRect(x - 1.5, y - 1.5, ww + 3, hh + 3);
        c.fillStyle = 'rgba(90,100,110,0.14)';
        c.fillRect(x - 3, y + hh + 1, ww + 6, 1.4);

        if (lit) {
          const grad = c.createLinearGradient(x, y, x, y + hh);
          if (warm) {
            grad.addColorStop(0, `rgba(255,${188 + rand() * 30},130,${alpha})`);
            grad.addColorStop(0.55, `rgba(255,${142 + rand() * 34},68,${alpha})`);
            grad.addColorStop(1, `rgba(176,${82 + rand() * 24},32,${alpha * 0.8})`);
          } else {
            grad.addColorStop(0, `rgba(178,224,255,${alpha * 0.95})`);
            grad.addColorStop(0.6, `rgba(96,188,238,${alpha * 0.9})`);
            grad.addColorStop(1, `rgba(38,96,150,${alpha * 0.75})`);
          }
          c.fillStyle = grad;
          c.fillRect(x, y, ww, hh);
          e.fillStyle = grad;
          e.fillRect(x, y, ww, hh);
          // blinds / curtains / a dark silhouette
          if (rand() > 0.62) {
            c.fillStyle = 'rgba(6,9,13,0.42)';
            for (let sy = y; sy < y + hh; sy += 4.5) c.fillRect(x, sy, ww, 1.5);
            e.fillStyle = 'rgba(0,0,0,0.38)';
            for (let sy = y; sy < y + hh; sy += 4.5) e.fillRect(x, sy, ww, 1.5);
          }
          if (rand() > 0.78) {
            c.fillStyle = 'rgba(4,7,11,0.65)';
            c.fillRect(x + ww * (0.22 + rand() * 0.4), y, ww * 0.16, hh);
            e.fillStyle = 'rgba(0,0,0,0.62)';
            e.fillRect(x + ww * (0.22 + rand() * 0.4), y, ww * 0.16, hh);
          }
          c.fillStyle = 'rgba(5,8,12,0.5)';
          c.fillRect(x + ww * 0.47, y, 1.4, hh);
          e.fillStyle = 'rgba(0,0,0,0.55)';
          e.fillRect(x + ww * 0.47, y, 1.4, hh);
        } else {
          const grad = c.createLinearGradient(x, y, x + ww, y + hh);
          grad.addColorStop(0, 'rgba(20,28,38,0.95)');
          grad.addColorStop(0.55, 'rgba(7,10,15,0.98)');
          grad.addColorStop(1, 'rgba(28,38,50,0.9)');
          c.fillStyle = grad;
          c.fillRect(x, y, ww, hh);
          c.fillStyle = 'rgba(120,150,180,0.10)';
          c.fillRect(x + 1, y + 1, ww * 0.35, hh * 0.4);
        }

        // mullion and sill
        c.fillStyle = 'rgba(3,5,8,0.8)';
        c.fillRect(x, y + hh * 0.5, ww, 1.2);
        c.fillStyle = 'rgba(135,148,160,0.18)';
        c.fillRect(x - 1, y + hh + 2, ww + 2, 1);
      }
    }

    // rain streaks running down the facade
    for (let i = 0; i < 34; i++) {
      const x = rand() * width;
      const y = rand() * height;
      const grad = c.createLinearGradient(x, y, x, y + 30 + rand() * 50);
      grad.addColorStop(0, 'rgba(4,6,9,0.25)');
      grad.addColorStop(1, 'rgba(4,6,9,0)');
      c.fillStyle = grad;
      c.fillRect(x, y, 1 + rand() * 1.6, 30 + rand() * 60);
    }
  });

  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const emissive = new THREE.CanvasTexture(emit);
  emissive.colorSpace = THREE.SRGBColorSpace;
  emissive.anisotropy = 8;
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

function corrugatedNormal() {
  const canvas = drawCanvas(256, 256, (ctx, w, h) => {
    const rand = mulberry32(883);
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x++) {
      const s = 0.5 + 0.5 * Math.cos((x / w) * Math.PI * 2 * 18);
      const v = Math.round(70 + s * 110);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, 0, 1, h);
    }
    for (let i = 0; i < 900; i++) {
      const g = 100 + rand() * 70;
      ctx.fillStyle = `rgba(${g},${g},${g},0.25)`;
      ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 6);
    }
  });
  const tex = normalFromCanvas(canvas, 1.6);
  tex.repeat.set(2, 1);
  return tex;
}

function crateNormal() {
  const canvas = drawCanvas(256, 256, (ctx, w, h) => {
    const rand = mulberry32(51);
    ctx.fillStyle = '#7a7a7a';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 34) {
      ctx.fillStyle = 'rgba(20,20,20,0.85)';
      ctx.fillRect(0, y, w, 3);
      ctx.fillStyle = 'rgba(150,150,150,0.5)';
      ctx.fillRect(0, y + 3, w, 1);
    }
    for (let i = 0; i < 700; i++) {
      const g = 100 + rand() * 60;
      ctx.fillStyle = `rgba(${g},${g},${g},0.22)`;
      ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 8, 1);
    }
    ctx.strokeStyle = 'rgba(35,35,35,0.9)';
    ctx.lineWidth = 10;
    ctx.strokeRect(9, 9, w - 18, h - 18);
  });
  return normalFromCanvas(canvas, 1.7);
}

function barrelNormal() {
  const canvas = drawCanvas(256, 256, (ctx, w, h) => {
    const rand = mulberry32(61);
    ctx.fillStyle = '#7d7d7d';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 28) {
      ctx.fillStyle = 'rgba(30,30,30,0.9)';
      ctx.fillRect(0, y, w, 6);
      ctx.fillStyle = 'rgba(170,170,170,0.6)';
      ctx.fillRect(0, y + 6, w, 2);
    }
    for (let i = 0; i < 420; i++) {
      const g = 90 + rand() * 60;
      ctx.fillStyle = `rgba(${g},${g},${g},0.2)`;
      ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 3, 1 + rand() * 4);
    }
  });
  return normalFromCanvas(canvas, 1.5);
}

function makeBuilding(scene, occluders, rand, angle, radius, index) {
  const width = 9 + rand() * 15;
  const depth = 9 + rand() * 13;
  const height = 12 + rand() * 30;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  const tex = windowTextures(100 + index);
  const tone = 0.72 + rand() * 0.26;
  const mat = new THREE.MeshStandardMaterial({
    map: tex.map,
    emissiveMap: tex.emissive,
    emissive: 0xffffff,
    emissiveIntensity: 0.5,
    color: new THREE.Color(tone * 0.9, tone * 0.94, tone * 1.0),
    roughness: 0.86,
    metalness: 0.12,
    envMapIntensity: 0.35,
  });
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = -angle + (rand() - 0.5) * 0.4;
  scene.add(group);

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
  mesh.position.y = height / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  occluders.push(mesh);

  // occasional staggered setback makes the skyline read as architecture, not boxes
  let top = height;
  if (rand() > 0.42) {
    const tierH = 3 + rand() * 8;
    const tier = new THREE.Mesh(
      new THREE.BoxGeometry(width * (0.5 + rand() * 0.24), tierH, depth * (0.5 + rand() * 0.24)),
      mat
    );
    tier.position.set((rand() - 0.5) * width * 0.2, height + tierH / 2, (rand() - 0.5) * depth * 0.2);
    tier.castShadow = true;
    tier.receiveShadow = true;
    group.add(tier);
    occluders.push(tier);
    top = height + tierH;
  }

  // cornice bands break up the flat facade
  const bandMat = new THREE.MeshStandardMaterial({ color: 0x14191f, roughness: 0.9, metalness: 0.1 });
  for (const frac of [0.32, 0.66]) {
    if (rand() > 0.64) continue;
    const band = new THREE.Mesh(new THREE.BoxGeometry(width + 0.34, 0.14, depth + 0.34), bandMat);
    band.position.y = height * frac;
    group.add(band);
  }

  // roof cap
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.5, 0.45, depth + 0.5),
    new THREE.MeshStandardMaterial({ color: 0x0d1116, roughness: 0.92, metalness: 0.18 })
  );
  roof.position.y = top + 0.22;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);
  occluders.push(roof);

  // rooftop clutter visible above the arena rim
  const clutter = new THREE.Group();
  clutter.position.y = top + 0.45;
  group.add(clutter);
  if (rand() > 0.5) {
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2 + rand() * 0.6, 1.3 + rand() * 0.6, 2.4 + rand() * 1.5, 10),
      new THREE.MeshStandardMaterial({ color: 0x2b333b, roughness: 0.75, metalness: 0.42 })
    );
    tank.position.set((rand() - 0.5) * width * 0.35, 1.6, (rand() - 0.5) * depth * 0.35);
    tank.castShadow = true;
    clutter.add(tank);
    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(1.35, 0.7, 10),
      new THREE.MeshStandardMaterial({ color: 0x1b2229, roughness: 0.8, metalness: 0.4 })
    );
    cap.position.copy(tank.position).add(new THREE.Vector3(0, 1.9, 0));
    clutter.add(cap);
  }
  for (let i = 0; i < 3; i++) {
    if (rand() > 0.9) continue;
    const unit = new THREE.Mesh(
      new THREE.BoxGeometry(1 + rand() * 1.4, 0.5 + rand() * 0.5, 0.8 + rand() * 1.1),
      new THREE.MeshStandardMaterial({ color: 0x252c33, roughness: 0.82, metalness: 0.35 })
    );
    unit.position.set((rand() - 0.5) * width * 0.7, 0.3, (rand() - 0.5) * depth * 0.7);
    unit.castShadow = true;
    clutter.add(unit);
  }

  if (rand() > 0.35) {
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.13, 5 + rand() * 8, 5),
      new THREE.MeshStandardMaterial({ color: 0x202831, roughness: 0.6, metalness: 0.7 })
    );
    mast.position.set((rand() - 0.5) * width * 0.3, top + 3.6, (rand() - 0.5) * depth * 0.3);
    mast.castShadow = true;
    group.add(mast);
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff4530, toneMapped: false })
    );
    beacon.position.copy(mast.position).add(new THREE.Vector3(0, 3.7, 0));
    group.add(beacon);
  }
}

function makeDistantSkyline(scene, rand) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0d141c,
    roughness: 0.95,
    metalness: 0.05,
  });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x3d2a18, transparent: true, opacity: 0.4 });
  for (let i = 0; i < 42; i++) {
    const angle = (i / 42) * Math.PI * 2 + (rand() - 0.5) * 0.1;
    const radius = 76 + rand() * 62;
    const width = 7 + rand() * 20;
    const depth = 7 + rand() * 14;
    const height = 12 + rand() * 56;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
    mesh.position.set(Math.cos(angle) * radius, height / 2, Math.sin(angle) * radius);
    mesh.rotation.y = -angle + (rand() - 0.5) * 0.5;
    scene.add(mesh);
    if (rand() > 0.35) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(width + 0.2, 0.35, depth + 0.2), glowMat);
      band.position.set(mesh.position.x, height * (0.35 + rand() * 0.5), mesh.position.z);
      band.rotation.y = mesh.rotation.y;
      scene.add(band);
    }
  }
}

export function createWorld(scene, renderer) {
  const occluders = [];
  const colliders = [];
  const rand = mulberry32(4117);

  scene.fog = new THREE.Fog(0x101b29, 20, 128);

  // ---------------- sky and image-based lighting ----------------
  const skyTex = skyTexture();
  scene.background = skyTex;
  scene.backgroundIntensity = 1.0;

  if (renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const env = pmrem.fromEquirectangular(skyTex);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.62;
    pmrem.dispose();
  }

  // ---------------- ground ----------------
  const groundMaps = groundTexture();
  const groundMat = new THREE.MeshStandardMaterial({
    map: groundMaps.map,
    normalMap: groundMaps.normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughnessMap: groundMaps.roughnessMap,
    roughness: 1.0,
    metalness: 0.1,
    color: 0xd2d8df,
    envMapIntensity: 0.42,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  occluders.push(ground);

  // shallow standing water reflects the sky/environment
  const puddleAlpha = canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.62, 'rgba(225,225,225,0.9)');
    g.addColorStop(0.82, 'rgba(80,80,80,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  puddleAlpha.colorSpace = THREE.NoColorSpace;
  const puddleMat = new THREE.MeshStandardMaterial({
    color: 0x070b10,
    roughness: 0.06,
    metalness: 0.72,
    envMapIntensity: 1.85,
    transparent: true,
    opacity: 0.94,
    alphaMap: puddleAlpha,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  for (let i = 0; i < 14; i++) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(1.3 + rand() * 3.8, 24), puddleMat);
    p.rotation.x = -Math.PI / 2;
    p.scale.y = 0.35 + rand() * 0.5;
    p.rotation.z = rand() * Math.PI;
    p.position.set((rand() - 0.5) * 50, 0.012 + i * 0.0004, (rand() - 0.5) * 50);
    p.receiveShadow = true;
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
  const buildingCount = 30;
  for (let i = 0; i < buildingCount; i++) {
    const angle = (i / buildingCount) * Math.PI * 2 + (rand() - 0.5) * 0.13;
    const radius = 42 + rand() * 28;
    makeBuilding(scene, occluders, rand, angle, radius, i);
  }
  makeDistantSkyline(scene, rand);

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
  const concreteCanvas = concrete.image;
  const barrierMat = new THREE.MeshStandardMaterial({
    map: concrete,
    normalMap: normalFromCanvas(concreteCanvas, 1.4, 3),
    normalScale: new THREE.Vector2(0.8, 0.8),
    color: 0x9aa0a6,
    roughness: 0.9,
    metalness: 0.08,
    envMapIntensity: 0.3,
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
      base.castShadow = true;
      base.receiveShadow = true;
      occluders.push(base);
    }
  }

  // ---------------- containers ----------------
  const containerNormal = corrugatedNormal();
  function addContainer(x, z, rot, base, w = 7, h = 2.9, d = 2.8) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      map: containerTexture(base),
      normalMap: containerNormal,
      normalScale: new THREE.Vector2(0.9, 0.9),
      color: 0xbfc4c8,
      roughness: 0.62,
      metalness: 0.42,
      envMapIntensity: 0.65,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x1a2026, roughness: 0.68, metalness: 0.45 });
    const doorA = new THREE.Mesh(new THREE.BoxGeometry(w * 0.42, h * 0.84, 0.12), doorMat);
    doorA.position.set(-w * 0.23, h / 2, d / 2 + 0.03);
    doorA.castShadow = true;
    group.add(doorA);
    const doorB = doorA.clone();
    doorB.position.x = w * 0.23;
    group.add(doorB);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, h * 0.7, 0.08), new THREE.MeshStandardMaterial({ color: 0x3a434c, roughness: 0.45, metalness: 0.7 }));
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
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x171e26, roughness: 0.48, metalness: 0.72, envMapIntensity: 0.9 });
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
  const genBody = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 1.5, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x262d34, roughness: 0.55, metalness: 0.55, envMapIntensity: 0.8 })
  );
  genBody.position.y = 0.75;
  genBody.castShadow = true;
  genBody.receiveShadow = true;
  gen.add(genBody);
  const vent = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 0.08), new THREE.MeshStandardMaterial({ color: 0x0b0f13, roughness: 0.9, metalness: 0.2 }));
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
  const fans = [];
  const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x2b333b, roughness: 0.52, metalness: 0.7, envMapIntensity: 0.85 });
  const paintedMetalMat = new THREE.MeshStandardMaterial({ color: 0x39434c, roughness: 0.68, metalness: 0.45, envMapIntensity: 0.6 });
  const grimeMetalMat = new THREE.MeshStandardMaterial({ color: 0x1a2026, roughness: 0.8, metalness: 0.5 });
  const grilleTex = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#1e252c';
    ctx.fillRect(0, 0, w, h);
    for (let y = 4; y < h; y += 9) {
      ctx.fillStyle = 'rgba(4,6,8,0.85)';
      ctx.fillRect(4, y, w - 8, 4);
      ctx.fillStyle = 'rgba(140,155,166,0.22)';
      ctx.fillRect(4, y + 4, w - 8, 1);
    }
    ctx.strokeStyle = 'rgba(140,155,166,0.25)';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, w - 4, h - 4);
  });

  function addACUnit(x, z, rot, scale = 1) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7 * scale, 1.0 * scale, 1.35 * scale), paintedMetalMat);
    body.position.y = 0.5 * scale;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const grille = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1 * scale, 0.6 * scale),
      new THREE.MeshStandardMaterial({ map: grilleTex, roughness: 0.72, metalness: 0.55 })
    );
    grille.position.set(0, 0.45 * scale, 0.68 * scale + 0.006);
    group.add(grille);
    const shroud = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46 * scale, 0.5 * scale, 0.09 * scale, 16, 1, true),
      grimeMetalMat
    );
    shroud.position.y = 1.03 * scale;
    group.add(shroud);
    const rotor = new THREE.Group();
    rotor.position.y = 1.0 * scale;
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.7 * scale, 0.018 * scale, 0.16 * scale), grimeMetalMat);
      blade.position.x = 0.2 * scale;
      blade.rotation.y = (i / 4) * Math.PI;
      rotor.add(blade);
    }
    group.add(rotor);
    fans.push({ rotor, speed: 2.6 + Math.random() * 2.4 });
    const feet = new THREE.Mesh(new THREE.BoxGeometry(1.5 * scale, 0.09, 1.15 * scale), grimeMetalMat);
    feet.position.y = 0.045;
    group.add(feet);
    group.position.set(x, 0, z);
    group.rotation.y = rot;
    scene.add(group);
    colliders.push({ type: 'box', x, z, halfW: 0.95 * scale, halfD: 0.8 * scale, rot });
    occluders.push(body);
    return group;
  }
  addACUnit(24.5, -23.5, -0.4);
  addACUnit(-24.5, -23, 0.55, 0.9);
  addACUnit(25.5, 22.5, 2.4, 1.15);
  addACUnit(-25.5, 14.5, 0.9, 0.85);

  // roof access hut
  const hut = new THREE.Group();
  const hutBody = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.7, 2.9), new THREE.MeshStandardMaterial({
    color: 0x3b4148, roughness: 0.82, metalness: 0.22, envMapIntensity: 0.4,
  }));
  hutBody.position.y = 1.35;
  hutBody.castShadow = true;
  hutBody.receiveShadow = true;
  hut.add(hutBody);
  const hutRoof = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.18, 3.2), grimeMetalMat);
  hutRoof.position.y = 2.79;
  hutRoof.castShadow = true;
  hut.add(hutRoof);
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.05, 0.08), grimeMetalMat);
  doorFrame.position.set(-0.45, 1.05, 1.47);
  hut.add(doorFrame);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.92, 0.06), new THREE.MeshStandardMaterial({
    color: 0x222a31, roughness: 0.55, metalness: 0.62,
  }));
  door.position.set(-0.45, 1.02, 1.53);
  hut.add(door);
  const doorLamp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.03), new THREE.MeshBasicMaterial({ color: 0xffa040, toneMapped: false }));
  doorLamp.position.set(-0.45, 2.2, 1.56);
  hut.add(doorLamp);
  const hutLamp = new THREE.PointLight(0xffa050, 16, 9, 2);
  hutLamp.position.set(-0.45, 2.15, 1.9);
  hut.add(hutLamp);
  hut.position.set(-24.5, 0, 27);
  hut.rotation.y = Math.PI + 0.1;
  scene.add(hut);
  colliders.push({ type: 'box', x: -24.5, z: 27, halfW: 1.9, halfD: 1.55, rot: Math.PI + 0.1 });
  occluders.push(hutBody);

  // long service pipes along the parapet
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x4a545d, roughness: 0.38, metalness: 0.82, envMapIntensity: 1.0 });
  function addPipeRun(axis, fixed, from, to, y) {
    const length = Math.abs(to - from);
    const mid = (to + from) / 2;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, length, 10), pipeMat);
    pipe.rotation.z = Math.PI / 2;
    if (axis === 'z') pipe.rotation.y = Math.PI / 2;
    pipe.position.set(axis === 'x' ? mid : fixed, y, axis === 'x' ? fixed : mid);
    pipe.castShadow = true;
    pipe.receiveShadow = true;
    scene.add(pipe);
    const bracketMat = grimeMetalMat;
    for (let t = from; t <= to; t += 5) {
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.34), bracketMat);
      bracket.position.set(axis === 'x' ? t : fixed, y - 0.14, axis === 'x' ? fixed : t);
      scene.add(bracket);
    }
  }
  addPipeRun('x', -31.6, -24, 8, 0.72);
  addPipeRun('z', 31.6, -22, 14, 0.58);
  addPipeRun('x', 31.6, -6, 26, 0.46);

  // squat exhaust stacks and vents
  for (const [x, z, h, r] of [[-27, -11, 1.5, 0.32], [18, -28, 1.2, 0.24], [-14, 27, 1.7, 0.4], [29, 4, 1.1, 0.26]]) {
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.12, h, 10), grimeMetalMat);
    stack.position.set(x, h / 2, z);
    stack.castShadow = true;
    stack.receiveShadow = true;
    scene.add(stack);
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.55, r * 1.2, 0.16, 10), darkMetalMat);
    hood.position.set(x, h + 0.06, z);
    hood.castShadow = true;
    scene.add(hood);
    colliders.push({ type: 'circle', x, z, r: r * 1.2 });
  }

  // low skylight with warm interior glow
  const skylight = new THREE.Group();
  const skylightFrame = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.22, 2.3), grimeMetalMat);
  skylightFrame.position.y = 0.11;
  skylightFrame.castShadow = true;
  skylight.add(skylightFrame);
  const skylightGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(3.15, 1.9),
    new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xffa356, emissiveIntensity: 1.1, roughness: 0.2, metalness: 0.1,
    })
  );
  skylightGlass.rotation.x = -Math.PI / 2;
  skylightGlass.position.y = 0.226;
  skylight.add(skylightGlass);
  skylight.position.set(22.5, 0, 12);
  skylight.rotation.y = -0.12;
  scene.add(skylight);

  // satellite dish
  const dish = new THREE.Group();
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 8), pipeMat);
  mast.position.y = 1.2;
  mast.castShadow = true;
  dish.add(mast);
  const reflector = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), new THREE.MeshStandardMaterial({
    color: 0x8d969e, roughness: 0.45, metalness: 0.55, side: THREE.DoubleSide, envMapIntensity: 0.9,
  }));
  reflector.position.set(0, 2.45, 0);
  reflector.rotation.set(-0.7, 0, 0.35);
  reflector.castShadow = true;
  dish.add(reflector);
  dish.position.set(27.5, 0, -13.5);
  scene.add(dish);

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
  scene.add(new THREE.AmbientLight(0x314151, 0.62));
  scene.add(new THREE.HemisphereLight(0x5b7d9d, 0x0a0d12, 1.15));

  // The moon is the key light; the shadow map is deliberately tight around the
  // arena so props and drones get crisp contact shadows instead of peter-panning.
  const moonLight = new THREE.DirectionalLight(0xa9c9ee, 2.15);
  moonLight.position.set(24, 46, -58);
  moonLight.target.position.set(0, 0, 0);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  moonLight.shadow.camera.left = -44;
  moonLight.shadow.camera.right = 44;
  moonLight.shadow.camera.top = 44;
  moonLight.shadow.camera.bottom = -44;
  moonLight.shadow.camera.near = 8;
  moonLight.shadow.camera.far = 130;
  moonLight.shadow.bias = -0.0006;
  moonLight.shadow.normalBias = 0.035;
  scene.add(moonLight);
  scene.add(moonLight.target);

  // cool bounce from the opposite side of the skyline
  const rim = new THREE.DirectionalLight(0x4f7fa8, 0.5);
  rim.position.set(-38, 22, 40);
  scene.add(rim);

  // Soft sky fill keeps the deck readable underneath the building shadows.
  const skyFill = new THREE.DirectionalLight(0x7a9fc0, 0.75);
  skyFill.position.set(-6, 60, 10);
  scene.add(skyFill);

  const warm = new THREE.PointLight(0xff8a3c, 620, 52, 2);
  warm.position.set(-19, 5.5, 17);
  scene.add(warm);
  const cyan = new THREE.PointLight(0x49bff2, 520, 50, 2);
  cyan.position.set(20, 6, -17);
  scene.add(cyan);
  // central courtyard fill so cover and props stay readable away from the corner lamps
  const fill = new THREE.PointLight(0xa8c4dd, 520, 60, 2);
  fill.position.set(0, 11, 1);
  scene.add(fill);
  const amberPool = new THREE.PointLight(0xffb060, 180, 28, 2);
  amberPool.position.set(-24.5, 2.6, 25.6);
  scene.add(amberPool);

  // moving search beam cones
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x7fc9ff, transparent: true, opacity: 0.022, blending: THREE.AdditiveBlending,
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

  return { occluders, colliders, beams: [beam, beam2], citadel, emblem, fans, moonLight };
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

let crateMaterial;
let barrelMaterial;

export const PROP_MATERIALS = {
  crate: () => {
    if (!crateMaterial) {
      crateMaterial = new THREE.MeshStandardMaterial({
        map: crateTexture(),
        normalMap: crateNormal(),
        normalScale: new THREE.Vector2(0.85, 0.85),
        roughness: 0.82,
        metalness: 0.04,
        envMapIntensity: 0.35,
      });
    }
    return crateMaterial;
  },
  barrel: () => {
    if (!barrelMaterial) {
      barrelMaterial = new THREE.MeshStandardMaterial({
        map: barrelTexture('#ff9d2e'),
        normalMap: barrelNormal(),
        normalScale: new THREE.Vector2(0.9, 0.9),
        roughness: 0.42,
        metalness: 0.62,
        envMapIntensity: 0.9,
      });
    }
    return barrelMaterial;
  },
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
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1b1713, roughness: 0.78, metalness: 0.16 });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.075, size + 0.04, 0.075), frameMat);
        post.position.set(sx * (size / 2 - 0.025), 0, sz * (size / 2 - 0.025));
        post.castShadow = true;
        group.add(post);
      }
    }
    for (const sy of [-1, 1]) {
      for (const [axis, len] of [['x', size + 0.03], ['z', size + 0.03]]) {
        const rail = new THREE.Mesh(
          axis === 'x' ? new THREE.BoxGeometry(len, 0.065, 0.065) : new THREE.BoxGeometry(0.065, 0.065, len),
          frameMat
        );
        rail.position.set(0, sy * (size / 2 - 0.02), 0);
        rail.position[axis === 'x' ? 'z' : 'x'] = sy * (size / 2 - 0.02);
        group.add(rail);
      }
    }
    radius = 0.68;
    mass = 1;
    group.traverse((o) => { if (o.isMesh) o.userData.propGroup = group; });
    return { group, radius, mass, halfHeight: size / 2 };
  }
  const h = 1.08;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, h, 20), PROP_MATERIALS.barrel());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  const topMat = new THREE.MeshStandardMaterial({ color: 0x2a333b, roughness: 0.38, metalness: 0.72 });
  for (const y of [h / 2 - 0.02, h * 0.16, -h * 0.2]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(y > h * 0.4 ? 0.32 : 0.355, 0.021, 5, 20), topMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    group.add(ring);
  }
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.315, 0.315, 0.025, 20), topMat);
  lid.position.y = h / 2 - 0.005;
  group.add(lid);
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.025, 12), new THREE.MeshBasicMaterial({ color: 0xff9d2e, toneMapped: false }));
  glow.position.y = h / 2 + 0.015;
  group.add(glow);
  radius = 0.5;
  mass = 0.82;
  group.traverse((o) => { if (o.isMesh) o.userData.propGroup = group; });
  return { group, radius, mass, halfHeight: h / 2 };
}

import * as THREE from 'three';

// ---------------------------------------------------------------- helpers
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTexture(width, height, draw, { srgb = true } = {}) {
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

export function setRepeat(texture, x, y) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(x, y);
  return texture;
}

export function cloneRepeat(texture, x, y) {
  const clone = texture.clone();
  clone.needsUpdate = true;
  return setRepeat(clone, x, y);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Tileable value-noise height field converted to a tangent-space normal map.
export function normalTexture(size, seed, strength = 1.8, stripes = 0) {
  const rand = mulberry32(seed);
  const grids = [];
  for (let octave = 0; octave < 4; octave++) {
    const cells = 4 << octave;
    const grid = new Float32Array(cells * cells);
    for (let i = 0; i < grid.length; i++) grid[i] = rand();
    grids.push({ cells, grid });
  }

  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let value = 0;
      let amplitude = 0.58;
      let total = 0;
      for (const { cells, grid } of grids) {
        const fx = (x / size) * cells;
        const fy = (y / size) * cells;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = fx - ix;
        const ty = fy - iy;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const x0 = ix % cells;
        const x1 = (ix + 1) % cells;
        const y0 = iy % cells;
        const y1 = (iy + 1) % cells;
        const top = lerp(grid[y0 * cells + x0], grid[y0 * cells + x1], sx);
        const bottom = lerp(grid[y1 * cells + x0], grid[y1 * cells + x1], sx);
        value += lerp(top, bottom, sy) * amplitude;
        total += amplitude;
        amplitude *= 0.52;
      }
      let h = value / total;
      if (stripes > 0) {
        h = h * 0.35 + (0.5 + 0.5 * Math.sin((x / size) * Math.PI * 2 * stripes)) * 0.65;
      }
      height[y * size + x] = h;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const scale = strength * size * 0.012;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const left = height[y * size + ((x - 1 + size) % size)];
      const right = height[y * size + ((x + 1) % size)];
      const up = height[((y - 1 + size) % size) * size + x];
      const down = height[((y + 1) % size) * size + x];
      let nx = (left - right) * scale;
      let ny = (up - down) * scale;
      let nz = 1;
      const length = Math.hypot(nx, ny, nz);
      nx /= length;
      ny /= length;
      nz /= length;
      const index = (y * size + x) * 4;
      image.data[index] = (nx * 0.5 + 0.5) * 255;
      image.data[index + 1] = (ny * 0.5 + 0.5) * 255;
      image.data[index + 2] = (nz * 0.5 + 0.5) * 255;
      image.data[index + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

function roughnessTexture(size, seed, base = 0.78, variation = 0.22, wet = 0) {
  const rand = mulberry32(seed);
  return canvasTexture(size, size, (ctx, w, h) => {
    const value = Math.round(base * 255);
    ctx.fillStyle = `rgb(${value},${value},${value})`;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const v = Math.round(THREE.MathUtils.clamp(base + (rand() - 0.5) * variation, 0.02, 1) * 255);
      ctx.fillStyle = `rgba(${v},${v},${v},${0.12 + rand() * 0.3})`;
      const s = 1 + rand() * 5;
      ctx.fillRect(rand() * w, rand() * h, s, s);
    }
    if (wet > 0) {
      for (let i = 0; i < 22; i++) {
        const g = ctx.createRadialGradient(rand() * w, rand() * h, 1, rand() * w, rand() * h, 12 + rand() * 54);
        g.addColorStop(0, `rgba(20,20,20,${0.35 + rand() * 0.3})`);
        g.addColorStop(1, 'rgba(20,20,20,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
    }
  }, { srgb: false });
}

function drawRust(ctx, w, h, rand, amount = 40) {
  for (let i = 0; i < amount; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 1 + rand() * 12;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${90 + rand() * 45},${42 + rand() * 25},${20 + rand() * 15},${0.18 + rand() * 0.35})`);
    g.addColorStop(1, 'rgba(70,35,18,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function drawScratches(ctx, w, h, rand, count = 34) {
  for (let i = 0; i < count; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const len = 4 + rand() * 40;
    ctx.strokeStyle = `rgba(${190 + rand() * 40},${195 + rand() * 35},${200 + rand() * 30},${0.05 + rand() * 0.14})`;
    ctx.lineWidth = 0.5 + rand();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len * (rand() - 0.5), y + len * (rand() - 0.5));
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- ground
export function asphaltTextures(repeat = 20) {
  const size = 1024;
  const rand = mulberry32(11);
  const map = canvasTexture(size, size, (ctx, w, h) => {
    ctx.fillStyle = '#181d23';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 16000; i++) {
      const g = 24 + rand() * 62;
      const blue = 2 + rand() * 8;
      ctx.fillStyle = `rgba(${g},${g + 2},${g + blue},${0.16 + rand() * 0.42})`;
      const s = 0.5 + rand() * 3.2;
      ctx.fillRect(rand() * w, rand() * h, s, s);
    }
    // tar seams and patched repairs
    for (let i = 0; i < 9; i++) {
      ctx.strokeStyle = `rgba(8,10,13,${0.35 + rand() * 0.4})`;
      ctx.lineWidth = 2 + rand() * 7;
      ctx.beginPath();
      let x = rand() * w;
      let y = rand() * h;
      ctx.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (rand() - 0.5) * 120;
        y += (rand() - 0.5) * 120;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // hairline cracks
    for (let i = 0; i < 22; i++) {
      ctx.strokeStyle = `rgba(70,76,84,${0.12 + rand() * 0.16})`;
      ctx.lineWidth = 0.7 + rand() * 1.2;
      ctx.beginPath();
      let x = rand() * w;
      let y = rand() * h;
      ctx.moveTo(x, y);
      for (let k = 0; k < 8; k++) {
        x += (rand() - 0.5) * 42;
        y += (rand() - 0.5) * 42;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // wet patches / oil
    for (let i = 0; i < 26; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const rx = 16 + rand() * 90;
      const ry = 8 + rand() * 46;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
      g.addColorStop(0, `rgba(4,7,10,${0.2 + rand() * 0.35})`);
      g.addColorStop(1, 'rgba(4,7,10,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    // faded paint scuffs
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = '#c8b98f';
    for (let i = 0; i < 4; i++) {
      ctx.lineWidth = 3 + rand() * 5;
      ctx.beginPath();
      ctx.moveTo(rand() * w, rand() * h);
      ctx.lineTo(rand() * w, rand() * h);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
  const normalMap = normalTexture(512, 12, 2.6);
  const roughnessMap = roughnessTexture(size, 19, 0.72, 0.32, 1);
  setRepeat(map, repeat, repeat);
  setRepeat(normalMap, repeat, repeat);
  setRepeat(roughnessMap, repeat, repeat);
  return { map, normalMap, roughnessMap };
}

// ---------------------------------------------------------------- concrete
export function concreteTextures(seed = 77, tint = '#343a41', repeat = 3) {
  const rand = mulberry32(seed);
  const size = 512;
  const map = canvasTexture(size, size, (ctx, w, h) => {
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 4200; i++) {
      const g = 38 + rand() * 46;
      ctx.fillStyle = `rgba(${g},${g + 3},${g + 6},${0.12 + rand() * 0.34})`;
      const s = 0.6 + rand() * 3.4;
      ctx.fillRect(rand() * w, rand() * h, s, s);
    }
    // formwork panel lines
    ctx.strokeStyle = 'rgba(16,19,23,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    // water streaks
    for (let i = 0; i < 18; i++) {
      const x = rand() * w;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, `rgba(8,10,13,${0.08 + rand() * 0.18})`);
      g.addColorStop(1, 'rgba(8,10,13,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 1 + rand() * 7, h);
    }
    // chipped corners
    for (let i = 0; i < 22; i++) {
      ctx.fillStyle = `rgba(12,15,18,${0.25 + rand() * 0.3})`;
      ctx.beginPath();
      ctx.arc(rand() * w, rand() * h, 1 + rand() * 6, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const normalMap = normalTexture(512, seed + 1, 1.5);
  const roughnessMap = roughnessTexture(size, seed + 2, 0.86, 0.2);
  setRepeat(map, repeat, repeat);
  setRepeat(normalMap, repeat, repeat);
  setRepeat(roughnessMap, repeat, repeat);
  return { map, normalMap, roughnessMap };
}

// ---------------------------------------------------------------- containers
export function containerTextures(base, seed = 9, repeat = 2) {
  const rand = mulberry32(seed);
  const size = 512;
  const map = canvasTexture(size, size, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    // corrugation
    for (let x = 0; x < w; x += 26) {
      ctx.fillStyle = 'rgba(0,0,0,0.26)';
      ctx.fillRect(x, 0, 5, h);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x + 5, 0, 2, h);
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      ctx.fillRect(x + 17, 0, 3, h);
    }
    // top and bottom rails
    ctx.fillStyle = 'rgba(8,11,14,0.5)';
    ctx.fillRect(0, 0, w, 22);
    ctx.fillRect(0, h - 30, w, 30);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, 22, w, 2);
    // grime and rust
    drawRust(ctx, w, h, rand, 52);
    for (let i = 0; i < 46; i++) {
      ctx.fillStyle = `rgba(10,13,16,${0.08 + rand() * 0.22})`;
      ctx.fillRect(rand() * w, rand() * h, 2 + rand() * 30, 1 + rand() * 7);
    }
    drawScratches(ctx, w, h, rand, 55);
    // stencils
    ctx.fillStyle = 'rgba(236,240,242,0.5)';
    ctx.font = 'bold 34px monospace';
    ctx.fillText('C17', 34, 78);
    ctx.font = '15px monospace';
    ctx.fillStyle = 'rgba(255,157,46,0.55)';
    ctx.fillText('SECTOR 9 / 04', 34, 104);
    ctx.fillStyle = 'rgba(236,240,242,0.3)';
    ctx.font = '13px monospace';
    ctx.fillText('COMBINE LOGISTICS', 34, h - 50);
    ctx.fillStyle = 'rgba(255,157,46,0.45)';
    ctx.fillRect(34, h - 42, 96, 3);
  });
  const normalMap = normalTexture(512, seed + 4, 2.2, 19);
  const roughnessMap = roughnessTexture(size, seed + 5, 0.58, 0.3, 0.4);
  setRepeat(map, repeat, 1);
  setRepeat(normalMap, repeat, 1);
  setRepeat(roughnessMap, repeat, 1);
  return { map, normalMap, roughnessMap };
}

export function barrelTextures(accent = '#ff9d2e', seed = 31, repeat = 2) {
  const rand = mulberry32(seed);
  const size = 512;
  const map = canvasTexture(size, size, (ctx, w, h) => {
    ctx.fillStyle = '#29323a';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 54) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(0, y, w, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(0, y + 12, w, 3);
    }
    // pressed ribs
    for (let y = 0; y < h; y += 108) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(0, y + 44, w, 4);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, y + 48, w, 4);
    }
    ctx.fillStyle = accent;
    ctx.fillRect(0, 176, w, 26);
    ctx.fillRect(0, 292, w, 10);
    ctx.fillStyle = 'rgba(8,10,13,0.84)';
    ctx.fillRect(0, 202, w, 82);
    ctx.fillStyle = accent;
    ctx.font = 'bold 44px monospace';
    ctx.fillText('λ', 36, 264);
    ctx.font = '24px monospace';
    ctx.fillText('FLAMMABLE', 98, 250);
    ctx.font = '15px monospace';
    ctx.fillStyle = 'rgba(236,240,242,0.55)';
    ctx.fillText('C17 / 04', 98, 274);
    drawRust(ctx, w, h, rand, 46);
    drawScratches(ctx, w, h, rand, 30);
  });
  const normalMap = normalTexture(512, seed + 3, 2.0, 8);
  const roughnessMap = roughnessTexture(size, seed + 4, 0.5, 0.32, 0.2);
  setRepeat(map, repeat, 1);
  setRepeat(normalMap, repeat, 1);
  setRepeat(roughnessMap, repeat, 1);
  return { map, normalMap, roughnessMap };
}

// ---------------------------------------------------------------- crate
export function crateTextures(seed = 31, repeat = 1) {
  const rand = mulberry32(seed);
  const size = 512;
  const map = canvasTexture(size, size, (ctx, w, h) => {
    ctx.fillStyle = '#433526';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 62) {
      const shade = 48 + rand() * 20;
      ctx.fillStyle = `rgb(${shade + 20},${shade + 6},${shade - 10})`;
      ctx.fillRect(0, y + 3, w, 56);
      // wood grain
      for (let i = 0; i < 26; i++) {
        ctx.strokeStyle = `rgba(${28 + rand() * 18},${20 + rand() * 12},${12 + rand() * 10},${0.18 + rand() * 0.25})`;
        ctx.lineWidth = 0.5 + rand() * 1.6;
        ctx.beginPath();
        const gy = y + 6 + rand() * 48;
        ctx.moveTo(0, gy);
        for (let x = 0; x <= w; x += 26) {
          ctx.lineTo(x, gy + Math.sin(x * 0.03 + rand() * 4) * 2.5);
        }
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, y, w, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(0, y + 59, w, 2);
    }
    // outer frame
    ctx.strokeStyle = '#1b1510';
    ctx.lineWidth = 24;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.strokeStyle = 'rgba(255,157,46,0.48)';
    ctx.lineWidth = 4;
    ctx.strokeRect(44, 44, w - 88, h - 88);
    ctx.fillStyle = 'rgba(255,157,46,0.7)';
    ctx.font = 'bold 58px monospace';
    ctx.fillText('λ', 218, 244);
    ctx.font = '20px monospace';
    ctx.fillText('RESISTANCE', 174, 284);
    ctx.font = '17px monospace';
    ctx.fillText('C17 // 09', 196, 310);
    drawScratches(ctx, w, h, rand, 60);
    drawRust(ctx, w, h, rand, 26);
  });
  const normalMap = normalTexture(512, seed + 2, 1.7, 8);
  const roughnessMap = roughnessTexture(size, seed + 3, 0.82, 0.24);
  setRepeat(map, repeat, repeat);
  setRepeat(normalMap, repeat, repeat);
  setRepeat(roughnessMap, repeat, repeat);
  return { map, normalMap, roughnessMap };
}

// ---------------------------------------------------------------- buildings
export function windowTextures(seed) {
  const width = 512;
  const height = 1024;
  const rand = mulberry32(seed);
  const cols = 8;
  const rows = 20;
  const color = document.createElement('canvas');
  color.width = width;
  color.height = height;
  const c = color.getContext('2d');
  const emit = document.createElement('canvas');
  emit.width = width;
  emit.height = height;
  const e = emit.getContext('2d');
  const rough = document.createElement('canvas');
  rough.width = width;
  rough.height = height;
  const r = rough.getContext('2d');

  c.fillStyle = '#262e36';
  c.fillRect(0, 0, width, height);
  e.fillStyle = '#000';
  e.fillRect(0, 0, width, height);
  r.fillStyle = '#dcdcdc';
  r.fillRect(0, 0, width, height);

  // concrete grain and grime
  for (let i = 0; i < 5200; i++) {
    const g = 24 + rand() * 34;
    c.fillStyle = `rgba(${g},${g + 2},${g + 5},${0.12 + rand() * 0.28})`;
    c.fillRect(rand() * width, rand() * height, 1 + rand() * 3, 1 + rand() * 3);
  }
  for (let i = 0; i < 30; i++) {
    const g = c.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, `rgba(8,10,13,${0.05 + rand() * 0.12})`);
    g.addColorStop(1, 'rgba(8,10,13,0)');
    c.fillStyle = g;
    c.fillRect(rand() * width, 0, 1 + rand() * 10, height);
  }

  const padX = 22;
  const padY = 26;
  const cw = (width - padX * 2) / cols;
  const ch = (height - padY * 2) / rows;

  for (let row = 0; row < rows; row++) {
    // floor slab / spandrel band
    const bandY = padY + row * ch;
    c.fillStyle = row % 4 === 0 ? 'rgba(46,52,59,0.9)' : 'rgba(27,32,38,0.9)';
    c.fillRect(0, bandY, width, ch * 0.16);
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.fillRect(0, bandY + ch * 0.16, width, 2);

    for (let col = 0; col < cols; col++) {
      const ww = cw * 0.54;
      const hh = ch * 0.42;
      const x = padX + col * cw + (cw - ww) / 2;
      const y = bandY + ch * 0.34;
      const lit = rand() > 0.88;
      const warm = rand() > 0.38;
      const brightness = 0.18 + rand() * 0.32;

      // frame
      c.fillStyle = 'rgba(9,12,16,0.95)';
      c.fillRect(x - 3, y - 3, ww + 6, hh + 6);
      // glass
      const glass = c.createLinearGradient(x, y, x + ww, y + hh);
      if (lit) {
        glass.addColorStop(0, warm ? `rgba(255,206,150,${brightness})` : `rgba(178,222,255,${brightness})`);
        glass.addColorStop(1, warm ? `rgba(190,112,56,${brightness * 0.8})` : `rgba(84,136,180,${brightness * 0.8})`);
      } else {
        glass.addColorStop(0, 'rgba(18,25,34,0.95)');
        glass.addColorStop(0.45, 'rgba(28,39,52,0.95)');
        glass.addColorStop(1, 'rgba(11,16,22,0.95)');
      }
      c.fillStyle = glass;
      c.fillRect(x, y, ww, hh);
      // reflection streak on dark glass
      if (!lit) {
        c.fillStyle = `rgba(110,145,175,${0.06 + rand() * 0.09})`;
        c.beginPath();
        c.moveTo(x, y + hh * 0.1);
        c.lineTo(x + ww * 0.7, y);
        c.lineTo(x + ww, y);
        c.lineTo(x + ww * 0.3, y + hh);
        c.lineTo(x, y + hh);
        c.closePath();
        c.fill();
      }
      // mullions
      c.fillStyle = 'rgba(8,10,13,0.9)';
      c.fillRect(x + ww / 2 - 1, y, 2, hh);
      if (rand() > 0.55) c.fillRect(x, y + hh * 0.5 - 1, ww, 2);

      if (lit) {
        e.fillStyle = warm
          ? `rgba(255,${205 + rand() * 35},${160 + rand() * 35},${brightness})`
          : `rgba(${150 + rand() * 45},${205 + rand() * 35},255,${brightness * 0.9})`;
        e.fillRect(x, y, ww, hh);
        if (rand() > 0.72) {
          e.fillStyle = 'rgba(0,0,0,0.75)';
          e.fillRect(x + ww * (0.25 + rand() * 0.4), y, ww * 0.18, hh);
        }
        r.fillStyle = 'rgba(70,70,70,0.8)';
        r.fillRect(x, y, ww, hh);
      } else {
        r.fillStyle = 'rgba(58,58,58,0.9)';
        r.fillRect(x, y, ww, hh);
      }
    }
  }

  // vertical pilasters
  for (let col = 0; col <= cols; col++) {
    c.fillStyle = 'rgba(13,17,21,0.65)';
    c.fillRect(padX + col * cw - 3, 0, 3, height);
  }
  c.fillStyle = 'rgba(8,11,15,0.5)';
  for (let i = 0; i < 16; i++) c.fillRect(0, rand() * height, width, 1 + rand() * 3);

  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const emissive = new THREE.CanvasTexture(emit);
  emissive.colorSpace = THREE.SRGBColorSpace;
  emissive.anisotropy = 8;
  emissive.wrapS = emissive.wrapT = THREE.RepeatWrapping;
  const roughness = new THREE.CanvasTexture(rough);
  roughness.anisotropy = 8;
  roughness.wrapS = roughness.wrapT = THREE.RepeatWrapping;
  return { map, emissive, roughness };
}

// ---------------------------------------------------------------- environment
export function environmentTexture() {
  return canvasTexture(1024, 512, (ctx, w, h) => {
    const rand = mulberry32(204);
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#03060b');
    sky.addColorStop(0.42, '#0b1420');
    sky.addColorStop(0.56, '#1d2936');
    sky.addColorStop(0.62, '#40281d');
    sky.addColorStop(0.7, '#121820');
    sky.addColorStop(1, '#05070a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // warm city glow
    let g = ctx.createRadialGradient(w * 0.28, h * 0.58, 8, w * 0.28, h * 0.58, w * 0.34);
    g.addColorStop(0, 'rgba(255,142,66,0.5)');
    g.addColorStop(0.45, 'rgba(220,90,35,0.15)');
    g.addColorStop(1, 'rgba(180,70,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // cool glow
    g = ctx.createRadialGradient(w * 0.74, h * 0.6, 8, w * 0.74, h * 0.6, w * 0.3);
    g.addColorStop(0, 'rgba(92,178,235,0.38)');
    g.addColorStop(1, 'rgba(60,130,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // distant lit windows
    for (let i = 0; i < 420; i++) {
      const x = rand() * w;
      const y = h * 0.53 + rand() * h * 0.17;
      const warm = rand() > 0.4;
      ctx.fillStyle = warm
        ? `rgba(255,${170 + rand() * 60},${90 + rand() * 50},${0.25 + rand() * 0.5})`
        : `rgba(${120 + rand() * 60},${190 + rand() * 50},255,${0.2 + rand() * 0.4})`;
      ctx.fillRect(x, y, 1 + rand() * 3, 1 + rand() * 3);
    }

    // cloud band
    for (let i = 0; i < 30; i++) {
      const x = rand() * w;
      const y = h * (0.32 + rand() * 0.22);
      const rx = 30 + rand() * 120;
      const ry = 4 + rand() * 16;
      const cg = ctx.createRadialGradient(x, y, 0, x, y, rx);
      cg.addColorStop(0, `rgba(${70 + rand() * 30},${72 + rand() * 26},${82 + rand() * 20},${0.05 + rand() * 0.08})`);
      cg.addColorStop(1, 'rgba(40,45,55,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

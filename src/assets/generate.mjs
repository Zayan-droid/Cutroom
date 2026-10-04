// Regenerate the offline sample clips with Node and ffmpeg on PATH.
// Run from the repository root:
//   node src/assets/generate.mjs                  all 24 clips, rendered in parallel
//   node src/assets/generate.mjs ad-3 social-1    only the named scenes (draft + render)
//   node src/assets/generate.mjs --preview <dir>  one PNG still per scene, for review
//
// Every frame is original procedural imagery (no downloaded media, fonts, or
// audio). All motion is periodic over the clip, so each 3-second clip loops.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cpus } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const FPS = 24;
const FRAMES = 72; // 3 s; every motion completes a whole cycle in this span
const SIZES = {
  social: { render: [720, 1280], draft: [180, 320] },
  ad: { render: [864, 1080], draft: [256, 320] },
  cinematic: { render: [1280, 720], draft: [320, 180] },
};

// ── Math, color, noise ───────────────────────────────────────────────────────

const TAU = Math.PI * 2;
const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
/** Smoothstep that also works with e0 > e1 (a falling edge). */
const smooth = (e0, e1, v) => {
  const t = clamp((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const gauss = (d, width) => Math.exp(-(d * d) / (width * width));

function hash(ix, iy, seed) {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise(x, y, seed = 0) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x, y, octaves = 4, seed = 0) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * f, y * f, seed + i * 101);
    norm += amp;
    amp *= 0.5;
    f *= 2.01;
  }
  return sum / norm;
}

/** Precompute fn on a grid over [x0,x1]×[y0,y1]; returns a bilinear sampler. */
function field2(fn, [x0, x1, y0, y1], nx, ny) {
  const data = new Float32Array(nx * ny);
  const sx = (x1 - x0) / (nx - 1);
  const sy = (y1 - y0) / (ny - 1);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) data[j * nx + i] = fn(x0 + i * sx, y0 + j * sy);
  return (x, y) => {
    const fx = clamp((x - x0) / sx, 0, nx - 1.001);
    const fy = clamp((y - y0) / sy, 0, ny - 1.001);
    const i = fx | 0;
    const j = fy | 0;
    const tx = fx - i;
    const ty = fy - j;
    const k = j * nx + i;
    const a = data[k];
    const b = data[k + 1];
    const c = data[k + nx];
    const d = data[k + nx + 1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

/** Precompute a 1-D profile over [x0,x1]; returns a linear sampler. */
function field1(fn, x0, x1, n) {
  const data = new Float32Array(n);
  const s = (x1 - x0) / (n - 1);
  for (let i = 0; i < n; i++) data[i] = fn(x0 + i * s);
  return (x) => {
    const f = clamp((x - x0) / s, 0, n - 1.001);
    const i = f | 0;
    return data[i] + (data[i + 1] - data[i]) * (f - i);
  };
}

/** Coverage of a shape with signed distance d (negative inside), antialiased over ~1px. */
const cover = (d, px) => smooth(px, -px, d);

/** Distance to a rounded box centered at (cx, cy) with half-size (hw, hh) and radius r. */
function sdBox(x, y, cx, cy, hw, hh, r = 0) {
  const qx = Math.abs(x - cx) - hw + r;
  const qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Normalized distance to an ellipse: <1 inside. */
const ellipse = (x, y, cx, cy, rx, ry) => Math.hypot((x - cx) / rx, (y - cy) / ry);

/**
 * Lambert-ish shading for an upright cylinder seen from the front, lit from the
 * front-left. `nx` is the horizontal position across the cylinder in [-1, 1].
 */
function cylinderLight(nx, lightX = -0.55) {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx));
  const lz = Math.sqrt(1 - lightX * lightX);
  return Math.max(0, nx * lightX + nz * lz);
}

// Shared studio backdrop: a seamless wall-to-floor sweep with a soft key light.
function studio(X, Y, wall, floor, sweepY, A) {
  const c = mix(wall, floor, smooth(sweepY - 0.05, sweepY + 0.07, Y));
  const key = 1 + 0.07 * gauss(Math.hypot(X - A * 0.22, Y - 0.18), 0.55) - 0.05 * smooth(0.5, 1, Y);
  return mul(c, key);
}

// ── Cinematic 16:9 — location plates ─────────────────────────────────────────

function layeredPlate(w, h, { sky, layers, clouds, mist }) {
  const A = w / h;
  const px = 1 / h;
  const box = [-0.15, A + 0.15, -0.15, 1.15];
  const prepared = layers.map((l) => ({
    ...l,
    color: hex(l.color),
    low: hex(l.low),
    edge: field1((x) => l.profile(x), box[0], box[1], w * 2),
    tex: field2((x, y) => fbm(x * l.texScale, y * l.texScale, 3, l.seed + 40) - 0.5, box, w, h),
  }));
  const cloudField = field2((x, y) => fbm(x * clouds.sx, y * clouds.sy, 5, clouds.seed), box, w >> 1, h >> 1);
  const top = hex(sky[0]);
  const horizon = hex(sky[1]);
  const cloudDark = hex(clouds.dark);
  const cloudLight = hex(clouds.light);
  const haze = hex(mist.color);
  let drift = 0;
  let lift = 0;
  return {
    frame(ph) {
      drift = Math.sin(ph);
      lift = Math.cos(ph);
    },
    pixel(X, Y) {
      let r = 0;
      let g = 0;
      let b = 0;
      let T = 1;
      // Front-to-back: stop once the nearer layers fully cover the pixel.
      for (let i = prepared.length - 1; i >= 0 && T > 0.003; i--) {
        const l = prepared[i];
        const lx = X + 0.016 * l.depth * drift;
        const ly = Y - 0.007 * l.depth * lift;
        const e = l.edge(lx);
        const blur = px * (1 + (1 - l.depth) * 1.5);
        const a = smooth(e - blur, e + blur, ly);
        if (a <= 0) continue;
        let c = l.shade ? l.shade(lx, ly, e, l) : mix(l.color, l.low, clamp((ly - e) * l.fall));
        c = mul(c, 1 + l.tex(lx, ly) * l.texAmount);
        c = mix(c, haze, (1 - l.depth) * mist.amount * Math.exp(-(ly - e) * 22));
        const k = a * T;
        r += c[0] * k;
        g += c[1] * k;
        b += c[2] * k;
        T *= 1 - a;
      }
      if (T > 0.003) {
        let s = mix(top, horizon, smooth(0, sky[2], Y));
        const cl = cloudField(X + 0.008 * drift, Y + 0.004 * lift);
        const fade = 1 - smooth(clouds.until * 0.4, clouds.until, Y);
        s = mix(s, cloudDark, smooth(0.5, 0.74, cl) * fade * clouds.amount);
        s = mix(s, cloudLight, smooth(0.62, 0.8, cloudField(X * 1.7 + 3, Y * 1.3)) * fade * clouds.amount * 0.6);
        r += s[0] * T;
        g += s[1] * T;
        b += s[2] * T;
      }
      const m = gauss(Y - mist.at, mist.width) * mist.band;
      return [r + (haze[0] - r) * m, g + (haze[1] - g) * m, b + (haze[2] - b) * m];
    },
  };
}

const ridge = (base, amp, freq, seed, oct = 5) => (x) => base - amp * fbm(x * freq, seed * 0.37, oct, seed);

/** Sharp-crested profile (dunes, snowy peaks): 1 at crests, 0 in troughs. */
const crest = (freq, seed, sharp = 0.7) => (x) =>
  1 - Math.abs(Math.sin(x * freq + 1.4 * fbm(x * freq * 0.35, seed, 3, seed))) ** sharp;

/** Conifer tops: a sawtooth of jittered triangles. */
const trees = (base, height, freq, seed) => (x) => {
  const u = x * freq;
  const cell = Math.floor(u);
  const local = u - cell - 0.5 + (hash(cell, 1, seed) - 0.5) * 0.3;
  const tall = height * (0.55 + 0.45 * hash(cell, 2, seed));
  return base - tall * Math.max(0, 1 - Math.abs(local) * 2.1) - 0.012 * fbm(x * 8, 0, 3, seed);
};

/** Ridged multifractal peaks for mountain ranges. */
const peaks = (base, amp, freq, seed) => (x) => {
  let v = 0;
  let a = 1;
  let f = freq;
  let norm = 0;
  for (let i = 0; i < 5; i++) {
    const n = 1 - Math.abs(noise(x * f, i * 3.1, seed + i) * 2 - 1);
    v += a * n * n;
    norm += a;
    a *= 0.5;
    f *= 2.1;
  }
  return base - amp * (v / norm);
};

/**
 * Slope-lit shading for crested layers: one face to the light, one in shade.
 * The face boundary is sheared so it runs down from each crest at an angle,
 * the way a lit ridge reads, instead of dropping straight down.
 */
const slopeShade = (lit, shade, fall, { shear = 0.9, rock, rockAmount = 0 } = {}) => {
  const L = hex(lit);
  const S = hex(shade);
  const K = rock ? hex(rock) : null;
  return (x, y, e, l) => {
    const xs = x - (y - e) * shear;
    const s = l.edge(xs + 0.004) - l.edge(xs - 0.004);
    const face = smooth(-0.0015, 0.0015, s);
    let c = mul(mix(L, S, face), 1 - clamp((y - e) * fall) * 0.35);
    if (K) {
      const streak = smooth(0.58, 0.72, noise(xs * 34, y * 7, l.seed + 9)) * smooth(0.002, 0.012, Math.abs(s));
      c = mix(c, K, streak * rockAmount);
    }
    return c;
  };
};

const highland = (w, h) =>
  layeredPlate(w, h, {
    sky: ['#B5BEC2', '#E0E1DB', 0.62],
    clouds: { sx: 1.5, sy: 5, seed: 7, dark: '#A0A9AD', light: '#ECECE7', amount: 0.6, until: 0.55 },
    mist: { color: '#D9DBD5', amount: 0.32, at: 0.63, width: 0.065, band: 0.12 },
    layers: [
      { profile: peaks(0.5, 0.16, 1.2, 3), color: '#A8B2B7', low: '#95A1A6', fall: 1.2, depth: 0.12, texScale: 10, texAmount: 0.04, seed: 3 },
      {
        profile: (x) => ridge(0.6, 0.1, 1.7, 5)(x) - 0.05 * smooth(0.7, 1.7, x), color: '#8A9792', low: '#73807A',
        fall: 1.2, depth: 0.3, texScale: 11, texAmount: 0.06, seed: 5,
      },
      {
        profile: (x) => ridge(0.71, 0.1, 2.3, 8)(x) + 0.05 * smooth(0, 1.3, x) - 0.03, color: '#66735E', low: '#46503F',
        fall: 1.4, depth: 0.6, texScale: 13, texAmount: 0.12, seed: 8,
      },
      {
        profile: (x) => ridge(0.88, 0.07, 3.1, 13)(x) - 0.1 * smooth(0.95, 1.85, x), color: '#4D533D', low: '#2A2E23',
        fall: 1.6, depth: 1, texScale: 16, texAmount: 0.2, seed: 13,
      },
    ],
  });

function coast(w, h) {
  const A = w / h;
  const px = 1 / h;
  const H = 0.5;
  const box = [-0.15, A + 0.15, -0.15, 1.15];
  const cirrus = field2((x, y) => fbm(x * 1.3, y * 15, 5, 21), box, w >> 1, h >> 1);
  const glint = field2((x, y) => noise(x * 120, y * 420, 22), box, w, h);
  const strata = field2((x, y) => fbm(x * 5, y * 18, 4, 24), box, w, h);
  const grain = field2((x, y) => fbm(x * 90, y * 90, 2, 26) - 0.5, box, w, h);
  const cliffTop = field1(
    (x) => H - 0.12 * smooth(1.02, 1.4, x) - 0.03 * fbm(x * 4.2, 0.5, 4, 23) * smooth(1, 1.25, x),
    box[0], box[1], w * 2,
  );
  const cliffLeft = field1((y) => 1.08 - 0.12 * smooth(H - 0.08, 1, y) + 0.025 * (fbm(y * 9, 3, 3, 27) - 0.5), box[2], box[3], h * 2);
  const dune = field1((x) => 0.87 + 0.03 * fbm(x * 2.4, 0.3, 4, 25) - 0.07 * smooth(0.9, 1.6, x), box[0], box[1], w * 2);
  const tuft = (x) => {
    const u = x * 70;
    const cell = Math.floor(u);
    const local = Math.abs(u - cell - 0.5) * 2;
    return 0.028 * (0.4 + 0.6 * hash(cell, 3, 28)) * Math.max(0, 1 - local) ** 2.2;
  };
  const skyTop = hex('#AFC2CD');
  const skyLow = hex('#E3E5DF');
  const seaFar = hex('#A2B3B6');
  const seaNear = hex('#5E7781');
  const foam = hex('#ECEEEA');
  const rock = hex('#706656');
  const rockDark = hex('#4F473D');
  const turf = hex('#7C7D58');
  const sand = hex('#CDBB97');
  const sandShade = hex('#B19F7E');
  const grass = hex('#8A895F');
  let z = 1;
  let dx = 0;
  let dy = 0;
  let ph = 0;
  return {
    frame(p) {
      ph = p;
      z = 1 + 0.02 * (1 - Math.cos(p)) / 2;
      dx = 0.005 * Math.sin(p);
      dy = 0.003 * Math.cos(p);
    },
    pixel(X0, Y0) {
      const X = (X0 - A / 2) / z + A / 2 + dx;
      const Y = (Y0 - 0.5) / z + 0.5 + dy;
      // Sky with high, thin cloud.
      let sky = mix(skyTop, skyLow, smooth(0, H, Y));
      sky = mix(sky, foam, smooth(0.56, 0.75, cirrus(X, Y)) * 0.45 * (1 - smooth(0.2, H, Y)));
      // Sea: darker toward the viewer, with glints and slow swell.
      const depth = clamp((Y - H) / (1 - H));
      let sea = mix(seaFar, seaNear, smooth(0, 0.8, depth));
      sea = mul(sea, 1 + 0.035 * Math.sin((Y - H) * 140 + X * 3 + ph));
      const g = glint(X + 0.004 * Math.cos(ph), Y + 0.001 * Math.sin(ph));
      sea = mix(sea, foam, smooth(0.82, 0.9, g) * (1 - depth) ** 2 * 0.35);
      let c = mix(sky, sea, smooth(H - px, H + px, Y));
      // Headland on the right, rising out of the sea.
      const top = cliffTop(X);
      const inCliff = smooth(top - px, top + px, Y) * smooth(cliffLeft(Y) - px, cliffLeft(Y) + px, X);
      if (inCliff > 0) {
        // Sedimentary layers: horizontal bands, warped and weathered.
        const n = strata(X, Y);
        const band = 0.5 + 0.5 * Math.sin(Y * 150 + n * 9);
        let rc = mix(rock, rockDark, clamp(band * 0.45 + (n - 0.5) * 0.9 + 0.2));
        rc = mix(rc, turf, smooth(0.018, 0.004, Y - top));
        rc = mul(rc, 1 - 0.18 * smooth(0.6, 1, Y));
        c = mix(c, rc, inCliff);
        // Surf where the rock meets the sea.
        const surf = gauss(X - cliffLeft(Y), 0.012) * smooth(H, H + 0.04, Y) * (0.5 + 0.5 * Math.sin(ph * 2 + Y * 40));
        c = mix(c, foam, surf * 0.55);
      }
      // Foreground dune with beach grass that leans in the wind.
      const sway = 0.004 * Math.sin(ph + X * 6);
      const d = dune(X);
      const grassTop = d - tuft(X + sway * (d - Y) * 25);
      const inGrass = smooth(grassTop - px, grassTop + px, Y) * (1 - smooth(d - px, d + px, Y));
      if (inGrass > 0) c = mix(c, mul(grass, 0.9 + 0.2 * hash(Math.floor(X * 70), 4, 29)), inGrass);
      const inDune = smooth(d - px, d + px, Y);
      if (inDune > 0) {
        let sc = mix(sand, sandShade, smooth(0, 0.12, Y - d));
        sc = mul(sc, 1 + grain(X, Y) * 0.08);
        c = mix(c, sc, inDune);
      }
      return c;
    },
  };
}

const dunes = (w, h) =>
  layeredPlate(w, h, {
    sky: ['#C3D3DD', '#F0EBE1', 0.44],
    clouds: { sx: 1.2, sy: 7, seed: 31, dark: '#D3DCE1', light: '#F4F3EE', amount: 0.35, until: 0.4 },
    mist: { color: '#EFE6D6', amount: 0.45, at: 0.45, width: 0.05, band: 0.18 },
    layers: [
      { profile: ridge(0.45, 0.04, 2.2, 32), color: '#D6C3A3', low: '#CDB898', fall: 1, depth: 0.12, texScale: 8, texAmount: 0.02, seed: 32 },
      {
        profile: (x) => 0.55 - 0.07 * crest(5.5, 33)(x), color: '#E0C49A', low: '#C9A877', fall: 1, depth: 0.35,
        texScale: 30, texAmount: 0.03, seed: 33, shade: slopeShade('#E6CBA0', '#C9A475', 2, { shear: 1.3 }),
      },
      {
        profile: (x) => 0.68 - 0.1 * crest(3.6, 34)(x), color: '#E2C496', low: '#C49E6B', fall: 1, depth: 0.65,
        texScale: 60, texAmount: 0.04, seed: 34, shade: slopeShade('#E8CB9D', '#C0976A', 1.6, { shear: 1.2 }),
      },
      {
        profile: (x) => 0.86 - 0.12 * crest(2.4, 35)(x), color: '#E4C597', low: '#BF975F', fall: 1, depth: 1,
        texScale: 110, texAmount: 0.05, seed: 35, shade: slopeShade('#EBCD9E', '#B98F61', 1.2, { shear: 1.1 }),
      },
    ],
  });

const winter = (w, h) =>
  layeredPlate(w, h, {
    sky: ['#CCD7DF', '#EFF0ED', 0.5],
    clouds: { sx: 1.1, sy: 4, seed: 41, dark: '#C4CDD4', light: '#F5F6F4', amount: 0.45, until: 0.45 },
    mist: { color: '#E9ECEC', amount: 0.4, at: 0.6, width: 0.06, band: 0.14 },
    layers: [
      {
        profile: peaks(0.52, 0.2, 1.6, 42), color: '#EEF1F3', low: '#DCE2E7', fall: 1, depth: 0.12, texScale: 14,
        texAmount: 0.04, seed: 42, shade: slopeShade('#F1F3F4', '#B3BFCA', 1.5, { shear: 0.7, rock: '#848E97', rockAmount: 0.55 }),
      },
      { profile: ridge(0.6, 0.06, 2.6, 43), color: '#E6EAED', low: '#D3DAE0', fall: 1.2, depth: 0.35, texScale: 10, texAmount: 0.03, seed: 43 },
      { profile: trees(0.675, 0.04, 85, 44), color: '#4C5952', low: '#43504A', fall: 1, depth: 0.55, texScale: 40, texAmount: 0.05, seed: 44 },
      { profile: trees(0.79, 0.11, 26, 45), color: '#2B352F', low: '#222A25', fall: 1, depth: 0.85, texScale: 50, texAmount: 0.06, seed: 45 },
      { profile: ridge(0.86, 0.025, 2, 46), color: '#F2F4F5', low: '#DDE4EA', fall: 0.9, depth: 1, texScale: 6, texAmount: 0.04, seed: 46 },
    ],
  });

// ── Product ad 4:5 — studio shots ────────────────────────────────────────────

function mug(w, h) {
  const A = w / h;
  const px = 1 / h;
  const wall = hex('#DAD7D1');
  const floor = hex('#CBC7BF');
  const glaze = hex('#EEEAE2');
  const inside = hex('#BBB3A6');
  const cx = A / 2;
  const R = 0.135;
  const top = 0.43;
  const bottom = 0.7;
  const ry = 0.032;
  let z = 1;
  let spec = 0;
  return {
    frame(ph) {
      z = 1 + 0.025 * (1 - Math.cos(ph)) / 2;
      spec = 0.07 * Math.sin(ph);
    },
    pixel(X0, Y0) {
      const X = (X0 - cx) / z + cx;
      const Y = (Y0 - 0.56) / z + 0.56;
      let c = studio(X, Y, wall, floor, 0.69, A);
      // Soft cast shadow to the right, then the contact shadow.
      c = mul(c, 1 - 0.16 * gauss(ellipse(X, Y, cx + 0.15, bottom - 0.004, 0.2, 0.03), 0.9));
      c = mul(c, 1 - 0.38 * gauss(ellipse(X, Y, cx, bottom + 0.004, R * 1.05, 0.024), 0.7));
      // Handle: an elliptical ring on the right.
      const hd = ellipse(X, Y, cx + R + 0.012, 0.56, 0.062, 0.078);
      const ring = Math.abs(hd - 1) * 0.07 - 0.012;
      const handle = cover(ring, px) * smooth(cx + R - 0.02, cx + R + 0.005, X);
      if (handle > 0) {
        const lit = 0.75 + 0.25 * Math.cos(Math.atan2(Y - 0.56, X - cx - R) + 2.2);
        c = mix(c, mul(glaze, lit * 0.95), handle);
      }
      // Body: an upright cylinder with a curved base.
      const nx = (X - cx) / R;
      if (Math.abs(nx) < 1.02) {
        const curve = ry * Math.sqrt(Math.max(0, 1 - nx * nx));
        const inBody = cover(Math.abs(X - cx) - R, px) * smooth(top - px, top + px, Y) * cover(Y - (bottom + curve), px);
        if (inBody > 0) {
          const n = clamp(nx, -1, 1);
          let bc = mul(glaze, 0.5 + 0.58 * cylinderLight(n));
          bc = add(bc, [1, 1, 1], 0.22 * gauss(n - (-0.38 + spec), 0.07));
          bc = mul(bc, 1 - 0.16 * smooth(bottom - 0.08, bottom + 0.02, Y));
          c = mix(c, bc, inBody);
        }
      }
      // Rim and the glazed interior.
      const rim = ellipse(X, Y, cx, top, R, ry);
      if (rim < 1.06) {
        const inner = ellipse(X, Y, cx, top + 0.002, R - 0.011, ry - 0.007);
        const back = mix(inside, mul(inside, 0.72), smooth(top - ry, top + ry, Y));
        c = mix(c, mul(glaze, 1.02), cover((rim - 1) * R, px));
        c = mix(c, back, cover((inner - 1) * (R - 0.011), px));
      }
      return c;
    },
  };
}

function bottle(w, h) {
  const A = w / h;
  const px = 1 / h;
  const box = [-0.1, A + 0.1, -0.1, 1.1];
  const concrete = field2((x, y) => fbm(x * 18, y * 18, 4, 51) - 0.5, box, w, h);
  const pores = field2((x, y) => smooth(0.93, 0.97, noise(x * 220, y * 220, 52)), box, w, h);
  const wall = hex('#E3DCCF');
  const floor = hex('#D6CEC0');
  const slab = hex('#BAB4AA');
  const slabTop = hex('#CFCAC1');
  const glassEdge = hex('#3F5848');
  const glassTint = hex('#7F9C87');
  const label = hex('#EFE9DD');
  const ink = hex('#3C3A36');
  const cork = hex('#B48F66');
  const cx = A / 2;
  const radius = (y) => {
    if (y > 0.33) return 0.098;
    if (y > 0.25) return 0.034 + 0.064 * smooth(0.25, 0.33, y);
    return y > 0.155 ? 0.034 : 0.038;
  };
  let spec = 0;
  let z = 1;
  return {
    frame(ph) {
      spec = 0.06 * Math.sin(ph);
      z = 1 + 0.02 * (1 - Math.cos(ph)) / 2;
    },
    pixel(X0, Y0) {
      const X = (X0 - cx) / z + cx;
      const Y = (Y0 - 0.5) / z + 0.5;
      let c = studio(X, Y, wall, floor, 0.66, A);
      // Concrete plinth.
      const onTop = cover(sdBox(X, Y, cx, 0.665, 0.26, 0.01), px);
      const onFront = cover(sdBox(X, Y, cx, 0.84, 0.26, 0.165), px);
      if (onFront > 0) {
        let pc = mul(slab, 1 + concrete(X, Y) * 0.12 - pores(X, Y) * 0.12);
        pc = mul(pc, 1 - 0.12 * smooth(0.7, 1, Y) + 0.05 * smooth(0.2, -0.2, X - cx));
        c = mix(c, pc, onFront);
      }
      if (onTop > 0) c = mix(c, mul(slabTop, 1 + concrete(X, Y) * 0.08), onTop);
      // Shadow of the bottle on the plinth top.
      c = mul(c, 1 - 0.3 * onTop * gauss(ellipse(X, Y, cx + 0.03, 0.664, 0.13, 0.012), 0.9));
      // Bottle: glass body, shoulder, neck, lip, cork.
      const R = radius(Y);
      const nx = (X - cx) / R;
      const inBottle = cover(Math.abs(X - cx) - R, px) * smooth(0.115 - px, 0.115 + px, Y) * cover(Y - 0.655, px);
      if (inBottle > 0) {
        const n = clamp(nx, -1, 1);
        const behind = studio(X, Y, wall, floor, 0.66, A);
        let gc = mix(glassEdge, mix(mul(behind, 0.88), glassTint, 0.55), (1 - n * n) * 0.85);
        gc = add(gc, [1, 1, 1], 0.5 * gauss(n - (-0.55 + spec), 0.06) + 0.25 * gauss(n - (0.72 + spec * 0.5), 0.025));
        if (Y > 0.43 && Y < 0.58) {
          // Paper label wrapped around the body; its print curves with the glass.
          const u = Math.asin(n) / (Math.PI / 2);
          let lc = mul(label, 0.55 + 0.5 * cylinderLight(n));
          const title = cover(sdBox(u, Y, 0, 0.475, 0.32, 0.005), px * 2);
          const line = cover(sdBox(u, Y, 0, 0.505, 0.45, 0.0022), px * 2) + cover(sdBox(u, Y, 0, 0.52, 0.38, 0.0022), px * 2);
          lc = mix(lc, ink, clamp(title * 0.85 + line * 0.55));
          gc = mix(gc, lc, smooth(0.43, 0.432, Y) * smooth(0.58, 0.578, Y));
        }
        if (Y < 0.15) gc = mul(cork, 0.6 + 0.5 * cylinderLight(n));
        c = mix(c, gc, inBottle);
      }
      return c;
    },
  };
}

function watch(w, h) {
  const A = w / h;
  const px = 1 / h;
  const box = [-0.2, A + 0.2, -0.2, 1.2];
  const cloud = field2((x, y) => fbm(x * 3, y * 3, 4, 61) - 0.5, box, w, h);
  const vein = field2((x, y) => Math.abs(Math.sin((x * 2.3 + y * 1.4) * TAU * 0.9 + 3.4 * fbm(x * 2.5, y * 2.5, 5, 62))), box, w, h);
  const fine = field2((x, y) => Math.abs(Math.sin((-x * 1.1 + y * 3) * TAU * 1.6 + 2.6 * fbm(x * 4 + 7, y * 4, 4, 63))), box, w, h);
  const leatherGrain = field2((x, y) => fbm(x * 150, y * 150, 2, 64) - 0.5, box, w, h);
  const marble = hex('#ECEAE6');
  const veinColor = hex('#A8A59F');
  const leather = hex('#7A5A41');
  const stitch = hex('#D8CBB4');
  const steel = hex('#C6C9CB');
  const dial = hex('#F2EFE7');
  const ink = hex('#2E2D2B');
  const second = hex('#9E4A30');
  const cx = A / 2;
  const cy = 0.5;
  const hands = [
    { angle: (305 / 360) * TAU, length: 0.095, width: 0.0048, color: ink },
    { angle: (60 / 360) * TAU, length: 0.145, width: 0.0034, color: ink },
    { angle: (252 / 360) * TAU, length: 0.158, width: 0.0011, color: second },
  ];
  const handDistance = (x, y, hand) => {
    // Hand points from the center toward the dial angle (clockwise from 12).
    const ux = Math.sin(hand.angle);
    const uy = -Math.cos(hand.angle);
    const along = x * ux + y * uy;
    const across = Math.abs(x * uy - y * ux);
    const t = clamp(along / hand.length, -0.15, 1);
    const half = hand.width * (1 - 0.55 * Math.max(0, t));
    return Math.max(across - half, along - hand.length, -along - hand.length * 0.15);
  };
  let rot = 0;
  let z = 1;
  let sweep = 0;
  return {
    frame(ph) {
      rot = 0.022 * Math.sin(ph);
      z = 1 + 0.02 * (1 - Math.cos(ph)) / 2;
      sweep = -2.3 + 0.35 * Math.sin(ph);
    },
    pixel(X0, Y0) {
      // A slow turntable twist and push-in around the watch.
      const x0 = (X0 - cx) / z;
      const y0 = (Y0 - cy) / z;
      const x = x0 * Math.cos(rot) - y0 * Math.sin(rot);
      const y = x0 * Math.sin(rot) + y0 * Math.cos(rot);
      const X = x + cx;
      const Y = y + cy;
      let c = mul(marble, 1 + cloud(X, Y) * 0.06);
      c = mix(c, veinColor, smooth(0.09, 0, vein(X, Y)) * 0.4);
      c = mix(c, mul(veinColor, 1.15), smooth(0.05, 0, fine(X, Y)) * 0.2);
      const r = Math.hypot(x, y);
      // Drop shadow of the strap and case.
      const sd = Math.min(Math.hypot(x - 0.012, y - 0.016) - 0.205, Math.abs(x - 0.012) - 0.085);
      c = mul(c, 1 - 0.26 * smooth(0.03, -0.012, sd));
      // Leather strap with stitching and buckle holes.
      const strap = cover(Math.abs(x) - 0.085, px);
      if (strap > 0) {
        let lc = mul(leather, 1 + leatherGrain(X, Y) * 0.1);
        lc = mul(lc, 1 - 0.28 * smooth(0.05, 0.085, Math.abs(x)));
        const stitchLine = cover(Math.abs(Math.abs(x) - 0.07) - 0.0016, px) * (((y * 46) % 1 + 1) % 1 < 0.55 ? 1 : 0);
        lc = mix(lc, stitch, stitchLine * 0.9);
        for (const hy of [0.32, 0.38, 0.44]) lc = mix(lc, mul(leather, 0.35), cover(Math.hypot(x, y - hy) - 0.008, px));
        c = mix(c, lc, strap);
      }
      if (r < 0.215) {
        const th = Math.atan2(y, x);
        // Brushed steel case and polished bezel.
        let sc = mul(steel, 0.8 + 0.16 * Math.cos(2 * th - 0.6));
        sc = mul(sc, 1 - 0.3 * smooth(0.198, 0.206, r));
        c = mix(c, sc, cover(r - 0.205, px));
        c = mix(c, mul(steel, 0.92 + 0.12 * Math.cos(th + 2.2)), cover(Math.abs(r - 0.193) - 0.01, px) * 0.6);
        // Dial with a faint sunburst, markers, and minute track.
        if (r < 0.18) {
          let dc = mul(dial, (1 + 0.012 * Math.cos(th * 90)) * (1 - 0.04 * smooth(0.12, 0.178, r)));
          const k = Math.round((th + Math.PI / 2) / (TAU / 12));
          const ma = k * (TAU / 12) - Math.PI / 2;
          const mx = x * Math.cos(-ma) - y * Math.sin(-ma);
          const my = x * Math.sin(-ma) + y * Math.cos(-ma);
          const twelve = ((k % 12) + 12) % 12 === 0;
          const marker = twelve
            ? Math.min(sdBox(mx, my, 0.152, 0.007, 0.013, 0.003), sdBox(mx, my, 0.152, -0.007, 0.013, 0.003))
            : sdBox(mx, my, 0.153, 0, 0.012, 0.0042);
          dc = mix(dc, ink, cover(marker, px));
          dc = mix(dc, ink, cover(Math.abs(r - 0.17) - 0.0007, px) * 0.6);
          for (const hand of hands) dc = mix(dc, hand.color, cover(handDistance(x, y, hand), px));
          dc = mix(dc, ink, cover(r - 0.0085, px));
          // Crystal reflection that drifts with the light.
          const glare = gauss(Math.hypot(x - 0.06 * Math.cos(sweep), y - 0.06 * Math.sin(sweep)) - 0.14, 0.03) * smooth(0.18, 0.15, r);
          dc = mix(dc, [1, 1, 1], glare * 0.22);
          c = mix(c, dc, cover(r - 0.178, px));
        }
      }
      // Crown at three o'clock.
      c = mix(c, mul(steel, 0.85), cover(sdBox(x, y, 0.218, 0, 0.012, 0.016, 0.004), px));
      return c;
    },
  };
}

function jar(w, h) {
  const A = w / h;
  const px = 1 / h;
  const wall = hex('#B8C2B0');
  const floor = hex('#AAB4A0');
  const frost = hex('#E4E8E3');
  const cream = hex('#EEE7DB');
  const lid = hex('#2C2C2A');
  const stone = hex('#8F8E87');
  const cx = A / 2 - 0.03;
  const R = 0.16;
  const ry = 0.035;
  let spec = 0;
  let z = 1;
  return {
    frame(ph) {
      spec = 0.08 * Math.sin(ph);
      z = 1 + 0.02 * (1 - Math.cos(ph)) / 2;
    },
    pixel(X0, Y0) {
      const X = (X0 - A / 2) / z + A / 2;
      const Y = (Y0 - 0.58) / z + 0.58;
      let c = studio(X, Y, wall, floor, 0.68, A);
      c = mul(c, 1 - 0.35 * gauss(ellipse(X, Y, cx, 0.715, R * 1.08, 0.026), 0.75));
      c = mul(c, 1 - 0.3 * gauss(ellipse(X, Y, cx + 0.255, 0.735, 0.08, 0.014), 0.8));
      // Pebble beside the jar.
      const pe = ellipse(X, Y, cx + 0.25, 0.71, 0.072, 0.036);
      if (pe < 1.05) {
        const shade = 0.62 + 0.45 * clamp(1 - Math.hypot(X - (cx + 0.225), Y - 0.69) * 9);
        c = mix(c, mul(stone, shade), cover((pe - 1) * 0.036, px));
      }
      const nx = (X - cx) / R;
      if (Math.abs(nx) < 1.03) {
        const n = clamp(nx, -1, 1);
        const curve = ry * Math.sqrt(Math.max(0, 1 - n * n));
        // Frosted glass body; the cream inside reads through the frost.
        const inBody = cover(Math.abs(X - cx) - R, px) * smooth(0.47 - px, 0.47 + px, Y) * cover(Y - (0.705 + curve), px);
        if (inBody > 0) {
          let bc = mix(mul(studio(X, Y, wall, floor, 0.68, A), 1.04), frost, 0.62);
          bc = mix(bc, cream, smooth(0.53, 0.56, Y) * 0.5 * (1 - n * n));
          bc = mul(bc, 0.82 + 0.24 * cylinderLight(n));
          bc = add(bc, [1, 1, 1], 0.12 * Math.abs(n) ** 6);
          c = mix(c, bc, inBody);
        }
        // Matte lid with a soft moving sheen.
        const inLid = cover(Math.abs(X - cx) - (R + 0.006), px) * smooth(0.405 - px, 0.405 + px, Y) * cover(Y - (0.475 + curve), px);
        if (inLid > 0) {
          let lc = mul(lid, 0.8 + 0.6 * cylinderLight(n));
          lc = add(lc, [1, 1, 1], 0.1 * gauss(n - (-0.45 + spec), 0.12));
          c = mix(c, lc, inLid);
        }
        const lidTop = ellipse(X, Y, cx, 0.405, R + 0.006, ry);
        if (lidTop < 1.05) c = mix(c, mul(lid, 1.35 + 0.15 * (1 - lidTop)), cover((lidTop - 1) * ry, px));
      }
      return c;
    },
  };
}

// ── Social 9:16 — vertical b-roll ────────────────────────────────────────────

function shoreline(w, h) {
  const A = w / h;
  const px = 1 / h;
  const box = [-0.2, A + 0.2, -0.2, 1.2];
  const ripple = field2((x, y) => fbm(x * 16, y * 16, 4, 71), box, w, h);
  const lace = field2((x, y) => fbm(x * 38, y * 30, 4, 72), box, w, h);
  const grain = field2((x, y) => fbm(x * 120, y * 120, 2, 73) - 0.5, box, w, h);
  const marks = field2((x, y) => Math.sin(y * 110 + x * 14 + 4 * fbm(x * 4, y * 4, 3, 74)), box, w, h);
  const line = field1((x) => 0.04 * Math.sin(x * 6 + 0.6) + 0.04 * (fbm(x * 3, 1.3, 4, 75) - 0.5), box[0], box[1], w * 2);
  const shallow = hex('#93B5B0');
  const deep = hex('#4E727D');
  const foam = hex('#F3F1EB');
  const wet = hex('#B19A79');
  const dry = hex('#D8C6A4');
  let reach = 0;
  let lag = 0;
  let ph = 0;
  let yaw = 0;
  return {
    frame(p) {
      ph = p;
      reach = 0.045 * Math.sin(p);
      lag = 0.045 * Math.sin(p - 0.7);
      yaw = 0.02 * Math.sin(p);
    },
    pixel(X0, Y0) {
      // A hovering drone: a little yaw about the frame center.
      const x0 = X0 - A / 2;
      const y0 = Y0 - 0.5;
      const X = x0 * Math.cos(yaw) - y0 * Math.sin(yaw) + A / 2;
      const Y = x0 * Math.sin(yaw) + y0 * Math.cos(yaw) + 0.5;
      const edge = 0.46 + line(X) + reach;
      const d = Y - edge; // > 0 on the sand
      // Sand: wet behind the retreating wave, dry beyond, with ripple marks.
      const wetEdge = 0.46 + line(X) + Math.max(reach, lag) + 0.035;
      let sand = mix(wet, dry, smooth(wetEdge - 0.02, wetEdge + 0.06, Y));
      sand = mul(sand, 1 + grain(X, Y) * 0.07 + marks(X, Y) * 0.025 * smooth(wetEdge, wetEdge + 0.1, Y));
      // Water: clear over the sand at the edge, deepening away from the beach.
      const dw = Math.max(0, -d);
      const rip = ripple(X + 0.01 * Math.cos(ph), Y + 0.01 * Math.sin(ph));
      let water = mul(mix(shallow, deep, smooth(0, 0.42, dw)), 1 + (rip - 0.5) * 0.14);
      water = mix(mul(sand, 0.9), water, smooth(0, 0.08, dw));
      let c = mix(water, sand, smooth(-px, px, d));
      // Foam: the wash line plus thin lace trailing back into the water.
      const lf = lace(X, Y - 0.02 * Math.sin(ph));
      const lacy = smooth(0.06, 0.005, Math.abs(lf - 0.5)) * smooth(-0.1, -0.015, d) * smooth(0.004, -0.004, d);
      const wash = gauss(d + 0.004, 0.009);
      c = mix(c, foam, clamp(wash * 0.95 + lacy * 0.45));
      return c;
    },
  };
}

function dappled(w, h) {
  const A = w / h;
  const box = [-0.2, A + 0.2, -0.2, 1.2];
  const blotch = field2((x, y) => fbm(x * 4, y * 4, 4, 81) - 0.5, box, w >> 1, h >> 1);
  const grain = field2((x, y) => fbm(x * 140, y * 140, 2, 82) - 0.5, box, w, h);
  const leaves = field2((x, y) => {
    const wx = x + 0.12 * fbm(x * 3, y * 3, 3, 83);
    const wy = y + 0.12 * fbm(x * 3 + 5, y * 3, 3, 84);
    return fbm(wx * 6, wy * 6, 4, 85);
  }, box, w, h);
  const plaster = hex('#E7DDCC');
  const sun = hex('#F7EAD3');
  const shade = hex('#D3C8B6');
  let ph = 0;
  return {
    frame(p) {
      ph = p;
    },
    pixel(X, Y) {
      // Window light falls as a skewed rectangle split by its mullions.
      const u = X + 0.32 * Y;
      const v = Y;
      const soft = 0.006 + 0.012 * v;
      const pane = smooth(0.12 - soft, 0.12 + soft, u) * smooth(0.66 + soft, 0.66 - soft, u) * smooth(0.1 - soft, 0.1 + soft, v) * smooth(0.88 + soft, 0.88 - soft, v);
      const mullions = 1 - smooth(soft, -soft, Math.abs(u - 0.39) - 0.012) - smooth(soft, -soft, Math.abs(v - 0.46) - 0.011);
      // Leaves outside the window sway, so their shadows drift and breathe.
      const sx = X + 0.012 * Math.sin(ph + Y * 3);
      const sy = Y + 0.008 * Math.cos(ph + X * 2);
      const leaf = smooth(0.5, 0.6, leaves(sx, sy));
      const light = clamp(pane * clamp(mullions) * (1 - leaf * 0.85));
      let c = mul(plaster, 1 + blotch(X, Y) * 0.05 + grain(X, Y) * 0.035);
      c = mix(mul(c, 0.93), mix(c, sun, 0.55), light);
      c = mix(c, shade, (1 - light) * 0.1);
      return mul(c, 1 - 0.06 * smooth(0.4, 1, Math.abs(Y - 0.5) * 2));
    },
  };
}

function rooftop(w, h) {
  const A = w / h;
  const px = 1 / h;
  const box = [-0.2, A + 0.2, -0.2, 1.2];
  const density = field2((x, y) => {
    const wx = x + 0.25 * fbm(x * 1.5, y * 1.5, 3, 91);
    const wy = y + 0.25 * fbm(x * 1.5 + 9, y * 1.5, 3, 92);
    return fbm(wx * 2.6, wy * 3.2, 6, 93);
  }, box, w, h);
  const facadeTex = field2((x, y) => fbm(x * 40, y * 40, 3, 94) - 0.5, box, w, h);
  const streaks = field1((x) => noise(x * 140, 0.5, 97), box[0], box[1], w * 2);
  // A hazy distant skyline: blocks of jittered heights.
  const skyline = field1((x) => 0.79 - 0.07 * hash(Math.floor(x * 13), 5, 95) - 0.025 * hash(Math.floor(x * 29), 6, 96), box[0], box[1], w * 4);
  const zenith = hex('#8FB0C6');
  const low = hex('#D7E1E5');
  const lit = hex('#F8F8F5');
  const shadow = hex('#B8C2C9');
  const concrete = hex('#8F8A81');
  const side = hex('#6E6A63');
  const far = hex('#AEB8BD');
  const glass = hex('#4E565C');
  const frameColor = hex('#5F5B55');
  let ox = 0;
  let oy = 0;
  let tilt = 0;
  return {
    frame(ph) {
      ox = 0.03 * Math.cos(ph);
      oy = 0.02 * Math.sin(ph);
      tilt = 0.008 * Math.sin(ph);
    },
    pixel(X, Y0) {
      const Y = Y0 + tilt;
      // Cumulus lit from above: compare density with the sample just above.
      let c = mix(zenith, low, smooth(0, 0.78, Y));
      const sx = X + ox;
      const sy = Y * 0.9 + oy;
      const dn = density(sx, sy);
      const cover2 = smooth(0.44, 0.62, dn);
      if (cover2 > 0) {
        const above = density(sx, sy - 0.025);
        const cc = mix(shadow, lit, clamp(0.55 + (dn - above) * 9));
        c = mix(c, cc, cover2);
      }
      // A hazy skyline, then the near building corner (it moves more: parallax).
      const fy = Y0 + tilt * 0.3;
      const sl = skyline(X);
      c = mix(c, mul(far, 1 - 0.06 * smooth(sl, 1, fy)), smooth(sl - px, sl + px, fy));
      const by = Y0 + tilt * 1.6;
      const roof = 0.66 + 0.035 * X;
      const front = cover(Math.max(roof - by, X - 0.31), px);
      const sideWall = cover(Math.max(roof + 0.018 - by, X - 0.4, 0.31 - X), px);
      if (front > 0 || sideWall > 0) {
        const reflect = mix(glass, mix(zenith, low, 0.6), 0.38);
        const weather = streaks(X) * smooth(roof, roof + 0.25, by);
        let fc = mul(concrete, 1 + facadeTex(X, by) * 0.08 - weather * 0.06);
        const cu = (X + 0.012) / 0.06;
        const rv = (by - roof - 0.035) / 0.07;
        const ci = Math.floor(cu);
        const ri = Math.floor(rv);
        const u = cu - ci;
        const v = rv - ri;
        if (rv > 0) {
          if (u > 0.17 && u < 0.83 && v > 0.15 && v < 0.85) fc = mix(fc, frameColor, 0.85);
          if (u > 0.21 && u < 0.79 && v > 0.19 && v < 0.81) {
            // Each pane reflects the sky a little differently.
            fc = mul(mix(reflect, low, 0.25 * smooth(0.19, 0.81, v)), 0.82 + 0.3 * hash(ci, ri, 98));
          }
        }
        fc = mul(fc, 1 - 0.1 * smooth(roof, 1, by));
        c = mix(c, fc, front);
        c = mix(c, mul(side, 1 + facadeTex(X, by) * 0.06 - weather * 0.05), sideWall);
      }
      return c;
    },
  };
}

function grass(w, h) {
  const A = w / h;
  const px = 1 / h;
  const box = [-0.2, A + 0.2, -0.2, 1.2];
  const treeline = field1((x) => 0.655 - 0.045 * fbm(x * 6, 0.2, 4, 101) - 0.025 * fbm(x * 22, 0.4, 3, 102), box[0], box[1], w * 2);
  const groundTex = field2((x, y) => fbm(x * 60, y * 30, 3, 103) - 0.5, box, w, h);
  const top = hex('#C2D2DB');
  const bright = hex('#EDEFE8');
  const warm = hex('#F4EEDD');
  const trees = hex('#8F9A86');
  const layers = [
    { base: 0.7, height: 0.09, density: 120, color: hex('#A3AB82'), blur: 0.004, sway: 0.006, seed: 104 },
    { base: 0.78, height: 0.2, density: 64, color: hex('#7F8C52'), blur: 0.0022, sway: 0.012, seed: 105 },
    { base: 0.9, height: 0.4, density: 24, color: hex('#5A673B'), blur: 0, sway: 0.02, seed: 106 },
    // Out-of-focus blades right in front of the lens.
    { base: 1.06, height: 0.42, density: 6, color: hex('#46522F'), blur: 0.016, sway: 0.03, seed: 107 },
  ];
  const rim = hex('#B9B874');
  const NONE = [1e9, 0, 1];
  // One curved blade per cell; two offset sets per layer fill the gaps.
  const blade = (X, Y, l, set, ph) => {
    const rise = l.base - Y; // height above the layer's ground line
    const s = l.sway * Math.sin(ph + X * 3 + set * 1.7 + l.seed) * clamp(rise / l.height) ** 1.5;
    const u = (X + s) * l.density + set * 0.5;
    const cell = Math.floor(u);
    const tall = l.height * (0.55 + 0.45 * hash(cell, set, l.seed));
    if (rise > tall) return NONE;
    const bend = (hash(cell, set + 7, l.seed) - 0.5) * 1.1 * clamp(rise / tall) ** 2;
    const local = u - cell - 0.5 - bend;
    const half = 0.4 * Math.max(0, 1 - Math.max(0, rise) / tall) ** 0.6;
    return [(Math.abs(local) - half) / l.density, local, 0.86 + 0.28 * hash(cell, set + 3, l.seed)];
  };
  let ph = 0;
  return {
    frame(p) {
      ph = p;
    },
    pixel(X, Y) {
      let c = mix(top, bright, smooth(0, 0.66, Y));
      c = mix(c, warm, gauss(Math.hypot(X - A * 0.85, Y - 0.12), 0.35) * 0.35);
      const tl = treeline(X);
      c = mix(c, trees, smooth(tl - 0.006, tl + 0.006, Y));
      for (const l of layers) {
        const aa = Math.max(px, l.blur);
        let a = smooth(l.base - aa, l.base + aa, Y);
        let local = 0;
        let tint = 1;
        for (let set = 0; set < 2; set++) {
          const [d, lx, t] = blade(X, Y, l, set, ph);
          const k = smooth(aa, -aa, d);
          if (k > a) {
            a = k;
            local = lx;
            tint = t;
          }
        }
        if (a <= 0) continue;
        let gc = mul(l.color, tint * (1 - 0.25 * smooth(l.base - l.height, l.base + 0.1, Y)) + groundTex(X, Y) * 0.06);
        if (l.blur === 0) gc = mix(gc, rim, smooth(0.05, 0.2, local) * clamp((l.base - Y) / l.height) * 0.6);
        c = mix(c, gc, a);
      }
      return c;
    },
  };
}

// ── Catalog ─────────────────────────────────────────────────────────────────

const SCENES = {
  social: [shoreline, dappled, rooftop, grass],
  ad: [mug, bottle, watch, jar],
  cinematic: [highland, coast, dunes, winter],
};

// ── Rendering ───────────────────────────────────────────────────────────────

// A static 4×4 ordered dither breaks up 8-bit banding without per-frame noise.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((b) => (b + 0.5) / 16 - 0.5);

function renderFrame(scene, w, h, frame, buffer) {
  scene.frame(((frame % FRAMES) / FRAMES) * TAU);
  let i = 0;
  for (let row = 0; row < h; row++) {
    const Y = (row + 0.5) / h;
    for (let col = 0; col < w; col++) {
      const c = scene.pixel((col + 0.5) / h, Y);
      const d = BAYER[(row & 3) * 4 + (col & 3)];
      buffer[i++] = clamp(Math.round(c[0] * 255 + d), 0, 255);
      buffer[i++] = clamp(Math.round(c[1] * 255 + d), 0, 255);
      buffer[i++] = clamp(Math.round(c[2] * 255 + d), 0, 255);
    }
  }
  return buffer;
}

function run(args, input) {
  const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: [input ? 'pipe' : 'ignore', 'ignore', 'pipe'],
    windowsHide: true,
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const done = new Promise((resolveDone, reject) => {
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolveDone() : reject(new Error(stderr || `ffmpeg exited ${code}`))));
  });
  return { child, done };
}

async function renderClip(kind, variant) {
  const [w, h] = SIZES[kind].render;
  const [dw, dh] = SIZES[kind].draft;
  const scene = SCENES[kind][variant](w, h);
  const render = join(here, `${kind}-${variant + 1}-render.mp4`);
  const draft = join(here, `${kind}-${variant + 1}-draft.mp4`);
  const encoder = run([
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-r', String(FPS), '-i', '-',
    '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-tune', 'film',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', render,
  ], true);
  const buffer = Buffer.alloc(w * h * 3);
  for (let f = 0; f < FRAMES; f++) {
    // Each frame gets its own copy: the pipe may still hold the previous one.
    if (!encoder.child.stdin.write(Buffer.from(renderFrame(scene, w, h, f, buffer)))) await once(encoder.child.stdin, 'drain');
  }
  encoder.child.stdin.end();
  await encoder.done;
  await run([
    '-i', render, '-vf', `scale=${dw}:${dh}:flags=lanczos,fps=12`,
    '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', draft,
  ]).done;
}

async function preview(dir, frame) {
  mkdirSync(dir, { recursive: true });
  for (const [kind, scenes] of Object.entries(SCENES)) {
    for (let variant = 0; variant < scenes.length; variant++) {
      const [w, h] = SIZES[kind].render;
      const pixels = renderFrame(scenes[variant](w, h), w, h, frame, Buffer.alloc(w * h * 3));
      const png = join(dir, `${kind}-${variant + 1}.png`);
      const job = run(['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-i', '-', '-frames:v', '1', png], true);
      job.child.stdin.end(pixels);
      await job.done;
      console.log(`Preview ${png}`);
    }
  }
}

// ── Command line ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const all = Object.entries(SCENES).flatMap(([kind, list]) => list.map((_, v) => `${kind}-${v + 1}`));

if (args[0] === '--preview') {
  await preview(resolve(args[1] ?? 'clip-preview'), Number(args[2] ?? 0));
} else if (args[0] === '--clip') {
  // Worker mode: render one scene in this process.
  const [kind, n] = args[1].split('-');
  await renderClip(kind, Number(n) - 1);
} else {
  const wanted = args.length ? args : all;
  for (const name of wanted) if (!all.includes(name)) throw new Error(`Unknown scene "${name}". Known: ${all.join(', ')}`);
  const slots = Math.max(1, Math.min(wanted.length, cpus().length - 1));
  const queue = [...wanted];
  const started = Date.now();
  const worker = async () => {
    while (queue.length) {
      const name = queue.shift();
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--clip', name], { stdio: 'inherit', windowsHide: true });
      const [code] = await once(child, 'close');
      if (code !== 0) throw new Error(`Rendering ${name} failed (exit ${code}).`);
      console.log(`Generated ${name} (draft + render)`);
    }
  };
  await Promise.all(Array.from({ length: slots }, worker));
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
}

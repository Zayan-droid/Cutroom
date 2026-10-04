// Shared helpers for the procedural sample clips: math, color, value and
// gradient noise, precomputed fields, a camera, and tone mapping.

export const TAU = Math.PI * 2;
export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
/** Smoothstep that also works with e0 > e1 (a falling edge). */
export const smooth = (e0, e1, v) => {
  const t = clamp((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
export const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const gauss = (d, width) => Math.exp(-(d * d) / (width * width));

export function hash(ix, iy, seed) {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function noise(x, y, seed = 0) {
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

// Eight evenly spread unit gradients for gradient noise.
const GRADIENTS = Array.from({ length: 8 }, (_, i) => [Math.cos((i * TAU) / 8 + 0.3), Math.sin((i * TAU) / 8 + 0.3)]);

/** Gradient noise in about [-0.7, 0.7], zero at lattice points: rounder than value noise. */
export function gnoise(x, y, seed = 0) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const g = (i, j, dx, dy) => {
    const v = GRADIENTS[(hash(i, j, seed) * 8) | 0];
    return v[0] * dx + v[1] * dy;
  };
  const a = g(ix, iy, fx, fy);
  const b = g(ix + 1, iy, fx - 1, fy);
  const c = g(ix, iy + 1, fx, fy - 1);
  const d = g(ix + 1, iy + 1, fx - 1, fy - 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export function fbm(x, y, octaves = 4, seed = 0) {
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
export function field2(fn, [x0, x1, y0, y1], nx, ny) {
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
export function field1(fn, x0, x1, n) {
  const data = new Float32Array(n);
  const s = (x1 - x0) / (n - 1);
  for (let i = 0; i < n; i++) data[i] = fn(x0 + i * s);
  return (x) => {
    const f = clamp((x - x0) / s, 0, n - 1.001);
    const i = f | 0;
    return data[i] + (data[i + 1] - data[i]) * (f - i);
  };
}


// ── 3-D helpers for the raymarched scenes ────────────────────────────────────

/** Ridged fractal noise in [0, 1]: sharp crests, for mountain ranges. */
export function ridged(x, y, octaves = 6, seed = 0) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  let weight = 1;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(noise(x * f, y * f, seed + i * 37) * 2 - 1);
    n *= n * weight;
    weight = clamp(n * 1.6);
    sum += amp * n;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

export const norm3 = (x, y, z) => {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};

/** Pinhole camera basis. `vfov` is the vertical field of view in degrees. */
export function lookAt(pos, target, vfov, aspect) {
  const f = norm3(target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]);
  const r = norm3(-f[2], 0, f[0]); // right = forward × up(0,1,0)
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const tanV = Math.tan((vfov * Math.PI) / 360);
  return { pos, f, r, u, tanV, tanH: tanV * aspect };
}

/** sRGB hex → linear-light RGB, for lighting math. */
export const linHex = (s) => hex(s).map((c) => c ** 2.2);

/** Filmic (ACES-fitted) tone curve, then display gamma. Input and output in 0..1+ per channel. */
export function display(c, exposure = 1) {
  const out = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const x = c[i] * exposure;
    const y = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
    out[i] = clamp(y) ** (1 / 2.2);
  }
  return out;
}

/**
 * Cellular (Worley) noise: distance to the nearest jittered feature point,
 * roughly 0..1. Reads as round clumps — tree crowns from above, pebbles.
 */
export function worley(x, y, seed = 0) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let best = 9;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i;
      const cy = iy + j;
      const px = cx + hash(cx, cy, seed);
      const py = cy + hash(cx, cy, seed + 1);
      const d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
}

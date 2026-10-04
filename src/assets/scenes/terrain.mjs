// Raymarched landscapes: a heightfield terrain with sun shadows, ambient
// occlusion, and fine surface detail filtered to the pixel size; water whose
// travelling waves reflect the land and sky; a cloud deck and distance haze;
// all seen through a slowly drifting camera (real parallax, looping per clip).
import { clamp, smooth, fbm, gnoise, hash, noise, ridged, worley, field2, linHex, lookAt, display, norm3 } from './kit.mjs';

/**
 * Zero-mean fractal noise for surface detail. Octaves fade out once they are
 * finer than `foot` (the ground width one pixel covers), so near ground gets
 * crisp texture while far ground stays calm instead of shimmering.
 */
function grain(x, z, f0, foot, seed) {
  let sum = 0;
  let amp = 0.5;
  let f = f0;
  let px = x * f0;
  let pz = z * f0;
  for (let o = 0; o < 6; o++) {
    const k = smooth(0.5, 0.2, f * foot);
    if (k <= 0) break;
    sum += amp * k * gnoise(px, pz, seed + o);
    // Rotate each octave so the lattices don't line up.
    const nx = 1.6 * px - 1.2 * pz;
    pz = 1.2 * px + 1.6 * pz;
    px = nx;
    f *= 2;
    amp *= 0.5;
  }
  return sum;
}

/**
 * Wind waves as a sum of travelling sines, longest first. Each one advances a
 * whole number of wavelengths per loop (shorter waves faster, as on deep
 * water), so the motion repeats seamlessly. `heading` is the travel direction
 * in the x–z plane, in radians; waves shorter than `shortest` are left out.
 */
function waveTrain(chop, heading, seed, shortest = 0) {
  const train = Array.from({ length: 18 }, (_, i) => {
    const length = 1.4 * 0.8 ** i;
    const angle = heading + (hash(i, 1, seed) - 0.5) * 2.4;
    const k = (2 * Math.PI) / length;
    return {
      length,
      dx: Math.cos(angle),
      dz: Math.sin(angle),
      kx: k * Math.cos(angle),
      kz: k * Math.sin(angle),
      steep: chop * 0.15 * (0.5 + hash(i, 3, seed)),
      cycles: Math.max(1, Math.round(1.2 / Math.sqrt(length))),
      phase: hash(i, 2, seed) * 2 * Math.PI,
    };
  });
  return train.filter((w) => w.length >= shortest);
}

/** Water surface slope at (x, z); waves shorter than the footprint drop out. */
function waveSlope(train, x, z, ph, foot) {
  let sx = 0;
  let sz = 0;
  for (const w of train) {
    const k = smooth(0.5, 0.25, foot / w.length);
    if (k <= 0) break;
    const c = w.steep * k * Math.cos(w.kx * x + w.kz * z - w.cycles * ph + w.phase);
    sx += c * w.dx;
    sz += c * w.dz;
  }
  return [sx, sz];
}

/**
 * A landscape scene. The heightfield is sampled once onto a grid; per frame,
 * each pixel marches its ray across the grid and shades what it hits.
 */
function landscape(w, h, cfg) {
  const A = w / h;
  const N = cfg.grid ?? 1400;
  const E = cfg.extent;
  const cell = (2 * E) / (N - 1);
  const inv = 1 / cell;
  const H = new Float32Array(N * N);
  let maxH = -1e9;
  for (let j = 0; j < N; j++) {
    const z = -E + j * cell;
    for (let i = 0; i < N; i++) {
      const v = cfg.height(-E + i * cell, z);
      H[j * N + i] = v;
      if (v > maxH) maxH = v;
    }
  }
  const sampleGrid = (G, x, z) => {
    let fx = (x + E) * inv;
    let fz = (z + E) * inv;
    if (fx < 0) fx = 0;
    else if (fx > N - 1.001) fx = N - 1.001;
    if (fz < 0) fz = 0;
    else if (fz > N - 1.001) fz = N - 1.001;
    const i = fx | 0;
    const j = fz | 0;
    const tx = fx - i;
    const tz = fz - j;
    const k = j * N + i;
    const a = G[k];
    const b = G[k + 1];
    const c = G[k + N];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + G[k + N + 1]) * tx * tz;
  };
  // Past the grid there is no land, rather than the edge row smeared out to
  // the horizon: rays leave over the skyline the grid itself makes.
  const inGrid = (x, z) => x >= -E && x <= E && z >= -E && z <= E;
  const height = (x, z) => (inGrid(x, z) ? sampleGrid(H, x, z) : -1e3);

  // Sun visibility per grid cell: a soft shadow marched toward the sun.
  const [lx, ly, lz] = norm3(...cfg.sun);
  const S = new Float32Array(N * N);
  const soft = cfg.shadowSoftness ?? 10;
  for (let j = 0; j < N; j++) {
    const z = -E + j * cell;
    for (let i = 0; i < N; i++) {
      const x = -E + i * cell;
      const h0 = H[j * N + i] + 0.004;
      let vis = 1;
      let t = cell * 1.5;
      for (let s = 0; s < 96; s++) {
        const py = h0 + ly * t;
        if (py > maxH) break;
        const d = py - height(x + lx * t, z + lz * t);
        vis = Math.min(vis, (soft * d) / t);
        if (vis <= 0) break;
        t += Math.max(cell * 0.8, d * 0.5);
      }
      S[j * N + i] = clamp(vis);
    }
  }

  // Ambient occlusion: how far a point sits below its blurred surroundings.
  const blur = (src, r) => {
    const tmp = new Float32Array(N * N);
    const out = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += src[j * N + clamp(i, 0, N - 1)];
      for (let i = 0; i < N; i++) {
        tmp[j * N + i] = acc / (2 * r + 1);
        acc += src[j * N + Math.min(N - 1, i + r + 1)] - src[j * N + Math.max(0, i - r)];
      }
    }
    for (let i = 0; i < N; i++) {
      let acc = 0;
      for (let j = -r; j <= r; j++) acc += tmp[clamp(j, 0, N - 1) * N + i];
      for (let j = 0; j < N; j++) {
        out[j * N + i] = acc / (2 * r + 1);
        acc += tmp[Math.min(N - 1, j + r + 1) * N + i] - tmp[Math.max(0, j - r) * N + i];
      }
    }
    return out;
  };
  const blurred = blur(H, Math.max(2, Math.round(0.35 / cell)));
  const AO = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) AO[k] = clamp(1 - Math.max(0, blurred[k] - H[k]) * (cfg.aoStrength ?? 2.5), 0.35, 1);

  const cloudField = field2((x, z) => fbm(x * 0.012, z * 0.012, 6, cfg.seed ?? 1), [-600, 600, -600, 600], 640, 640);

  const zenith = linHex(cfg.sky[0]);
  const horizon = linHex(cfg.sky[1]);
  const sunColor = linHex(cfg.sunColor).map((c) => c * (cfg.sunIntensity ?? 3));
  const skyLight = linHex(cfg.skyLight ?? cfg.sky[1]).map((c) => c * (cfg.ambient ?? 0.9));
  const haze = linHex(cfg.haze ?? cfg.sky[1]);
  const cloudLit = linHex(cfg.clouds?.lit ?? '#FFFFFF');
  const cloudShade = linHex(cfg.clouds?.shade ?? '#9AA3AA');
  const water = cfg.water ?? null;
  const train = water && waveTrain(water.chop ?? 0.35, water.heading ?? 0, cfg.seed ?? 1, water.shortest);
  const waterDeep = linHex(water?.deep ?? '#21404A');
  const waterShallow = linHex(water?.shallow ?? '#4F7C7A');
  const foam = linHex('#EEF0EC');
  const exposure = cfg.exposure ?? 1;
  const cosSun = Math.cos((0.9 * Math.PI) / 180);
  const pixAngle = (2 * Math.tan((cfg.fov * Math.PI) / 360)) / h;
  const grainScale = cfg.grainScale ?? 6;
  const grainAmount = cfg.grain ?? 0.5;
  const bumpAmount = cfg.bump ?? 0.6;

  let cam = lookAt([0, 1, 5], [0, 1, 0], 40, A);
  let ph = 0;

  function sky(dx, dy, dz, oy) {
    const up = Math.max(0, dy);
    const g = 1 - (1 - up) ** 3;
    let r = horizon[0] + (zenith[0] - horizon[0]) * g;
    let gg = horizon[1] + (zenith[1] - horizon[1]) * g;
    let b = horizon[2] + (zenith[2] - horizon[2]) * g;
    const sd = dx * lx + dy * ly + dz * lz;
    if (sd > 0) {
      const glow = (cfg.glow ?? 0.35) * sd ** 8 + 0.6 * sd ** 90 + (sd > cosSun ? 8 : 0);
      r += sunColor[0] * glow * 0.2;
      gg += sunColor[1] * glow * 0.2;
      b += sunColor[2] * glow * 0.2;
    }
    if (cfg.clouds && dy > 0.004) {
      const tc = (cfg.clouds.height - oy) / dy;
      const cx = cam.pos[0] + dx * tc + cfg.clouds.drift * Math.cos(ph);
      const cz = cam.pos[2] + dz * tc + cfg.clouds.drift * Math.sin(ph);
      const dens = cloudField(cx, cz);
      const cov = smooth(cfg.clouds.cover, cfg.clouds.cover + 0.2, dens) * smooth(0.004, 0.12, dy);
      if (cov > 0) {
        const lit = clamp(0.45 + (dens - cloudField(cx + lx * 6, cz + lz * 6)) * 5 + sd * 0.25);
        const k = cfg.clouds.brightness ?? 1.1;
        r += ((cloudShade[0] + (cloudLit[0] - cloudShade[0]) * lit) * k - r) * cov;
        gg += ((cloudShade[1] + (cloudLit[1] - cloudShade[1]) * lit) * k - gg) * cov;
        b += ((cloudShade[2] + (cloudLit[2] - cloudShade[2]) * lit) * k - b) * cov;
      }
    }
    return [r, gg, b];
  }

  /** March a ray against the heightfield; returns the hit distance or -1. */
  function march(ox, oy, oz, dx, dy, dz, t0, tMax, steps) {
    let t = t0;
    let prevT = t;
    let prevD = oy + dy * t - height(ox + dx * t, oz + dz * t);
    for (let s = 0; s < steps; s++) {
      const py = oy + dy * t;
      if (py > maxH && dy >= 0) return -1;
      const d = py - height(ox + dx * t, oz + dz * t);
      if (d < 0.0006 * t) return prevT + ((t - prevT) * prevD) / (prevD - d);
      prevT = t;
      prevD = d;
      t += Math.max(0.0012 * t, d * 0.45);
      if (t > tMax) return -1;
    }
    return -1;
  }

  /**
   * Lit ground color (linear) where a ray (dx, dy, dz) hits the terrain at
   * (x, z) after travelling `t`.
   */
  function ground(x, z, t, dx, dy, dz) {
    const y = sampleGrid(H, x, z);
    const e = cell;
    let nx = sampleGrid(H, x - e, z) - sampleGrid(H, x + e, z);
    let ny = 2 * e;
    let nz = sampleGrid(H, x, z - e) - sampleGrid(H, x, z + e);
    let nl = Math.hypot(nx, ny, nz);
    const base = cfg.material(x, y, z, nx / nl, ny / nl, nz / nl, t);
    // Fine detail the grid can't hold: fractal bumps and grain (and, per
    // scene, extra relief such as sand ripples), filtered to the pixel
    // footprint, which stretches where the ray grazes the ground. Bright snow
    // and sand stay smoother than turf and rock.
    const lum = 0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2];
    const rough = 1 - 0.8 * smooth(0.25, 0.7, lum);
    const facing = Math.max(0.12, -(dx * nx + dy * ny + dz * nz) / nl);
    const foot = (t * pixAngle) / Math.sqrt(facing);
    const g = grain(x, z, grainScale, foot, 61);
    const step = Math.max(foot * 0.5, 0.0005);
    const slope = (bumpAmount * rough * ny) / (grainScale * step);
    nx -= (grain(x + step, z, grainScale, foot, 61) - g) * slope;
    nz -= (grain(x, z + step, grainScale, foot, 61) - g) * slope;
    if (cfg.relief) {
      const [sx, sz] = cfg.relief(x, z, foot);
      nx -= sx * ny;
      nz -= sz * ny;
    }
    nl = Math.hypot(nx, ny, nz);
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const tone = 1 + 2 * g * grainAmount * rough;
    const albedo = [base[0] * tone, base[1] * tone, base[2] * tone];
    // Hollows in the fine detail see less sky.
    const cavity = clamp(1 + 1.5 * g * rough, 0.5, 1.3);
    const sun = Math.max(0, nx * lx + ny * ly + nz * lz) * sampleGrid(S, x, z);
    const amb = (0.55 + 0.45 * ny) * sampleGrid(AO, x, z) * cavity;
    return [
      albedo[0] * (sunColor[0] * sun + skyLight[0] * amb),
      albedo[1] * (sunColor[1] * sun + skyLight[1] * amb),
      albedo[2] * (sunColor[2] * sun + skyLight[2] * amb),
    ];
  }

  /** Haze toward the sky seen along the ray, denser low down. */
  function fog(col, dist, dx, dy, dz, oy) {
    const fogY = oy + dy * Math.min(dist, 30);
    const density = cfg.fog.density * Math.exp(-Math.max(0, fogY - cfg.fog.base) * cfg.fog.falloff);
    const k = 1 - Math.exp(-dist * density);
    const along = sky(dx, Math.max(dy, 0.002), dz, oy);
    return [
      col[0] + (along[0] * 0.55 + haze[0] * 0.45 - col[0]) * k,
      col[1] + (along[1] * 0.55 + haze[1] * 0.45 - col[1]) * k,
      col[2] + (along[2] * 0.55 + haze[2] * 0.45 - col[2]) * k,
    ];
  }

  return {
    frame(p) {
      ph = p;
      const c = cfg.camera(p);
      cam = lookAt(c.pos, c.target, cfg.fov, A);
    },
    pixel(X, Y) {
      const u = (X / A) * 2 - 1;
      const v = 1 - 2 * Y;
      const { pos, f, r: right, u: up, tanH, tanV } = cam;
      let dx = f[0] + right[0] * u * tanH + up[0] * v * tanV;
      let dy = f[1] + right[1] * u * tanH + up[1] * v * tanV;
      let dz = f[2] + right[2] * u * tanH + up[2] * v * tanV;
      const dl = Math.hypot(dx, dy, dz);
      dx /= dl;
      dy /= dl;
      dz /= dl;
      const [ox, oy, oz] = pos;
      const tMax = cfg.far ?? 60;

      const t = march(ox, oy, oz, dx, dy, dz, 0.02, tMax, 300);
      const waterT = water && dy < 0 ? (water.level - oy) / dy : -1;
      const onWater = waterT > 0 && (t < 0 || waterT < t) && (water.open || inGrid(ox + dx * waterT, oz + dz * waterT));
      if (t < 0 && !onWater) return display(sky(dx, dy, dz, oy), exposure);

      if (!onWater) {
        const col = ground(ox + dx * t, oz + dz * t, t, dx, dy, dz);
        return display(fog(col, t, dx, dy, dz, oy), exposure);
      }

      // Water: travelling waves tilt the normal; it reflects land and sky.
      const x = ox + dx * waterT;
      const z = oz + dz * waterT;
      const [gx, gz] = waveSlope(train, x, z, ph, (waterT * pixAngle) / Math.sqrt(Math.max(0.02, -dy)));
      const [nx, ny, nz] = norm3(-gx, 1, -gz);
      const vn = -(dx * nx + dy * ny + dz * nz);
      const fres = 0.02 + 0.98 * (1 - Math.max(0, vn)) ** 5;
      const rx = dx + 2 * vn * nx;
      const ry = Math.max(0.001, dy + 2 * vn * ny);
      const rz = dz + 2 * vn * nz;
      const rt = march(x, water.level + 0.002, z, rx, ry, rz, 0.02, tMax * 0.6, 160);
      const refl = rt > 0
        ? fog(ground(x + rx * rt, z + rz * rt, waterT + rt, rx, ry, rz), waterT + rt, rx, ry, rz, water.level)
        : sky(rx, ry, rz, water.level);
      const depth = water.level - height(x, z);
      const body = waterShallow.map((c, i) => c + (waterDeep[i] - c) * smooth(0, 0.6, depth));
      let col = body.map((c, i) => c * (0.25 + 0.5 * Math.max(0, ly)) * (1 - fres) + refl[i] * fres);
      const glint = Math.max(0, rx * lx + ry * ly + rz * lz) ** 400;
      col = col.map((c, i) => c + sunColor[i] * glint * 1.5);
      if (water.foam) {
        const shore = smooth(0.05, 0, depth) * (0.55 + 0.45 * noise(x * 9 + Math.cos(ph) * 0.6, z * 9, 7));
        col = col.map((c, i) => c + (foam[i] * (0.4 + 0.6 * Math.max(0, ly)) - c) * shore);
      }
      return display(fog(col, waterT, dx, dy, dz, oy), exposure);
    },
  };
}

const loop = (ph, base, sway) => [
  base[0] + sway[0] * Math.sin(ph),
  base[1] + sway[1] * Math.sin(ph * 2) * 0.5,
  base[2] + sway[2] * Math.cos(ph),
];

const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

/** Conifer canopy seen from above or afar: round crowns with dark gaps. */
function canopy(x, z, dark, light, density = 9, seed = 1) {
  const c = worley(x * density, z * density, seed);
  const crown = smooth(0.75, 0.15, c);
  return scale(mixc(dark, light, crown * (0.7 + 0.3 * noise(x * 3, z * 3, seed + 2))), 0.75 + 0.35 * crown);
}

// ── Scenes ──────────────────────────────────────────────────────────────────

export function highland(w, h) {
  const grass = linHex('#56633A');
  const dry = linHex('#7A7049');
  const heather = linHex('#5A4740');
  const rock = linHex('#77736B');
  return landscape(w, h, {
    extent: 34,
    seed: 3,
    height(x, z) {
      const glen = 1 - Math.exp(-(x * x) / 16);
      const hills = fbm(x * 0.085 + 3, z * 0.085, 6, 11);
      const far = smooth(-4, -24, z);
      return glen * (1.1 + 2.6 * hills) + far * 4.4 * ridged(x * 0.07, z * 0.07, 6, 12) + 0.32 * fbm(x * 0.45, z * 0.45, 5, 13) - 0.15;
    },
    material(x, y, z, nx, ny) {
      const n = fbm(x * 1.6, z * 1.6, 4, 14);
      let c = mixc(grass, dry, smooth(0.42, 0.68, n));
      c = mixc(c, heather, smooth(0.5, 0.72, fbm(x * 0.9 + 9, z * 0.9, 4, 15)) * 0.7);
      c = scale(c, 0.85 + 0.3 * noise(x * 14, z * 14, 17));
      return mixc(c, rock, clamp(smooth(0.88, 0.7, ny) + smooth(0.68, 0.82, noise(x * 3, z * 3, 16)) * 0.25));
    },
    water: { level: 0.12, deep: '#25343A', shallow: '#3E4B44', chop: 0.06 },
    grain: 0.6,
    sun: [-0.35, 0.5, -0.7],
    sunColor: '#FFF1DE',
    sunIntensity: 1.8,
    skyLight: '#C5CFD6',
    ambient: 1.15,
    sky: ['#8796A3', '#D0D5D5'],
    haze: '#C6CCCE',
    clouds: { height: 9, cover: 0.4, drift: 0.6, lit: '#E8EAEA', shade: '#7F888F', brightness: 1.0 },
    fog: { density: 0.022, base: 0.6, falloff: 0.7 },
    glow: 0.15,
    camera: (ph) => ({ pos: loop(ph, [1.1, 1.5, 10], [0.25, 0.06, 0.35]), target: [-0.6, 0.8, -6] }),
    fov: 34,
    far: 70,
    exposure: 1.0,
  });
}

/** A bay: grassy headland on the right, a beach, open sea, a far point. */
export function coast(w, h) {
  const rock = linHex('#6A6156');
  const turf = linHex('#5F6B3C');
  const turfDry = linHex('#80794F');
  const sand = linHex('#CDBB97');
  const wetSand = linHex('#9C8C6E');
  const shoreAt = (z) => -0.32 * z + 0.7 * Math.sin(z * 0.21) + 2.4 * (fbm(z * 0.06, 7.1, 4, 21) - 0.5);
  return landscape(w, h, {
    extent: 34,
    seed: 5,
    height(x, z) {
      const d = x - shoreAt(z); // > 0 inland
      const land = smooth(-0.6, 0.8, d);
      const rise = 0.12 + 0.9 * smooth(0.6, 5, d) * (0.6 + fbm(x * 0.2, z * 0.2, 5, 22));
      const point = 2.6 * smooth(-12, -26, z) * smooth(-2, 6, d) * ridged(x * 0.08, z * 0.08, 5, 28);
      const seabed = -0.3 - 0.8 * smooth(0, -7, d);
      return land * (rise + point) + (1 - land) * seabed + 0.05 * fbm(x * 2.5, z * 2.5, 3, 23);
    },
    material(x, y, z, nx, ny) {
      let c = mixc(turf, turfDry, smooth(0.45, 0.7, fbm(x * 1.4, z * 1.4, 4, 24)));
      c = scale(c, 0.82 + 0.35 * noise(x * 12, z * 12, 25));
      c = mixc(c, rock, smooth(0.86, 0.68, ny));
      const beach = smooth(0.32, 0.12, y);
      c = mixc(c, mixc(sand, wetSand, smooth(0.07, 0.0, y)), beach);
      return c;
    },
    water: { level: 0, deep: '#1E3C48', shallow: '#4A7A75', chop: 0.4, foam: true, open: true, heading: 0.3 },
    sun: [-0.7, 0.32, -0.6],
    sunColor: '#FFE9CF',
    sunIntensity: 3.0,
    skyLight: '#AFC3D2',
    ambient: 0.8,
    sky: ['#5A84AE', '#D6DEE3'],
    haze: '#CCD6DB',
    clouds: { height: 11, cover: 0.55, drift: 0.8, lit: '#FFFFFF', shade: '#A6B1BA', brightness: 1.1 },
    fog: { density: 0.01, base: 0.2, falloff: 0.4 },
    glow: 0.4,
    // From the headland, looking along the beach toward the far point.
    camera: (ph) => ({ pos: loop(ph, [shoreAt(9) + 2.4, 1.6, 9], [0.2, 0.05, 0.3]), target: [shoreAt(-8) - 1.4, 0.1, -8] }),
    fov: 40,
    far: 80,
    exposure: 1.0,
  });
}

const RIPPLE = (2 * Math.PI) / Math.hypot(38, 8); // sand ripple wavelength

export function dunes(w, h) {
  const sand = linHex('#D7A86F');
  const sandDeep = linHex('#B5814E');
  return landscape(w, h, {
    extent: 30,
    seed: 7,
    shadowSoftness: 18,
    height(x, z) {
      const warp = 2.4 * fbm(x * 0.05, z * 0.05, 3, 31);
      const u = x * 0.42 + z * 0.1 + warp;
      const crestLine = (1 - Math.abs(Math.sin(u))) ** 1.6;
      const swell = fbm(x * 0.06, z * 0.06, 4, 32);
      return 1.25 * crestLine * (0.45 + swell) + 1.1 * swell;
    },
    material(x, y) {
      return mixc(sand, sandDeep, smooth(1.2, 0.3, y) * 0.45);
    },
    // Wind ripples as relief, so the low sun picks out each crest; they fade
    // where a pixel covers more than half a ripple.
    relief(x, z, foot) {
      const k = 0.32 * smooth(0.5, 0.25, foot / RIPPLE);
      if (k <= 0) return [0, 0];
      const s = k * Math.cos(x * 38 + z * 8 + fbm(x * 0.9, z * 0.9, 2, 33) * 6);
      return [s * 0.98, s * 0.21];
    },
    grain: 0.08,
    grainScale: 10,
    bump: 0.25,
    sun: [0.86, 0.22, -0.3],
    sunColor: '#FFE2B8',
    sunIntensity: 3.6,
    skyLight: '#C9CDCB',
    ambient: 0.95,
    sky: ['#4D82B6', '#D8E0E5'],
    haze: '#DDD6CA',
    clouds: { height: 14, cover: 0.7, drift: 0.5, lit: '#FFFFFF', shade: '#C9D3DA', brightness: 1.05 },
    fog: { density: 0.008, base: 0.4, falloff: 0.4 },
    glow: 0.3,
    camera: (ph) => ({ pos: loop(ph, [0, 2.3, 8.5], [0.3, 0.05, 0.3]), target: [1.0, 0.75, -5] }),
    fov: 34,
    far: 60,
    exposure: 1.0,
  });
}

const alpineColors = () => ({
  snow: linHex('#EEF2F5'),
  rock: linHex('#6E6A66'),
  pine: linHex('#1F2A20'),
  pineLit: linHex('#3E5235'),
  meadow: linHex('#5C6A3A'),
});

const alpineHeight = (x, z) => {
  const peaks = ridged(x * 0.075, z * 0.075, 7, 41);
  const range = smooth(3, -12, z);
  return 0.25 + 5.6 * peaks * range + 0.7 * fbm(x * 0.12, z * 0.12, 5, 42) * (0.4 + range);
};

function alpineMaterial({ snow, rock, pine, pineLit, meadow }) {
  return (x, y, z, nx, ny) => {
    const n = noise(x * 2.5, z * 2.5, 43);
    const trees = smooth(0.55, 0.25, fbm(x * 0.6, z * 0.6, 4, 44) - (y - 0.6) * 0.4);
    let c = mixc(scale(meadow, 0.85 + 0.3 * noise(x * 10, z * 10, 45)), canopy(x, z, pine, pineLit, 11, 46), trees);
    c = mixc(c, rock, smooth(1.2, 1.9, y + n * 0.4));
    const snowy = smooth(1.6, 2.4, y + n * 0.6) * smooth(0.5, 0.72, ny);
    return mixc(mixc(c, rock, smooth(0.8, 0.62, ny)), snow, snowy);
  };
}

const alpineLight = {
  sun: [0.55, 0.5, -0.45],
  sunColor: '#FFF4E6',
  sunIntensity: 3.0,
  skyLight: '#A9C2DA',
  ambient: 0.75,
  sky: ['#5482B0', '#D6E0E9'],
  haze: '#CDD8E1',
  clouds: { height: 12, cover: 0.6, drift: 0.7, lit: '#FFFFFF', shade: '#B4C0CA', brightness: 1.1 },
  fog: { density: 0.012, base: 0.5, falloff: 0.35 },
  glow: 0.3,
};

export function alpine(w, h) {
  return landscape(w, h, {
    ...alpineLight,
    extent: 36,
    seed: 9,
    height: alpineHeight,
    material: alpineMaterial(alpineColors()),
    camera: (ph) => ({ pos: loop(ph, [0.4, 1.9, 9.5], [0.3, 0.07, 0.3]), target: [0, 2.5, -9] }),
    fov: 36,
    far: 80,
    exposure: 1.0,
  });
}

/** Vertical: the same range mirrored in a still lake (social, 9:16). */
export function alpineLake(w, h) {
  return landscape(w, h, {
    ...alpineLight,
    extent: 36,
    seed: 9,
    height(x, z) {
      const land = alpineHeight(x, z);
      const basin = smooth(5.5, 2.5, Math.hypot((x - 3.0) * 0.55, z - 4.0));
      return land + (-0.25 - land) * basin;
    },
    material: alpineMaterial(alpineColors()),
    water: { level: 0.12, deep: '#12232A', shallow: '#355047', chop: 0.06, shortest: 0.15 },
    camera: (ph) => ({ pos: loop(ph, [2.6, 0.7, 7.0], [0.15, 0.04, 0.2]), target: [6.0, 2.6, -16] }),
    fov: 44,
    far: 80,
    exposure: 1.0,
  });
}

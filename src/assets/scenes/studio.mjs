// Raymarched studio product shots: signed-distance objects on a seamless
// paper sweep, lit by a key softbox, a fill, and a rim light, with soft
// shadows, ambient occlusion, fresnel reflections of the softbox, and
// cone-traced edge antialiasing. The camera makes a slow, looping orbit.
import { TAU, clamp, smooth, noise, fbm, field2, linHex, lookAt, display, norm3 } from './kit.mjs';

// ── Signed distance primitives (scalar arguments: no allocation per call) ──

/** Upright cylinder centered at the origin with rounded edges. */
function sdCylinder(x, y, z, r, halfH, round) {
  const dx = Math.hypot(x, z) - r + round;
  const dy = Math.abs(y) - halfH + round;
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - round;
}

/** Ring lying in the xy plane (its axis along z). */
function sdTorusXY(x, y, z, R, r) {
  return Math.hypot(Math.hypot(x, y) - R, z) - r;
}

/** Vertical capsule from y = a to y = b. */
function sdCapsule(x, y, z, a, b, r) {
  const t = clamp((y - a) / (b - a));
  return Math.hypot(x, y - (a + (b - a) * t), z) - r;
}

/** Box centered at the origin with half-size (bx, by, bz) and rounded edges. */
function sdBox(x, y, z, bx, by, bz, round) {
  const qx = Math.abs(x) - bx + round;
  const qy = Math.abs(y) - by + round;
  const qz = Math.abs(z) - bz + round;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - round;
}

function sdEllipsoid(x, y, z, rx, ry, rz) {
  const k0 = Math.hypot(x / rx, y / ry, z / rz);
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return (k0 * (k0 - 1)) / k1;
}

/** Smooth union. */
function smin(a, b, k) {
  const h = clamp(0.5 + (0.5 * (b - a)) / k);
  return b + (a - b) * h - k * h * (1 - h);
}

// ── Renderer ────────────────────────────────────────────────────────────────

/** Direction of the tall strip light, for vertical highlights. */
const STRIP = norm3(-0.93, 0, 0.36);

function studio(w, h, cfg) {
  const A = w / h;
  const sdf = cfg.sdf;
  const [bx, by, bz, bR] = cfg.bounds;
  const key = norm3(...cfg.key);
  const fill = norm3(...cfg.fill);
  const rim = norm3(...cfg.rim);
  const keyColor = linHex(cfg.keyColor ?? '#FFF4E4').map((c) => c * (cfg.keyIntensity ?? 2.4));
  const fillColor = linHex(cfg.fillColor ?? '#DCE6F0').map((c) => c * (cfg.fillIntensity ?? 0.45));
  const rimColor = linHex('#FFFFFF').map((c) => c * (cfg.rimIntensity ?? 0.7));
  const ambient = linHex(cfg.ambientColor ?? '#E8E6E1').map((c) => c * (cfg.ambient ?? 0.42));
  const wall = linHex(cfg.wall);
  const floor = linHex(cfg.floor);
  const exposure = cfg.exposure ?? 1;
  let cam = lookAt([0, 1, 4], [0, 0.5, 0], 30, A);
  let pxAngle = 1;
  let ph = 0;

  /** The paper sweep: floor fades into the wall, with a soft glow from the key. */
  function backdrop(dx, dy, dz) {
    const g = smooth(-0.12, 0.3, dy);
    const glow = Math.max(0, dx * key[0] + dz * key[2]) * 0.18 + Math.max(0, dy) * 0.12;
    return [
      (floor[0] + (wall[0] - floor[0]) * g) * (0.82 + glow),
      (floor[1] + (wall[1] - floor[1]) * g) * (0.82 + glow),
      (floor[2] + (wall[2] - floor[2]) * g) * (0.82 + glow),
    ];
  }

  function normalAt(x, y, z) {
    const e = 0.0007;
    const a = sdf(x + e, y - e, z - e);
    const b = sdf(x - e, y - e, z + e);
    const c = sdf(x - e, y + e, z - e);
    const d = sdf(x + e, y + e, z + e);
    return norm3(a - b - c + d, -a - b + c + d, -a + b - c + d);
  }

  function softShadow(x, y, z, k) {
    let res = 1;
    let t = 0.01;
    for (let i = 0; i < 48; i++) {
      const hh = sdf(x + key[0] * t, y + key[1] * t, z + key[2] * t);
      res = Math.min(res, (k * hh) / t);
      if (res < 0.002) return 0;
      t += clamp(hh, 0.008, 0.18);
      if (t > 4) break;
    }
    return clamp(res);
  }

  function occlusion(x, y, z, nx, ny, nz) {
    let occ = 0;
    let weight = 1;
    for (let i = 1; i <= 5; i++) {
      const hh = 0.04 * i;
      occ += (hh - sdf(x + nx * hh, y + ny * hh, z + nz * hh)) * weight;
      weight *= 0.7;
    }
    return clamp(1 - occ * 2.2, 0.25, 1);
  }

  /** Reflection of the studio: the key softbox as a bright panel, then the backdrop. */
  function environment(rx, ry, rz, rough) {
    // Overhead the studio is dark except for the softboxes; that contrast is what
    // makes metal and gloss read.
    const dim = 1 - 0.6 * smooth(0.25, 0.85, ry);
    const c = backdrop(rx, ry, rz).map((v) => v * dim);
    const k = rx * key[0] + ry * key[1] + rz * key[2];
    const panel = smooth(0.82 - rough * 0.5, 0.95 - rough * 0.25, k) * (2.2 - rough * 1.4);
    const back = smooth(0.9, 0.98, rx * rim[0] + ry * rim[1] + rz * rim[2]) * 0.9;
    // A tall strip light at the left: crisp vertical highlights on curved surfaces.
    const hl = Math.hypot(rx, rz) || 1;
    const strip = smooth(0.955, 0.985 - rough * 0.2, (rx * STRIP[0] + rz * STRIP[2]) / hl) * smooth(0.75, 0.2, Math.abs(ry)) * (1.8 - rough * 1.2);
    const add = back + strip;
    return [c[0] + keyColor[0] * panel * 0.45 + add, c[1] + keyColor[1] * panel * 0.45 + add, c[2] + keyColor[2] * panel * 0.45 + add];
  }

  function shadeObject(x, y, z, dx, dy, dz) {
    const [nx, ny, nz] = normalAt(x, y, z);
    const m = cfg.material(x, y, z, nx, ny, nz, ph);
    const ndv = Math.max(0, -(dx * nx + dy * ny + dz * nz));
    const wrap = m.wrap ?? 0;
    const ndk = (nx * key[0] + ny * key[1] + nz * key[2] + wrap) / (1 + wrap);
    const shadow = ndk > 0 ? softShadow(x + nx * 0.004, y + ny * 0.004, z + nz * 0.004, 10) : 0;
    const ao = occlusion(x, y, z, nx, ny, nz);
    const diffuse = Math.max(0, ndk) * shadow;
    const fillD = Math.max(0, nx * fill[0] + ny * fill[1] + nz * fill[2]);
    const rimD = (1 - ndv) ** 3 * Math.max(0, nx * rim[0] + ny * rim[1] + nz * rim[2]);
    const hemi = (0.55 + 0.45 * ny) * ao;
    const f0 = m.f0 ?? 0.04;
    const fres = f0 + (1 - f0) * (1 - ndv) ** 5;
    const vn = -(dx * nx + dy * ny + dz * nz);
    const env = environment(dx + 2 * vn * nx, dy + 2 * vn * ny, dz + 2 * vn * nz, m.rough ?? 0.3);
    const metal = m.metal ? 1 : 0;
    const out = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const a = m.albedo[i];
      const lit = keyColor[i] * diffuse + fillColor[i] * fillD + ambient[i] * hemi;
      const base = a * lit * (1 - metal) * (1 - fres);
      const spec = env[i] * (metal ? a : 1) * (metal ? 1 : fres) * ao * (0.4 + 0.6 * shadow);
      out[i] = base + spec + rimColor[i] * rimD * ao + (m.glow ? m.glow[i] * (0.4 + 0.6 * ndv * ndv) : 0);
    }
    return out;
  }

  function shadeFloor(x, z, dx, dy, dz) {
    const shadow = softShadow(x, 0.001, z, 9);
    // Contact darkening from the object's distance just above the floor.
    let occ = 0;
    for (let i = 1; i <= 4; i++) {
      const hh = 0.06 * i;
      occ += Math.max(0, hh - sdf(x, hh, z)) / i;
    }
    const ao = clamp(1 - occ * 1.6, 0.3, 1);
    const lit = [
      keyColor[0] * key[1] * shadow + ambient[0] * ao * 1.1,
      keyColor[1] * key[1] * shadow + ambient[1] * ao * 1.1,
      keyColor[2] * key[1] * shadow + ambient[2] * ao * 1.1,
    ];
    const base = cfg.floorAlbedo ? cfg.floorAlbedo(x, z) : floor;
    const c = [base[0] * lit[0], base[1] * lit[1], base[2] * lit[2]];
    if (cfg.floorGloss !== undefined) {
      // Polished stone: a fresnel reflection of the studio lights (not of the object).
      const fres = 0.035 + 0.965 * (1 - Math.max(0, -dy)) ** 5;
      const env = environment(dx, -dy, dz, cfg.floorGloss);
      const k = fres * (0.35 + 0.65 * shadow);
      for (let i = 0; i < 3; i++) c[i] += env[i] * k;
    }
    // The far floor melts into the sweep.
    const [f0, f1] = cfg.floorFade ?? [bR * 1.8, bR * 5];
    const far = smooth(f0, f1, Math.hypot(x - bx, z - bz));
    const back = backdrop(dx, dy, dz);
    return [c[0] + (back[0] - c[0]) * far, c[1] + (back[1] - c[1]) * far, c[2] + (back[2] - c[2]) * far];
  }

  return {
    frame(p) {
      ph = p;
      const c = cfg.camera(p);
      cam = lookAt(c.pos, c.target, cfg.fov, A);
      pxAngle = (2 * cam.tanV) / h;
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

      // Bounding sphere first; inside it, sphere-trace the object.
      let hitT = -1;
      let nearT = -1;
      let nearCover = 0;
      const ocx = ox - bx;
      const ocy = oy - by;
      const ocz = oz - bz;
      const bq = ocx * dx + ocy * dy + ocz * dz;
      const disc = bq * bq - (ocx * ocx + ocy * ocy + ocz * ocz - bR * bR);
      if (disc > 0) {
        const sq = Math.sqrt(disc);
        let t = Math.max(0.001, -bq - sq);
        const tEnd = -bq + sq;
        let best = Infinity;
        for (let i = 0; i < 160 && t < tEnd; i++) {
          const d = sdf(ox + dx * t, oy + dy * t, oz + dz * t);
          const ratio = d / (t * pxAngle);
          if (ratio < best) {
            best = ratio;
            nearT = t;
          }
          if (d < 0.00025 * t) {
            hitT = t;
            break;
          }
          t += d * 0.9;
        }
        // A ray that grazes the silhouette contributes partial coverage.
        if (hitT < 0 && best < 1) nearCover = 1 - Math.max(0, best);
      }

      const floorT = dy < 0 ? -oy / dy : -1;
      let behind;
      if (floorT > 0) behind = shadeFloor(ox + dx * floorT, oz + dz * floorT, dx, dy, dz);
      else behind = backdrop(dx, dy, dz);

      if (hitT > 0 && (floorT < 0 || hitT < floorT)) {
        return display(shadeObject(ox + dx * hitT, oy + dy * hitT, oz + dz * hitT, dx, dy, dz), exposure);
      }
      if (nearCover > 0 && (floorT < 0 || nearT < floorT)) {
        const o = shadeObject(ox + dx * nearT, oy + dy * nearT, oz + dz * nearT, dx, dy, dz);
        return display(
          [behind[0] + (o[0] - behind[0]) * nearCover, behind[1] + (o[1] - behind[1]) * nearCover, behind[2] + (o[2] - behind[2]) * nearCover],
          exposure,
        );
      }
      return display(behind, exposure);
    },
  };
}

/** A slow orbit around the product: azimuth sways, the camera eases in. */
function orbit(ph, target, distance, elevation, azimuth, sway) {
  const az = ((azimuth + sway * Math.sin(ph)) * Math.PI) / 180;
  const el = (elevation * Math.PI) / 180;
  const d = distance * (1 - 0.035 * (1 - Math.cos(ph)) * 0.5);
  return {
    pos: [target[0] + d * Math.cos(el) * Math.sin(az), target[1] + d * Math.sin(el), target[2] + d * Math.cos(el) * Math.cos(az)],
    target,
  };
}

const LIGHTS = { key: [-0.55, 0.75, 0.42], fill: [0.75, 0.3, 0.6], rim: [0.35, 0.5, -0.8] };

// ── Products ────────────────────────────────────────────────────────────────

export function mug(w, h) {
  const glaze = linHex('#8FA085');
  const inside = linHex('#C9C9BC');
  const foot = linHex('#B49A80');
  return studio(w, h, {
    ...LIGHTS,
    sdf(x, y, z) {
      const outer = sdCylinder(x, y - 0.42, z, 0.4, 0.42, 0.035);
      const inner = sdCylinder(x, y - 0.52, z, 0.355, 0.42, 0.03);
      const shell = Math.max(outer, -inner);
      const handle = Math.max(sdTorusXY(x - 0.43, y - 0.46, z, 0.17, 0.045), 0.36 - x);
      return smin(shell, handle, 0.03);
    },
    material(x, y, z) {
      const r = Math.hypot(x, z);
      if (y < 0.035 && r > 0.33) return { albedo: foot, f0: 0.03, rough: 0.7 }; // unglazed foot ring
      const interior = r < 0.36 && y > 0.1;
      const speck = 0.94 + 0.06 * noise(x * 60, y * 60 + z * 60, 3);
      return { albedo: (interior ? inside : glaze).map((c) => c * speck), f0: 0.05, rough: 0.12 };
    },
    bounds: [0.08, 0.45, 0, 0.78],
    wall: '#DAD5CC',
    floor: '#CFC9BE',
    camera: (ph) => orbit(ph, [0.06, 0.4, 0], 4.3, 16, -28, 10),
    fov: 30,
    exposure: 0.88,
  });
}

export function bottle(w, h) {
  const amber = linHex('#3A1806');
  const amberGlow = linHex('#C46A1C').map((c) => c * 0.22);
  const paper = linHex('#ECE6DA');
  const ink = linHex('#2F2B27');
  const brass = linHex('#B89A63');
  const rubber = linHex('#201E1D');
  return studio(w, h, {
    ...LIGHTS,
    sdf(x, y, z) {
      const body = sdCylinder(x, y - 0.4, z, 0.27, 0.4, 0.07);
      const neck = sdCylinder(x, y - 0.86, z, 0.115, 0.08, 0.03);
      const collar = sdCylinder(x, y - 0.99, z, 0.135, 0.06, 0.012);
      const bulb = sdCapsule(x, y, z, 1.08, 1.27, 0.095);
      return Math.min(smin(body, neck, 0.13), collar, bulb);
    },
    material(x, y, z) {
      if (y > 1.055) return { albedo: rubber, f0: 0.035, rough: 0.55 };
      if (y > 0.925) return { albedo: brass, metal: true, rough: 0.28 };
      const r = Math.hypot(x, z);
      if (r > 0.255 && Math.abs(y - 0.4) < 0.17) {
        // Paper label wrapped around the body; its print follows the curve.
        const a = Math.atan2(x, z);
        const title = Math.abs(y - 0.46) < 0.018 && Math.abs(a - 0.35) < 0.42;
        const line = (Math.abs(y - 0.4) < 0.006 || Math.abs(y - 0.37) < 0.006) && Math.abs(a - 0.35) < 0.55;
        return { albedo: title ? ink : line ? ink.map((c, i) => c + (paper[i] - c) * 0.45) : paper, f0: 0.03, rough: 0.6 };
      }
      return { albedo: amber, f0: 0.08, rough: 0.03, glow: amberGlow };
    },
    bounds: [0, 0.66, 0, 0.78],
    wall: '#E6DDD0',
    floor: '#D9CEBD',
    camera: (ph) => orbit(ph, [0, 0.62, 0], 4.1, 10, 18, 10),
    fov: 30,
    exposure: 0.95,
  });
}

export function jar(w, h) {
  const frost = linHex('#D9DFDA');
  const lid = linHex('#252423');
  const stone = linHex('#8C8A84');
  return studio(w, h, {
    ...LIGHTS,
    sdf(x, y, z) {
      const body = sdCylinder(x, y - 0.27, z, 0.48, 0.27, 0.05);
      const cap = sdCylinder(x, y - 0.62, z, 0.5, 0.09, 0.025);
      const pebble = sdEllipsoid(x - 0.8, y - 0.075, z - 0.34, 0.2, 0.085, 0.15) + 0.005 * (noise(x * 18, z * 18, 5) - 0.5);
      return Math.min(body, cap, pebble);
    },
    material(x, y, z) {
      if (Math.hypot(x - 0.8, z - 0.34) < 0.26 && y < 0.2) {
        return { albedo: stone.map((c) => c * (0.85 + 0.25 * noise(x * 70, z * 70, 6))), f0: 0.03, rough: 0.8 };
      }
      if (y > 0.525) return { albedo: lid, f0: 0.045, rough: 0.42 };
      return { albedo: frost, f0: 0.04, rough: 0.5, wrap: 0.6 };
    },
    bounds: [0.3, 0.38, 0.12, 1.05],
    wall: '#BBC4B3',
    floor: '#ADB8A5',
    camera: (ph) => orbit(ph, [0.32, 0.32, 0.1], 5.0, 15, -14, 9),
    fov: 30,
    exposure: 0.92,
  });
}

/** A watch lying on polished marble, seen from above at an angle. */
export function watch(w, h) {
  const steel = linHex('#C7CBCF');
  const dial = linHex('#EFEBE2');
  const ink = linHex('#2A2A28');
  const second = linHex('#A34B30');
  const leather = linHex('#6F4E36');
  const thread = linHex('#D9CBB4');
  const marbleBase = linHex('#ECEBE7');
  const veinColor = linHex('#A9A6A0');
  const marble = field2((x, z) => {
    const vein = Math.abs(Math.sin((x * 1.5 + z * 0.9) * TAU * 0.6 + 3.2 * fbm(x * 1.6, z * 1.6, 5, 62)));
    const fine = Math.abs(Math.sin((-x * 0.8 + z * 2) * TAU + 2.6 * fbm(x * 2.6 + 7, z * 2.6, 4, 63)));
    const cloud = fbm(x * 2, z * 2, 4, 61) - 0.5;
    return clamp(smooth(0.1, 0, vein) * 0.55 + smooth(0.05, 0, fine) * 0.25 - cloud * 0.12);
  }, [-4, 4, -4, 4], 1600, 1600);
  // Hands as clock angles (clockwise from 12, which points toward -z).
  const hands = [
    { a: (305 / 360) * TAU, len: 0.2, wid: 0.011, color: ink },
    { a: (60 / 360) * TAU, len: 0.3, wid: 0.008, color: ink },
    { a: (252 / 360) * TAU, len: 0.32, wid: 0.003, color: second },
  ];
  const onHand = (x, z, hand) => {
    const ux = Math.sin(hand.a);
    const uz = -Math.cos(hand.a);
    const along = x * ux + z * uz;
    const across = Math.abs(x * uz - z * ux);
    const taper = hand.wid * (1 - 0.5 * clamp(along / hand.len));
    return along > -0.04 && along < hand.len && across < taper;
  };
  const dialAlbedo = (x, z) => {
    const r = Math.hypot(x, z);
    const th = Math.atan2(x, -z);
    let c = dial.map((v) => v * (1 + 0.015 * Math.cos(th * 90)));
    // Hour markers (a double one at twelve) and the minute track.
    const k = Math.round(th / (TAU / 12));
    const ma = k * (TAU / 12);
    const along = x * Math.sin(ma) - z * Math.cos(ma);
    const across = Math.abs(x * Math.cos(ma) + z * Math.sin(ma));
    const twelve = ((k % 12) + 12) % 12 === 0;
    if (along > 0.28 && along < 0.335 && (twelve ? Math.abs(across - 0.012) < 0.006 : across < 0.008)) c = ink;
    if (Math.abs(r - 0.345) < 0.0016) c = ink.map((v, i) => v + (dial[i] - v) * 0.4);
    // Hands, with a soft offset shadow from the key light.
    for (const hand of hands) {
      if (onHand(x - 0.008, z - 0.01, hand)) c = c.map((v) => v * 0.82);
    }
    for (const hand of hands) if (onHand(x, z, hand)) c = hand.color;
    if (r < 0.016) c = ink;
    return c;
  };
  return studio(w, h, {
    ...LIGHTS,
    sdf(x, y, z) {
      const caseBody = Math.max(sdCylinder(x, y - 0.095, z, 0.44, 0.06, 0.022), -sdCylinder(x, y - 0.21, z, 0.372, 0.07, 0));
      const strap = sdBox(x, y - 0.018, z, 0.17, 0.018, 3.2, 0.012);
      const lugs = sdBox(Math.abs(x) - 0.13, y - 0.07, Math.abs(z) - 0.42, 0.028, 0.035, 0.07, 0.012);
      const crown = sdBox(x - 0.47, y - 0.095, z, 0.035, 0.03, 0.04, 0.014);
      return Math.min(caseBody, strap, lugs, crown);
    },
    material(x, y, z) {
      const r = Math.hypot(x, z);
      if (r < 0.375 && y > 0.12) return { albedo: dialAlbedo(x, z), f0: 0.045, rough: 0.04 }; // dial under crystal
      if (r < 0.46 && y > 0.03) return { albedo: steel, metal: true, rough: r > 0.37 && y > 0.13 ? 0.12 : 0.32 };
      if (x > 0.43) return { albedo: steel, metal: true, rough: 0.2 }; // crown
      if (Math.abs(x) > 0.1 && Math.abs(z) > 0.34 && Math.abs(z) < 0.5 && y > 0.035) return { albedo: steel, metal: true, rough: 0.2 };
      // Leather strap: stitched edges and buckle holes on the lower half.
      let c = leather.map((v) => v * (0.88 + 0.22 * noise(x * 90, z * 90, 64)));
      if (Math.abs(Math.abs(x) - 0.145) < 0.004 && ((z * 14) % 1 + 1) % 1 < 0.55) c = thread;
      for (const hz of [0.72, 0.86, 1.0]) if (Math.hypot(x, z - hz) < 0.022) c = leather.map((v) => v * 0.3);
      return { albedo: c, f0: 0.03, rough: 0.6 };
    },
    bounds: [0, 0.1, 0, 3.3],
    floorAlbedo: (x, z) => {
      const v = marble(x, z);
      return marbleBase.map((c, i) => c + (veinColor[i] - c) * v);
    },
    floorGloss: 0.25,
    floorFade: [6, 9],
    wall: '#E9E7E3',
    floor: '#ECEBE7',
    camera: (ph) => orbit(ph, [0, 0.05, 0], 3.3, 62, 22, 7),
    fov: 30,
    exposure: 0.9,
  });
}

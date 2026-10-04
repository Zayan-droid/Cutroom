// Flat 2-D scenes: subjects that are themselves flat or seen straight on
// (a shoreline from a drone, a sunlit wall, grass against the sky), drawn with
// layered procedural shading.
import { clamp, fbm, field1, field2, gauss, hash, hex, mix, mul, smooth } from './kit.mjs';

export function shoreline(w, h) {
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

export function dappled(w, h) {
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

export function grass(w, h) {
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

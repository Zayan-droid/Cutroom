// Regenerate the original offline mock clips with Node and ffmpeg on PATH.
// Run from the repository root: node src/assets/generate.mjs
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const output = dirname(fileURLToPath(import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'cutroom-clips-'));
const palettes = [
  [[22, 17, 57], [109, 59, 155], [255, 168, 104], [252, 225, 182]],
  [[10, 38, 54], [21, 117, 127], [153, 231, 215], [240, 249, 219]],
  [[55, 18, 41], [151, 48, 81], [248, 157, 134], [255, 228, 204]],
  [[13, 27, 71], [70, 89, 188], [206, 180, 255], [235, 231, 255]],
];
const dimensions = {
  social: { render: [720, 1280], draft: [180, 320] },
  ad: { render: [864, 1080], draft: [256, 320] },
  cinematic: { render: [1280, 720], draft: [320, 180] },
};

const clamp = (value) => Math.min(1, Math.max(0, value));
const blend = (a, b, amount) => a.map((v, i) => v + (b[i] - v) * clamp(amount));
const mask = (distance, feather = 0.002) => clamp(0.5 - distance / feather);
const roundedBox = (x, y, cx, cy, w, h, r) => {
  const qx = Math.abs(x - cx) - w + r;
  const qy = Math.abs(y - cy) - h + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};

function scene(kind, variant, width, height) {
  const [dark, mid, bright, light] = palettes[variant];
  const data = Buffer.alloc(width * height * 3);
  const ratio = width / height;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const u = col / width;
      const v = row / height;
      const x = (u - 0.5) * ratio;
      const y = v - 0.5;
      let color = blend(dark, mid, 0.16 + v * 0.48);
      if (kind === 'social') {
        const centerX = (variant % 2 ? -0.03 : 0.03);
        const centerY = -0.09 + variant * 0.015;
        const radius = Math.hypot(x - centerX, y - centerY);
        color = blend(color, bright, Math.exp(-radius * radius * 14) * 0.37);
        const wave = v - (0.75 + 0.09 * Math.sin(u * 5 + variant));
        color = blend(color, dark, mask(-wave));
        color = blend(color, bright, mask(Math.abs(wave) - 0.006) * 0.65);
        const orbit = Math.hypot((x - centerX) * 0.82, (y - centerY) * 1.4);
        color = blend(color, light, mask(Math.abs(orbit - 0.252) - 0.0015) * 0.65);
        const body = mask(radius - 0.172);
        const sphere = blend(mid, bright, clamp(0.55 - (x - centerX) * 2.4 - (y - centerY) * 2.0));
        color = blend(color, sphere, body);
        color = blend(color, light, Math.exp(-((x - centerX + 0.053) ** 2 + (y - centerY + 0.07) ** 2) * 450) * body * 0.72);
        const dot = Math.hypot(x + 0.12, y - 0.21);
        color = blend(color, bright, mask(dot - 0.028));
      } else if (kind === 'ad') {
        const halo = Math.hypot(x, y + 0.09);
        color = blend(color, bright, Math.exp(-halo * halo * 11) * 0.32);
        const haloEdge = mask(Math.abs(halo - 0.27) - 0.002);
        color = blend(color, light, haloEdge * 0.24);
        const pedestal = roundedBox(x, y, 0, 0.3, 0.25, 0.045, 0.018);
        color = blend(color, blend(mid, bright, 0.4 - y), mask(pedestal));
        const shadow = Math.exp(-x * x * 105 - (y - 0.249) ** 2 * 2300);
        color = blend(color, dark, shadow * 0.6);
        const bottle = roundedBox(x, y, 0, 0.015, 0.105, 0.217, 0.025);
        const material = blend(mid, bright, 0.68 - x * 3 + Math.sin(x * 22) * 0.12);
        color = blend(color, material, mask(bottle));
        const cap = roundedBox(x, y, 0, -0.209, 0.07, 0.035, 0.008);
        color = blend(color, blend(dark, mid, 0.8 - x * 3), mask(cap));
        const label = roundedBox(x, y, 0, 0.035, 0.077, 0.079, 0.001);
        color = blend(color, light, mask(label) * 0.9);
        const mark = Math.abs(Math.hypot(x, y + 0.002) - 0.024);
        color = blend(color, mid, mask(mark - 0.0015));
        for (let line = 0; line < 3; line++) {
          const lineWidth = line === 0 ? 0.038 : 0.027;
          color = blend(color, mid, mask(roundedBox(x, y, 0, 0.046 + line * 0.008, lineWidth, 0.001, 0)) * 0.6);
        }
        color = blend(color, light, mask(roundedBox(x, y, -0.084, 0, 0.002, 0.17, 0.002)) * 0.33);
      } else {
        color = blend(dark, bright, clamp(v * 1.25) * 0.85);
        const sunX = 0.18 - variant * 0.115;
        const sunY = -0.11 + (variant % 2) * 0.04;
        const sun = Math.hypot(x - sunX, y - sunY);
        color = blend(color, light, Math.exp(-sun * sun * 14) * 0.42);
        color = blend(color, light, mask(sun - 0.076));
        for (let ridge = 0; ridge < 4; ridge++) {
          const horizon = 0.45 + ridge * 0.12 + Math.sin(u * (7 + ridge * 1.8) + variant + ridge) * (0.08 - ridge * 0.013) + Math.sin(u * 20 + ridge) * 0.016;
          const mountain = blend(dark, mid, 0.7 - ridge * 0.2);
          color = blend(color, mountain, mask(horizon - v, 0.003));
        }
        const mist = Math.exp(-((v - 0.58) ** 2) * 220) * 0.13;
        color = blend(color, light, mist);
      }
      const vignette = clamp(1 - (x * x + y * y) * 0.36);
      const index = (row * width + col) * 3;
      for (let c = 0; c < 3; c++) data[index + c] = Math.round(color[c] * vignette);
    }
  }
  return Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`), data]);
}

function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `ffmpeg exited ${result.status}`);
}

try {
  for (const [kind, sizes] of Object.entries(dimensions)) {
    for (let variant = 0; variant < 4; variant++) {
      const [width, height] = sizes.render;
      const still = join(scratch, `${kind}-${variant}.ppm`);
      const render = join(output, `${kind}-${variant + 1}-render.mp4`);
      const draft = join(output, `${kind}-${variant + 1}-draft.mp4`);
      writeFileSync(still, scene(kind, variant, width, height));
      try {
        const phase = variant * Math.PI / 2;
        const zoom = `1.045+0.012*sin(on/72*2*PI+${phase})`;
        const panX = `iw/2-iw/zoom/2+iw*0.006*sin(on/72*2*PI+${phase})`;
        const panY = `ih/2-ih/zoom/2+ih*0.006*cos(on/72*2*PI+${phase})`;
        ffmpeg(['-i', still, '-vf', `zoompan=z='${zoom}':x='${panX}':y='${panY}':d=72:s=${width}x${height}:fps=24`, '-frames:v', '72', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '25', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', render]);
        ffmpeg(['-i', render, '-vf', `scale=${sizes.draft[0]}:${sizes.draft[1]}:flags=lanczos,fps=12`, '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '31', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', draft]);
        console.log(`Generated ${kind} ${variant + 1} (draft + render)`);
      } finally {
        unlinkSync(still);
      }
    }
  }
} finally {
  // Only the unique temporary directory created by this process is removed.
  rmdirSync(scratch);
}

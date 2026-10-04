// Regenerate the offline sample clips with Node and ffmpeg on PATH.
// Run from the repository root:
//   node src/assets/generate.mjs                  all 24 clips, scenes rendered in parallel
//   node src/assets/generate.mjs ad-3 social-1    only the named scenes (draft + render)
//   node src/assets/generate.mjs --preview <dir>  one PNG still per scene, for review
//
// Every frame is original procedural imagery (no downloaded media, fonts, or
// audio): raymarched landscapes and studio product shots, plus a few flat
// scenes. All motion is periodic over the clip, so each 3-second clip loops.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cpus } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { TAU, clamp } from './scenes/kit.mjs';
import { dappled, grass, shoreline } from './scenes/flat.mjs';
import { alpine, alpineLake, coast, dunes, highland } from './scenes/terrain.mjs';
import { bottle, jar, mug, watch } from './scenes/studio.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FPS = 24;
const FRAMES = 72; // 3 s; every motion completes a whole cycle in this span
// Drafts are the same footage at half resolution and half the frame rate.
const SIZES = {
  social: { render: [720, 1280], draft: [360, 640] },
  ad: { render: [864, 1080], draft: [432, 540] },
  cinematic: { render: [1280, 720], draft: [640, 360] },
};

// Index i is the file `<intent>-<i + 1>-{draft,render}.mp4`.
const SCENES = {
  social: [shoreline, dappled, alpineLake, grass],
  ad: [mug, bottle, watch, jar],
  cinematic: [highland, coast, dunes, alpine],
};

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
    '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-tune', 'film',
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
    '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '27',
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

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FRAME_ASPECTS,
  clampCrop,
  containRect,
  cropLockAspect,
  cropToFractions,
  formatClock,
  lockCrop,
  moveCrop,
  placeAspect,
  planEdit,
  resizeCrop,
  setCropOrigin,
  setCropSize,
  sourcePlan,
  trimRange,
  upscaleChoices,
} from '../src/edit/geometry.ts';
import {
  canonicalRecipe,
  cloneRecipe,
  createRecipe,
  describeRecipe,
  formatFactor,
  hasChanges,
  isUnchanged,
  normalizeRecipe,
  recipeSlug,
  summarizeRecipe,
} from '../src/edit/recipe.ts';

// The editor's picture math is pure, so the preview, the stage, and the
// exporter all draw from one tested plan.

const HD = { width: 1280, height: 720 };
const recipe = (patch = {}) => ({ ...createRecipe(), ...patch });
const near = (actual, expected, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ≈ ${expected}`);

test('placeAspect finds the largest rect of a shape and slides it along the free axis', () => {
  const frame = { x: 0, y: 0, ...HD };
  assert.deepEqual(placeAspect(frame, 9 / 16), { x: 437.5, y: 0, width: 405, height: 720 });
  assert.deepEqual(placeAspect(frame, 9 / 16, { x: 0, y: 0.5 }), { x: 0, y: 0, width: 405, height: 720 });
  assert.deepEqual(placeAspect(frame, 9 / 16, { x: 1, y: 0.5 }), { x: 875, y: 0, width: 405, height: 720 });
  // Wider than the bounds: full width, slides vertically; out-of-range positions clamp.
  const strip = placeAspect({ x: 100, y: 50, width: 400, height: 400 }, 2, { x: 0.5, y: 7 });
  assert.deepEqual(strip, { x: 100, y: 250, width: 400, height: 200 });
});

test('crop locks resolve to the largest crop of that shape around the current centre', () => {
  assert.equal(cropLockAspect('free', HD), null);
  near(cropLockAspect('original', HD), 16 / 9);
  assert.equal(cropLockAspect('4:5', HD), 0.8);
  const centred = lockCrop({ x: 0, y: 0, ...HD }, HD, FRAME_ASPECTS['9:16']);
  assert.deepEqual(centred, { x: 438, y: 0, width: 405, height: 720 });
  // A crop near the right edge keeps its place but stays inside the frame.
  const right = lockCrop({ x: 1200, y: 100, width: 60, height: 60 }, HD, 1);
  assert.deepEqual(right, { x: 560, y: 0, width: 720, height: 720 });
  assert.deepEqual(lockCrop({ x: 10.4, y: 20.6, width: 100.2, height: 50 }, HD, null), { x: 10, y: 21, width: 100, height: 50 });
});

test('free crop handles move only the grabbed edges and stop at the frame and the minimum size', () => {
  const full = { x: 0, y: 0, ...HD };
  assert.deepEqual(resizeCrop(full, 'se', -100, -50, HD, null), { x: 0, y: 0, width: 1180, height: 670 });
  assert.deepEqual(resizeCrop(full, 'w', 300, 999, HD, null), { x: 300, y: 0, width: 980, height: 720 });
  assert.deepEqual(resizeCrop(full, 'e', 500, 0, HD, null), full, 'cannot grow past the frame');
  const tiny = resizeCrop(full, 'nw', 5000, 5000, HD, null);
  assert.deepEqual(tiny, { x: 1248, y: 688, width: 32, height: 32 }, 'cannot cross the opposite edge');
});

test('locked crop handles keep the ratio and stay inside the frame', () => {
  const square = { x: 100, y: 100, width: 400, height: 400 };
  const corner = resizeCrop(square, 'se', 200, 50, HD, 1);
  assert.deepEqual(corner, { x: 100, y: 100, width: 600, height: 600 }, 'follows the axis that moved further');
  const capped = resizeCrop(square, 'se', 2000, 2000, HD, 1);
  assert.deepEqual(capped, { x: 100, y: 100, width: 620, height: 620 }, 'limited by room below the anchor');
  const edge = resizeCrop({ x: 0, y: 600, width: 100, height: 100 }, 'e', 300, 0, HD, 1);
  assert.deepEqual(edge, { x: 0, y: 320, width: 400, height: 400 }, 'slides up to stay inside');
  const north = resizeCrop({ x: 600, y: 300, width: 160, height: 90 }, 'n', 0, -90, HD, 16 / 9);
  assert.deepEqual(north, { x: 520, y: 210, width: 320, height: 180 }, 'grows from the bottom edge, centred');
  for (const handle of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
    const shrunk = resizeCrop(square, handle, handle.includes('w') ? 900 : -900, handle.includes('n') ? 900 : -900, HD, 9 / 16);
    assert.ok(shrunk.width >= 32 && shrunk.height >= 32, `${handle} keeps the minimum size`);
    near(shrunk.width / shrunk.height, 9 / 16, 0.05);
  }
});

test('moving and typing a crop clamps it to the frame', () => {
  const crop = { x: 100, y: 100, width: 400, height: 300 };
  assert.deepEqual(moveCrop(crop, -500, 9000, HD), { x: 0, y: 420, width: 400, height: 300 });
  assert.deepEqual(setCropSize(crop, { width: 800 }, HD, 16 / 9), { x: 100, y: 100, width: 800, height: 450 });
  assert.deepEqual(setCropSize(crop, { height: 9000 }, HD, 16 / 9), { x: 0, y: 0, width: 1280, height: 720 }, 'shrinks to fit');
  assert.deepEqual(setCropSize(crop, { width: 5 }, HD, null), { x: 100, y: 100, width: 32, height: 300 });
  assert.deepEqual(setCropOrigin(crop, { x: 1000 }, HD), { x: 880, y: 100, width: 400, height: 300 });
  assert.deepEqual(clampCrop({ x: -20, y: -20, width: 9999, height: 9999 }, HD), { x: 0, y: 0, ...HD });
  assert.deepEqual(cropToFractions({ x: 320, y: 180, width: 640, height: 360 }, HD), { x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
});

test('the untouched recipe plans the source frame as-is', () => {
  const plan = planEdit(createRecipe(), HD);
  assert.deepEqual(plan, sourcePlan(HD));
  assert.deepEqual(plan, {
    width: 1280, height: 720, src: { x: 0, y: 0, ...HD }, dst: { x: 0, y: 0, ...HD }, background: null, scale: 1, upscale: 1,
  });
});

test('a crop plans its region at its own pixel size', () => {
  const plan = planEdit(recipe({ crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } }), HD);
  assert.deepEqual(plan.src, { x: 320, y: 180, width: 640, height: 360 });
  assert.equal(plan.width, 640);
  assert.equal(plan.height, 360);
  assert.equal(plan.background, null);
});

test('reframing to fill cuts the overflow at the chosen position', () => {
  const centre = planEdit(recipe({ frame: '9:16' }), HD);
  assert.deepEqual(centre.src, { x: 437.5, y: 0, width: 405, height: 720 });
  assert.deepEqual([centre.width, centre.height], [406, 720], 'even sizes for video encoders');
  assert.equal(centre.background, null);
  assert.equal(planEdit(recipe({ frame: '9:16', position: { x: 0, y: 0.5 } }), HD).src.x, 0);
  assert.equal(planEdit(recipe({ frame: '9:16', position: { x: 1, y: 0.5 } }), HD).src.x, 875);
  const square = planEdit(recipe({ frame: '1:1', crop: { x: 0, y: 0, width: 0.5, height: 1 } }), HD);
  assert.deepEqual(square.src, { x: 0, y: 40, width: 640, height: 640 }, 'reframes the crop, not the whole frame');
});

test('reframing to fit keeps the whole picture and fills the bars', () => {
  const plan = planEdit(recipe({ frame: '9:16', fit: 'fit' }), HD);
  assert.deepEqual(plan.src, { x: 0, y: 0, ...HD });
  assert.deepEqual([plan.width, plan.height], [1280, 2276]);
  near(plan.dst.x, 0);
  near(plan.dst.width, 1280);
  near(plan.dst.y + plan.dst.height / 2, plan.height / 2, 0.5);
  assert.deepEqual(plan.background, { kind: 'blur', src: { x: 437.5, y: 0, width: 405, height: 720 } });
  const top = planEdit(recipe({ frame: '9:16', fit: 'fit', position: { x: 0.5, y: 0 }, background: 'white' }), HD);
  assert.equal(top.dst.y, 0);
  assert.deepEqual(top.background, { kind: 'color', color: 'white' });
  const pillar = planEdit(recipe({ frame: '16:9', fit: 'fit', background: 'black' }), { width: 720, height: 1280 });
  assert.equal(pillar.height, 1280);
  near(pillar.dst.x, (pillar.width - 720) / 2, 1);
});

test('upscaling sizes the short side to the target and never shrinks or passes UHD', () => {
  const hd = planEdit(recipe({ upscale: '1080p' }), HD);
  assert.deepEqual([hd.width, hd.height, hd.scale, hd.upscale], [1920, 1080, 1.5, 1.5]);
  const tall = planEdit(recipe({ frame: '9:16', upscale: '4k' }), HD);
  assert.deepEqual([tall.width, tall.height], [2160, 3840]);
  const already = planEdit(recipe({ upscale: '1080p' }), { width: 1920, height: 1080 });
  assert.deepEqual([already.width, already.height, already.upscale], [1920, 1080, 1]);
  const strip = planEdit(recipe({ crop: { x: 0, y: 0, width: 1, height: 300 / 720 }, upscale: '4k' }), HD);
  assert.deepEqual([strip.width, strip.height, strip.upscale], [3840, 900, 3], 'long side capped at 3840');
  const choices = upscaleChoices(createRecipe(), HD);
  assert.deepEqual(choices.map((c) => [c.id, c.width, c.height, c.available]), [
    ['none', 1280, 720, true], ['1080p', 1920, 1080, true], ['1440p', 2560, 1440, true], ['4k', 3840, 2160, true],
  ]);
  const big = upscaleChoices(createRecipe(), { width: 2560, height: 1440 });
  assert.deepEqual(big.map((c) => c.available), [true, false, false, true]);
});

test('containRect letterboxes a frame inside a box', () => {
  assert.deepEqual(containRect({ width: 1600, height: 900 }, { width: 800, height: 800 }), { x: 0, y: 175, width: 800, height: 450 });
  assert.deepEqual(containRect({ width: 9, height: 16 }, { width: 900, height: 800 }), { x: 225, y: 0, width: 450, height: 800 });
});

test('trims clamp to the clip and keep a minimum length; clocks show tenths', () => {
  assert.deepEqual(trimRange(null, 3), { start: 0, end: 3 });
  assert.deepEqual(trimRange({ start: 0.5, end: 2.5 }, 3), { start: 0.5, end: 2.5 });
  assert.deepEqual(trimRange({ start: 2.9, end: 9 }, 3), { start: 2.8, end: 3 });
  assert.deepEqual(trimRange({ start: -1, end: 0 }, 3), { start: 0, end: 0.2 });
  assert.deepEqual(trimRange({ start: 1, end: 2 }, Number.NaN), { start: 0, end: 0 });
  assert.equal(formatClock(0), '0:00.0');
  assert.equal(formatClock(2.46), '0:02.5');
  assert.equal(formatClock(59.96), '1:00.0');
  assert.equal(formatClock(125.25, 2), '2:05.25');
  assert.equal(formatClock(-3, 0), '0:00');
});

test('recipes are validated, clamped, and copied rather than shared', () => {
  const base = createRecipe();
  assert.deepEqual(normalizeRecipe(base), base);
  assert.notEqual(normalizeRecipe(base).crop, base.crop);
  const copy = cloneRecipe({ ...base, trim: { start: 1, end: 2 } });
  assert.deepEqual(copy.trim, { start: 1, end: 2 });
  const clamped = normalizeRecipe({ ...base, crop: { x: 0.9, y: -1, width: 0.5, height: 7 }, position: { x: 3, y: -2 } });
  assert.deepEqual(clamped.crop, { x: 0.5, y: 0, width: 0.5, height: 1 });
  assert.deepEqual(clamped.position, { x: 1, y: 0 });
  for (const bad of [
    null, 'crop', { ...base, crop: null }, { ...base, frame: '21:9' }, { ...base, upscale: '8k' },
    { ...base, fit: 'stretch' }, { ...base, background: 'red' }, { ...base, cropAspect: '2:1' },
    { ...base, crop: { ...base.crop, width: Number.NaN } }, { ...base, trim: { start: 2, end: 1 } }, { ...base, trim: 'all' },
  ]) {
    assert.equal(normalizeRecipe(bad), null, JSON.stringify(bad));
  }
});

test('change detection ignores settings that do nothing for this source', () => {
  assert.equal(hasChanges(createRecipe()), false);
  assert.equal(hasChanges(recipe({ upscale: '1080p' })), true);
  assert.equal(hasChanges(recipe({ fit: 'fit', background: 'white', position: { x: 0, y: 1 } })), false, 'fit only matters when reframing');
  // A 16:9 reframe of a full 16:9 frame, an upscale that can't enlarge, and a whole-clip trim are no-ops.
  const noop = recipe({ frame: '16:9', upscale: '1080p', trim: { start: 0, end: 3 } });
  assert.equal(isUnchanged(noop, { width: 1920, height: 1080 }, 3), true);
  assert.deepEqual(canonicalRecipe(noop, { width: 1920, height: 1080 }, 3), createRecipe());
  assert.equal(isUnchanged(noop, HD, 3), false, 'the upscale still enlarges a 720p clip');
  assert.equal(isUnchanged(recipe({ trim: { start: 0.5, end: 3 } }), HD, 3), false);
});

test('descriptions name each change plainly, in pipeline order', () => {
  const edit = recipe({
    crop: { x: 0, y: 0, width: 0.5, height: 1 }, frame: '9:16', fit: 'fit', background: 'black',
    upscale: '1080p', trim: { start: 0.5, end: 2.75 },
  });
  assert.deepEqual(describeRecipe(edit, HD, 3).map((c) => c.text), [
    'Cropped to 640 × 720',
    'Reframed to 9:16, fitted with black bars',
    'Upscaled to 1080 × 1920 (1.69×)',
    'Trimmed to 0:00.5–0:02.8 (2.3 s)',
  ]);
  assert.deepEqual(describeRecipe(recipe({ upscale: '4k' })).map((c) => c.tool), ['upscale']);
  assert.deepEqual(describeRecipe(recipe({ upscale: '1080p' }), { width: 1920, height: 1080 }), [], 'an upscale with no effect is not claimed');
  assert.equal(summarizeRecipe(edit), 'Crop · 9:16 fit · 1080p · Trim');
  assert.equal(summarizeRecipe(recipe({ frame: '1:1' })), '1:1');
  assert.equal(summarizeRecipe(createRecipe()), 'No changes');
  assert.equal(recipeSlug(edit), 'crop-9x16-fit-1080p-trim');
  assert.equal(recipeSlug(recipe({ upscale: '4k' })), '4k');
  assert.equal(recipeSlug(createRecipe()), 'edit');
  assert.equal(formatFactor(1.5), '1.5×');
  assert.equal(formatFactor(2), '2×');
});

import type { Rect, RenderPlan, Size } from '@/edit/geometry';

// Draws one frame of an edit: background (blurred cover or flat color), then
// the picture. WebGL 2 is the main path; it enlarges with a Catmull-Rom
// bicubic filter and, for exports, sharpens with contrast-adaptive sharpening
// (AMD FidelityFX CAS). A Canvas 2D path covers browsers without WebGL 2 and
// files whose host blocks reading their pixels (preview only).

export type RenderSource = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap;

export interface DrawOptions {
  /** 'export' enlarges with the sharp filter and sharpens; 'preview' favours speed. */
  quality?: 'preview' | 'export';
  /** The part of the output frame to show, in output pixels. Defaults to the whole frame. */
  view?: Rect;
}

export interface FrameRenderer {
  readonly kind: 'webgl' | '2d';
  /** Draw `source` (of `size` pixels) through `plan` into the canvas at its current pixel size. */
  draw(source: RenderSource, size: Size, plan: RenderPlan, options?: DrawOptions): void;
  dispose(): void;
}

/** The source's pixels can't be read (a cross-origin file served without CORS). */
export class SourceBlockedError extends Error {
  constructor() {
    super("This file's host doesn't allow it to be edited in the browser.");
    this.name = 'SourceBlockedError';
  }
}

/** Bars behind a fitted picture are darkened slightly so the picture stands out. */
const BACKGROUND_GAIN = 0.8;
/** Long side of the working image the blurred background is made from. */
const BLUR_SIZE = 96;
/** Sharpening strength for upscaled exports (0 soft – 1 strong). */
const SHARPNESS = 0.4;

export function createRenderer(
  canvas: HTMLCanvasElement,
  options: { prefer?: 'webgl' | '2d'; preserveDrawingBuffer?: boolean } = {},
): FrameRenderer {
  if (options.prefer !== '2d') {
    const gl = createWebGLRenderer(canvas, options.preserveDrawingBuffer ?? false);
    if (gl) return gl;
  }
  return create2DRenderer(canvas);
}

function isVideo(source: RenderSource): source is HTMLVideoElement {
  return typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement;
}

/** A video with no decoded frame yet draws nothing (and WebGL would error). */
function hasFrame(source: RenderSource): boolean {
  if (isVideo(source)) return source.readyState >= 2 && source.videoWidth > 0;
  if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) return source.complete && source.naturalWidth > 0;
  return true;
}

interface Mapping {
  map(rect: Rect): Rect;
  /** Canvas pixels per output pixel. */
  scale: number;
}

function viewMapping(canvas: { width: number; height: number }, plan: RenderPlan, view?: Rect): Mapping {
  const v = view ?? { x: 0, y: 0, width: plan.width, height: plan.height };
  const sx = canvas.width / v.width;
  const sy = canvas.height / v.height;
  return {
    map: (r) => ({ x: (r.x - v.x) * sx, y: (r.y - v.y) * sy, width: r.width * sx, height: r.height * sy }),
    scale: Math.min(sx, sy),
  };
}

// ── WebGL 2 ───────────────────────────────────────────────────────────────────

const VERTEX = `#version 300 es
layout(location = 0) in vec2 a_corner;
uniform vec2 u_target;
uniform vec4 u_dst;
uniform vec4 u_uv;
out vec2 v_uv;
void main() {
  vec2 p = u_dst.xy + a_corner * u_dst.zw;
  gl_Position = vec4(p.x / u_target.x * 2.0 - 1.0, 1.0 - p.y / u_target.y * 2.0, 0.0, 1.0);
  v_uv = u_uv.xy + a_corner * u_uv.zw;
}`;

const COPY = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_texSize;
uniform int u_bicubic;
uniform float u_gain;
in vec2 v_uv;
out vec4 color;

// Catmull-Rom in nine bilinear taps.
vec4 catmullRom(vec2 uv) {
  vec2 pos = uv * u_texSize;
  vec2 t1 = floor(pos - 0.5) + 0.5;
  vec2 f = pos - t1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 t0 = (t1 - 1.0) / u_texSize;
  vec2 t3 = (t1 + 2.0) / u_texSize;
  vec2 t12 = (t1 + w2 / w12) / u_texSize;
  vec4 c = texture(u_tex, vec2(t0.x, t0.y)) * w0.x * w0.y;
  c += texture(u_tex, vec2(t12.x, t0.y)) * w12.x * w0.y;
  c += texture(u_tex, vec2(t3.x, t0.y)) * w3.x * w0.y;
  c += texture(u_tex, vec2(t0.x, t12.y)) * w0.x * w12.y;
  c += texture(u_tex, vec2(t12.x, t12.y)) * w12.x * w12.y;
  c += texture(u_tex, vec2(t3.x, t12.y)) * w3.x * w12.y;
  c += texture(u_tex, vec2(t0.x, t3.y)) * w0.x * w3.y;
  c += texture(u_tex, vec2(t12.x, t3.y)) * w12.x * w3.y;
  c += texture(u_tex, vec2(t3.x, t3.y)) * w3.x * w3.y;
  return c;
}

void main() {
  vec4 c = u_bicubic == 1 ? catmullRom(v_uv) : texture(u_tex, v_uv);
  color = vec4(clamp(c.rgb * u_gain, 0.0, 1.0), 1.0);
}`;

// Separable Gaussian: nine taps folded into five bilinear fetches.
const BLUR = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_step;
in vec2 v_uv;
out vec4 color;
void main() {
  vec4 c = texture(u_tex, v_uv) * 0.2270270270;
  c += texture(u_tex, v_uv + u_step * 1.3846153846) * 0.3162162162;
  c += texture(u_tex, v_uv - u_step * 1.3846153846) * 0.3162162162;
  c += texture(u_tex, v_uv + u_step * 3.2307692308) * 0.0702702703;
  c += texture(u_tex, v_uv - u_step * 3.2307692308) * 0.0702702703;
  color = c;
}`;

// Contrast-adaptive sharpening (FidelityFX CAS): sharpens flat detail more
// than strong edges, so upscaled edges get crisper without halos.
const SHARPEN = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform vec4 u_bounds;
uniform float u_sharpness;
in vec2 v_uv;
out vec4 color;
vec3 at(float x, float y) {
  return texture(u_tex, clamp(v_uv + vec2(x, y) * u_texel, u_bounds.xy, u_bounds.zw)).rgb;
}
void main() {
  vec3 a = at(-1.0, -1.0); vec3 b = at(0.0, -1.0); vec3 c = at(1.0, -1.0);
  vec3 d = at(-1.0, 0.0);  vec3 e = at(0.0, 0.0);  vec3 f = at(1.0, 0.0);
  vec3 g = at(-1.0, 1.0);  vec3 h = at(0.0, 1.0);  vec3 i = at(1.0, 1.0);
  vec3 mn = min(min(min(d, e), min(f, b)), h);
  mn += min(mn, min(min(a, c), min(g, i)));
  vec3 mx = max(max(max(d, e), max(f, b)), h);
  mx += max(mx, max(max(a, c), max(g, i)));
  vec3 amp = sqrt(clamp(min(mn, 2.0 - mx) / max(mx, vec3(1e-5)), 0.0, 1.0));
  vec3 w = amp * (-1.0 / mix(8.0, 5.0, u_sharpness));
  color = vec4(clamp((b * w + d * w + f * w + h * w + e) / (1.0 + 4.0 * w), 0.0, 1.0), 1.0);
}`;

interface Program {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

interface Target {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

function createWebGLRenderer(canvas: HTMLCanvasElement, preserveDrawingBuffer: boolean): FrameRenderer | null {
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer,
    });
  } catch {
    gl = null;
  }
  if (!gl) return null;
  const g = gl;

  const compile = (type: number, text: string) => {
    const shader = g.createShader(type)!;
    g.shaderSource(shader, text);
    g.compileShader(shader);
    if (!g.getShaderParameter(shader, g.COMPILE_STATUS) && !g.isContextLost()) {
      throw new Error(`Shader failed to compile: ${g.getShaderInfoLog(shader) ?? ''}`);
    }
    return shader;
  };
  const vertex = compile(g.VERTEX_SHADER, VERTEX);
  const link = (fragmentText: string, names: string[]): Program => {
    const program = g.createProgram()!;
    g.attachShader(program, vertex);
    g.attachShader(program, compile(g.FRAGMENT_SHADER, fragmentText));
    g.bindAttribLocation(program, 0, 'a_corner');
    g.linkProgram(program);
    if (!g.getProgramParameter(program, g.LINK_STATUS) && !g.isContextLost()) {
      throw new Error(`Shader program failed to link: ${g.getProgramInfoLog(program) ?? ''}`);
    }
    const uniforms: Program['uniforms'] = {};
    for (const name of ['u_target', 'u_dst', 'u_uv', ...names]) uniforms[name] = g.getUniformLocation(program, name);
    return { program, uniforms };
  };

  let copy: Program;
  let blur: Program;
  let sharpen: Program;
  try {
    copy = link(COPY, ['u_tex', 'u_texSize', 'u_bicubic', 'u_gain']);
    blur = link(BLUR, ['u_tex', 'u_step']);
    sharpen = link(SHARPEN, ['u_tex', 'u_texel', 'u_bounds', 'u_sharpness']);
  } catch {
    g.getExtension('WEBGL_lose_context')?.loseContext();
    return null;
  }

  const vao = g.createVertexArray();
  g.bindVertexArray(vao);
  const corners = g.createBuffer();
  g.bindBuffer(g.ARRAY_BUFFER, corners);
  g.bufferData(g.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), g.STATIC_DRAW);
  g.enableVertexAttribArray(0);
  g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);

  const newTexture = () => {
    const texture = g.createTexture()!;
    g.bindTexture(g.TEXTURE_2D, texture);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    return texture;
  };

  const sourceTexture = newTexture();
  let uploaded: RenderSource | null = null;
  let mipmapped = false;
  const targets = new Map<string, Target>();
  let lost = false;
  const onLost = (event: Event) => {
    event.preventDefault();
    lost = true;
  };
  canvas.addEventListener('webglcontextlost', onLost);

  /** A reusable render target of a given size, keyed by its role. */
  const target = (role: string, width: number, height: number): Target => {
    const existing = targets.get(role);
    if (existing && existing.width === width && existing.height === height) return existing;
    if (existing) {
      g.deleteFramebuffer(existing.framebuffer);
      g.deleteTexture(existing.texture);
    }
    const texture = newTexture();
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, width, height, 0, g.RGBA, g.UNSIGNED_BYTE, null);
    const framebuffer = g.createFramebuffer()!;
    g.bindFramebuffer(g.FRAMEBUFFER, framebuffer);
    g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, texture, 0);
    const made = { framebuffer, texture, width, height };
    targets.set(role, made);
    return made;
  };

  const bindOutput = (out: Target | null) => {
    g.bindFramebuffer(g.FRAMEBUFFER, out ? out.framebuffer : null);
    const width = out ? out.width : g.drawingBufferWidth;
    const height = out ? out.height : g.drawingBufferHeight;
    g.viewport(0, 0, width, height);
    return { width, height };
  };

  /** Draw `texture` into `dst` (target pixels, top-left origin) from the texture area `uv` (u, v, du, dv). */
  const drawQuad = (
    prog: Program,
    size: { width: number; height: number },
    dst: Rect,
    uv: [number, number, number, number],
    texture: WebGLTexture,
    set: (u: Program['uniforms']) => void,
  ) => {
    g.useProgram(prog.program);
    g.uniform2f(prog.uniforms.u_target, size.width, size.height);
    g.uniform4f(prog.uniforms.u_dst, dst.x, dst.y, dst.width, dst.height);
    g.uniform4f(prog.uniforms.u_uv, uv[0], uv[1], uv[2], uv[3]);
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, texture);
    g.uniform1i(prog.uniforms.u_tex, 0);
    set(prog.uniforms);
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
  };

  // Render targets are drawn top-down but stored bottom-up, so sampling one flips v.
  const targetUv = (r: Rect, t: { width: number; height: number }): [number, number, number, number] => [
    r.x / t.width, 1 - r.y / t.height, r.width / t.width, -r.height / t.height,
  ];
  const sourceUv = (r: Rect, size: Size): [number, number, number, number] => [
    r.x / size.width, r.y / size.height, r.width / size.width, r.height / size.height,
  ];

  const upload = (source: RenderSource, wantMips: boolean) => {
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, sourceTexture);
    // A still never changes, so it uploads once; video frames upload every draw.
    if (uploaded !== source || isVideo(source)) {
      g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
      g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      try {
        g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, source);
      } catch (error) {
        uploaded = null;
        if (error instanceof DOMException && error.name === 'SecurityError') throw new SourceBlockedError();
        throw error;
      }
      uploaded = source;
      mipmapped = false;
    }
    if (wantMips && !mipmapped) {
      g.generateMipmap(g.TEXTURE_2D);
      mipmapped = true;
    }
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, wantMips ? g.LINEAR_MIPMAP_LINEAR : g.LINEAR);
  };

  return {
    kind: 'webgl',
    draw(source, size, plan, options = {}) {
      if (lost || g.isContextLost() || !hasFrame(source)) return;
      const exporting = options.quality === 'export';
      const out = bindOutput(null);
      const view = viewMapping(out, plan, options.view);
      const frame = view.map({ x: 0, y: 0, width: plan.width, height: plan.height });
      const dst = view.map(plan.dst);
      const enlarge = dst.width / plan.src.width;
      const blurBars = plan.background?.kind === 'blur';
      // Mipmaps keep shrunken pictures (and the blur's working copy) free of shimmer.
      upload(source, enlarge < 0.99 || blurBars);

      // 1. Background.
      const white = plan.background?.kind === 'color' && plan.background.color === 'white';
      g.clearColor(white ? 1 : 0, white ? 1 : 0, white ? 1 : 0, 1);
      g.clear(g.COLOR_BUFFER_BIT);
      if (plan.background?.kind === 'blur') {
        const aspect = plan.width / plan.height;
        const bw = Math.max(8, Math.round(aspect >= 1 ? BLUR_SIZE : BLUR_SIZE * aspect));
        const bh = Math.max(8, Math.round(aspect >= 1 ? BLUR_SIZE / aspect : BLUR_SIZE));
        const a = target('blur-a', bw, bh);
        const b = target('blur-b', bw, bh);
        const small = { x: 0, y: 0, width: bw, height: bh };
        drawQuad(copy, bindOutput(a), small, sourceUv(plan.background.src, size), sourceTexture, (u) => {
          g.uniform2f(u.u_texSize, size.width, size.height);
          g.uniform1i(u.u_bicubic, 0);
          g.uniform1f(u.u_gain, 1);
        });
        for (let pass = 0; pass < 2; pass++) {
          drawQuad(blur, bindOutput(b), small, targetUv(small, a), a.texture, (u) => g.uniform2f(u.u_step, 1 / bw, 0));
          drawQuad(blur, bindOutput(a), small, targetUv(small, b), b.texture, (u) => g.uniform2f(u.u_step, 0, 1 / bh));
        }
        drawQuad(copy, bindOutput(null), frame, targetUv(small, a), a.texture, (u) => {
          g.uniform2f(u.u_texSize, bw, bh);
          g.uniform1i(u.u_bicubic, 1);
          g.uniform1f(u.u_gain, BACKGROUND_GAIN);
        });
      }

      // 2. Picture. Exports of enlarged pictures go through a sharpening pass.
      const sharp = exporting && enlarge > 1.01;
      const pictureUniforms = (u: Program['uniforms']) => {
        g.uniform2f(u.u_texSize, size.width, size.height);
        g.uniform1i(u.u_bicubic, enlarge > 1.01 ? 1 : 0);
        g.uniform1f(u.u_gain, 1);
      };
      if (!sharp) {
        drawQuad(copy, bindOutput(null), dst, sourceUv(plan.src, size), sourceTexture, pictureUniforms);
        return;
      }
      const picture = target('picture', out.width, out.height);
      drawQuad(copy, bindOutput(picture), dst, sourceUv(plan.src, size), sourceTexture, pictureUniforms);
      const screen = bindOutput(null);
      const half = { x: 0.5 / out.width, y: 0.5 / out.height };
      const bounds = targetUv(dst, out);
      drawQuad(sharpen, screen, dst, bounds, picture.texture, (u) => {
        g.uniform2f(u.u_texel, 1 / out.width, 1 / out.height);
        // Keep neighbour reads inside the picture so its edges don't pick up the bars.
        g.uniform4f(
          u.u_bounds,
          bounds[0] + half.x,
          bounds[1] + bounds[3] + half.y,
          bounds[0] + bounds[2] - half.x,
          bounds[1] - half.y,
        );
        g.uniform1f(u.u_sharpness, SHARPNESS);
      });
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      if (!g.isContextLost()) {
        targets.forEach((t) => {
          g.deleteFramebuffer(t.framebuffer);
          g.deleteTexture(t.texture);
        });
        g.deleteTexture(sourceTexture);
        g.deleteBuffer(corners);
        g.deleteVertexArray(vao);
        [copy, blur, sharpen].forEach((p) => g.deleteProgram(p.program));
      }
      targets.clear();
      uploaded = null;
      // Free the context now instead of waiting for garbage collection; browsers cap live contexts.
      g.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

// ── Canvas 2D fallback ────────────────────────────────────────────────────────

function create2DRenderer(canvas: HTMLCanvasElement): FrameRenderer {
  const ctx = canvas.getContext('2d', { alpha: false });
  let small: HTMLCanvasElement | null = null;
  return {
    kind: '2d',
    draw(source, _size, plan, options = {}) {
      if (!ctx || !hasFrame(source)) return;
      const view = viewMapping(canvas, plan, options.view);
      const frame = view.map({ x: 0, y: 0, width: plan.width, height: plan.height });
      const dst = view.map(plan.dst);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const white = plan.background?.kind === 'color' && plan.background.color === 'white';
      ctx.fillStyle = white ? '#FFFFFF' : '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (plan.background?.kind === 'blur') {
        // Shrinking to a few dozen pixels and smoothing back up reads as a soft blur everywhere.
        small ??= document.createElement('canvas');
        const aspect = plan.width / plan.height;
        small.width = Math.max(4, Math.round(aspect >= 1 ? 24 : 24 * aspect));
        small.height = Math.max(4, Math.round(aspect >= 1 ? 24 / aspect : 24));
        const sctx = small.getContext('2d');
        if (sctx) {
          const bg = plan.background.src;
          sctx.imageSmoothingEnabled = true;
          sctx.imageSmoothingQuality = 'high';
          sctx.drawImage(source, bg.x, bg.y, bg.width, bg.height, 0, 0, small.width, small.height);
          ctx.drawImage(small, frame.x, frame.y, frame.width, frame.height);
          ctx.fillStyle = `rgba(0, 0, 0, ${1 - BACKGROUND_GAIN})`;
          ctx.fillRect(frame.x, frame.y, frame.width, frame.height);
        }
      }
      ctx.drawImage(source, plan.src.x, plan.src.y, plan.src.width, plan.src.height, dst.x, dst.y, dst.width, dst.height);
    },
    dispose() {
      small = null;
    },
  };
}

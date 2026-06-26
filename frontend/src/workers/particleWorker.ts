// WebGL particle renderer running inside a Web Worker via OffscreenCanvas.
//
// Mirrors the 2D drawParticles() in
// frontend/src/components/BackgroundEffect.tsx: same layout math, spawn rules,
// update/decay and particle cap. Rendering is decoupled from the main thread —
// an internal rAF loop simulates + draws from the latest received state, while
// the main thread only pushes new state via postMessage.

// ── Message contract ───────────────────────────────────────────────────────
type Orientation = 'normal' | 'flipped';

interface InitMsg {
  type: 'init';
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  dpr: number;
}
interface ColorsMsg {
  type: 'colors';
  rgb: Float32Array; // length 128*3, per-bar RGB each 0..1
}
interface FrameMsg {
  type: 'frame';
  bars: Float32Array; // length 128, each 0..1
  wave?: Float32Array; // length 128, each -1..1 (scope mode only)
  mode?: 'bars' | 'oscilloscope' | 'radial';
  gain: number;
  mirrored: boolean;
  orientation: Orientation;
  sidebarOpen: boolean;
  constellations?: boolean;
  width: number;
  height: number;
}
interface ResizeMsg {
  type: 'resize';
  width: number;
  height: number;
  dpr: number;
}
interface StopMsg {
  type: 'stop';
}
type IncomingMsg = InitMsg | ColorsMsg | FrameMsg | ResizeMsg | StopMsg;

// ── Constants matching the 2D implementation ───────────────────────────────
const BAR_COUNT = 128;
const FLOATS_PER_PARTICLE = 7; // posX, posY, size(px), r, g, b, a
// Hard ceiling for preallocated buffers. The live cap is
// floor(4000 * max(gain,1)); we clamp storage to this so the typed arrays are
// allocated exactly once. Sized for a generous gain ceiling.
const MAX_PARTICLES = 24000;

// ── Shaders ────────────────────────────────────────────────────────────────
const VERT_SRC = `
attribute vec2 a_pos;     // clip space
attribute float a_size;   // particle pixel size (diameter)
attribute vec4 a_color;   // rgba, straight (not premultiplied)
uniform float u_dpr;
varying vec4 v_color;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
  gl_PointSize = a_size * u_dpr;
  v_color = a_color;
}
`;

const FRAG_SRC = `
precision mediump float;
varying vec4 v_color;
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  float a = smoothstep(0.5, 0.4, d); // soft round dot
  if (a <= 0.0) discard;
  gl_FragColor = vec4(v_color.rgb, v_color.a * a);
}
`;

// Constellation line shaders — plain colored segments (#19).
const VERT_LINE_SRC = `
attribute vec2 a_pos;
attribute vec4 a_color;
varying vec4 v_color;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
  v_color = a_color;
}
`;

const FRAG_LINE_SRC = `
precision mediump float;
varying vec4 v_color;
void main() {
  gl_FragColor = vec4(v_color.rgb, v_color.a);
}
`;

// ── Worker-local state ─────────────────────────────────────────────────────
let gl: WebGLRenderingContext | null = null;
let program: WebGLProgram | null = null;
let vbo: WebGLBuffer | null = null;
let rafId = 0;

let locPos = -1;
let locSize = -1;
let locColor = -1;
let locDpr: WebGLUniformLocation | null = null;

// Constellation (lines) pass.
let progLine: WebGLProgram | null = null;
let vboLine: WebGLBuffer | null = null;
let locLinePos = -1;
let locLineColor = -1;
let constellations = false;
const FLOATS_PER_LINE_VERT = 6; // x, y (clip), r, g, b, a
const MAX_EDGES = 12000;
const lineData = new Float32Array(MAX_EDGES * 2 * FLOATS_PER_LINE_VERT);
// Uniform-grid neighbour search to keep line building ~O(n·k) instead of O(n²).
let cellHead: Int32Array | null = null;
let cellEdges: Int32Array | null = null; // per-cell edge count for area-density cap
const cellNext = new Int32Array(MAX_PARTICLES);

let dpr = 1;
let width = 0; // logical (CSS) px — used for layout + clip-space math
let height = 0;

// Latest frame state (null until first 'frame'/'colors').
let bars: Float32Array | null = null;
let wave: Float32Array | null = null;
let mode: 'bars' | 'oscilloscope' | 'radial' = 'bars';
let colors: Float32Array | null = null;
let gain = 1;
let mirrored = false;
let orientation: Orientation = 'normal';
let sidebarOpen = false;

// Adaptive quality (#95): scales spawn rate + particle cap down when render time
// climbs (weak GPU / busy device) and recovers when there's headroom. Driven by
// the worker's own measured frame time, so it's display-refresh independent.
let qualityScale = 1;

// Flat particle pool. `count` is the number of live particles.
const px = new Float32Array(MAX_PARTICLES);
const py = new Float32Array(MAX_PARTICLES);
const pvx = new Float32Array(MAX_PARTICLES);
const pvy = new Float32Array(MAX_PARTICLES);
const psize = new Float32Array(MAX_PARTICLES);
const pr = new Float32Array(MAX_PARTICLES);
const pg = new Float32Array(MAX_PARTICLES);
const pb = new Float32Array(MAX_PARTICLES);
const plife = new Float32Array(MAX_PARTICLES);
let count = 0;

// Interleaved upload buffer.
const vertexData = new Float32Array(MAX_PARTICLES * FLOATS_PER_PARTICLE);

// ── WebGL helpers ──────────────────────────────────────────────────────────
function compileShader(ctx: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = ctx.createShader(type);
  if (!sh) {
    console.error('particleWorker: createShader failed');
    return null;
  }
  ctx.shaderSource(sh, src);
  ctx.compileShader(sh);
  if (!ctx.getShaderParameter(sh, ctx.COMPILE_STATUS)) {
    console.error('particleWorker: shader compile error:', ctx.getShaderInfoLog(sh));
    ctx.deleteShader(sh);
    return null;
  }
  return sh;
}

function buildProgram(ctx: WebGLRenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
  const vs = compileShader(ctx, ctx.VERTEX_SHADER, vsSrc);
  const fs = compileShader(ctx, ctx.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const prog = ctx.createProgram();
  if (!prog) {
    console.error('particleWorker: createProgram failed');
    return null;
  }
  ctx.attachShader(prog, vs);
  ctx.attachShader(prog, fs);
  ctx.linkProgram(prog);
  // Shaders can be flagged for deletion after link.
  ctx.deleteShader(vs);
  ctx.deleteShader(fs);
  if (!ctx.getProgramParameter(prog, ctx.LINK_STATUS)) {
    console.error('particleWorker: program link error:', ctx.getProgramInfoLog(prog));
    ctx.deleteProgram(prog);
    return null;
  }
  return prog;
}

function setCanvasSize(canvas: OffscreenCanvas): void {
  const pw = Math.max(1, Math.round(width * dpr));
  const ph = Math.max(1, Math.round(height * dpr));
  canvas.width = pw;
  canvas.height = ph;
  if (gl) gl.viewport(0, 0, pw, ph);
}

// ── Init ───────────────────────────────────────────────────────────────────
function init(msg: InitMsg): void {
  width = msg.width;
  height = msg.height;
  dpr = msg.dpr;
  count = 0;

  const ctx = msg.canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
  });
  if (!ctx) {
    console.error('particleWorker: failed to acquire webgl context');
    return;
  }
  gl = ctx;

  const prog = buildProgram(ctx, VERT_SRC, FRAG_SRC);
  if (!prog) {
    gl = null;
    return;
  }
  program = prog;

  locPos = ctx.getAttribLocation(prog, 'a_pos');
  locSize = ctx.getAttribLocation(prog, 'a_size');
  locColor = ctx.getAttribLocation(prog, 'a_color');
  locDpr = ctx.getUniformLocation(prog, 'u_dpr');

  vbo = ctx.createBuffer();
  if (!vbo) {
    console.error('particleWorker: createBuffer failed');
    gl = null;
    return;
  }
  ctx.bindBuffer(ctx.ARRAY_BUFFER, vbo);
  // Preallocate the full dynamic vertex buffer once.
  ctx.bufferData(ctx.ARRAY_BUFFER, vertexData.byteLength, ctx.DYNAMIC_DRAW);

  // Constellation line program + buffer.
  progLine = buildProgram(ctx, VERT_LINE_SRC, FRAG_LINE_SRC);
  if (progLine) {
    locLinePos = ctx.getAttribLocation(progLine, 'a_pos');
    locLineColor = ctx.getAttribLocation(progLine, 'a_color');
    vboLine = ctx.createBuffer();
    if (vboLine) {
      ctx.bindBuffer(ctx.ARRAY_BUFFER, vboLine);
      ctx.bufferData(ctx.ARRAY_BUFFER, lineData.byteLength, ctx.DYNAMIC_DRAW);
      ctx.bindBuffer(ctx.ARRAY_BUFFER, vbo);
    }
  }

  ctx.enable(ctx.BLEND);
  ctx.blendFunc(ctx.SRC_ALPHA, ctx.ONE_MINUS_SRC_ALPHA);
  ctx.clearColor(0, 0, 0, 0);

  setCanvasSize(msg.canvas);

  // Start the internal render loop. The OffscreenCanvas is reachable via the
  // gl context, so we don't need to keep a separate reference for rendering.
  startLoop();
}

// ── Simulation + render (one frame) ────────────────────────────────────────
function spawn(dtScale: number): void {
  if (!bars || !colors) return;

  const isXl = width >= 1280;
  const vizHeight = isXl ? 280 : 220;
  const vizBottom = isXl ? -4 : -22;
  const vizBaseline = height + vizBottom - vizHeight + 180;
  const vizMaxBarHeight = 180 - 24;
  const contentLeft = sidebarOpen ? 256 : 0;
  const contentW = width - contentLeft;
  const contentCenter = contentLeft + contentW / 2;
  const halfW = contentW / 2;

  // Radial: emit particles from the ring outward (matches the canvas ring,
  // which is centered in the bottom visualizer strip).
  if (mode === 'radial') {
    const col = colors;
    // Radial uses a full-viewport centered canvas — emit from the screen center
    // ring to match (not the bottom-strip baseline).
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.min(width, height) / 2 - Math.min(width, height) * 0.06;
    const innerR = Math.max(14, maxR * 0.12);
    const span = maxR - innerR;
    const full = mirrored ? Math.PI : Math.PI * 2;
    const anglePer = full / BAR_COUNT;
    const top = -Math.PI / 2;
    for (let i = 0; i < BAR_COUNT; i++) {
      const value = bars[i];
      if (value < 0.2) continue;
      if (Math.random() > value * 0.3 * gain * dtScale * qualityScale) continue;
      const pos = orientation === 'flipped' ? BAR_COUNT - 1 - i : i;
      const r = innerR + value * span;
      const speed = (0.4 + value * 2) * gain;
      const size = (0.8 + value * 1.5) * Math.min(gain, 1.5);
      const life = 0.5 + value * 0.5;
      const emit = (angle: number) => {
        if (count >= MAX_PARTICLES) return;
        const ca = Math.cos(angle);
        const sa = Math.sin(angle);
        const idx = count++;
        px[idx] = cx + ca * r + (Math.random() - 0.5) * 6;
        py[idx] = cy + sa * r + (Math.random() - 0.5) * 6;
        pvx[idx] = ca * speed + (Math.random() - 0.5) * 0.4;
        pvy[idx] = sa * speed + (Math.random() - 0.5) * 0.4;
        psize[idx] = size;
        pr[idx] = col[i * 3];
        pg[idx] = col[i * 3 + 1];
        pb[idx] = col[i * 3 + 2];
        plife[idx] = life;
      };
      emit(top + pos * anglePer);
      if (mirrored) emit(top - pos * anglePer);
    }
    return;
  }

  // Oscilloscope: emit particles along the waveform line itself (the bar-top
  // geometry below is meaningless when the visual is a single wave).
  if (mode === 'oscilloscope') {
    if (!wave) return;
    // Match drawScope()'s raised center (buffer y=92 vs bars baseline 180) and
    // amplitude, scaled from buffer px to screen px per breakpoint.
    const scopeCenter = vizBaseline - (isXl ? 88 : 69);
    const SCOPE_AMP = isXl ? 70 : 55;
    for (let i = 0; i < BAR_COUNT; i++) {
      if (Math.random() > 0.06 * gain * dtScale * qualityScale) continue;
      if (count >= MAX_PARTICLES) return;
      const x = contentLeft + (i / (BAR_COUNT - 1)) * contentW;
      const y = scopeCenter + wave[i] * SCOPE_AMP;
      const idx = count++;
      px[idx] = x + (Math.random() - 0.5) * 6;
      py[idx] = y + (Math.random() - 0.5) * 4;
      pvx[idx] = (Math.random() - 0.5) * 0.8;
      pvy[idx] = -(0.4 + Math.random() * 1.2) * gain;
      psize[idx] = (0.8 + Math.random() * 1.2) * Math.min(gain, 1.5);
      pr[idx] = colors[i * 3];
      pg[idx] = colors[i * 3 + 1];
      pb[idx] = colors[i * 3 + 2];
      plife[idx] = 0.5 + Math.random() * 0.4;
    }
    return;
  }

  for (let i = 0; i < BAR_COUNT; i++) {
    const value = bars[i];
    if (value < 0.2) continue;
    // Spawn probability scales with dtScale so the spawn *rate per second* stays
    // constant regardless of frame rate (more frames -> lower per-frame chance).
    if (Math.random() > value * 0.3 * gain * dtScale * qualityScale) continue;

    const barHeight = value * vizMaxBarHeight;
    const spawnY = vizBaseline - barHeight;

    const pos = orientation === 'flipped' ? BAR_COUNT - 1 - i : i;
    const posNorm = pos / BAR_COUNT;

    const speed = (0.5 + value * 3) * gain;
    const size = (0.8 + value * 1.5) * Math.min(gain, 1.5);
    const life = 0.5 + value * 0.5;
    const r = colors[i * 3];
    const g = colors[i * 3 + 1];
    const b = colors[i * 3 + 2];

    // One or two x positions depending on mirroring.
    const xCount = mirrored ? 2 : 1;
    for (let k = 0; k < xCount; k++) {
      if (count >= MAX_PARTICLES) return;
      let baseX: number;
      if (mirrored) {
        baseX = k === 0 ? contentCenter + posNorm * halfW : contentCenter - posNorm * halfW;
      } else {
        baseX = contentLeft + posNorm * contentW;
      }
      const idx = count++;
      px[idx] = baseX + (Math.random() - 0.5) * 15;
      py[idx] = spawnY + (Math.random() - 0.5) * 8;
      pvx[idx] = (Math.random() - 0.5) * 1.2;
      pvy[idx] = -speed;
      psize[idx] = size;
      pr[idx] = r;
      pg[idx] = g;
      pb[idx] = b;
      plife[idx] = life;
    }
  }
}

function renderFrame(dtScale: number): void {
  const ctx = gl;
  if (!ctx || !program || !vbo) return;

  ctx.clear(ctx.COLOR_BUFFER_BIT);

  // No-op render (cleared frame) until we have both bars and colors.
  if (!bars || !colors) return;

  spawn(dtScale);

  // Update + compact (swap-and-pop style) while building the vertex buffer.
  // All per-frame deltas are scaled by dtScale for frame-rate independence.
  let write = 0;
  let v = 0;
  for (let i = 0; i < count; i++) {
    const x = px[i] + pvx[i] * dtScale;
    const y = py[i] + pvy[i] * dtScale;
    const life = plife[i] - 0.005 * dtScale;
    if (life <= 0 || y < -10) continue;

    // Keep the live particle (compact into the write slot).
    px[write] = x;
    py[write] = y;
    pvx[write] = pvx[i];
    pvy[write] = pvy[i];
    psize[write] = psize[i];
    pr[write] = pr[i];
    pg[write] = pg[i];
    pb[write] = pb[i];
    plife[write] = life;
    write++;

    // Build clip-space vertex.
    vertexData[v++] = (x / width) * 2 - 1;
    vertexData[v++] = 1 - (y / height) * 2;
    vertexData[v++] = psize[i] * 2; // diameter in px; shader scales by dpr
    vertexData[v++] = pr[i];
    vertexData[v++] = pg[i];
    vertexData[v++] = pb[i];
    vertexData[v++] = life * 0.85;
  }
  count = write;

  // Cap stored particle count for next frame (excess already drawn this frame,
  // matching the 2D version which caps after drawing).
  const maxParticles = Math.min(MAX_PARTICLES, Math.floor(4000 * Math.max(gain, 1) * qualityScale));
  if (count > maxParticles) count = maxParticles;

  const drawCount = write;
  if (drawCount === 0) return;

  // Draw connecting lines first so particles render on top of them.
  if (constellations) drawConstellations(ctx);

  ctx.useProgram(program);
  if (locDpr) ctx.uniform1f(locDpr, dpr);

  ctx.bindBuffer(ctx.ARRAY_BUFFER, vbo);
  ctx.bufferSubData(ctx.ARRAY_BUFFER, 0, vertexData.subarray(0, drawCount * FLOATS_PER_PARTICLE));

  const stride = FLOATS_PER_PARTICLE * 4;
  if (locPos >= 0) {
    ctx.enableVertexAttribArray(locPos);
    ctx.vertexAttribPointer(locPos, 2, ctx.FLOAT, false, stride, 0);
  }
  if (locSize >= 0) {
    ctx.enableVertexAttribArray(locSize);
    ctx.vertexAttribPointer(locSize, 1, ctx.FLOAT, false, stride, 2 * 4);
  }
  if (locColor >= 0) {
    ctx.enableVertexAttribArray(locColor);
    ctx.vertexAttribPointer(locColor, 4, ctx.FLOAT, false, stride, 3 * 4);
  }

  ctx.drawArrays(ctx.POINTS, 0, drawCount);
}

// ── Constellation lines (#19) ────────────────────────────────────────────────
// Uniform-grid neighbour search: bucket live particles into threshold-sized
// cells, then connect each particle only to particles in its 9 neighbouring
// cells. Keeps the work ~O(n·k) so it stays in budget at a few thousand nodes.
function drawConstellations(ctx: WebGLRenderingContext): void {
  if (!progLine || !vboLine || count < 2) return;
  const threshold = 150 * qualityScale;
  if (threshold < 1) return;
  const inv = 1 / threshold;
  const thr2 = threshold * threshold;
  const cell = threshold;
  const cols = Math.max(1, Math.ceil(width / cell));
  const rows = Math.max(1, Math.ceil(height / cell));
  const nCells = cols * rows;
  if (!cellHead || cellHead.length < nCells) cellHead = new Int32Array(nCells);
  if (!cellEdges || cellEdges.length < nCells) cellEdges = new Int32Array(nCells);
  cellHead.fill(-1, 0, nCells);
  cellEdges.fill(0, 0, nCells);

  for (let i = 0; i < count; i++) {
    let cxg = (px[i] / cell) | 0;
    let cyg = (py[i] / cell) | 0;
    if (cxg < 0) cxg = 0; else if (cxg >= cols) cxg = cols - 1;
    if (cyg < 0) cyg = 0; else if (cyg >= rows) cyg = rows - 1;
    const ci = cyg * cols + cxg;
    cellNext[i] = cellHead[ci];
    cellHead[ci] = i;
  }

  // Generous caps — just perf/pathological-density safety. The spread "web" look
  // comes from many lines; opacity is controlled by low per-line alpha, not caps.
  const MAX_PER_NODE = 12;
  const MAX_PER_CELL = 40;
  let li = 0;
  let edges = 0;
  for (let i = 0; i < count && edges < MAX_EDGES; i++) {
    const xi = px[i];
    const yi = py[i];
    let cxg = (xi / cell) | 0;
    let cyg = (yi / cell) | 0;
    if (cxg < 0) cxg = 0; else if (cxg >= cols) cxg = cols - 1;
    if (cyg < 0) cyg = 0; else if (cyg >= rows) cyg = rows - 1;
    const ci = cyg * cols + cxg;
    if (cellEdges[ci] >= MAX_PER_CELL) continue; // area already at capacity
    const r = pr[i];
    const g = pg[i];
    const b = pb[i];
    let iEdges = 0;
    neighbors:
    for (let gy = cyg - 1; gy <= cyg + 1; gy++) {
      if (gy < 0 || gy >= rows) continue;
      for (let gx = cxg - 1; gx <= cxg + 1; gx++) {
        if (gx < 0 || gx >= cols) continue;
        let j = cellHead[gy * cols + gx];
        while (j !== -1) {
          if (j > i) {
            const dx = px[j] - xi;
            const dy = py[j] - yi;
            const d2 = dx * dx + dy * dy;
            if (d2 < thr2) {
              const alpha = (1 - Math.sqrt(d2) * inv) * 0.42 * qualityScale;
              if (alpha >= 0.02 && edges < MAX_EDGES) {
                lineData[li++] = (xi / width) * 2 - 1;
                lineData[li++] = 1 - (yi / height) * 2;
                lineData[li++] = r; lineData[li++] = g; lineData[li++] = b; lineData[li++] = alpha;
                lineData[li++] = (px[j] / width) * 2 - 1;
                lineData[li++] = 1 - (py[j] / height) * 2;
                lineData[li++] = r; lineData[li++] = g; lineData[li++] = b; lineData[li++] = alpha;
                edges++;
                cellEdges[ci]++;
                if (++iEdges >= MAX_PER_NODE || cellEdges[ci] >= MAX_PER_CELL) break neighbors;
              }
            }
          }
          j = cellNext[j];
        }
      }
    }
  }

  if (edges === 0) return;
  ctx.useProgram(progLine);
  ctx.bindBuffer(ctx.ARRAY_BUFFER, vboLine);
  ctx.bufferSubData(ctx.ARRAY_BUFFER, 0, lineData.subarray(0, li));
  const stride = FLOATS_PER_LINE_VERT * 4;
  if (locLinePos >= 0) {
    ctx.enableVertexAttribArray(locLinePos);
    ctx.vertexAttribPointer(locLinePos, 2, ctx.FLOAT, false, stride, 0);
  }
  if (locLineColor >= 0) {
    ctx.enableVertexAttribArray(locLineColor);
    ctx.vertexAttribPointer(locLineColor, 4, ctx.FLOAT, false, stride, 2 * 4);
  }
  ctx.drawArrays(ctx.LINES, 0, edges * 2);
}

function startLoop(): void {
  // Render at the display's native rate but keep motion frame-rate independent:
  // every per-frame delta is scaled by dtScale = elapsed / (1000/30), where
  // 30fps is the reference cadence the original tuning was based on. So at 60Hz
  // each frame moves half as far but twice as often -> identical real speed.
  const REF_FRAME_MS = 1000 / 30;
  let lastTime = 0;
  // Perf-stats accumulation (posted to the main thread for the HUD ~2x/sec).
  let statFrames = 0;
  let statRenderMs = 0;
  let statWindowStart = 0;
  const post = (self as unknown as { postMessage: (m: unknown) => void }).postMessage.bind(self);
  const loop = (now: number) => {
    rafId = (self as unknown as typeof globalThis).requestAnimationFrame(loop);
    let dtScale = 1;
    if (lastTime) {
      dtScale = (now - lastTime) / REF_FRAME_MS;
      if (dtScale > 3) dtScale = 3; // clamp huge gaps (tab refocus) to avoid teleporting
      else if (dtScale <= 0) dtScale = 1;
    }
    lastTime = now;

    const t0 = performance.now();
    renderFrame(dtScale);
    statRenderMs += performance.now() - t0;
    statFrames++;
    if (statWindowStart === 0) {
      statWindowStart = now;
    } else if (now - statWindowStart >= 500) {
      const avgMs = statRenderMs / statFrames;
      // Throttle down when frames get expensive; recover when there's slack.
      if (avgMs > 11 && qualityScale > 0.4) {
        qualityScale = Math.max(0.4, qualityScale - 0.15);
      } else if (avgMs < 6 && qualityScale < 1) {
        qualityScale = Math.min(1, qualityScale + 0.08);
      }
      post({
        type: 'stats',
        fps: Math.round((statFrames * 1000) / (now - statWindowStart)),
        frameMs: avgMs,
        count,
        quality: qualityScale,
      });
      statFrames = 0;
      statRenderMs = 0;
      statWindowStart = now;
    }
  };
  rafId = (self as unknown as typeof globalThis).requestAnimationFrame(loop);
}

// ── Teardown ───────────────────────────────────────────────────────────────
function stop(): void {
  if (rafId) {
    (self as unknown as typeof globalThis).cancelAnimationFrame(rafId);
    rafId = 0;
  }
  if (gl) {
    if (vbo) gl.deleteBuffer(vbo);
    if (program) gl.deleteProgram(program);
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
  }
  gl = null;
  program = null;
  vbo = null;
  bars = null;
  colors = null;
  count = 0;
}

// ── Message dispatch ───────────────────────────────────────────────────────
self.onmessage = (event: MessageEvent<IncomingMsg>) => {
  const msg = event.data;
  switch (msg.type) {
    case 'init':
      init(msg);
      break;
    case 'colors':
      colors = msg.rgb;
      break;
    case 'frame':
      // Store latest state only — the rAF loop renders from it.
      bars = msg.bars;
      if (msg.wave) wave = msg.wave;
      mode = msg.mode ?? 'bars';
      gain = msg.gain;
      mirrored = msg.mirrored;
      orientation = msg.orientation;
      sidebarOpen = msg.sidebarOpen;
      constellations = !!msg.constellations;
      width = msg.width;
      height = msg.height;
      break;
    case 'resize': {
      width = msg.width;
      height = msg.height;
      dpr = msg.dpr;
      if (gl) {
        const canvas = gl.canvas as OffscreenCanvas;
        setCanvasSize(canvas);
      }
      break;
    }
    case 'stop':
      stop();
      break;
  }
};

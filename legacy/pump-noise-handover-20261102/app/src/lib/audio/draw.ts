import { clamp } from "@/lib/utils";
import {
  BEARING_ORDERS,
  type BearingKey,
  type EnvelopePeak,
  type EnvelopeSummary,
} from "@/lib/audio/envelope";

export type Palette = {
  bg: string;
  fg: string;
  muted: string;
  line: string;
  amber: string;
  signal: string;
  alarm: string;
};

let cached: Palette | null = null;

export function palette(): Palette {
  if (cached) return cached;
  const cs = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  cached = {
    bg: pick("--color-bg", "#0b0f12"),
    fg: pick("--color-fg", "#e7eee9"),
    muted: pick("--color-muted", "#93a09a"),
    line: pick("--color-line", "#2c3840"),
    amber: pick("--color-amber", "#e6a23c"),
    signal: pick("--color-signal", "#3dbea5"),
    alarm: pick("--color-alarm", "#e25b4a"),
  };
  return cached;
}

export function resizeCanvas(canvas: HTMLCanvasElement, size?: { width: number; height: number }) {
  const dpr = size ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const rect = size ? null : canvas.getBoundingClientRect();
  const cssW = Math.max(1, size?.width ?? rect?.width ?? 1);
  const cssH = Math.max(1, size?.height ?? rect?.height ?? 1);
  const bw = Math.max(1, Math.round(cssW * dpr));
  const bh = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  return { dpr, cssW, cssH, bw, bh };
}

const F_MIN = 20;

function fMax(sampleRate: number) {
  return Math.min(20000, Math.max(1000, sampleRate / 2));
}

export function freqToX(freq: number, plotW: number, sampleRate: number) {
  const min = Math.log(F_MIN);
  const max = Math.log(fMax(sampleRate));
  const f = clamp(freq, F_MIN, fMax(sampleRate));
  return ((Math.log(f) - min) / (max - min)) * plotW;
}

export function xToFreq(x: number, plotW: number, sampleRate: number) {
  const min = Math.log(F_MIN);
  const max = Math.log(fMax(sampleRate));
  const t = clamp(x / Math.max(1, plotW), 0, 1);
  return Math.exp(min + t * (max - min));
}

function dbToY(db: number, plotH: number, splAt0: number) {
  const t = (db - (splAt0 - 100)) / 100;
  return plotH - clamp(t, 0, 1) * plotH;
}

const HEAT = new Uint8ClampedArray(256 * 3);
const STOPS: [number, number, number, number][] = [
  [0, 11, 15, 18],
  [0.2, 14, 72, 68],
  [0.48, 61, 190, 165],
  [0.76, 230, 162, 60],
  [1, 247, 240, 226],
];
for (let i = 0; i < 256; i++) {
  const t = i / 255;
  let j = 0;
  while (j < STOPS.length - 2 && t > STOPS[j + 1]![0]) j++;
  const a = STOPS[j]!;
  const b = STOPS[j + 1]!;
  const u = (t - a[0]) / (b[0] - a[0] || 1);
  HEAT[i * 3] = Math.round(a[1] + (b[1] - a[1]) * u);
  HEAT[i * 3 + 1] = Math.round(a[2] + (b[2] - a[2]) * u);
  HEAT[i * 3 + 2] = Math.round(a[3] + (b[3] - a[3]) * u);
}

function heatIndex(db: number, splAt0: number) {
  const t = (db - (splAt0 - 100)) / 100;
  return clamp(Math.round(t * 255), 0, 255);
}

const SPEC = { l: 46, r: 8, t: 10, b: 22 };

export function drawSpectrum(
  canvas: HTMLCanvasElement,
  db: Float32Array,
  peak: Float32Array | null,
  sampleRate: number,
  fftSize: number,
  splAt0: number,
  rpm: number,
  blades: number,
  cursorFrac: number | null,
  bpfLabel = "BPF",
  size?: { width: number; height: number },
) {
  const { dpr, cssW, cssH } = resizeCanvas(canvas, size);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const pal = palette();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, cssW, cssH);
  const plotW = cssW - SPEC.l - SPEC.r;
  const plotH = cssH - SPEC.t - SPEC.b;
  ctx.font = "11px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.lineWidth = 1;
  ctx.strokeStyle = pal.line;
  ctx.fillStyle = pal.muted;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let dbTick = 0; dbTick <= 100; dbTick += 20) {
    const y = SPEC.t + dbToY(splAt0 - dbTick, plotH, splAt0);
    ctx.beginPath();
    ctx.moveTo(SPEC.l, y);
    ctx.lineTo(SPEC.l + plotW, y);
    ctx.stroke();
    ctx.fillText(String(Math.round(splAt0 - dbTick)), SPEC.l - 6, y);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const freq of [20, 100, 1000, 10000]) {
    if (freq >= fMax(sampleRate)) continue;
    const x = SPEC.l + freqToX(freq, plotW, sampleRate);
    ctx.beginPath();
    ctx.moveTo(x, SPEC.t);
    ctx.lineTo(x, SPEC.t + plotH);
    ctx.stroke();
    ctx.fillText(freq >= 1000 ? `${freq / 1000}k` : String(freq), x, SPEC.t + plotH + 6);
  }

  let hover: { hz: number; db: number } | null = null;
  if (db.length > 8 && plotW > 8) {
    const cols: number[] = new Array(Math.ceil(plotW));
    const n = db.length;
    for (let x = 0; x < cols.length; x++) {
      const fLo = xToFreq(x, plotW, sampleRate);
      const fHi = xToFreq(x + 1, plotW, sampleRate);
      let i1 = Math.max(1, Math.floor((fLo * fftSize) / sampleRate));
      let i2 = Math.min(n - 1, Math.ceil((fHi * fftSize) / sampleRate));
      if (i2 < i1) i2 = i1;
      let m = -200;
      for (let i = i1; i <= i2; i++) {
        const v = db[i] ?? -200;
        if (v > m) m = v;
      }
      cols[x] = m;
    }
    ctx.beginPath();
    cols.forEach((v, x) => {
      const y = SPEC.t + dbToY(v, plotH, splAt0);
      if (x === 0) ctx.moveTo(SPEC.l + x, y);
      else ctx.lineTo(SPEC.l + x, y);
    });
    ctx.lineTo(SPEC.l + cols.length, SPEC.t + plotH);
    ctx.lineTo(SPEC.l, SPEC.t + plotH);
    ctx.closePath();
    ctx.fillStyle = withAlpha(pal.signal, 0.16);
    ctx.fill();
    ctx.beginPath();
    cols.forEach((v, x) => {
      const y = SPEC.t + dbToY(v, plotH, splAt0);
      if (x === 0) ctx.moveTo(SPEC.l + x, y);
      else ctx.lineTo(SPEC.l + x, y);
    });
    ctx.strokeStyle = pal.signal;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (peak && peak.length === db.length) {
      ctx.beginPath();
      let started = false;
      for (let x = 0; x < cols.length; x++) {
        const fLo = xToFreq(x, plotW, sampleRate);
        const fHi = xToFreq(x + 1, plotW, sampleRate);
        let i1 = Math.max(1, Math.floor((fLo * fftSize) / sampleRate));
        let i2 = Math.min(n - 1, Math.ceil((fHi * fftSize) / sampleRate));
        if (i2 < i1) i2 = i1;
        let m = -200;
        for (let i = i1; i <= i2; i++) {
          const v = peak[i] ?? -200;
          if (v > m) m = v;
        }
        const y = SPEC.t + dbToY(m, plotH, splAt0);
        if (!started) {
          ctx.moveTo(SPEC.l + x, y);
          started = true;
        } else ctx.lineTo(SPEC.l + x, y);
      }
      ctx.strokeStyle = pal.amber;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (rpm >= 300) {
      mark(ctx, pal.amber, SPEC.l + freqToX(rpm / 60, plotW, sampleRate), SPEC.t, plotH, "1×");
      const bpf = (rpm / 60) * blades;
      if (bpf < fMax(sampleRate)) {
        mark(ctx, pal.fg, SPEC.l + freqToX(bpf, plotW, sampleRate), SPEC.t, plotH, bpfLabel);
      }
    }

    if (cursorFrac !== null) {
      const x = clamp(cursorFrac * cssW, SPEC.l, SPEC.l + plotW) - SPEC.l;
      const col = clamp(Math.round(x), 0, cols.length - 1);
      const hz = xToFreq(col, plotW, sampleRate);
      const level = cols[col] ?? Number.NaN;
      hover = { hz, db: level };
      ctx.strokeStyle = pal.fg;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(SPEC.l + col, SPEC.t);
      ctx.lineTo(SPEC.l + col, SPEC.t + plotH);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = pal.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "13px 'IBM Plex Sans', sans-serif";
    ctx.fillText("开始观测后显示频谱", SPEC.l + plotW / 2, SPEC.t + plotH / 2);
  }
  return hover;
}

function mark(
  ctx: CanvasRenderingContext2D,
  color: string,
  x: number,
  top: number,
  plotH: number,
  label: string,
  labelDy = 4,
  solid = false,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = solid ? 1.5 : 1;
  if (!solid) ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x, top + plotH);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(label, x + 4, top + labelDy);
}

/** 把 dB 谱压成屏幕列（对数频率，每列取最大值）。 */
function columnsOf(db: Float32Array, plotW: number, sampleRate: number, fftSize: number) {
  const cols: number[] = new Array(Math.ceil(plotW));
  const n = db.length;
  for (let x = 0; x < cols.length; x++) {
    const fLo = xToFreq(x, plotW, sampleRate);
    const fHi = xToFreq(x + 1, plotW, sampleRate);
    let i1 = Math.max(1, Math.floor((fLo * fftSize) / sampleRate));
    let i2 = Math.min(n - 1, Math.ceil((fHi * fftSize) / sampleRate));
    if (i2 < i1) i2 = i1;
    let m = -200;
    for (let i = i1; i <= i2; i++) {
      const v = db[i] ?? -200;
      if (v > m) m = v;
    }
    cols[x] = m;
  }
  return cols;
}

function drawAxes(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  plotW: number,
  plotH: number,
  sampleRate: number,
  splAt0: number,
  showBands = true,
) {
  ctx.font = "11px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.lineWidth = 1;
  ctx.strokeStyle = pal.line;
  ctx.fillStyle = pal.muted;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let dbTick = 0; dbTick <= 100; dbTick += 20) {
    const y = SPEC.t + dbToY(splAt0 - dbTick, plotH, splAt0);
    ctx.beginPath();
    ctx.moveTo(SPEC.l, y);
    ctx.lineTo(SPEC.l + plotW, y);
    ctx.stroke();
    ctx.fillText(String(Math.round(splAt0 - dbTick)), SPEC.l - 6, y);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const freq of [20, 100, 1000, 10000]) {
    if (freq >= fMax(sampleRate)) continue;
    const x = SPEC.l + freqToX(freq, plotW, sampleRate);
    if (showBands) {
      ctx.beginPath();
      ctx.moveTo(x, SPEC.t);
      ctx.lineTo(x, SPEC.t + plotH);
      ctx.stroke();
    }
    ctx.fillText(freq >= 1000 ? `${freq / 1000}k` : String(freq), x, SPEC.t + plotH + 6);
  }
}

/**
 * 降噪对比谱：原始（灰）、噪声底（橙虚线）、降噪后（绿）。
 * 判决仍用原始谱，这张图只帮助看清谱线位置与噪声底。
 */
export function drawCleanSpectrum(
  canvas: HTMLCanvasElement,
  rawDb: Float32Array,
  cleanDb: Float32Array,
  noiseDb: Float32Array,
  sampleRate: number,
  fftSize: number,
  splAt0: number,
  rpm: number,
  blades: number,
  bpfLabel = "BPF",
  cursorFrac: number | null = null,
  size?: { width: number; height: number },
  subharmonic: { ratio: number } | null = null,
) {
  const { dpr, cssW, cssH } = resizeCanvas(canvas, size);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const pal = palette();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, cssW, cssH);
  const plotW = cssW - SPEC.l - SPEC.r;
  const plotH = cssH - SPEC.t - SPEC.b;
  drawAxes(ctx, pal, plotW, plotH, sampleRate, splAt0);

  const paint = (cols: number[], color: string, width: number, dash: number[]) => {
    if (cols.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    cols.forEach((v, x) => {
      const y = SPEC.t + dbToY(v, plotH, splAt0);
      if (x === 0) ctx.moveTo(SPEC.l + x, y);
      else ctx.lineTo(SPEC.l + x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  };

  let hover: { hz: number; db: number } | null = null;
  if (rawDb.length > 8 && plotW > 8) {
    const raw = columnsOf(rawDb, plotW, sampleRate, fftSize);
    const clean = cleanDb.length > 8 ? columnsOf(cleanDb, plotW, sampleRate, fftSize) : null;
    const noise = noiseDb.length > 8 ? columnsOf(noiseDb, plotW, sampleRate, fftSize) : null;
    paint(raw, withAlpha(pal.muted, 0.85), 1, []);
    if (noise) paint(noise, pal.amber, 1, [4, 3]);
    if (clean) {
      ctx.beginPath();
      ctx.moveTo(SPEC.l + clean.length, SPEC.t + plotH);
      ctx.lineTo(SPEC.l, SPEC.t + plotH);
      ctx.closePath();
      ctx.fillStyle = withAlpha(pal.signal, 0.12);
      ctx.fill();
      paint(clean, pal.signal, 1.6, []);
    }
    if (rpm >= 300) {
      mark(ctx, pal.amber, SPEC.l + freqToX(rpm / 60, plotW, sampleRate), SPEC.t, plotH, "1×");
      const bpf = (rpm / 60) * blades;
      if (bpf < fMax(sampleRate)) {
        mark(ctx, pal.fg, SPEC.l + freqToX(bpf, plotW, sampleRate), SPEC.t, plotH, bpfLabel);
      }
      if (subharmonic) {
        const f0 = rpm / 60;
        for (const [label, order] of [
          ["1/2×", 0.5],
          ["1/3×", 1 / 3],
        ] as const) {
          const hz = f0 * order;
          if (hz >= F_MIN) mark(ctx, pal.amber, SPEC.l + freqToX(hz, plotW, sampleRate), SPEC.t, plotH, label);
        }
      }
    }
    const cursor = cursorFrac ?? 0;
    if (cursorFrac !== null) {
      const x = clamp(cursor * cssW, SPEC.l, SPEC.l + plotW) - SPEC.l;
      const col = clamp(Math.round(x), 0, raw.length - 1);
      hover = { hz: xToFreq(col, plotW, sampleRate), db: (clean ?? raw)[col] ?? Number.NaN };
      ctx.strokeStyle = pal.fg;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(SPEC.l + col, SPEC.t);
      ctx.lineTo(SPEC.l + col, SPEC.t + plotH);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = pal.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "13px 'IBM Plex Sans', sans-serif";
    ctx.fillText("开始观测后显示降噪对比", SPEC.l + plotW / 2, SPEC.t + plotH / 2);
  }
  return hover;
}

/** 包络谱光标吸附结果：最近峰 + 最近轴承阶次（理论频率与相对偏差）。 */
export type EnvelopeHit = {
  /** 实际吸附到的频率（有峰时为峰频，否则为光标频率） */
  hz: number;
  peak: EnvelopePeak | null;
  bearingKey: BearingKey;
  bearingOrder: number;
  bearingHz: number;
  /** 相对理论频率的偏差（%），正数表示实测偏高 */
  deviationPct: number;
  /** 偏差是否落在 ±8%（FTF 等低频阶次放宽到 ±2 Hz）内 */
  near: boolean;
};

/** 把任意频率吸附到包络谱峰，并给出最近轴承特征阶次的对照。 */
export function envelopeHit(env: EnvelopeSummary, f0: number, hz: number): EnvelopeHit {
  const tol = Math.max(6 * (env.df || 0), 2);
  let peak: EnvelopePeak | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const item of env.peaks) {
    const d = Math.abs(item.hz - hz);
    if (d < best && d <= tol) {
      best = d;
      peak = item;
    }
  }
  const focus = peak?.hz ?? hz;
  let bearing = BEARING_ORDERS[0]!;
  let bestDev = Number.POSITIVE_INFINITY;
  for (const item of BEARING_ORDERS) {
    const theory = item.order * f0;
    const dev = theory > 0 ? ((focus - theory) / theory) * 100 : 0;
    if (Math.abs(dev) < Math.abs(bestDev)) {
      bestDev = dev;
      bearing = item;
    }
  }
  const bearingHz = bearing.order * f0;
  return {
    hz: focus,
    peak,
    bearingKey: bearing.key,
    bearingOrder: bearing.order,
    bearingHz,
    deviationPct: bestDev,
    near: Math.abs((focus - bearingHz) / Math.max(1, bearingHz)) <= 0.08 || Math.abs(focus - bearingHz) <= 2,
  };
}

const ENV_PAD = { l: 42, r: 8, t: 10, b: 20 };

/** 包络谱横轴范围：至少覆盖 6.5× 转频，且不小于 60 Hz。 */
export function envelopeFMax(f0: number) {
  return Math.max(f0 * 6.5, 60);
}

/** 由画布内 x 坐标换算包络谱频率（与 drawEnvelope 的边距一致）。 */
export function envelopeFreqAt(x: number, cssW: number, f0: number) {
  const plotW = Math.max(1, cssW - ENV_PAD.l - ENV_PAD.r);
  return clamp((x - ENV_PAD.l) / plotW, 0, 1) * envelopeFMax(f0);
}

/** 包络谱：横轴线性到 6.5× 转频，标出轴承特征阶次。 */
export function drawEnvelope(
  canvas: HTMLCanvasElement,
  env: EnvelopeSummary,
  f0: number,
  size?: { width: number; height: number },
  cursorHz: number | null = null,
) {
  const { dpr, cssW, cssH } = resizeCanvas(canvas, size);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const pal = palette();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, cssW, cssH);
  const l = ENV_PAD.l;
  const r = ENV_PAD.r;
  const t = ENV_PAD.t;
  const b = ENV_PAD.b;
  const plotW = cssW - l - r;
  const plotH = cssH - t - b;
  const xMax = envelopeFMax(f0);
  const dbMax = 30;
  const xOf = (hz: number) => l + clamp(hz / xMax, 0, 1) * plotW;
  const yOf = (db: number) => t + plotH - clamp((db - -5) / dbMax, 0, 1) * plotH;

  ctx.fillStyle = pal.muted;
  ctx.font = "11px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.strokeStyle = pal.line;
  ctx.lineWidth = 1;
  for (const db of [0, 10, 20, 30]) {
    const y = yOf(db);
    ctx.beginPath();
    ctx.moveTo(l, y);
    ctx.lineTo(l + plotW, y);
    ctx.stroke();
    ctx.fillText(`${db}`, l - 6, y);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let k = 1; k <= 6; k++) {
    const x = xOf(f0 * k);
    ctx.beginPath();
    ctx.moveTo(x, t);
    ctx.lineTo(x, t + plotH);
    ctx.stroke();
    ctx.fillText(`${k}×`, x, t + plotH + 4);
  }

  const spec = env.spectrumDb;
  if (spec.length > 8) {
    const stepDiv = Math.max(1, Math.floor(spec.length / plotW));
    ctx.beginPath();
    let started = false;
    for (let k = 1; k < spec.length; k += stepDiv) {
      const hz = k * env.df;
      if (hz > xMax) break;
      const x = xOf(hz);
      const y = yOf(spec[k] ?? -5);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = pal.signal;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    const hit = cursorHz === null ? null : envelopeHit(env, f0, cursorHz);
    for (const item of BEARING_ORDERS) {
      const hz = item.order * f0;
      if (hz > xMax) continue;
      if (hit?.near && hit.bearingKey === item.key) {
        mark(ctx, pal.fg, xOf(hz), t, plotH, `${item.key} ${item.order}× · ${hz.toFixed(0)} Hz`, 18, true);
      } else {
        mark(ctx, pal.amber, xOf(hz), t, plotH, item.key);
      }
    }

    if (hit && cursorHz !== null) {
      const cx = xOf(cursorHz);
      ctx.strokeStyle = pal.fg;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, t);
      ctx.lineTo(cx, t + plotH);
      ctx.stroke();
      if (hit.peak) {
        const px = xOf(hit.peak.hz);
        const py = yOf(hit.peak.db);
        ctx.fillStyle = pal.amber;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = pal.bg;
        ctx.lineWidth = 1;
        ctx.stroke();
        const right = px > cssW - 150;
        ctx.fillStyle = pal.fg;
        ctx.textAlign = right ? "right" : "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(
          `峰值 ${hit.peak.hz.toFixed(0)} Hz · ${hit.peak.order.toFixed(2)}×`,
          px + (right ? -6 : 6),
          Math.max(t + 12, py - 8),
        );
        ctx.textAlign = "left";
      }
    }
  } else {
    ctx.fillStyle = pal.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "13px 'IBM Plex Sans', sans-serif";
    ctx.fillText("包络谱等待采样", l + plotW / 2, t + plotH / 2);
  }
  return cursorHz === null ? null : envelopeHit(env, f0, cursorHz);
}

/** 离屏渲染导出：频谱与包络各出一张 PNG。 */
export function spectrumPng(
  rawDb: Float32Array,
  cleanDb: Float32Array,
  noiseDb: Float32Array,
  sampleRate: number,
  fftSize: number,
  splAt0: number,
  rpm: number,
  blades: number,
  bpfLabel: string,
) {
  if (typeof document === "undefined" || rawDb.length < 8) return null;
  const canvas = document.createElement("canvas");
  const width = 1600;
  const height = 720;
  drawCleanSpectrum(canvas, rawDb, cleanDb, noiseDb, sampleRate, fftSize, splAt0, rpm, blades, bpfLabel, null, {
    width,
    height,
  });
  return canvas.toDataURL("image/png");
}

export function envelopePng(env: EnvelopeSummary, f0: number) {
  if (typeof document === "undefined" || env.spectrumDb.length < 8) return null;
  const canvas = document.createElement("canvas");
  const width = 1600;
  const height = 640;
  drawEnvelope(canvas, env, f0, { width, height });
  return canvas.toDataURL("image/png");
}

const images = new WeakMap<HTMLCanvasElement, ImageData>();

export function drawWaterfall(
  canvas: HTMLCanvasElement,
  data: Float32Array,
  cols: number,
  rows: number,
  head: number,
  splAt0: number,
  active: boolean,
) {
  const { bw, bh } = resizeCanvas(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  let img = images.get(canvas);
  if (!img || img.width !== bw || img.height !== bh) {
    img = ctx.createImageData(bw, bh);
    images.set(canvas, img);
  }
  const px = img.data;
  let seen = false;
  for (let y = 0; y < bh; y++) {
    const rowIndex = Math.min(rows - 1, Math.floor((y / bh) * rows));
    const src = (head - 1 - rowIndex + rows * 4) % rows;
    const base = src * cols;
    for (let x = 0; x < bw; x++) {
      const col = Math.min(cols - 1, Math.floor((x / bw) * cols));
      const db = data[base + col] ?? -200;
      if (db > -120) seen = true;
      const hi = heatIndex(db, splAt0) * 3;
      const o = (y * bw + x) * 4;
      px[o] = HEAT[hi] ?? 0;
      px[o + 1] = HEAT[hi + 1] ?? 0;
      px[o + 2] = HEAT[hi + 2] ?? 0;
      px[o + 3] = 255;
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.putImageData(img, 0, 0);
  if (!seen) {
    const pal = palette();
    const { dpr, cssW, cssH } = resizeCanvas(canvas);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = pal.muted;
    ctx.font = "13px 'IBM Plex Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(active ? "正在积累瀑布…" : "瀑布图等待采样", cssW / 2, cssH / 2);
  }
}

export function drawTrend(
  canvas: HTMLCanvasElement,
  trend: Float32Array,
  head: number,
  count: number,
  splAt0: number,
  warn: number,
  danger: number,
) {
  const { dpr, cssW, cssH } = resizeCanvas(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const pal = palette();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, cssW, cssH);
  const l = 46;
  const r = 8;
  const t = 10;
  const b = 18;
  const plotW = cssW - l - r;
  const plotH = cssH - t - b;
  ctx.font = "11px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.fillStyle = pal.muted;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.strokeStyle = pal.line;
  ctx.lineWidth = 1;
  for (const dbTick of [0, 50, 100]) {
    const y = t + dbToY(splAt0 - dbTick, plotH, splAt0);
    ctx.beginPath();
    ctx.moveTo(l, y);
    ctx.lineTo(l + plotW, y);
    ctx.stroke();
    ctx.fillText(String(Math.round(splAt0 - dbTick)), l - 6, y);
  }
  rule(ctx, pal.amber, l, plotW, t, plotH, splAt0, warn);
  rule(ctx, pal.alarm, l, plotW, t, plotH, splAt0, danger);
  if (count < 2) {
    ctx.fillStyle = pal.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "13px 'IBM Plex Sans', sans-serif";
    ctx.fillText("采样后画出 60 秒曲线", l + plotW / 2, t + plotH / 2);
    return;
  }
  // 每像素列取 min/max 聚合：样本比像素多时不再逐帧连线（逐帧会在 100 ms
  // 采样序列出现视差抖动，看起来"顿挫"），而是把落进同一列的所有样本压成
  // 一条竖直短线。样本少于像素时仍按点连线，不做无意义的重采样。
  const plotPx = Math.max(1, Math.floor(plotW));
  ctx.strokeStyle = pal.signal;
  ctx.lineWidth = count > plotPx ? 1 : 1.5;
  ctx.beginPath();
  if (count <= plotPx) {
    let started = false;
    for (let i = 0; i < count; i++) {
      const idx = (head - count + i + trend.length) % trend.length;
      const v = trend[idx] ?? splAt0 - 100;
      if (!Number.isFinite(v)) continue;
      const x = l + (i / Math.max(1, count - 1)) * plotW;
      const y = t + dbToY(v, plotH, splAt0);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
  } else {
    for (let px = 0; px < plotPx; px++) {
      const a = Math.floor((px / plotPx) * count);
      const b = Math.max(a + 1, Math.floor(((px + 1) / plotPx) * count));
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = a; i < b && i < count; i++) {
        const idx = (head - count + i + trend.length) % trend.length;
        const v = trend[idx];
        if (!Number.isFinite(v)) continue;
        if (v! < lo) lo = v!;
        if (v! > hi) hi = v!;
      }
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
      const x = l + px + 0.5;
      ctx.moveTo(x, t + dbToY(hi, plotH, splAt0));
      ctx.lineTo(x, t + dbToY(lo, plotH, splAt0));
    }
  }
  ctx.stroke();
  ctx.fillStyle = pal.muted;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = "11px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.fillText("60 秒前", l, t + plotH + 4);
  ctx.textAlign = "right";
  ctx.fillText("现在", l + plotW, t + plotH + 4);
}

function rule(
  ctx: CanvasRenderingContext2D,
  color: string,
  l: number,
  plotW: number,
  t: number,
  plotH: number,
  splAt0: number,
  db: number,
) {
  const y = t + dbToY(db, plotH, splAt0);
  ctx.strokeStyle = color;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(l, y);
  ctx.lineTo(l + plotW, y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function withAlpha(color: string, alpha: number) {
  const hex = color.trim();
  const m = /^#([\da-f]{6})$/i.exec(hex);
  if (!m) return color;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Pump synthesizer shared verbatim with an AudioWorklet.
 * Keep this string free of closures, template placeholders, and TypeScript.
 */
export const DSP_SOURCE = `
function createPumpState(mode, rpm, blades, gridHz, load, pole) {
  var twopi = 6.283185307179586;
  var g = gridHz === 60 ? 60 : 50;
  var p = pole === 4 ? 4 : 2;
  var l = load > 0 ? load : 1;
  var s = {
    mode: mode | 0,
    rpm: rpm,
    blades: blades | 0,
    grid: g,
    pole: p,
    load: l,
    phase: new Float32Array(161),
    fphase: new Float32Array(8),
    ephase: new Float32Array(3),
    seed: ((mode * 10007 + (rpm | 0) * 13 + (blades | 0) * 99 + g * 7 + p * 31) | 0) || 123456789,
    lp: 0,
    ring: 0,
    ringPhase: 0,
    n: 0,
  };
  var h, x;
  for (h = 0; h < 161; h++) {
    x = s.seed | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    s.seed = x || 123456789;
    s.phase[h] = ((x >>> 0) / 4294967296) * twopi;
  }
  for (h = 0; h < 8; h++) {
    x = s.seed | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    s.seed = x || 123456789;
    s.fphase[h] = ((x >>> 0) / 4294967296) * twopi;
  }
  return s;
}

function pumpSample(s, sr) {
  var f0 = s.rpm / 60;
  var dt = 1 / sr;
  var twopi = 6.283185307179586;
  var y = 0;
  var blades = s.blades | 0;
  var mode = s.mode | 0;
  var maxH = 10;
  if (mode === 0 || mode === 1 || mode === 5 || mode === 6) maxH = Math.max(3, blades * 2);
  else if (mode === 2 || mode === 4 || mode === 7 || mode === 8 || mode === 9) maxH = Math.max(4, blades);
  else if (mode >= 10 && mode <= 15) maxH = Math.max(6, blades * 2);
  if (maxH > 160) maxH = 160;
  var h, amp;

  for (h = 1; h <= maxH; h++) {
    amp = 0;
    if (mode === 0) {
      if (h === 1) amp = 0.12;
      else if (h === 2) amp = 0.045;
      else if (h === 3) amp = 0.02;
      else if (h === blades) amp = 0.85;
      else if (h === blades * 2) amp = 0.28;
    } else if (mode === 1) {
      if (h === 1) amp = 0.1;
      else if (h === blades) amp = 0.32;
      else if (h === blades * 2) amp = 0.08;
    } else if (mode === 2) {
      if (h === 1) amp = 1;
      else if (h === 2) amp = 0.22;
      else if (h === 3) amp = 0.08;
      else if (h === blades) amp = 0.15;
    } else if (mode === 3) {
      amp = 0.48 / Math.sqrt(h);
    } else if (mode === 4) {
      if (h === 1) amp = 0.14;
      else if (h === 2) amp = 0.05;
      else if (h === blades) amp = 0.42;
    } else if (mode === 5) {
      if (h === 1) amp = 0.18;
      else if (h === 2) amp = 0.07;
      else if (h === 3) amp = 0.03;
      else if (h === blades) amp = 0.8;
      else if (h === blades * 2) amp = 0.3;
    } else if (mode === 6) {
      if (h === 1) amp = 0.08;
      else if (h === blades) amp = 0.28;
      else if (h === blades * 2) amp = 0.08;
    } else if (mode === 7) {
      if (h === 1) amp = 0.65;
      else if (h === 2) amp = 0.32;
      else if (h === 3) amp = 0.18;
      else if (h === 4) amp = 0.1;
      else if (h === blades) amp = 0.22;
    } else if (mode === 8) {
      if (h === 1) amp = 0.55;
      else if (h === 2) amp = 0.22;
      else if (h === 3) amp = 0.1;
      else if (h === blades) amp = 0.3;
    } else if (mode === 9) {
      if (h === 1) amp = 0.14;
      else if (h === 2) amp = 0.05;
      else if (h === blades) amp = 0.36;
    } else if (mode === 10) {
      if (h === 1) amp = 0.75;
      else if (h === 2) amp = 0.68;
      else if (h === 3) amp = 0.25;
      else if (h === 4) amp = 0.1;
      else if (h === blades) amp = 0.18;
    } else if (mode === 11) {
      if (h === 1) amp = 0.45;
      else if (h === 2) amp = 0.1;
      else if (h === 3) amp = 0.05;
      else if (h === blades) amp = 0.32;
      else if (h === blades * 2) amp = 0.1;
    } else if (mode === 12) {
      if (h === 1) amp = 0.2;
      else if (h === 2) amp = 0.08;
      else if (h === 3) amp = 0.04;
      else if (h === blades) amp = 0.45;
      else if (h === blades * 2) amp = 0.16;
    } else if (mode === 13) {
      if (h === 1) amp = 0.62;
      else if (h === 2) amp = 0.5;
      else if (h === 3) amp = 0.2;
      else if (h === blades) amp = 0.35;
      else if (h === blades * 2) amp = 0.12;
    } else if (mode === 14) {
      if (h === 1) amp = 0.38;
      else if (h === 2) amp = 0.2;
      else if (h === 3) amp = 0.08;
      else if (h === blades) amp = 0.28;
    } else if (mode === 15) {
      if (h === 1) amp = 0.4;
      else if (h === 2) amp = 0.12;
      else if (h === 3) amp = 0.05;
      else if (h === blades) amp = 0.32;
    }
    if (amp > 0) {
      s.phase[h] += twopi * f0 * h * dt;
      if (s.phase[h] > twopi) s.phase[h] -= twopi;
      y += amp * Math.sin(s.phase[h]);
    }
  }

  if (mode === 3) {
    var fr = [0.5, 1.5, 2.5, 3.5];
    var fa = [0.72, 0.48, 0.32, 0.18];
    for (h = 0; h < 4; h++) {
      s.fphase[h] += twopi * f0 * fr[h] * dt;
      if (s.fphase[h] > twopi) s.fphase[h] -= twopi;
      y += fa[h] * Math.sin(s.fphase[h]);
    }
  }
  if (mode === 8) {
    var fr8 = [0.5, 1.5, 2.5];
    var fa8 = [0.5, 0.3, 0.14];
    for (h = 0; h < 3; h++) {
      s.fphase[h] += twopi * f0 * fr8[h] * dt;
      if (s.fphase[h] > twopi) s.fphase[h] -= twopi;
      y += fa8[h] * Math.sin(s.fphase[h]);
    }
  }
  if (mode === 12) {
    var fr12 = [0.5, 1.5];
    var fa12 = [0.18, 0.1];
    for (h = 0; h < 2; h++) {
      s.fphase[h] += twopi * f0 * fr12[h] * dt;
      if (s.fphase[h] > twopi) s.fphase[h] -= twopi;
      y += fa12[h] * Math.sin(s.fphase[h]);
    }
  }
  if (mode === 14) {
    var fr14 = [0.5, 1.5, 2.5];
    var fa14 = [0.45, 0.28, 0.12];
    for (h = 0; h < 3; h++) {
      s.fphase[h] += twopi * f0 * fr14[h] * dt;
      if (s.fphase[h] > twopi) s.fphase[h] -= twopi;
      y += fa14[h] * Math.sin(s.fphase[h]);
    }
  }

  var eBase = (s.pole === 2 ? 0.16 : 0.11) * (0.35 + 0.65 * (s.load > 1.5 ? 1.5 : s.load < 0.2 ? 0.2 : s.load));
  s.ephase[0] += twopi * (2 * s.grid) * dt;
  if (s.ephase[0] > twopi) s.ephase[0] -= twopi;
  y += eBase * Math.sin(s.ephase[0]);
  s.ephase[1] += twopi * (4 * s.grid) * dt;
  if (s.ephase[1] > twopi) s.ephase[1] -= twopi;
  y += eBase * 0.3 * Math.sin(s.ephase[1]);

  var x = s.seed | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  s.seed = x;
  var white = ((x >>> 0) / 4294967296) * 2 - 1;
  var alpha = 0.02;
  if (mode === 1 || mode === 6) alpha = 0.18;
  else if (mode === 5) alpha = 0.12;
  else if (mode === 7) alpha = 0.3;
  else if (mode === 8) alpha = 0.16;
  else if (mode === 10) alpha = 0.05;
  else if (mode === 11) alpha = 0.12;
  else if (mode === 12) alpha = 0.03;
  else if (mode === 13) alpha = 0.05;
  else if (mode === 14) alpha = 0.07;
  else if (mode === 15) alpha = 0.04;
  s.lp += alpha * (white - s.lp);
  var hp = white - s.lp;
  var nAmp = 0.06;
  var nSig = s.lp;
  if (mode === 1) {
    nAmp = 2.2;
    nSig = hp;
  } else if (mode === 3) {
    nAmp = 0.16;
    nSig = s.lp;
  } else if (mode === 4) {
    nAmp = 0.05;
    nSig = s.lp;
  } else if (mode === 5) {
    nAmp = 0.12;
    nSig = s.lp;
  } else if (mode === 6) {
    nAmp = 2.4;
    nSig = hp;
  } else if (mode === 7) {
    nAmp = 0.6;
    nSig = s.lp;
  } else if (mode === 8) {
    nAmp = 1.1;
    nSig = s.lp;
  } else if (mode === 9) {
    nAmp = 0.05;
    nSig = s.lp;
  } else if (mode === 10) {
    nAmp = 0.12;
    nSig = s.lp;
  } else if (mode === 11) {
    nAmp = 0.35;
    nSig = white;
  } else if (mode === 12) {
    nAmp = 0.95;
    nSig = s.lp;
  } else if (mode === 13) {
    nAmp = 0.18;
    nSig = s.lp;
  } else if (mode === 14) {
    nAmp = 0.55;
    nSig = s.lp;
  } else if (mode === 15) {
    nAmp = 0.1;
    nSig = s.lp;
  }
  var loadGain = 0.65 + 0.35 * (s.load > 1.6 ? 1.6 : s.load);
  nAmp *= loadGain;
  if (mode === 1 || mode === 6) {
    var mod = 0.72 + 0.28 * Math.sin(twopi * 19 * s.n * dt);
    y += nAmp * nSig * mod;
  } else if (mode === 8 || mode === 14) {
    var mod8 = 0.42 + 0.58 * Math.sin(twopi * f0 * s.n * dt);
    y += nAmp * nSig * mod8;
  } else {
    y += nAmp * nSig;
  }

  if (mode === 4 || mode === 9 || mode === 15) {
    var rate = mode === 15 ? f0 : f0 * 3.07;
    var period = Math.max(8, Math.round(sr / rate));
    if (s.n % period === 0) s.ring = 1;
    s.ring *= Math.exp(-dt / 0.00065);
    s.ringPhase += twopi * (mode === 15 ? 5800 : 4200) * dt;
    if (s.ringPhase > twopi) s.ringPhase -= twopi;
    y += s.ring * Math.sin(s.ringPhase) * (mode === 9 ? 9 : mode === 15 ? 10 : 11);
  }

  s.n++;
  if (y !== y) return 0;
  return y;
}
`;

export const WORKLET_SOURCE = `${DSP_SOURCE}
class PumpSynth extends AudioWorkletProcessor {
  constructor() {
    super();
    this.state = createPumpState(0, 2800, 6, 50, 1, 2);
    this.port.onmessage = function (ev) {
      var d = ev.data || {};
      if (d.type === "set") {
        this.state = createPumpState(d.mode, d.rpm, d.blades, d.gridHz, d.load, d.pole);
      }
    }.bind(this);
  }
  process(inputs, outputs) {
    var out = outputs[0] && outputs[0][0];
    if (!out) return true;
    var i;
    for (i = 0; i < out.length; i++) out[i] = pumpSample(this.state, sampleRate);
    return true;
  }
}

class PumpCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 32768;
    this.buf = new Float32Array(this.size);
    this.n = 0;
    this.peak = 0;
    this.over = 0;
    this.clipped = 0;
  }
  process(inputs) {
    var input = inputs[0] && inputs[0][0];
    if (!input) return true;
    for (var i = 0; i < input.length; i++) {
      var x = input[i];
      this.buf[this.n++] = x;
      var ax = x < 0 ? -x : x;
      if (ax > this.peak) this.peak = ax;
      if (ax >= 0.95) {
        this.over++;
        if (this.over >= 3) this.clipped++;
      } else {
        this.over = 0;
      }
      if (this.n >= this.size) {
        this.port.postMessage({
          samples: this.buf,
          sr: sampleRate,
          peak: this.peak,
          clipRate: this.clipped / this.size,
          clip: this.clipped > 0,
          t: currentTime
        });
        this.buf = new Float32Array(this.size);
        this.n = 0;
        this.peak = 0;
        this.over = 0;
        this.clipped = 0;
      }
    }
    return true;
  }
}

class PumpMeter extends AudioWorkletProcessor {
  constructor() {
    super();
    this.z2 = 0;
    this.z4 = 0;
    this.zn = 0;
    this.a2 = 0;
    this.c2 = 0;
    this.zpk = 0;
    this.cpk = 0;
    this.hop = 0;
  }
  process(inputs, outputs) {
    var out = outputs[0] && outputs[0][0];
    if (out) out.fill(0);
    var z = inputs[0] && inputs[0][0];
    var a = inputs[1] && inputs[1][0];
    var c = inputs[2] && inputs[2][0];
    var n = z ? z.length : a ? a.length : c ? c.length : 0;
    if (!n) return true;
    var i, x, x2, ax;
    for (i = 0; i < n; i++) {
      if (z) {
        x = z[i];
        x2 = x * x;
        this.z2 += x2;
        this.z4 += x2 * x2;
        ax = x < 0 ? -x : x;
        if (ax > this.zpk) this.zpk = ax;
        this.zn++;
      }
      if (a) this.a2 += a[i] * a[i];
      if (c) {
        x = c[i];
        this.c2 += x * x;
        ax = x < 0 ? -x : x;
        if (ax > this.cpk) this.cpk = ax;
      }
    }
    this.hop += n;
    if (this.hop >= sampleRate * 0.05) {
      var zn = this.zn > 0 ? this.zn : 1;
      this.port.postMessage({
        dt: this.hop / sampleRate,
        zMs: this.z2 / zn,
        zK: this.z4 / zn,
        zPk: this.zpk,
        aMs: this.a2 / zn,
        cMs: this.c2 / zn,
        cPk: this.cpk,
      });
      this.z2 = 0;
      this.z4 = 0;
      this.a2 = 0;
      this.c2 = 0;
      this.zn = 0;
      this.zpk = 0;
      this.cpk = 0;
      this.hop = 0;
    }
    return true;
  }
}

registerProcessor("pump-synth", PumpSynth);
registerProcessor("pump-meter", PumpMeter);
registerProcessor("pump-capture", PumpCapture);
`;

type PumpFns = {
  createPumpState: (
    mode: number,
    rpm: number,
    blades: number,
    gridHz?: number,
    load?: number,
    pole?: number,
  ) => PumpState;
  pumpSample: (s: PumpState, sr: number) => number;
};

type PumpState = {
  mode: number;
  rpm: number;
  blades: number;
  grid: number;
  pole: number;
  load: number;
  phase: Float32Array;
  fphase: Float32Array;
  ephase: Float32Array;
  seed: number;
  lp: number;
  ring: number;
  ringPhase: number;
  n: number;
};

let fns: PumpFns | null = null;

export function getPumpFns(): PumpFns {
  if (!fns) {
    fns = new Function(`${DSP_SOURCE}; return { createPumpState, pumpSample };`)() as PumpFns;
  }
  return fns;
}

const gainCache = new Map<string, number>();

/** Linear gain that places the scenario at targetDb when 0 dBFS equals splRef. */
export function scenarioGain(
  mode: number,
  rpm: number,
  blades: number,
  sampleRate: number,
  targetDb: number,
  splRef: number,
  gridHz = 50,
  pole = 2,
  load = 1,
) {
  const key = `${mode}|${rpm}|${blades}|${sampleRate}|${targetDb}|${splRef}|${gridHz}|${pole}|${load.toFixed(3)}`;
  const hit = gainCache.get(key);
  if (hit !== undefined) return hit;
  const { createPumpState, pumpSample } = getPumpFns();
  const state = createPumpState(mode, rpm, blades, gridHz, load, pole);
  const n = Math.min(sampleRate, 48000);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const y = pumpSample(state, sampleRate);
    sum += y * y;
  }
  const rms = Math.sqrt(sum / n) || 1e-9;
  const target = Math.pow(10, (targetDb - splRef) / 20);
  const gain = target / rms;
  gainCache.set(key, gain);
  return gain;
}

import { diagnose } from "./diagnose.ts";
import { spectralFeatures } from "./features.ts";
import { getPumpFns } from "./pump-dsp.ts";
import { SCENARIOS } from "./scenarios.ts";
import { aWeightDb, cWeightDb, cascadeDb, designAWeighting, designCWeighting } from "./weighting.ts";

function fftDb(frame: Float32Array) {
  const n = frame.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const w =
      0.42 -
      0.5 * Math.cos((2 * Math.PI * i) / (n - 1)) +
      0.08 * Math.cos((4 * Math.PI * i) / (n - 1));
    re[i] = (frame[i] ?? 0) * w;
  }
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i] ?? 0;
      re[i] = re[j] ?? 0;
      re[j] = tr;
      const ti = im[i] ?? 0;
      im[i] = im[j] ?? 0;
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe0 = Math.cos(ang);
    const wIm0 = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cRe = 1;
      let cIm = 0;
      const half = len >> 1;
      for (let j = 0; j < half; j++) {
        const aRe = re[i + j] ?? 0;
        const aIm = im[i + j] ?? 0;
        const bRe = re[i + j + half] ?? 0;
        const bIm = im[i + j + half] ?? 0;
        const tRe = bRe * cRe - bIm * cIm;
        const tIm = bRe * cIm + bIm * cRe;
        re[i + j] = aRe + tRe;
        im[i + j] = aIm + tIm;
        re[i + j + half] = aRe - tRe;
        im[i + j + half] = aIm - tIm;
        const nRe = cRe * wRe0 - cIm * wIm0;
        cIm = cRe * wIm0 + cIm * wRe0;
        cRe = nRe;
      }
    }
  }
  const db = new Float32Array(n / 2);
  for (let i = 0; i < db.length; i++) {
    const mag = Math.hypot(re[i] ?? 0, im[i] ?? 0) / n;
    db[i] = 20 * Math.log10(mag + 1e-12);
  }
  return db;
}

const fs = 48000;
const targets = [63, 100, 500, 1000, 2000, 4000, 8000];
const aSections = designAWeighting(fs);
const cSections = designCWeighting(fs);
console.log("A-weight analog vs digital");
for (const f of targets) {
  const analog = aWeightDb(f);
  const digital = cascadeDb(aSections, f, fs);
  console.log(f, analog.toFixed(2), digital.toFixed(2), (digital - analog).toFixed(2));
}
console.log("C-weight analog vs digital");
for (const f of targets) {
  const analog = cWeightDb(f);
  const digital = cascadeDb(cSections, f, fs);
  console.log(f, analog.toFixed(2), digital.toFixed(2), (digital - analog).toFixed(2));
}

const { createPumpState, pumpSample } = getPumpFns();
const fftSize = 8192;
for (const scenario of SCENARIOS) {
  const rpm = 2800;
  const blades = scenario.pump === "vortex" ? 24 : 6;
  const state = createPumpState(scenario.mode, rpm, blades, 50, 1, 2);
  for (let i = 0; i < fs; i++) pumpSample(state, fs);
  const frame = new Float32Array(fftSize);
  let s2 = 0;
  let s4 = 0;
  let pk = 0;
  for (let i = 0; i < fftSize; i++) {
    const y = pumpSample(state, fs);
    frame[i] = y;
    const y2 = y * y;
    s2 += y2;
    s4 += y2 * y2;
    pk = Math.max(pk, Math.abs(y));
  }
  const ms = s2 / fftSize;
  const crest = pk / Math.sqrt(ms);
  const kurtosis = s4 / fftSize / (ms * ms);
  const db = fftDb(frame);
  const spec = spectralFeatures(db, fs, fftSize, rpm, blades);
  const result = diagnose({ ...spec, pumpType: scenario.pump, level: 80, crest, kurtosis });
  console.log(
    scenario.id,
    result.status,
    result.directions.map((d) => d.title).join(","),
    "kurt",
    kurtosis.toFixed(2),
    "crest",
    crest.toFixed(2),
    "flat",
    spec.flatness.toFixed(3),
    "hf",
    spec.hfRatio.toFixed(2),
    "1x",
    spec.oneXRatio.toFixed(2),
    "bpf",
    spec.bpfRatio.toFixed(2),
    "half",
    spec.halfRatio.toFixed(2),
    "harms",
    spec.harmonicCount,
    "dom",
    spec.dominantHz.toFixed(1),
  );
}

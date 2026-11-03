/** IEC 61672-1 A/C weighting. Display uses the analog magnitude; the meter uses biquads. */

export type Biquad = { ff: number[]; fb: number[] };

const F1 = 20.598997;
const F2 = 107.65265;
const F3 = 737.86223;
const F4 = 12194.217;

function ra(f: number) {
  const f2 = f * f;
  const c1 = F4 * F4;
  const num = c1 * f2 * f2;
  const den = (f2 + F1 * F1) * Math.sqrt((f2 + F2 * F2) * (f2 + F3 * F3)) * (f2 + c1);
  return num / den;
}

function rc(f: number) {
  const f2 = f * f;
  const c1 = F4 * F4;
  return (c1 * f2) / ((f2 + F1 * F1) * (f2 + c1));
}

const RA_1K = ra(1000);
const RC_1K = rc(1000);

export function aWeightDb(f: number) {
  if (f < 1) return -80;
  return 20 * Math.log10(ra(f) / RA_1K);
}

export function cWeightDb(f: number) {
  if (f < 1) return -80;
  return 20 * Math.log10(rc(f) / RC_1K);
}

export function weightDb(kind: "A" | "C" | "Z", f: number) {
  if (kind === "A") return aWeightDb(f);
  if (kind === "C") return cWeightDb(f);
  return 0;
}

export function bilinear(
  b0: number,
  b1: number,
  b2: number,
  a0: number,
  a1: number,
  a2: number,
  fs: number,
): Biquad {
  const k = 2 * fs;
  const k2 = k * k;
  const nb0 = b0 * k2 + b1 * k + b2;
  const nb1 = 2 * (b2 - b0 * k2);
  const nb2 = b0 * k2 - b1 * k + b2;
  const na0 = a0 * k2 + a1 * k + a2;
  const na1 = 2 * (a2 - a0 * k2);
  const na2 = a0 * k2 - a1 * k + a2;
  const inv = 1 / na0;
  return {
    ff: [nb0 * inv, nb1 * inv, nb2 * inv],
    fb: [1, na1 * inv, na2 * inv],
  };
}

export function biquadMag(biq: Biquad, freq: number, fs: number) {
  const w = (2 * Math.PI * freq) / fs;
  const c1 = Math.cos(w);
  const s1 = Math.sin(w);
  const c2 = Math.cos(2 * w);
  const s2 = Math.sin(2 * w);
  const b0 = biq.ff[0] ?? 0;
  const b1 = biq.ff[1] ?? 0;
  const b2 = biq.ff[2] ?? 0;
  const a0 = biq.fb[0] ?? 1;
  const a1 = biq.fb[1] ?? 0;
  const a2 = biq.fb[2] ?? 0;
  const nr = b0 + b1 * c1 + b2 * c2;
  const ni = -(b1 * s1 + b2 * s2);
  const dr = a0 + a1 * c1 + a2 * c2;
  const di = -(a1 * s1 + a2 * s2);
  return Math.hypot(nr, ni) / Math.hypot(dr, di);
}

function normalizeCascade(sections: Biquad[], fs: number) {
  for (const s of sections) {
    const m = biquadMag(s, 1000, fs) || 1;
    const g = 1 / m;
    s.ff[0] = (s.ff[0] ?? 0) * g;
    s.ff[1] = (s.ff[1] ?? 0) * g;
    s.ff[2] = (s.ff[2] ?? 0) * g;
  }
}

/** Cascade magnitude in dB, normalized so 1 kHz is 0 dB. */
export function cascadeDb(sections: Biquad[], freq: number, fs: number) {
  let m = 1;
  for (const s of sections) m *= biquadMag(s, freq, fs);
  return 20 * Math.log10(Math.max(m, 1e-12));
}

export function designAWeighting(fs: number): Biquad[] {
  const w1 = 2 * Math.PI * F1;
  const w2 = 2 * Math.PI * F2;
  const w3 = 2 * Math.PI * F3;
  const w4 = 2 * Math.PI * F4;
  const sections = [
    bilinear(1, 0, 0, 1, 2 * w1, w1 * w1, fs),
    bilinear(1, 0, 0, 1, w2 + w3, w2 * w3, fs),
    bilinear(0, 0, 1, 1, 2 * w4, w4 * w4, fs),
  ];
  normalizeCascade(sections, fs);
  return sections;
}

export function designCWeighting(fs: number): Biquad[] {
  const w1 = 2 * Math.PI * F1;
  const w4 = 2 * Math.PI * F4;
  const sections = [
    bilinear(1, 0, 0, 1, 2 * w1, w1 * w1, fs),
    bilinear(0, 0, 1, 1, 2 * w4, w4 * w4, fs),
  ];
  normalizeCascade(sections, fs);
  return sections;
}

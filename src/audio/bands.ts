/** Nominal 1/3-octave centers, IEC 61260. */

export type OctaveBand = { fc: number; label: string; tick: boolean };

export const THIRD_OCTAVE: OctaveBand[] = [
  { fc: 25, label: "25", tick: false },
  { fc: 31.5, label: "31.5", tick: true },
  { fc: 40, label: "40", tick: false },
  { fc: 50, label: "50", tick: false },
  { fc: 63, label: "63", tick: false },
  { fc: 80, label: "80", tick: false },
  { fc: 100, label: "100", tick: false },
  { fc: 125, label: "125", tick: true },
  { fc: 160, label: "160", tick: false },
  { fc: 200, label: "200", tick: false },
  { fc: 250, label: "250", tick: false },
  { fc: 315, label: "315", tick: false },
  { fc: 400, label: "400", tick: false },
  { fc: 500, label: "500", tick: true },
  { fc: 630, label: "630", tick: false },
  { fc: 800, label: "800", tick: false },
  { fc: 1000, label: "1k", tick: true },
  { fc: 1250, label: "1.25k", tick: false },
  { fc: 1600, label: "1.6k", tick: false },
  { fc: 2000, label: "2k", tick: true },
  { fc: 2500, label: "2.5k", tick: false },
  { fc: 3150, label: "3.15k", tick: false },
  { fc: 4000, label: "4k", tick: false },
  { fc: 5000, label: "5k", tick: false },
  { fc: 6300, label: "6.3k", tick: false },
  { fc: 8000, label: "8k", tick: true },
  { fc: 10000, label: "10k", tick: false },
  { fc: 12500, label: "12.5k", tick: false },
  { fc: 16000, label: "16k", tick: false },
  { fc: 20000, label: "20k", tick: false },
];

const HALF = Math.pow(2, 1 / 6);

export function synthesizeOctave(db: Float32Array, sampleRate: number, fftSize: number) {
  const out = new Float32Array(THIRD_OCTAVE.length);
  const n = db.length;
  for (let b = 0; b < THIRD_OCTAVE.length; b++) {
    const fc = THIRD_OCTAVE[b]!.fc;
    const f1 = fc / HALF;
    const f2 = fc * HALF;
    let i1 = Math.max(1, Math.ceil((f1 * fftSize) / sampleRate));
    let i2 = Math.min(n - 1, Math.floor((f2 * fftSize) / sampleRate));
    if (i2 < i1) {
      const center = Math.round((fc * fftSize) / sampleRate);
      i1 = Math.max(1, Math.min(n - 1, center));
      i2 = i1;
    }
    let p = 0;
    for (let i = i1; i <= i2; i++) {
      const v = db[i] ?? -140;
      p += Math.pow(10, (Number.isFinite(v) ? v : -140) / 10);
    }
    out[b] = p > 0 ? 10 * Math.log10(p) : -140;
  }
  return out;
}

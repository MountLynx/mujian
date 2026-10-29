// Sparse, tactile SFX for the 102s cut. No BGM, no room tone.
// Generates individual one-shots plus a mixed 102s stereo cue track.
import fs from 'node:fs';
import path from 'node:path';

const SR = 48000;
const TAU = Math.PI * 2;
const DURATION = 102;
const N = SR * DURATION;
const OUT_DIR = path.resolve('video/public/audio/sfx');
const MIX_PATH = path.resolve('video/public/audio/sfx-track.wav');
fs.mkdirSync(OUT_DIR, { recursive: true });

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296 * 2 - 1;
  };
}

function normalize(L, R, peak = 0.7) {
  let max = 0;
  for (let i = 0; i < L.length; i += 1) max = Math.max(max, Math.abs(L[i]), Math.abs(R[i]));
  if (max <= 0) return { L, R };
  const g = peak / max;
  for (let i = 0; i < L.length; i += 1) {
    L[i] *= g;
    R[i] *= g;
  }
  return { L, R };
}

function wav(L, R) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i += 1) {
    buf.writeInt16LE(Math.round(clamp(L[i], -1, 1) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(clamp(R[i], -1, 1) * 32767), 46 + i * 4);
  }
  return buf;
}

function write(name, L, R) {
  const normalized = normalize(L, R, 0.72);
  fs.writeFileSync(path.join(OUT_DIR, `${name}.wav`), wav(normalized.L, normalized.R));
  return normalized;
}

function whoosh() {
  const dur = 0.78;
  const n = Math.floor(SR * dur);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const r = rng(11);
  let lpL = 0;
  let lpR = 0;
  let loL = 0;
  let loR = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / SR;
    const x = t / dur;
    const env = Math.sin(Math.PI * x) ** 2;
    const fc = 220 + 1600 * Math.sin(Math.PI * Math.min(1, x * 1.15));
    const a = 1 - Math.exp(-TAU * fc / SR);
    const b = 1 - Math.exp(-TAU * 130 / SR);
    const wl = r();
    const wr = r();
    lpL += a * (wl - lpL);
    lpR += a * (wr - lpR);
    loL += b * (wl - loL);
    loR += b * (wr - loR);
    const body = Math.sin(TAU * (74 - 22 * x) * t) * 0.18;
    L[i] = ((lpL - loL) * 1.6 + body) * env;
    R[i] = ((lpR - loR) * 1.6 + body) * env;
  }
  return write('whoosh', L, R);
}

function click() {
  const dur = 0.11;
  const n = Math.floor(SR * dur);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const r = rng(23);
  for (let i = 0; i < n; i += 1) {
    const t = i / SR;
    const attack = Math.min(1, t / 0.0012);
    const env = attack * Math.exp(-t * 75);
    const body =
      Math.sin(TAU * 2150 * t) * 0.55 +
      Math.sin(TAU * 1380 * t) * 0.25 +
      r() * 0.12;
    L[i] = body * env;
    R[i] = body * env * 0.96;
  }
  return write('click', L, R);
}

function tick() {
  const dur = 0.24;
  const n = Math.floor(SR * dur);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const r = rng(37);
  const hits = [0, 0.075];
  for (const start of hits) {
    const from = Math.floor(start * SR);
    for (let i = from; i < n; i += 1) {
      const t = i / SR - start;
      if (t < 0) continue;
      const attack = Math.min(1, t / 0.0015);
      const env = attack * Math.exp(-t * 34);
      const wood =
        Math.sin(TAU * 470 * t) * 0.5 +
        Math.sin(TAU * 880 * t) * 0.22 +
        Math.sin(TAU * 1320 * t) * 0.08;
      const snap = r() * Math.exp(-t * 55) * 0.25;
      const v = (wood + snap) * env * (start === 0 ? 1 : 0.55);
      L[i] += v;
      R[i] += v * 0.94;
    }
  }
  return write('die-tick', L, R);
}

function chime(name, freqs, dur, decay, peak = 0.6) {
  const n = Math.floor(SR * dur);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let k = 0; k < freqs.length; k += 1) {
    const f = freqs[k];
    const spread = (k / Math.max(1, freqs.length - 1)) * 0.5 - 0.25;
    const gl = Math.cos(((spread + 1) / 2) * (Math.PI / 2));
    const gr = Math.sin(((spread + 1) / 2) * (Math.PI / 2));
    for (let i = 0; i < n; i += 1) {
      const t = i / SR;
      const attack = Math.min(1, t / 0.006);
      const v =
        Math.sin(TAU * f * t) * Math.exp(-t / decay) +
        0.32 * Math.sin(TAU * f * 2.01 * t + 0.4) * Math.exp(-t / (decay * 0.72)) +
        0.10 * Math.sin(TAU * f * 3.02 * t + 0.9) * Math.exp(-t / (decay * 0.5));
      L[i] += v * attack * gl * 0.45;
      R[i] += v * attack * gr * 0.45;
    }
  }
  return write(name, L, R, peak);
}

function page() {
  const dur = 0.55;
  const n = Math.floor(SR * dur);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const r = rng(51);
  const swells = [0.0, 0.16];
  for (const start of swells) {
    for (let i = Math.floor(start * SR); i < n; i += 1) {
      const t = i / SR - start;
      if (t < 0) continue;
      const env = Math.min(1, t / 0.02) * Math.exp(-t * 7);
      const band = r() * Math.exp(-t * 10) * 0.35;
      const air = Math.sin(TAU * 1700 * t) * 0.02;
      L[i] += (band + air) * env;
      R[i] += (band * 0.9 + air) * env;
    }
  }
  return write('page-turn', L, R);
}

function modal() {
  const dur = 0.55;
  const n = Math.floor(SR * dur);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const r = rng(67);
  for (let i = 0; i < n; i += 1) {
    const t = i / SR;
    const env = Math.min(1, t / 0.004) * Math.exp(-t * 8);
    const thud = Math.sin(TAU * 92 * t) * 0.55 + Math.sin(TAU * 138 * t) * 0.18;
    const paper = r() * Math.exp(-t * 18) * 0.18;
    L[i] = (thud + paper) * env;
    R[i] = (thud * 0.95 + paper) * env;
  }
  return write('modal', L, R);
}

const buffers = {
  whoosh: whoosh(),
  click: click(),
  'die-tick': tick(),
  'chime-arrival': chime('chime-arrival', [587.33, 880], 2.8, 1.7, 0.55),
  'chime-result': chime('chime-result', [659.25, 987.77], 2.2, 1.2, 0.55),
  'page-turn': page(),
  modal: modal(),
  'bell-outro': chime('bell-outro', [146.83, 220, 293.66], 4.8, 3.2, 0.55),
};

const mixL = new Float32Array(N);
const mixR = new Float32Array(N);
const cues = [
  [6.0, 'whoosh', 0.5, 0.0],
  [34.0, 'chime-arrival', 0.4, 0.15],
  [38.3, 'die-tick', 0.55, -0.1],
  [57.4, 'click', 0.6, 0.1],
  [59.0, 'chime-result', 0.45, 0.05],
  [71.0, 'page-turn', 0.45, -0.1],
  [82.0, 'modal', 0.45, 0.1],
  [97.0, 'bell-outro', 0.55, 0.0],
];

for (const [time, name, gain, pan] of cues) {
  const buf = buffers[name];
  const from = Math.floor(time * SR);
  const gl = Math.cos(((pan + 1) / 2) * (Math.PI / 2)) * gain;
  const gr = Math.sin(((pan + 1) / 2) * (Math.PI / 2)) * gain;
  for (let i = 0; i < buf.L.length && from + i < N; i += 1) {
    mixL[from + i] += buf.L[i] * gl;
    mixR[from + i] += buf.R[i] * gr;
  }
}

let peak = 0;
for (let i = 0; i < N; i += 1) peak = Math.max(peak, Math.abs(mixL[i]), Math.abs(mixR[i]));
const norm = peak > 0 ? 0.5 / peak : 1;
for (let i = 0; i < N; i += 1) {
  mixL[i] *= norm;
  mixR[i] *= norm;
}
fs.writeFileSync(MIX_PATH, wav(mixL, mixR));
console.log(`wrote ${OUT_DIR}/*.wav`);
console.log(`wrote ${MIX_PATH} (${(fs.statSync(MIX_PATH).size / 1024 / 1024).toFixed(1)} MB, ${DURATION}s)`);
console.log(`peak ${(20 * Math.log10(0.5)).toFixed(1)} dBFS, ${cues.length} cues`);
for (const [time, name, gain] of cues) console.log(`  ${String(time).padStart(5)}s  ${name.padEnd(14)} gain ${gain}`);

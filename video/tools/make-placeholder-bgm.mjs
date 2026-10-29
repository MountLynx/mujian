// Placeholder ambient bed for the 90s intro film.
// This is intentionally simple: a quiet drone + tape noise + sparse bells.
// Replace it with a generated track from video/BGM-PROMPT.md.
import fs from 'node:fs';
import path from 'node:path';

const SR = 48000;
const DURATION = 102;
const N = SR * DURATION;
const TAU = Math.PI * 2;

const left = new Float32Array(N);
const right = new Float32Array(N);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (v) => {
  const x = clamp(v, 0, 1);
  return x * x * (3 - 2 * x);
};

const SCALE = DURATION / 90;

const chords = [
  { start: 0, end: 32, notes: [73.42, 110.0, 146.83, 174.61], pan: [-0.2, 0.25, -0.1, 0.3] }, // Dm
  { start: 28, end: 48, notes: [58.27, 87.31, 116.54, 146.83], pan: [0.15, -0.2, 0.3, -0.15] }, // Bb
  { start: 44, end: 62, notes: [49.0, 73.42, 98.0, 116.54], pan: [-0.25, 0.1, -0.2, 0.25] }, // Gm
  { start: 58, end: 78, notes: [73.42, 110.0, 146.83, 174.61], pan: [-0.15, 0.2, -0.25, 0.15] }, // Dm
  { start: 74, end: 90, notes: [73.42, 110.0, 146.83, 220.0], pan: [0.1, -0.2, 0.2, -0.1] }, // Dm add A
].map((chord) => ({ ...chord, start: chord.start * SCALE, end: chord.end * SCALE }));

for (const chord of chords) {
  for (let n = 0; n < chord.notes.length; n += 1) {
    const f = chord.notes[n];
    const pan = chord.pan[n];
    const gain = n === 0 ? 0.05 : 0.032;
    const start = chord.start;
    const end = chord.end;
    const from = Math.floor(start * SR);
    const to = Math.floor(end * SR);
    for (let i = from; i < to; i += 1) {
      const t = i / SR;
      const env = Math.min(smooth((t - start) / 3.5), smooth((end - t) / 3.5));
      const lfo = 0.82 + 0.18 * Math.sin(TAU * 0.043 * t + n * 1.7);
      const detune = 1 + 0.0009 * Math.sin(TAU * 0.07 * t + n);
      const v =
        Math.sin(TAU * f * t) +
        0.22 * Math.sin(TAU * f * 2 * t + 0.4) +
        0.06 * Math.sin(TAU * f * 3 * t + 1.1);
      const amount = gain * env * lfo * v * detune;
      const pl = Math.cos(((pan + 1) / 2) * (Math.PI / 2));
      const pr = Math.sin(((pan + 1) / 2) * (Math.PI / 2));
      left[i] += amount * pl;
      right[i] += amount * pr;
    }
  }
}

// Slow filtered noise, like tape/room tone.
let low = 0;
let band = 0;
for (let i = 0; i < N; i += 1) {
  const t = i / SR;
  const w = Math.random() * 2 - 1;
  low = 0.995 * low + 0.005 * w;
  band = 0.92 * band + 0.08 * w;
  const fade = Math.min(smooth(t / 4), smooth((DURATION - t) / 5));
  const noise = (low * 1.6 + band * 0.12) * 0.012 * fade;
  left[i] += noise;
  right[i] += noise * 0.92;
}

// Sparse bells.
const bells = [
  [8, 587.33, -0.35],
  [20, 440.0, 0.3],
  [34, 349.23, -0.25],
  [48, 587.33, 0.35],
  [62, 698.46, -0.3],
  [76, 440.0, 0.25],
  [84, 587.33, 0.0],
].map(([time, freq, pan]) => [time * SCALE, freq, pan]);
for (const [time, freq, pan] of bells) {
  const from = Math.floor(time * SR);
  const length = Math.floor(5.5 * SR);
  const pl = Math.cos(((pan + 1) / 2) * (Math.PI / 2));
  const pr = Math.sin(((pan + 1) / 2) * (Math.PI / 2));
  for (let j = 0; j < length && from + j < N; j += 1) {
    const t = j / SR;
    const attack = 1 - Math.exp(-60 * t);
    const decay = Math.exp(-1.9 * t);
    const v =
      Math.sin(TAU * freq * t) +
      0.4 * Math.sin(TAU * freq * 2 * t + 0.3) * Math.exp(-2.8 * t) +
      0.15 * Math.sin(TAU * freq * 3 * t + 0.9) * Math.exp(-4.5 * t);
    const amount = 0.026 * attack * decay * v;
    left[from + j] += amount * pl;
    right[from + j] += amount * pr;
  }
}

// Global fade and peak normalise to about -6 dBFS.
let peak = 0;
for (let i = 0; i < N; i += 1) {
  const t = i / SR;
  const fade = Math.min(smooth(t / 4.5), smooth((DURATION - t) / 5.5));
  left[i] *= fade;
  right[i] *= fade;
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
}
const normalise = peak > 0 ? 0.5 / peak : 1;
for (let i = 0; i < N; i += 1) {
  left[i] *= normalise;
  right[i] *= normalise;
}

const out = path.resolve('video/public/audio/bgm-placeholder.wav');
fs.mkdirSync(path.dirname(out), { recursive: true });
const buffer = Buffer.alloc(44 + N * 4);
buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + N * 4, 4);
buffer.write('WAVE', 8);
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(2, 22);
buffer.writeUInt32LE(SR, 24);
buffer.writeUInt32LE(SR * 4, 28);
buffer.writeUInt16LE(4, 32);
buffer.writeUInt16LE(16, 34);
buffer.write('data', 36);
buffer.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i += 1) {
  buffer.writeInt16LE(Math.round(clamp(left[i], -1, 1) * 32767), 44 + i * 4);
  buffer.writeInt16LE(Math.round(clamp(right[i], -1, 1) * 32767), 46 + i * 4);
}
fs.writeFileSync(out, buffer);
console.log(`wrote ${out} (${(buffer.length / 1024 / 1024).toFixed(1)} MB, ${DURATION}s)`);

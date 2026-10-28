import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export function newId(prefix = ''): string {
  return `${prefix}${prefix ? '_' : ''}${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Deterministic d20 roll, auditable from (seed, label). */
export function seededD20(seed: string, label: string): number {
  const digest = crypto.createHash('sha256').update(`${seed}::${label}`).digest();
  return (digest.readUInt32BE(0) % 20) + 1;
}

export function randomSeed(): string {
  return crypto.randomBytes(6).toString('hex');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function asNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,，;；]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * Models occasionally put a literal newline or control character inside a
 * JSON string. JSON.parse rejects that even though the intent is unambiguous.
 * Walk the text with a tiny state machine and escape those characters only
 * while inside a string; structural whitespace is left untouched.
 */
function escapeControlCharsInStrings(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      out += ch;
      inString = false;
      continue;
    }
    if (ch === '\n') {
      out += '\\n';
      continue;
    }
    if (ch === '\r') {
      out += '\\r';
      continue;
    }
    if (ch === '\t') {
      out += '\\t';
      continue;
    }
    if (ch.charCodeAt(0) < 0x20) {
      out += ' ';
      continue;
    }
    out += ch;
  }
  return out;
}

function tryParseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    /* try a conservative repair for raw control characters */
  }
  try {
    return JSON.parse(escapeControlCharsInStrings(text));
  } catch {
    return undefined;
  }
}

export function parseJsonLoose(raw: string): unknown {
  const trimmed = raw.trim().replace(/^\uFEFF/, '');
  const direct = tryParseJson(trimmed);
  if (direct !== undefined) return direct;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const parsed = tryParseJson(fenced[1].trim());
    if (parsed !== undefined) return parsed;
  }

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const parsed = tryParseJson(trimmed.slice(first, last + 1));
    if (parsed !== undefined) return parsed;
  }
  throw new Error('模型返回内容不是合法 JSON。');
}

export function formatClock(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function parseClock(clock: string): number {
  const match = clock.trim().match(/^(\d{1,2})[:：](\d{2})$/);
  if (!match) return 22 * 60;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return 22 * 60;
  return hours * 60 + minutes;
}

export function clockAfter(baseMinutes: number, elapsedMinutes: number): {
  minutes: number;
  display: string;
} {
  const absolute = baseMinutes + Math.max(0, Math.round(elapsedMinutes));
  const dayOffset = Math.floor(absolute / 1440);
  const display = formatClock(absolute);
  return {
    minutes: absolute,
    display: dayOffset > 0 ? `${display} · 次日` : display,
  };
}

export async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!, index);
    }
  });
  await Promise.all(runners);
  return results;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Serializes writes per key so a poller never reads a half-finished sequence of updates. */
export class WriteQueues {
  private queues = new Map<string, Promise<unknown>>();

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    this.queues.set(key, current);
    try {
      return await current;
    } finally {
      if (this.queues.get(key) === current) this.queues.delete(key);
    }
  }
}

/** Atomic JSON file write: write to a temp file, then rename over the target. */
export async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

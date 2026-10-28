import assert from 'node:assert/strict';
import test from 'node:test';
import { parseJsonLoose } from '../src/utils.ts';

test('JSON 容错：字符串内的裸换行与控制字符会被修复', () => {
  const raw = '{\n  "narration": "第一行\n第二行",\n  "ok": true\n}';
  const parsed = parseJsonLoose(raw) as { narration: string; ok: boolean };
  assert.equal(parsed.ok, true);
  assert.equal(parsed.narration, '第一行\n第二行');
});

test('JSON 容错：代码围栏与前后说明都能被剥离', () => {
  const raw = '好的，这是结果：\n```json\n{"a":1}\n```\n请查收。';
  assert.deepEqual(parseJsonLoose(raw), { a: 1 });
});

test('JSON 容错：真正的坏 JSON 仍然报错', () => {
  assert.throws(() => parseJsonLoose('{"a": '), /不是合法 JSON/);
});

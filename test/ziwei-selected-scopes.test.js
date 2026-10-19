const test = require('node:test');
const assert = require('node:assert/strict');
const { createZiweiChart } = require('../src/ziwei');
const { generateZiweiScopes, generateZiweiHoroscope } = require('../src/ziwei-horoscope');
const { resolvePeriodBoundary } = require('../src/time');

const input = { date: '2000-08-16', time: '02:30', gender: 'female',
  latitude: 25.033, longitude: 121.5654, timeZone: 'Asia/Taipei',
  targetDate: '2121-08-16', targetTime: '14:30' };

test('generates requested valid layers through the final decadal after age 120', () => {
  const { astrolabe } = createZiweiChart(input);
  const snapshot = generateZiweiScopes(astrolabe, input, ['decadal', 'yearly', 'monthly']);
  assert.deepEqual(Object.keys(snapshot.scopes), ['decadal', 'yearly', 'monthly']);
  assert.equal(snapshot.scopes.decadal.index, 6);
  assert.equal(snapshot.scopes.yearly.index, 3); // 2121 is 辛巳; fixed 寅 index is zero.
  assert.equal(snapshot.scopes.yearly.heavenly_stem, '辛');
  for (const palace of snapshot.palace_overlays) {
    assert.deepEqual(Object.keys(palace.scopes), ['decadal', 'yearly', 'monthly']);
  }
  assert.deepEqual(Object.keys(snapshot.scope_relations), ['decadal', 'yearly', 'monthly']);
  assert.throws(() => generateZiweiHoroscope(astrolabe, input), /supported.*age/);
});

test('accepts the first occurrence of a repeated period boundary while snapshots stay strict', () => {
  const targetInput = { ...input, timeZone: 'America/Havana', longitude: -82.36,
    targetDate: '2026-11-01', targetTime: '00:00' };
  const { astrolabe } = createZiweiChart(targetInput);
  const boundary = resolvePeriodBoundary(targetInput.targetDate, targetInput.timeZone);
  const value = generateZiweiScopes(astrolabe, { ...targetInput, targetBoundary: boundary }, ['yearly']);
  assert.equal(value.target.resolved_utc, '2026-11-01T04:00:00.000Z');
  assert.throws(() => generateZiweiHoroscope(astrolabe, targetInput), /ambiguous/);
  assert.throws(() => generateZiweiScopes(astrolabe, { ...targetInput,
    targetBoundary: { ...boundary, utc: '2026-11-01T05:00:00.000Z' } }, ['yearly']), /boundary/);
});

test('rejects unknown or empty scope requests instead of silently emitting incomplete data', () => {
  const { astrolabe } = createZiweiChart(input);
  assert.throws(() => generateZiweiScopes(astrolabe, input, ['decadl']), /scope/);
  assert.throws(() => generateZiweiScopes(astrolabe, input, []), /scope/);
});

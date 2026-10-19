const test = require('node:test');
const assert = require('node:assert/strict');

const { parseBirthInput } = require('../src/chart');
const { resolveCivilTime } = require('../src/time');

const flags = [
  '--date',
  '2000-08-16',
  '--time',
  '02:30',
  '--gender',
  'female',
  '--latitude',
  '25.033',
  '--longitude',
  '121.5654',
  '--time-zone',
  'Asia/Taipei',
];

const baziFlags = [
  '--system',
  'bazi',
  ...flags.filter((value) => value !== '--gender' && value !== 'female'),
];

test('parses a complete Ziwei horoscope request', () => {
  const input = parseBirthInput([
    ...flags,
    '--ziwei-output',
    'horoscope',
    '--target-date',
    '2026-08-03',
    '--target-time',
    '14:30',
  ]);

  assert.equal(input.ziweiOutput, 'horoscope');
  assert.equal(input.targetDate, '2026-08-03');
  assert.equal(input.targetTime, '14:30');
});

test('requires both target fields only for horoscope output', () => {
  assert.throws(
    () => parseBirthInput([...flags, '--ziwei-output', 'horoscope']),
    /target-date.*target-time/,
  );
  assert.throws(
    () =>
      parseBirthInput([
        ...flags,
        '--target-date',
        '2026-08-03',
        '--target-time',
        '14:30',
      ]),
    /horoscope/,
  );
});

test('rejects Ziwei output flags for Bazi', () => {
  assert.throws(
    () => parseBirthInput([...baziFlags, '--ziwei-output', 'horoscope']),
    /Ziwei.*Bazi/i,
  );
  assert.throws(
    () =>
      parseBirthInput([
        ...baziFlags,
        '--target-date',
        '2026-08-03',
        '--target-time',
        '14:30',
      ]),
    /Ziwei.*Bazi/i,
  );
});

test('resolves target civil time without apparent-solar correction', () => {
  assert.deepEqual(
    resolveCivilTime({
      date: '2026-08-03',
      time: '14:30',
      timeZone: 'Asia/Taipei',
    }),
    { timeIndex: 7 },
  );
});

test('rejects a nonexistent target civil time', () => {
  assert.throws(
    () =>
      resolveCivilTime({
        date: '2026-03-08',
        time: '02:30',
        timeZone: 'America/New_York',
      }),
    /does not exist/,
  );
});

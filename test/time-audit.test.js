const test = require('node:test');
const assert = require('node:assert/strict');

const { correctBirthTime, resolveCivilTime } = require('../src/time');

test('equivalent +180 and -180 longitudes produce the same apparent date', () => {
  const input = { date: '2026-01-01', time: '12:00', timeZone: 'Pacific/Fiji' };
  const east = correctBirthTime({ ...input, longitude: 180 });
  const west = correctBirthTime({ ...input, longitude: -180 });

  assert.deepEqual(west, east);
});

for (const date of ['2026-01-01', '2026-07-01']) {
  for (const [timeZone, longitude] of [
    ['Pacific/Chatham', -176.55],
    ['Pacific/Kiritimati', -157.4],
  ]) {
    test(`preserves the local solar date at noon in ${timeZone} on ${date}`, () => {
      const correction = correctBirthTime({ date, time: '12:00', timeZone, longitude });

      assert.equal(correction.apparentDate, date);
      assert.ok(Math.abs(correction.longitudeCorrectionMinutes) < 120);
    });
  }
}

test('resolves a historical IANA UTC offset containing seconds', () => {
  // IANA asia: Asia/Shanghai used +08:05:43 until 1901.
  const correction = correctBirthTime({
    date: '1900-06-21',
    time: '12:00',
    timeZone: 'Asia/Shanghai',
    longitude: 121.5,
  });

  assert.ok(Math.abs(correction.offsetMinutes - (8 * 60 + 5 + 43 / 60)) < 1e-9);
  assert.equal(correction.apparentDate, '1900-06-21');
});

test('accepts a valid four-digit Gregorian year below 0100', () => {
  assert.deepEqual(
    resolveCivilTime({ date: '0099-01-01', time: '12:00', timeZone: 'UTC' }),
    { timeIndex: 6 },
  );
});

test('rejects a solar correction that would exceed the four-digit date contract', () => {
  assert.throws(
    () => correctBirthTime({
      date: '9999-12-31',
      time: '23:59',
      longitude: -1,
      timeZone: 'Etc/GMT+12',
    }),
    /range|year|date/i,
  );
});

for (const [date, time, timeZone, error] of [
  ['2026-03-08', '02:30', 'America/New_York', /does not exist/],
  ['2026-11-01', '01:30', 'America/New_York', /ambiguous/],
  ['2026-10-04', '02:15', 'Australia/Lord_Howe', /does not exist/],
  ['2026-04-05', '01:45', 'Australia/Lord_Howe', /ambiguous/],
  ['2011-12-30', '12:00', 'Pacific/Apia', /does not exist/],
]) {
  test(`rejects unavailable or ambiguous local time ${date} ${time} ${timeZone}`, () => {
    assert.throws(() => resolveCivilTime({ date, time, timeZone }), error);
  });
}

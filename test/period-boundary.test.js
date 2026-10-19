const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveCivilInstant, resolvePeriodBoundary } = require('../src/time');

test('resolves a precise civil instant including a fractional-hour time zone', () => {
  const value = resolveCivilInstant({ date: '2026-01-01', time: '00:00', timeZone: 'Pacific/Chatham' });
  assert.equal(value.utc, '2025-12-31T10:15:00.000Z');
  assert.equal(value.utc_offset_minutes, 825);
});

for (const [date, timeZone, localDate, time, utc, resolution] of [
  ['2026-01-01', 'America/New_York', '2026-01-01', '00:00', '2026-01-01T05:00:00.000Z', 'exact'],
  ['2018-11-04', 'America/Sao_Paulo', '2018-11-04', '01:00', '2018-11-04T03:00:00.000Z', 'first_valid_minute'],
  ['2026-11-01', 'America/Havana', '2026-11-01', '00:00', '2026-11-01T04:00:00.000Z', 'earliest_occurrence'],
  ['2011-12-30', 'Pacific/Apia', '2011-12-31', '00:00', '2011-12-30T10:00:00.000Z', 'first_valid_minute'],
]) {
  test(`resolves a period boundary in ${timeZone} on ${date}`, () => {
    const value = resolvePeriodBoundary(date, timeZone);
    assert.equal(value.requested_date, date);
    assert.equal(value.date, localDate);
    assert.equal(value.time, time);
    assert.equal(value.utc, utc);
    assert.equal(value.resolution, resolution);
  });
}

test('keeps strict birth-time rejection separate from period-boundary disambiguation', () => {
  assert.throws(() => resolveCivilInstant({
    date: '2026-11-01', time: '00:30', timeZone: 'America/Havana',
  }), /ambiguous/);
  assert.throws(() => resolveCivilInstant({
    date: '2018-11-04', time: '00:30', timeZone: 'America/Sao_Paulo',
  }), /does not exist/);
});

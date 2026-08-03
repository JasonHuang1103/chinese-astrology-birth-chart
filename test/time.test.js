const test = require('node:test');
const assert = require('node:assert/strict');

const { chineseHourIndex, correctBirthTime } = require('../src/time');

test('maps corrected time to iztro Chinese-hour indices', () => {
  assert.equal(chineseHourIndex(0, 0), 0);
  assert.equal(chineseHourIndex(1, 0), 1);
  assert.equal(chineseHourIndex(22, 59), 11);
  assert.equal(chineseHourIndex(23, 0), 12);
});

test('applies the longitude correction relative to the zone meridian', () => {
  const result = correctBirthTime({
    date: '2000-06-21',
    time: '12:00',
    longitude: 121.5654,
    timeZone: 'Asia/Taipei',
  });

  assert.equal(result.offsetMinutes, 480);
  assert.ok(result.longitudeCorrectionMinutes > 6);
  assert.ok(result.longitudeCorrectionMinutes < 7);
  assert.match(result.apparentTime, /^\d{2}:\d{2}$/);
});

test('carries apparent solar time across a calendar boundary', () => {
  const result = correctBirthTime({
    date: '2000-01-01',
    time: '00:02',
    longitude: -179,
    timeZone: 'Etc/GMT-12',
  });

  assert.equal(result.apparentDate, '1999-12-31');
});

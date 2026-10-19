const test = require('node:test');
const assert = require('node:assert/strict');
const { generateZiweiBatch } = require('../src/ziwei-batch');

test('expresses pre-reform natural period endpoints as Gregorian dates consistently with UTC', () => {
  const input = { date: '1582-10-15', time: '12:30', gender: 'male',
    latitude: 0, longitude: 120, timeZone: 'Asia/Taipei' };
  let year;
  let month;
  for (const item of generateZiweiBatch(input)) {
    if (item.path === '流年/1582.json') year = item.document;
    if (item.path === '流月/1582-09.json') { month = item.document; break; }
  }
  // In 1582 the engine labels pre-reform dates in the Julian calendar.
  // Julian Jan 24 / Sep 17 correspond to Gregorian Feb 3 / Sep 27.
  assert.equal(year.period.natural.start.date, '1582-02-03');
  assert.equal(month.period.natural.start.date, '1582-09-27');
  assert.equal(month.period.natural.end.date, '1582-10-26');
  assert.equal(Date.parse(month.period.natural.end.utc) - Date.parse(month.period.natural.start.utc),
    29 * 24 * 60 * 60 * 1000);
  assert.equal(month.period.valid.start.date, '1582-10-15');
});

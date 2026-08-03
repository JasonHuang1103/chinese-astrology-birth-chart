const test = require('node:test');
const assert = require('node:assert/strict');

const { generateChart, parseBirthInput } = require('../src/chart');

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

test('rejects an invalid IANA time zone', () => {
  assert.throws(() => parseBirthInput([...flags.slice(0, -1), 'Moon/Base']), /time-zone/);
});

test('rejects out-of-range coordinates', () => {
  assert.throws(
    () => parseBirthInput(flags.map((value) => (value === '25.033' ? '91' : value))),
    /latitude/,
  );
});

test('normalizes an iztro chart into plain, AI-readable JSON', () => {
  const document = generateChart(parseBirthInput(flags));

  assert.equal(document.schema_version, '1.0.0');
  assert.equal(document.source.package, 'iztro');
  assert.equal(document.input.time_zone, 'Asia/Taipei');
  assert.equal(document.chart.palaces.length, 12);
  assert.deepEqual(Object.keys(document.chart.palaces[0].stars).sort(), ['adjective', 'major', 'minor']);
  assert.equal(JSON.stringify(document).includes('rawDates'), false);
});

test('defaults to Zi Wei and requires gender only for Zi Wei', () => {
  const ziwei = parseBirthInput(flags);

  assert.equal(ziwei.system, 'ziwei');
  assert.throws(
    () => parseBirthInput(flags.filter((value) => value !== '--gender' && value !== 'female')),
    /gender/,
  );
});

test('accepts Bazi without gender and rejects an unsupported system', () => {
  const baziFlags = [
    ...flags.filter((value) => value !== '--gender' && value !== 'female'),
    '--system',
    'bazi',
  ];

  assert.equal(parseBirthInput(baziFlags).system, 'bazi');
  assert.throws(() => parseBirthInput([...flags, '--system', 'both']), /system/);
});

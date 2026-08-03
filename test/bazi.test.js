const test = require('node:test');
const assert = require('node:assert/strict');

const { generateChart, parseBirthInput } = require('../src/chart');

const flags = [
  '--system',
  'bazi',
  '--date',
  '2000-08-16',
  '--time',
  '02:30',
  '--latitude',
  '25.033',
  '--longitude',
  '121.5654',
  '--time-zone',
  'Asia/Taipei',
];

test('generates a standalone Bazi document from apparent solar time', () => {
  const document = generateChart(parseBirthInput(flags));

  assert.deepEqual(Object.keys(document).sort(), [
    'bazi',
    'input',
    'schema_version',
    'source',
    'time_correction',
  ]);
  assert.equal(document.source.package, 'lunar-typescript');
  assert.equal(document.source.day_boundary_sect, 2);
  assert.equal(document.chart, undefined);
  assert.equal(document.input.gender, undefined);
  assert.equal(document.bazi.pillars.year.combined, '庚辰');
  assert.equal(document.bazi.pillars.day.stem, '丙');
  assert.deepEqual(document.bazi.pillars.day.hidden_stems, ['丁', '己']);
  assert.equal(document.bazi.pillars.hour.combined, '己丑');
  assert.equal(document.bazi.auxiliary.tai_yuan.value.length, 2);
});

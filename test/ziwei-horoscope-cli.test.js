const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

test('writes one self-contained Ziwei horoscope document to stdout', () => {
  const result = spawnSync(
    process.execPath,
    [
      'bin/ziwei-json.js',
      '--system',
      'ziwei',
      '--ziwei-output',
      'horoscope',
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
      '--target-date',
      '2026-08-03',
      '--target-time',
      '14:30',
    ],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  const document = JSON.parse(result.stdout);
  assert.equal(document.chart.palaces.length, 12);
  assert.equal(document.ziwei_addon.palace_relations.length, 12);
  assert.equal(document.horoscope.scopes.yearly.palace_names.length, 12);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

test('writes one JSON document to stdout', () => {
  const result = spawnSync(
    process.execPath,
    [
      'bin/ziwei-json.js',
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
    ],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).chart.palaces.length, 12);
  assert.equal(result.stderr, '');
});

test('writes invalid input errors to stderr and exits nonzero', () => {
  const result = spawnSync(
    process.execPath,
    [
      'bin/ziwei-json.js',
      '--date',
      'bad',
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
    ],
    { encoding: 'utf8' },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /date/i);
  assert.equal(result.stdout, '');
});

test('writes a standalone Bazi document without gender', () => {
  const result = spawnSync(
    process.execPath,
    [
      'bin/ziwei-json.js',
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
    ],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0);
  const document = JSON.parse(result.stdout);
  assert.equal(document.bazi.pillars.month.combined, '甲申');
  assert.equal(document.chart, undefined);
  assert.equal(result.stderr, '');
});

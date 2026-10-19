const test = require('node:test');
const assert = require('node:assert/strict');
const { astro } = require('iztro');

const { generateChart } = require('../src/chart');

const input = {
  date: '2000-08-16',
  time: '02:30',
  gender: 'female',
  latitude: 25.033,
  longitude: 121.5654,
  timeZone: 'Asia/Taipei',
};

test('records the installed engine version and effective calculation conventions', () => {
  const document = generateChart(input);

  assert.equal(document.source.version, require('iztro/package.json').version);
  assert.deepEqual(document.calculation_conventions.engine_config, astro.getConfig());
  assert.equal(document.calculation_conventions.fix_leap_month, true);
  assert.equal(document.calculation_conventions.natal_time_basis, 'apparent_solar_time');
  assert.equal(document.calculation_conventions.brightness_null_meaning, 'not_provided_by_engine');
  assert.deepEqual(document.calculation_conventions.time_zone_runtime, {
    node: process.versions.node,
    icu: process.versions.icu,
    tz: process.versions.tz,
  });
});

test('records a changed school without changing provenance of earlier documents', () => {
  const original = astro.getConfig().algorithm;
  try {
    const first = generateChart(input);
    astro.config({ algorithm: original === 'default' ? 'zhongzhou' : 'default' });
    const second = generateChart(input);

    assert.equal(first.calculation_conventions.engine_config.algorithm, original);
    assert.notEqual(second.calculation_conventions.engine_config.algorithm, original);
  } finally {
    astro.config({ algorithm: original });
  }
});

test('snapshots custom table overrides instead of retaining mutable engine references', () => {
  const overrides = astro.getConfig().mutagens;
  const original = overrides.jiaHeavenly;
  try {
    astro.config({ mutagens: { 甲: ['廉貞', '破軍', '武曲', '太陽'] } });
    const document = generateChart(input);
    const recorded = document.calculation_conventions.engine_config.mutagens;
    const expected = [...overrides.jiaHeavenly];
    overrides.jiaHeavenly[0] = 'ziweiMaj';

    assert.deepEqual(recorded.jiaHeavenly, expected);
  } finally {
    if (original === undefined) delete overrides.jiaHeavenly;
    else overrides.jiaHeavenly = original;
  }
});

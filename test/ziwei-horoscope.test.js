const test = require('node:test');
const assert = require('node:assert/strict');

const { generateChart, parseBirthInput } = require('../src/chart');

const horoscopeFlags = [
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
];

const scopeNames = ['decadal', 'age', 'yearly', 'monthly', 'daily', 'hourly'];

test('generates a self-contained horoscope with every official time scope', () => {
  const document = generateChart(parseBirthInput(horoscopeFlags));

  assert.equal(document.chart.palaces.length, 12);
  assert.equal(document.ziwei_addon.palace_relations.length, 12);
  assert.deepEqual(Object.keys(document.horoscope.scopes), scopeNames);
  assert.equal(document.horoscope.palace_overlays.length, 12);
  assert.equal(document.horoscope.target.date, '2026-08-03');
  assert.equal(document.horoscope.target.time, '14:30');
  assert.equal(document.horoscope.target.chinese_hour_index, 7);
  assert.equal(document.horoscope.target.time_basis, 'local_civil_time');
  assert.equal(document.horoscope.target.apparent_solar_correction_applied, false);
});

test('keeps natal positions fixed while mapping all dynamic scope data', () => {
  const document = generateChart(parseBirthInput(horoscopeFlags));
  const { scopes, palace_overlays: overlays } = document.horoscope;

  overlays.forEach((overlay, index) => {
    assert.equal(overlay.fixed_index, index);
    assert.equal(overlay.natal_palace.index, index);
    assert.equal(overlay.natal_palace.name, document.chart.palaces[index].name);
    for (const scopeName of scopeNames) {
      assert.equal(overlay.scopes[scopeName].palace_name, scopes[scopeName].palace_names[index]);
    }
  });

  for (const scope of Object.values(scopes)) {
    assert.equal(scope.palace_names.length, 12);
    assert.equal(scope.dynamic_stars_by_palace.length, 12);
    assert.equal(scope.transformations.length, 4);
  }
  assert.equal(scopes.age.dynamic_stars_by_palace.every((stars) => stars.length === 0), true);
  assert.equal(scopes.yearly.index, 4);
  assert.equal(scopes.yearly.palace_names[4], '命宮');
});

test('resolves horoscope transformations and yearly twelve-god overlays', () => {
  const document = generateChart(parseBirthInput(horoscopeFlags));
  const yearly = document.horoscope.scopes.yearly;

  assert.deepEqual(
    yearly.transformations.map(({ transformation }) => transformation),
    ['祿', '權', '科', '忌'],
  );
  assert.equal(
    yearly.transformations.every(({ target_palace: targetPalace }) =>
      Number.isInteger(targetPalace?.index)),
    true,
  );
  assert.equal(yearly.jiangqian12_by_palace.length, 12);
  assert.equal(yearly.suiqian12_by_palace.length, 12);
  assert.equal(yearly.jiangqian12_by_palace[0], '指背');
  assert.equal(document.horoscope.palace_overlays[0].scopes.yearly.jiangqian12, '指背');
});

test('exports scope-aware empty-palace borrowing and sanfang-sizheng references', () => {
  const document = generateChart(parseBirthInput(horoscopeFlags));

  for (const scopeName of scopeNames) {
    const relations = document.horoscope.scope_relations[scopeName];
    assert.equal(relations.length, 12);
    for (const relation of relations) {
      assert.equal(relation.scope_palace.fixed_index >= 0, true);
      assert.equal(relation.scope_palace.fixed_index <= 11, true);
      assert.deepEqual(
        Object.keys(relation.sanfang_sizheng),
        ['target', 'opposite', 'wealth', 'career'],
      );
    }

    const empty = relations.find((relation) => relation.is_empty_at_fixed_position);
    assert.ok(empty);
    assert.equal(empty.borrowed_palace.materialized_into_chart, false);
    assert.equal(
      empty.borrowed_palace.source_palace.fixed_index,
      empty.sanfang_sizheng.opposite.fixed_index,
    );
    assert.deepEqual(
      document.chart.palaces[empty.scope_palace.fixed_index].stars.major,
      [],
    );
  }
});

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

test('adds palace relationships without materializing borrowed stars', () => {
  const document = generateChart(parseBirthInput(flags));
  const addon = document.ziwei_addon;
  const empty = addon.palace_relations.find((item) => item.is_empty);

  assert.equal(addon.palace_relations.length, 12);
  assert.equal(addon.indexes.opposite_axes.length, 6);
  assert.ok(empty);
  assert.equal(empty.borrowed_palace.materialized_into_chart, false);
  assert.equal(empty.borrowed_palace.source_palace.index, empty.opposite_palace.index);
  assert.deepEqual(document.chart.palaces[empty.palace.index].stars.major, []);
  assert.equal(empty.sanfang_sizheng.star_locations.length > 0, true);
  assert.deepEqual(
    Object.keys(empty.sanfang_sizheng.palaces),
    ['target', 'opposite', 'wealth', 'career'],
  );
});

test('exports four palace-stem flights per palace and indexes self transformations', () => {
  const addon = generateChart(parseBirthInput(flags)).ziwei_addon;
  const flightGroups = addon.transformations.palace_stem_flights;
  const selfEdges = flightGroups.flatMap(({ source_palace: sourcePalace, flights }) =>
    flights
      .filter((flight) => flight.is_self_transformation)
      .map((flight) => ({ source_palace: sourcePalace, ...flight })),
  );

  assert.equal(flightGroups.length, 12);
  assert.equal(flightGroups.every(({ flights }) => flights.length === 4), true);
  assert.equal(
    flightGroups.every(({ flights }) =>
      flights.map(({ transformation }) => transformation).join('') === '祿權科忌'),
    true,
  );
  assert.deepEqual(addon.transformations.self_transformations, selfEdges);
});

test('birth transformations and star indexes resolve to natal chart locations', () => {
  const document = generateChart(parseBirthInput(flags));
  const addon = document.ziwei_addon;
  const birthTransformations = addon.transformations.birth_year_transformations;

  assert.deepEqual(
    birthTransformations.map(({ transformation }) => transformation).sort(),
    ['忌', '權', '科', '祿'].sort(),
  );
  for (const item of birthTransformations) {
    const palace = document.chart.palaces[item.target_palace.index];
    assert.equal(palace.name, item.target_palace.name);
    assert.equal(
      Object.values(palace.stars).flat().some((star) => star.name === item.star),
      true,
    );
  }

  for (const [starName, locations] of Object.entries(addon.indexes.stars_by_name)) {
    for (const location of locations) {
      const palace = document.chart.palaces[location.palace.index];
      assert.equal(
        palace.stars[location.category].some((star) => star.name === starName),
        true,
      );
    }
  }
});

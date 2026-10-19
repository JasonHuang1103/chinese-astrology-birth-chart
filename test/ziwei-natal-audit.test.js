const test = require('node:test');
const assert = require('node:assert/strict');

const { generateZiweiChart } = require('../src/ziwei');

// Synthetic inputs cover ten year stems, both genders, all thirteen hour indices,
// and all five element classes. These are structural audits, not reference charts.
const times = Array.from({ length: 12 }, (_, index) => `${String(index * 2).padStart(2, '0')}:30`)
  .concat('23:30');
const documents = Array.from({ length: 10 }, (_, index) => 1984 + index).flatMap((year) =>
  times.flatMap((time) => ['male', 'female'].map((gender) => generateZiweiChart({
    date: `${year}-06-15`, time, gender, latitude: 0, longitude: 120, timeZone: 'Asia/Taipei',
  }))),
);

const branches = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];
const palaceNames = ['命宮', '兄弟', '夫妻', '子女', '財帛', '疾厄', '遷移', '僕役', '官祿', '田宅', '福德', '父母'];
const ziweiOffsets = { 紫微: 0, 天機: -1, 太陽: -3, 武曲: -4, 天同: -5, 廉貞: -8 };
const tianfuOffsets = { 天府: 0, 太陰: 1, 貪狼: 2, 巨門: 3, 天相: 4, 天梁: 5, 七殺: 6, 破軍: 10 };
const majorNames = [...Object.keys(ziweiOffsets), ...Object.keys(tianfuOffsets)];
const minorNames = ['左輔', '右弼', '文昌', '文曲', '天魁', '天鉞', '祿存', '天馬', '地空', '地劫', '火星', '鈴星', '擎羊', '陀羅'];
// Frozen default table from iztro 2.5.8 lib/data/heavenlyStems.js.
// Expected values do not call the engine's transformation helpers. This checks
// this implementation's contract and does not adjudicate different schools.
const transformations = ['祿', '權', '科', '忌'];
const transformationTable = {
  甲: ['廉貞', '破軍', '武曲', '太陽'],
  乙: ['天機', '天梁', '紫微', '太陰'],
  丙: ['天同', '天機', '文昌', '廉貞'],
  丁: ['太陰', '天同', '天機', '巨門'],
  戊: ['貪狼', '太陰', '右弼', '天機'],
  己: ['武曲', '貪狼', '天梁', '文曲'],
  庚: ['太陽', '武曲', '太陰', '天同'],
  辛: ['巨門', '太陽', '文曲', '文昌'],
  壬: ['天梁', '紫微', '左輔', '武曲'],
  癸: ['破軍', '巨門', '太陰', '貪狼'],
};
const wrap = (index) => (index + 12) % 12;
const ref = ({ index, name, heavenly_stem, earthly_branch }) => ({ index, name, heavenly_stem, earthly_branch });

test('synthetic natal matrix preserves palace identities, body palace and element coverage', () => {
  for (const { chart } of documents) {
    const { palaces } = chart;
    assert.deepEqual(palaces.map((palace) => palace.index), Array.from({ length: 12 }, (_, index) => index));
    assert.deepEqual(palaces.map((palace) => palace.earthly_branch), branches);
    assert.deepEqual(palaces.map((palace) => palace.name).sort(), [...palaceNames].sort());
    assert.equal(palaces.filter((palace) => palace.is_body_palace).length, 1);
    assert.equal(palaces.find((palace) => palace.is_body_palace).earthly_branch, chart.body_palace_branch);
    assert.equal(palaces.find((palace) => palace.name === '命宮').earthly_branch, chart.soul_palace_branch);
    assert.ok(chart.soul);
    assert.ok(chart.body);
  }
  assert.equal(new Set(documents.map(({ chart }) => chart.five_elements_class)).size, 5);
  assert.equal(new Set(documents.map(({ chart }) => chart.chinese_date[0])).size, 10);
  assert.equal(new Set(documents.map(({ time_correction: correction }) => correction.chinese_hour_index)).size, 13);
});

test('synthetic natal matrix retains star inventory and relative major-star placement', () => {
  for (const { chart } of documents) {
    const majorLocations = Object.fromEntries(chart.palaces.flatMap((palace) =>
      palace.stars.major.map((star) => [star.name, palace.index])));
    assert.deepEqual(chart.palaces.flatMap((palace) => palace.stars.major.map((star) => star.name)).sort(), [...majorNames].sort());
    assert.deepEqual(chart.palaces.flatMap((palace) => palace.stars.minor.map((star) => star.name)).sort(), [...minorNames].sort());
    assert.equal(chart.palaces.flatMap((palace) => palace.stars.adjective).length, 38);
    for (const [anchor, offsets] of [['紫微', ziweiOffsets], ['天府', tianfuOffsets]]) {
      for (const [starName, offset] of Object.entries(offsets)) {
        assert.equal(majorLocations[starName], wrap(majorLocations[anchor] + offset));
      }
    }
    for (const palace of chart.palaces) {
      for (const star of Object.values(palace.stars).flat()) assert.equal(star.scope, 'origin');
      for (const star of palace.stars.major) assert.match(star.brightness, /^[廟旺得利平不陷]$/);
    }
  }
});

test('synthetic natal matrix resolves palace geometry, borrowing and star references', () => {
  for (const { chart, ziwei_addon: addon } of documents) {
    assert.equal(addon.palace_relations.length, 12);
    assert.equal(addon.indexes.opposite_axes.length, 6);
    for (const relation of addon.palace_relations) {
      const index = relation.palace.index;
      const palace = chart.palaces[index];
      assert.deepEqual(relation.palace, ref(palace));
      assert.deepEqual(relation.opposite_palace, ref(chart.palaces[wrap(index + 6)]));
      assert.deepEqual(relation.adjacent_palaces.previous, ref(chart.palaces[wrap(index - 1)]));
      assert.deepEqual(relation.adjacent_palaces.next, ref(chart.palaces[wrap(index + 1)]));
      const expectedRelations = { target: index, opposite: wrap(index + 6), wealth: wrap(index + 8), career: wrap(index + 4) };
      for (const [role, expectedIndex] of Object.entries(expectedRelations)) {
        assert.deepEqual(relation.sanfang_sizheng.palaces[role], ref(chart.palaces[expectedIndex]));
        const actual = relation.sanfang_sizheng.star_locations.filter((star) => star.role === role);
        const expected = Object.entries(chart.palaces[expectedIndex].stars).flatMap(([category, stars]) =>
          stars.map((star) => `${category}:${star.name}`)).sort();
        assert.deepEqual(actual.map((star) => `${star.category}:${star.name}`).sort(), expected);
        for (const star of actual) assert.deepEqual(star.palace, ref(chart.palaces[expectedIndex]));
      }
      assert.equal(relation.is_empty, palace.stars.major.length === 0);
      if (relation.is_empty) {
        const borrowed = relation.borrowed_palace;
        assert.equal(borrowed.materialized_into_chart, false);
        assert.deepEqual(borrowed.source_palace, ref(chart.palaces[wrap(index + 6)]));
        assert.deepEqual(borrowed.major_stars.map((star) => star.name).sort(),
          chart.palaces[wrap(index + 6)].stars.major.map((star) => star.name).sort());
      } else assert.equal(relation.borrowed_palace, null);
    }
    for (const [name, locations] of Object.entries(addon.indexes.stars_by_name)) {
      for (const location of locations) {
        assert.deepEqual(location.palace, ref(chart.palaces[location.palace.index]));
        assert.equal(chart.palaces[location.palace.index].stars[location.category].filter((star) => star.name === name).length, 1);
      }
    }
  }
});

test('synthetic natal matrix matches frozen default four transformations and self-flight geometry', () => {
  for (const { chart, ziwei_addon: addon } of documents) {
    const locations = Object.fromEntries(chart.palaces.flatMap((palace) =>
      Object.entries(palace.stars).flatMap(([category, stars]) =>
        stars.map((star) => [star.name, { palace, category, star }]))));
    const birth = addon.transformations.birth_year_transformations;
    assert.equal(birth.length, 4);
    for (const [index, starName] of transformationTable[chart.chinese_date[0]].entries()) {
      const entry = birth.find((item) => item.transformation === transformations[index]);
      assert.equal(entry.star, starName);
      assert.equal(entry.star_category, locations[starName].category);
      assert.deepEqual(entry.target_palace, ref(locations[starName].palace));
      assert.equal(locations[starName].star.mutagen, transformations[index]);
    }
    const expectedSelf = [];
    assert.equal(addon.transformations.palace_stem_flights.length, 12);
    for (const [index, group] of addon.transformations.palace_stem_flights.entries()) {
      const palace = chart.palaces[index];
      assert.deepEqual(group.source_palace, ref(palace));
      assert.equal(group.heavenly_stem, palace.heavenly_stem);
      assert.equal(group.flights.length, 4);
      for (const [flightIndex, starName] of transformationTable[palace.heavenly_stem].entries()) {
        const flight = group.flights[flightIndex];
        assert.equal(flight.star, starName);
        assert.equal(flight.transformation, transformations[flightIndex]);
        assert.equal(flight.star_category, locations[starName].category);
        assert.deepEqual(flight.target_palace, ref(locations[starName].palace));
        const isSelf = locations[starName].palace.index === palace.index;
        assert.equal(flight.is_self_transformation, isSelf);
        if (isSelf) expectedSelf.push({ source_palace: ref(palace), ...flight });
      }
    }
    assert.deepEqual(addon.transformations.self_transformations, expectedSelf);
  }
});

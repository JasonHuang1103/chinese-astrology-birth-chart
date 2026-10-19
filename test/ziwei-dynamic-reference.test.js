const test = require('node:test');
const assert = require('node:assert/strict');

const { createZiweiChart } = require('../src/ziwei');
const { generateZiweiScopes } = require('../src/ziwei-horoscope');

// Literal dates and placements are hand-derived from the sources listed in
// docs/references/ziwei-dynamic-conventions.md, not read back from the engine.
const birth = {
  date: '2000-08-16', time: '02:30', latitude: 0, longitude: 120,
  timeZone: 'Asia/Taipei',
};
const charts = Object.fromEntries(['female', 'male'].map((gender) =>
  [gender, createZiweiChart({ ...birth, gender })]));
const natalBranches = {
  紫微: '午', 天機: '巳', 太陽: '卯', 武曲: '寅', 天同: '丑', 廉貞: '戌',
  天府: '戌', 太陰: '亥', 貪狼: '子', 巨門: '丑', 天相: '寅', 天梁: '卯', 七殺: '辰', 破軍: '申',
  左輔: '戌', 右弼: '辰', 文昌: '酉', 文曲: '巳',
};
// Order: Lu, Quan, Ke, Ji. Ren Ke explicitly adopts the project's default
// Zuo Fu variant; the cited Quanshu transcription instead gives Tian Fu.
const transformations = {
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

function scopesAt(gender, targetDate, requested) {
  return generateZiweiScopes(charts[gender].astrolabe, {
    ...birth, gender, targetDate, targetTime: '14:30',
  }, requested).scopes;
}

function assertScope(scope, [index, stem, branch]) {
  assert.equal(scope.index, index, 'independently derived focus palace');
  assert.equal(scope.palace_names[index], '命宮');
  assert.equal(scope.heavenly_stem, stem, 'scope transformation trigger');
  assert.equal(scope.earthly_branch, branch, 'scope Ganzhi branch');
  assert.deepEqual(scope.transformations.map(({ transformation }) => transformation), ['祿', '權', '科', '忌']);
  assert.deepEqual(scope.transformations.map(({ star }) => star), transformations[stem]);
  assert.deepEqual(scope.transformations.map(({ target_palace: palace }) => palace.earthly_branch),
    transformations[stem].map((star) => natalBranches[star]));
}

test('dynamic reference starts from independently placed natal stars and wood-three bureau', () => {
  for (const { document } of Object.values(charts)) {
    assert.deepEqual(document.chart.lunar_date_details, { year: 2000, month: 7, day: 17, is_leap: false });
    assert.equal(document.time_correction.chinese_hour_index, 1);
    assert.equal(document.chart.soul_palace_branch, '未');
    assert.equal(document.chart.body_palace_branch, '酉');
    assert.equal(document.chart.five_elements_class, '木三局');
    const life = document.chart.palaces.find((palace) => palace.name === '命宮');
    assert.equal(life.heavenly_stem, '癸');
    assert.deepEqual(life.decadal.range, [3, 12]);
    const actual = Object.fromEntries(document.chart.palaces.flatMap((palace) =>
      Object.values(palace.stars).flat().map((star) => [star.name, palace.earthly_branch])));
    for (const [star, branch] of Object.entries(natalBranches)) assert.equal(actual[star], branch, star);
  }
});

const decadals = [
  { date: '2002-02-12', ages: [3, 12], female: [5, '癸', '未'], male: [5, '癸', '未'], yearly: [4, '壬', '午'] },
  { date: '2012-01-23', ages: [13, 22], female: [4, '壬', '午'], male: [6, '甲', '申'], yearly: [2, '壬', '辰'] },
  { date: '2022-02-01', ages: [23, 32], female: [3, '辛', '巳'], male: [7, '乙', '酉'], yearly: [0, '壬', '寅'] },
  { date: '2120-08-01', ages: [113, 122], female: [6, '甲', '申'], male: [4, '壬', '午'], yearly: [2, '庚', '辰'] },
  { date: '2121-08-01', ages: [113, 122], female: [6, '甲', '申'], male: [4, '壬', '午'], yearly: [3, '辛', '巳'] },
];

for (const gender of ['female', 'male']) {
  for (const fixture of decadals) {
    test(`independent decadal direction and yearly palace: ${gender} ${fixture.date}`, () => {
      // In ages 121/122 only these scopes are requested; the small-limit age
      // table ends at 120 and is not an oracle for the twelve decadal spans.
      const scopes = scopesAt(gender, fixture.date, ['decadal', 'yearly']);
      assert.deepEqual(Object.keys(scopes), ['decadal', 'yearly']);
      assertScope(scopes.decadal, fixture[gender]);
      assertScope(scopes.yearly, fixture.yearly);
      assert.equal(scopes.decadal.name, '大限');
      assert.deepEqual(charts[gender].document.chart.palaces[fixture[gender][0]].decadal.range, fixture.ages);
    });
  }

  test(`independent decadal boundaries use lunar new year: ${gender}`, () => {
    assert.equal(scopesAt(gender, '2002-02-11', ['decadal']).decadal.name, '童限');
    assertScope(scopesAt(gender, '2012-01-22', ['decadal']).decadal, [5, '癸', '未']);
    assertScope(scopesAt(gender, '2022-01-31', ['decadal']).decadal,
      gender === 'female' ? [4, '壬', '午'] : [6, '甲', '申']);
  });
}

const months2026 = [
  ['2026-02-17', 11, '庚', '寅'],
  ['2026-03-19', 0, '辛', '卯'],
  ['2026-04-17', 1, '壬', '辰'],
  ['2026-05-17', 2, '癸', '巳'],
  ['2026-06-15', 3, '甲', '午'],
  ['2026-07-14', 4, '乙', '未'],
  ['2026-08-13', 5, '丙', '申'],
  ['2026-09-11', 6, '丁', '酉'],
  ['2026-10-10', 7, '戊', '戌'],
  ['2026-11-09', 8, '己', '亥'],
];

for (const [date, index, stem, branch] of months2026) {
  test(`independent Doujun, five-tiger month stem and transformations: ${date}`, () => {
    const scopes = scopesAt('female', date, ['yearly', 'monthly']);
    assertScope(scopes.yearly, [4, '丙', '午']);
    assertScope(scopes.monthly, [index, stem, branch]);
  });
}

const leap2025 = [
  ['2025-06-25', 3, '癸', '未'], // regular sixth month, day 1
  ['2025-07-25', 3, '癸', '未'], // leap sixth month, day 1
  ['2025-08-08', 3, '癸', '未'], // leap sixth month, day 15
  ['2025-08-09', 4, '甲', '申'], // leap sixth month, day 16: logical seventh month
  ['2025-08-22', 4, '甲', '申'], // leap sixth month, final day
  ['2025-08-23', 4, '甲', '申'], // regular seventh month, day 1
];

for (const gender of ['female', 'male']) {
  for (const [date, index, stem, branch] of leap2025) {
    test(`independent selected half-month convention: ${gender} ${date}`, () => {
      const scopes = scopesAt(gender, date, ['yearly', 'monthly']);
      assertScope(scopes.yearly, [3, '乙', '巳']);
      assertScope(scopes.monthly, [index, stem, branch]);
    });
  }
}

const test = require('node:test');
const assert = require('node:assert/strict');

const { generateChart } = require('../src/chart');

const birthInput = {
  system: 'ziwei',
  ziweiOutput: 'horoscope',
  date: '2000-08-16',
  time: '02:30',
  gender: 'female',
  latitude: 25.033,
  longitude: 121.5654,
  timeZone: 'Asia/Taipei',
};

function chartAt(targetDate, targetTime = '14:30') {
  return generateChart({ ...birthInput, targetDate, targetTime });
}

test('rejects targets before birth rather than returning fabricated childhood scopes', () => {
  for (const [date, time] of [
    ['1999-08-16', '14:30'],
    ['2000-08-15', '14:30'],
    ['2000-08-16', '02:29'],
  ]) {
    assert.throws(() => chartAt(date, time), /before.*birth|target.*birth/i);
  }
});

test('rejects a target outside the supported minor-limit ages', () => {
  // The final natal decadal is still valid at age 121, but iztro 2.5.8
  // supplies minor-limit ages only from 1 through 120.
  assert.throws(() => chartAt('2120-08-16'), /supported|range|age|scope/i);
});

test('rejects a target beyond the final natal decadal', () => {
  // This synthetic chart has twelve decadals, from [3, 12] to [113, 122].
  assert.throws(() => chartAt('2122-08-16'), /supported|range|age|scope/i);
});

test('supports childhood limits before the first decadal begins', () => {
  const first = chartAt('2000-08-17');
  const second = chartAt('2001-08-16');
  const third = chartAt('2002-08-16');

  assert.deepEqual(first.chart.palaces[5].decadal.range, [3, 12]);
  assert.equal(first.horoscope.scopes.age.nominal_age, 1);
  assert.equal(first.horoscope.scopes.decadal.name, '童限');
  assert.equal(first.horoscope.scopes.decadal.index, 5);
  assert.equal(first.chart.palaces[5].name, '命宮');
  assert.equal(second.horoscope.scopes.age.nominal_age, 2);
  assert.equal(second.horoscope.scopes.decadal.name, '童限');
  assert.equal(second.horoscope.scopes.decadal.index, 1);
  assert.equal(second.chart.palaces[1].name, '財帛');
  assert.equal(third.horoscope.scopes.age.nominal_age, 3);
  assert.equal(third.horoscope.scopes.decadal.name, '大限');
  assert.equal(third.horoscope.scopes.decadal.index, 5);
});

test('changes nominal age, decadal, and annual scopes on lunar New Year', () => {
  // Calendar date: https://www.hko.gov.hk/tc/gts/time/calendar/pdf/files/2012.pdf
  const before = chartAt('2012-01-22').horoscope;
  const after = chartAt('2012-01-23').horoscope;

  assert.equal(before.target.lunar_date, '二〇一一年腊月廿九');
  assert.equal(after.target.lunar_date, '二〇一二年正月初一');
  assert.equal(before.scopes.age.nominal_age, 12);
  assert.equal(after.scopes.age.nominal_age, 13);
  assert.equal(before.scopes.decadal.index, 5);
  assert.equal(after.scopes.decadal.index, 4);
  assert.equal(before.scopes.yearly.heavenly_stem, '辛');
  assert.equal(before.scopes.yearly.earthly_branch, '卯');
  assert.equal(after.scopes.yearly.heavenly_stem, '壬');
  assert.equal(after.scopes.yearly.earthly_branch, '辰');
  for (const h of [before, after]) {
    assert.equal(h.scopes.yearly.suiqian12_by_palace[h.scopes.yearly.index], '歲建');
  }
});

test('changes monthly scope on the first lunar day rather than Gregorian month start', () => {
  const before = chartAt('2025-06-24').horoscope.scopes.monthly;
  const after = chartAt('2025-06-25').horoscope.scopes.monthly;

  assert.deepEqual([before.index, before.heavenly_stem, before.earthly_branch], [2, '壬', '午']);
  assert.deepEqual([after.index, after.heavenly_stem, after.earthly_branch], [3, '癸', '未']);
});

test('keeps the leap-month first half in the preceding month and second half in the next', () => {
  // Calendar dates: https://www.hko.gov.hk/tc/gts/time/calendar/pdf/files/2025.pdf
  const expectations = [
    ['2025-07-24', '二〇二五年六月三十', 3, '癸', '未'],
    ['2025-07-25', '二〇二五年闰六月初一', 3, '癸', '未'],
    ['2025-08-08', '二〇二五年闰六月十五', 3, '癸', '未'],
    ['2025-08-09', '二〇二五年闰六月十六', 4, '甲', '申'],
    ['2025-08-22', '二〇二五年闰六月廿九', 4, '甲', '申'],
    ['2025-08-23', '二〇二五年七月初一', 4, '甲', '申'],
  ];

  for (const [date, lunarDate, index, stem, branch] of expectations) {
    const h = chartAt(date).horoscope;
    assert.equal(h.target.lunar_date, lunarDate);
    assert.deepEqual(
      [h.scopes.monthly.index, h.scopes.monthly.heavenly_stem, h.scopes.monthly.earthly_branch],
      [index, stem, branch],
    );
  }
});

test('keeps all scope references and transformation destinations resolvable at age 120', () => {
  const document = chartAt('2119-08-16');
  const h = document.horoscope;

  assert.equal(h.scopes.age.nominal_age, 120);
  for (const [scopeName, scope] of Object.entries(h.scopes)) {
    assert.ok(scope.index >= 0 && scope.index <= 11);
    assert.equal(scope.palace_names[scope.index], '命宮');
    assert.equal(new Set(scope.palace_names).size, 12);
    assert.equal(h.palace_overlays.filter((p) => p.scopes[scopeName].is_focus).length, 1);

    for (const transformation of scope.transformations) {
      const target = transformation.target_palace;
      assert.ok(target);
      const palace = document.chart.palaces[target.index];
      assert.equal(target.name, palace.name);
      assert.ok(palace.stars[transformation.star_category].some(
        (star) => star.name === transformation.star,
      ));
    }

    for (const relation of h.scope_relations[scopeName]) {
      const index = relation.scope_palace.fixed_index;
      assert.equal(relation.sanfang_sizheng.target.fixed_index, index);
      assert.equal(relation.sanfang_sizheng.opposite.fixed_index, (index + 6) % 12);
      assert.equal(relation.sanfang_sizheng.wealth.fixed_index, (index + 8) % 12);
      assert.equal(relation.sanfang_sizheng.career.fixed_index, (index + 4) % 12);
      for (const reference of Object.values(relation.sanfang_sizheng)) {
        assert.equal(reference.palace_name, scope.palace_names[reference.fixed_index]);
        assert.equal(reference.natal_palace.index, reference.fixed_index);
      }
    }
  }
});

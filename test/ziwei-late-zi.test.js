const test = require('node:test');
const assert = require('node:assert/strict');

const { generateZiweiChart } = require('../src/ziwei');

// HKO dates + hand-derived placements, independently checked against classical
// placement rules and Fortel's table. No expected value is obtained from iztro.
// See docs/references/ziwei-late-zi-convention.md for sources and calculations.
const cases = [
  {
    id: 'leap second month eighteenth', late: '2023-04-07', early: '2023-04-08',
    lunar: { year: 2023, month: 2, day: 18, is_leap: true, effective_month: 3 },
    year: '癸卯', branch: '辰', stem: '丙', bureau: '土五局', ziwei: '未',
  },
  {
    id: 'leap second month fifteenth', late: '2023-04-04', early: '2023-04-05',
    lunar: { year: 2023, month: 2, day: 15, is_leap: true, effective_month: 2 },
    year: '癸卯', branch: '卯', stem: '乙', bureau: '水二局', ziwei: '申',
  },
  {
    id: 'leap second month fifteenth to sixteenth', late: '2023-04-05', early: '2023-04-06',
    lunar: { year: 2023, month: 2, day: 16, is_leap: true, effective_month: 3 },
    year: '癸卯', branch: '辰', stem: '丙', bureau: '土五局', ziwei: '酉',
  },
  {
    id: 'leap month end', late: '2023-04-19', early: '2023-04-20',
    lunar: { year: 2023, month: 3, day: 1, is_leap: false, effective_month: 3 },
    year: '癸卯', branch: '辰', stem: '丙', bureau: '土五局', ziwei: '午',
  },
  {
    id: 'ordinary lunar month end', late: '2023-05-18', early: '2023-05-19',
    lunar: { year: 2023, month: 4, day: 1, is_leap: false, effective_month: 4 },
    year: '癸卯', branch: '巳', stem: '丁', bureau: '土五局', ziwei: '午',
  },
  {
    id: '2023 lunar new year', late: '2023-01-21', early: '2023-01-22',
    lunar: { year: 2023, month: 1, day: 1, is_leap: false, effective_month: 1 },
    year: '癸卯', branch: '寅', stem: '甲', bureau: '水二局', ziwei: '丑',
  },
  {
    id: '2022 lunar new year', late: '2022-01-31', early: '2022-02-01',
    lunar: { year: 2022, month: 1, day: 1, is_leap: false, effective_month: 1 },
    year: '壬寅', branch: '寅', stem: '壬', bureau: '金四局', ziwei: '亥',
  },
];

for (const fixture of cases) {
  test(`forward late Zi uses one effective lunar date: ${fixture.id}`, () => {
    const late = generateZiweiChart({
      date: fixture.late, time: '23:30', gender: 'male',
      latitude: 0, longitude: 120, timeZone: 'Asia/Taipei',
    });
    const early = generateZiweiChart({
      date: fixture.early, time: '00:30', gender: 'male',
      latitude: 0, longitude: 120, timeZone: 'Asia/Taipei',
    });

    for (const { chart } of [late, early]) {
      assert.equal(chart.soul_palace_branch, fixture.branch, 'life palace uses effective lunar month');
      assert.equal(chart.body_palace_branch, fixture.branch, 'body palace uses effective lunar month');
      const life = chart.palaces.find((palace) => palace.name === '命宮');
      assert.equal(life.heavenly_stem, fixture.stem, 'palace stem uses effective lunar year');
      assert.equal(life.earthly_branch, fixture.branch);
      assert.equal(chart.five_elements_class, fixture.bureau);
      assert.equal(chart.chinese_date.slice(0, 2), fixture.year);
      const ziwei = chart.palaces.find((palace) => palace.stars.major.some((star) => star.name === '紫微'));
      assert.equal(ziwei.earthly_branch, fixture.ziwei, 'Ziwei uses the same effective day and bureau');
      assert.ok(chart.calculation_lunar_date_details, 'the effective lunar date is recorded separately');
      const { year, month, day, is_leap, effective_month } = chart.calculation_lunar_date_details;
      assert.deepEqual({ year, month, day, is_leap, effective_month }, fixture.lunar);
    }

    assert.deepEqual(late.chart.palaces, early.chart.palaces, 'all natal placements share one effective date');
    assert.equal(late.input.date, fixture.late);
    assert.equal(late.input.time, '23:30');
    assert.equal(late.time_correction.apparent_solar_date, fixture.late);
    assert.equal(late.time_correction.chinese_hour_index, 12);
    assert.match(late.time_correction.apparent_solar_time, /^23:/);
    assert.equal(late.chart.time, '晚子時');
    assert.equal(early.time_correction.apparent_solar_date, fixture.early);
    assert.equal(early.time_correction.chinese_hour_index, 0);
    assert.equal(early.chart.time, '早子時');
  });
}

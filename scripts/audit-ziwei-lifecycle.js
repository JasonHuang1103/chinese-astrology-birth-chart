const assert = require('node:assert/strict');
const { generateChart } = require('../src/chart');
const { LunarYear, Lunar } = require('lunar-typescript');

// Structural lifecycle sampling for two synthetic births, not independent reference charts.

const birth = {
  system: 'ziwei', ziweiOutput: 'horoscope', date: '2000-08-16', time: '02:30',
  latitude: 25.033, longitude: 121.5654, timeZone: 'Asia/Taipei', targetTime: '14:30',
};
const results = [];
const samples = [];
let skippedMonths = 0;
for (let year = 2000; year <= 2119; year += 1) {
  const months = LunarYear.fromYear(year).getMonths().filter((month) => month.getYear() === year);
  for (const month of months) {
    const number = month.getMonth();
    const first = Lunar.fromYmd(year, number, 1).getSolar().toYmd();
    const last = Lunar.fromYmd(year, number, month.getDayCount()).getSolar().toYmd();
    if (last < birth.date) { skippedMonths += 1; continue; }
    samples.push({ year, month: number, day: first < birth.date ? 'birth' : 1, date: first < birth.date ? birth.date : first });
    if (number < 0) samples.push({ year, month: number, day: 16, date: Lunar.fromYmd(year, number, 16).getSolar().toYmd() });
  }
}

function referenceMatches(reference, chart, scope) {
  assert.ok(Number.isInteger(reference.fixed_index));
  assert.ok(reference.fixed_index >= 0 && reference.fixed_index <= 11);
  assert.equal(reference.palace_name, scope.palace_names[reference.fixed_index]);
  const palace = chart.palaces[reference.fixed_index];
  assert.deepEqual(reference.natal_palace, {
    index: palace.index, name: palace.name,
    heavenly_stem: palace.heavenly_stem, earthly_branch: palace.earthly_branch,
  });
}

for (const gender of ['male', 'female']) {
  const baselineDocument = generateChart({ ...birth, gender, ziweiOutput: 'natal' });
  const baseline = JSON.stringify(baselineDocument.chart);
  const schedule = baselineDocument.chart.palaces.map((p) => ({ index: p.index, natal_palace: p.name, range: p.decadal.range }));
  schedule.sort((a, b) => a.range[0] - b.range[0]);
  const seen = new Map();
  const result = {
    gender, samples: 0, errors: 0, first_error: null,
    lunar_years: new Set(), regular_months: new Set(), leap_months: new Set(), leap_second_half_samples: 0,
    initial_partial_month_samples: 0, first_sample: samples[0], last_sample: samples[samples.length - 1],
    nominal_age_min: 121, nominal_age_max: 0, childhood_samples: 0,
  };
  for (const sample of samples) {
    result.samples += 1;
    result.lunar_years.add(sample.year);
    (sample.month < 0 ? result.leap_months : result.regular_months).add(`${sample.year}:${sample.month}`);
    if (sample.day === 16) result.leap_second_half_samples += 1;
    if (sample.day === 'birth') result.initial_partial_month_samples += 1;
    try {
      const document = generateChart({ ...birth, gender, targetDate: sample.date });
      const h = document.horoscope;
      assert.equal(JSON.stringify(document.chart), baseline, 'natal chart changed with target');
      assert.equal(h.scopes.age.nominal_age, sample.year - 2000 + 1, 'nominal age does not follow lunar year');
      result.nominal_age_min = Math.min(result.nominal_age_min, h.scopes.age.nominal_age);
      result.nominal_age_max = Math.max(result.nominal_age_max, h.scopes.age.nominal_age);
      if (h.scopes.decadal.name === '童限') result.childhood_samples += 1;
      else {
        const age = h.scopes.age.nominal_age;
        const expected = schedule.find((entry) => age >= entry.range[0] && age <= entry.range[1]);
        assert.ok(expected, 'no natal decadal schedule matches the nominal age');
        assert.equal(h.scopes.decadal.index, expected.index, 'active decadal does not match natal schedule');
        const observed = seen.get(expected.index) || { min_age: age, max_age: age, samples: 0 };
        observed.min_age = Math.min(observed.min_age, age); observed.max_age = Math.max(observed.max_age, age); observed.samples += 1;
        seen.set(expected.index, observed);
      }
      assert.equal(h.palace_overlays.length, 12);
      for (const [name, scope] of Object.entries(h.scopes)) {
        assert.ok(Number.isInteger(scope.index) && scope.index >= 0 && scope.index <= 11, `${name}: invalid index`);
        assert.equal(scope.palace_names.length, 12, `${name}: palace count`);
        assert.equal(new Set(scope.palace_names).size, 12, `${name}: duplicate palace names`);
        assert.equal(scope.palace_names[scope.index], '命宮', `${name}: focus not life palace`);
        assert.equal(h.palace_overlays.filter((p) => p.scopes[name].is_focus).length, 1, `${name}: focus count`);
        assert.equal(scope.dynamic_stars_by_palace.length, 12, `${name}: dynamic star palace count`);
        scope.dynamic_stars_by_palace.flat().forEach((star) => assert.equal(star.scope, name, `${name}: star layer mismatch`));
        assert.equal(scope.transformations.length, 4, `${name}: transformation count`);
        for (const change of scope.transformations) {
          const destination = change.target_palace;
          assert.ok(destination && Number.isInteger(destination.index) && destination.index >= 0 && destination.index <= 11, `${name}: unresolved transformation`);
          const palace = document.chart.palaces[destination.index];
          assert.equal(destination.name, palace.name, `${name}: destination palace name`);
          assert.equal(destination.heavenly_stem, palace.heavenly_stem, `${name}: destination stem`);
          assert.equal(destination.earthly_branch, palace.earthly_branch, `${name}: destination branch`);
          assert.ok(palace.stars[change.star_category].some((star) => star.name === change.star), `${name}: missing destination star`);
          assert.ok(h.palace_overlays[destination.index].scopes[name].transformations_targeting_here.includes(change), `${name}: missing transformation overlay`);
        }
        for (const [index, overlay] of h.palace_overlays.entries()) {
          assert.equal(overlay.fixed_index, index);
          assert.equal(overlay.natal_palace.index, index);
          assert.equal(overlay.scopes[name].palace_name, scope.palace_names[index]);
          assert.deepEqual(overlay.scopes[name].dynamic_stars, scope.dynamic_stars_by_palace[index]);
        }
        assert.equal(h.scope_relations[name].length, 12);
        for (const relation of h.scope_relations[name]) {
          referenceMatches(relation.scope_palace, document.chart, scope);
          const index = relation.scope_palace.fixed_index;
          assert.equal(relation.sanfang_sizheng.target.fixed_index, index);
          assert.equal(relation.sanfang_sizheng.opposite.fixed_index, (index + 6) % 12);
          assert.equal(relation.sanfang_sizheng.wealth.fixed_index, (index + 8) % 12);
          assert.equal(relation.sanfang_sizheng.career.fixed_index, (index + 4) % 12);
          Object.values(relation.sanfang_sizheng).forEach((reference) => referenceMatches(reference, document.chart, scope));
          if (relation.borrowed_palace) {
            assert.equal(document.chart.palaces[index].stars.major.length, 0);
            assert.equal(relation.borrowed_palace.materialized_into_chart, false);
            assert.equal(relation.borrowed_palace.source_palace.fixed_index, (index + 6) % 12);
          }
        }
      }
    } catch (error) {
      result.errors += 1;
      if (!result.first_error) result.first_error = { sample, message: error.message, stack: error.stack };
    }
    if (result.samples % 250 === 0) console.log(JSON.stringify({ progress: gender, samples: result.samples, total: samples.length, current: sample, errors: result.errors }));
  }
  results.push({
    ...result, lunar_years: result.lunar_years.size, regular_months: result.regular_months.size, leap_months: result.leap_months.size,
    decadal_direction: (schedule[1].index - schedule[0].index + 12) % 12 === 1 ? 'forward' : 'backward',
    decadal_coverage: schedule.map((entry) => ({ ...entry, observed: seen.get(entry.index) || null, uncovered_tail_ages: entry.range[1] > 120 ? [121, entry.range[1]] : null })),
  });
  console.log(JSON.stringify({ completed: gender, samples: result.samples, errors: result.errors }));
}
console.log(JSON.stringify({ total_samples: results.reduce((sum, result) => sum + result.samples, 0), total_errors: results.reduce((sum, result) => sum + result.errors, 0), skipped_prebirth_months_per_gender: skippedMonths, results }, null, 2));

if (results.some((result) => result.errors > 0)) process.exitCode = 1;

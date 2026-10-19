const test = require('node:test');
const assert = require('node:assert/strict');

const { generateZiweiChart } = require('../src/ziwei');
const reference = require('./fixtures/ziwei-independent-reference.json');

test('independent fixture covers ten year stems and all five element classes', () => {
  assert.equal(reference.cases.length, 10);
  assert.equal(new Set(reference.cases.map(({ lunar }) => lunar.year_stem)).size, 10);
  assert.equal(new Set(reference.cases.map(({ expected }) => expected.five_elements_class)).size, 5);
  for (const { expected } of reference.cases) {
    assert.equal(Object.keys(expected.major_star_branches).length, 14);
    assert.equal(Object.keys(expected.minor_star_branches).length, 12);
  }
});

// Expected data is frozen from independent HKO/classical sources, not generated
// by iztro. See the fixture for the manual derivation and its precise limits.
for (const fixture of reference.cases) {
  test(`independent natal reference: ${fixture.id}`, () => {
    const { chart, ziwei_addon: addon, time_correction: correction } = generateZiweiChart(fixture.input);
    const { expected, lunar } = fixture;
    assert.equal(correction.apparent_solar_date, fixture.input.date);
    assert.equal(chart.time, `${lunar.hour_branch}時`);
    const calendar = { year: lunar.year, month: lunar.month, day: lunar.day, is_leap: lunar.is_leap };
    assert.deepEqual(chart.lunar_date_details, calendar);
    assert.deepEqual(chart.calculation_lunar_date_details, { ...calendar, effective_month: lunar.month });
    assert.equal(chart.chinese_date.slice(0, 2), lunar.year_stem + lunar.year_branch);
    assert.equal(chart.soul_palace_branch, expected.soul_palace_branch);
    assert.equal(chart.body_palace_branch, expected.body_palace_branch);
    assert.equal(chart.five_elements_class, expected.five_elements_class);
    const lifePalace = chart.palaces.find((palace) => palace.name === '命宮');
    assert.equal(lifePalace.heavenly_stem, expected.life_palace_stem);
    assert.deepEqual(lifePalace.decadal.range, expected.first_decadal_range);

    const locations = Object.fromEntries(chart.palaces.flatMap((palace) =>
      Object.values(palace.stars).flat().map((star) => [star.name, { branch: palace.earthly_branch, star }])));
    for (const [name, branch] of Object.entries({ ...expected.major_star_branches, ...expected.minor_star_branches })) {
      // The classic's 辛-year 魁/鉞 pair is reversed in the default engine.
      // Keep the independent values intact and check the named variant below.
      if (lunar.year_stem === '辛' && ['天魁', '天鉞'].includes(name)) continue;
      // The transcript says 丙丁豬狗位. For adopted 酉, use the separately
      // pinned Fortel source table, preserving 戌 as the uncollated reading.
      if (['丙', '丁'].includes(lunar.year_stem) && name === '天鉞') {
        assert.equal(locations[name]?.branch, fixture.independent_minor_star_branches[name]);
        continue;
      }
      assert.equal(locations[name]?.branch, branch, `${fixture.id}: ${name} absolute branch`);
    }
    for (const [name, brightness] of Object.entries(expected.brightness)) {
      assert.equal(locations[name].star.brightness, brightness, `${fixture.id}: ${name} brightness`);
    }

    const nextDecadal = chart.palaces.find((palace) => palace.decadal.range[0] === expected.second_decadal_range[0]);
    assert.equal(nextDecadal.earthly_branch, expected.second_decadal_branch);
    assert.deepEqual(nextDecadal.decadal.range, expected.second_decadal_range);
    for (const [transformation, star] of Object.entries(expected.year_transformations)) {
      // The reference's 壬化科=天府 differs from the configured default 左輔.
      // Do not quietly substitute the engine's table into an independent oracle.
      if (lunar.year_stem === '壬' && transformation === '科') continue;
      const actual = addon.transformations.birth_year_transformations.find((entry) => entry.transformation === transformation);
      assert.equal(actual.star, star, `${fixture.id}: ${transformation}`);
      assert.equal(actual.target_palace.earthly_branch, locations[star].branch);
      assert.equal(locations[star].star.mutagen, transformation);
    }
  });
}

test('default 辛魁鉞 and 壬化科 variants are explicitly distinct from the classical reference', () => {
  const xin = reference.cases.find(({ lunar }) => lunar.year_stem === '辛');
  const { chart, calculation_conventions: conventions } = generateZiweiChart(xin.input);
  const kuiYueVariant = reference.known_differences.find(({ field }) => field === 'minor_star_branches[辛]');
  const kuiYueConvention = conventions.table_variants.find(({ id }) => id === 'xin_noble_order');
  assert.deepEqual(kuiYueConvention.adopted, kuiYueVariant.default_engine);
  assert.deepEqual(kuiYueConvention.reference, kuiYueVariant.reference);
  assert.equal(kuiYueConvention.reference_source, '紫微斗數全書·卷二');
  assert.equal(kuiYueConvention.adopted_source, 'iztro-2.5.8-default');
  for (const name of ['天魁', '天鉞']) {
    assert.equal(xin.expected.minor_star_branches[name], kuiYueVariant.reference[name]);
    assert.notEqual(kuiYueVariant.default_engine[name], kuiYueVariant.reference[name]);
    const palace = chart.palaces.find((item) => item.stars.minor.some((star) => star.name === name));
    assert.equal(palace.earthly_branch, kuiYueVariant.default_engine[name]);
  }

  const ren = reference.cases.find(({ lunar }) => lunar.year_stem === '壬');
  const { ziwei_addon: addon, calculation_conventions: renConventions } = generateZiweiChart(ren.input);
  const transformationVariant = reference.known_differences.find(({ field }) => field === 'birth_year_transformations[壬][科]');
  const transformationConvention = renConventions.table_variants.find(({ id }) => id === 'ren_year_ke');
  assert.deepEqual(transformationConvention.adopted, { 科: transformationVariant.default_engine });
  assert.deepEqual(transformationConvention.reference, { 科: transformationVariant.reference });
  assert.equal(transformationConvention.reference_source, '紫微斗數全書·卷二');
  assert.equal(transformationConvention.adopted_source, 'iztro-2.5.8-default');
  assert.equal(ren.expected.year_transformations.科, transformationVariant.reference);
  assert.notEqual(transformationVariant.default_engine, transformationVariant.reference);
  assert.equal(addon.transformations.birth_year_transformations.find((item) => item.transformation === '科').star,
    transformationVariant.default_engine);
});

test('丙丁天鉞 uses the independent Fortel table and discloses the uncollated classical reading', () => {
  const source = reference.sources.independent_noble_table;
  assert.equal(source.commit, '2620cc895395f9f6994abd4927e739d31015c67d');
  for (const fixture of reference.cases.filter(({ lunar }) => ['丙', '丁'].includes(lunar.year_stem))) {
    assert.equal(fixture.expected.minor_star_branches.天鉞, '戌');
    assert.equal(fixture.independent_minor_source, 'independent_noble_table');
    assert.equal(fixture.independent_minor_star_branches.天鉞, '酉');
    const { chart, calculation_conventions: conventions } = generateZiweiChart(fixture.input);
    assert.equal(chart.palaces.find((palace) => palace.stars.minor.some((star) => star.name === '天鉞')).earthly_branch,
      fixture.independent_minor_star_branches.天鉞);
    const variant = conventions.table_variants.find(({ id }) => id === 'bing_ding_noble_transcription');
    assert.ok(variant, '丙丁天鉞 transcript ambiguity must be disclosed');
    assert.deepEqual(variant.adopted, { 天鉞: '酉' });
    assert.deepEqual(variant.reference, { 天鉞: '戌' });
    assert.equal(variant.reference_source, '紫微斗數全書·卷二轉錄（猪狗，未校勘）');
    assert.equal(variant.adopted_source, 'iztro-2.5.8-default');
  }
});

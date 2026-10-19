const { astro, data, util } = require('iztro');
const { version: iztroVersion } = require('iztro/package.json');
const { Solar } = require('lunar-typescript');

const { correctBirthTime } = require('./time');
const { generateZiweiAddon } = require('./ziwei-addon');
const { generateZiweiHoroscope } = require('./ziwei-horoscope');

function normalizeStar(star) {
  return {
    name: star.name,
    type: star.type,
    scope: star.scope,
    brightness: star.brightness || null,
    mutagen: star.mutagen || null,
  };
}

function normalizePalace(palace) {
  return {
    index: palace.index,
    name: palace.name,
    is_body_palace: palace.isBodyPalace,
    is_original_palace: palace.isOriginalPalace,
    heavenly_stem: palace.heavenlyStem,
    earthly_branch: palace.earthlyBranch,
    stars: {
      major: palace.majorStars.map(normalizeStar),
      minor: palace.minorStars.map(normalizeStar),
      adjective: palace.adjectiveStars.map(normalizeStar),
    },
    changsheng12: palace.changsheng12,
    boshi12: palace.boshi12,
    jiangqian12: palace.jiangqian12,
    suiqian12: palace.suiqian12,
    decadal: {
      range: [...palace.decadal.range],
      heavenly_stem: palace.decadal.heavenlyStem,
      earthly_branch: palace.decadal.earthlyBranch,
    },
    ages: [...palace.ages],
  };
}

function lunarDetails(date) {
  const lunar = Solar.fromYmd(...date.split('-').map(Number)).getLunar();
  return { year: lunar.getYear(), month: Math.abs(lunar.getMonth()),
    day: lunar.getDay(), is_leap: lunar.getMonth() < 0 };
}

function createZiweiChart(input) {
  const correction = correctBirthTime(input);
  if (input.date < '1582-10-15' || correction.apparentDate < '1582-10-15') {
    throw new Error('Ziwei Gregorian birth dates must be on or after 1582-10-15');
  }
  const engineConfig = JSON.parse(JSON.stringify(astro.getConfig()));
  const forwardLateZi = engineConfig.dayDivide === 'forward' && correction.timeIndex === 12;
  const engineDate = forwardLateZi
    ? Solar.fromYmd(...correction.apparentDate.split('-').map(Number)).next(1).toYmd()
    : correction.apparentDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(engineDate)) {
    throw new Error('effective birth date exceeds supported year range');
  }
  const engineTimeIndex = correction.timeIndex === 12 ? 0 : correction.timeIndex;
  const astrolabe = astro.bySolar(
    engineDate,
    engineTimeIndex,
    input.gender === 'male' ? '男' : '女',
    true,
    'zh-TW',
  );
  const calculationLunar = lunarDetails(engineDate);

  const document = {
    schema_version: '1.0.0',
    source: {
      package: 'iztro',
      version: iztroVersion,
      language: 'zh-TW',
    },
    calculation_conventions: {
      engine_config: engineConfig,
      adapter_rules_version: '2.0.0',
      fix_leap_month: true,
      natal_time_basis: 'apparent_solar_time',
      late_zi_rule: engineConfig.dayDivide === 'forward' ? 'forward_entire_date' : 'current_date',
      effective_birth_date: engineDate,
      effective_birth_time_index: engineTimeIndex,
      brightness_null_meaning: 'not_provided_by_engine',
      table_variants: [
        { id: 'ren_year_ke', adopted: { 科: util.getMutagensByHeavenlyStem('壬')[2] },
          reference: { 科: '天府' }, reference_source: '紫微斗數全書·卷二',
          adopted_source: engineConfig.mutagens.renHeavenly ? 'engine_config.mutagens' : `iztro-${iztroVersion}-default` },
        { id: 'xin_noble_order', adopted: { 天魁: '午', 天鉞: '寅' },
          reference: { 天魁: '寅', 天鉞: '午' }, reference_source: '紫微斗數全書·卷二',
          adopted_source: `iztro-${iztroVersion}-default` },
        { id: 'bing_ding_noble_transcription', adopted: { 天鉞: '酉' },
          reference: { 天鉞: '戌' }, reference_source: '紫微斗數全書·卷二轉錄（猪狗，未校勘）',
          adopted_source: `iztro-${iztroVersion}-default`,
          note: '轉錄猪狗與常用猪雞表有異，不視為已校勘古籍規則' },
      ],
      time_zone_runtime: {
        node: process.versions.node,
        icu: process.versions.icu,
        tz: process.versions.tz,
      },
    },
    input: {
      date: input.date,
      time: input.time,
      gender: input.gender,
      latitude: input.latitude,
      longitude: input.longitude,
      time_zone: input.timeZone,
    },
    time_correction: {
      utc_offset_minutes: correction.offsetMinutes,
      equation_of_time_minutes: correction.equationOfTimeMinutes,
      longitude_correction_minutes: correction.longitudeCorrectionMinutes,
      total_correction_minutes: correction.totalCorrectionMinutes,
      apparent_solar_date: correction.apparentDate,
      apparent_solar_time: correction.apparentTime,
      chinese_hour_index: correction.timeIndex,
    },
    chart: {
      gender: astrolabe.gender,
      solar_date: correction.apparentDate,
      lunar_date: Solar.fromYmd(...correction.apparentDate.split('-').map(Number)).getLunar().toString(),
      lunar_date_details: lunarDetails(correction.apparentDate),
      calculation_lunar_date_details: { ...calculationLunar,
        effective_month: (calculationLunar.month - 1 +
          (calculationLunar.is_leap && calculationLunar.day > 15 ? 1 : 0)) % 12 + 1 },
      chinese_date: astrolabe.chineseDate,
      time: correction.timeIndex === 12 ? '晚子時' : astrolabe.time,
      time_range: data.TIME_RANGE[correction.timeIndex],
      sign: astro.getSignBySolarDate(correction.apparentDate, 'zh-TW'),
      zodiac: astrolabe.zodiac,
      soul_palace_branch: astrolabe.earthlyBranchOfSoulPalace,
      body_palace_branch: astrolabe.earthlyBranchOfBodyPalace,
      soul: astrolabe.soul,
      body: astrolabe.body,
      five_elements_class: astrolabe.fiveElementsClass,
      palaces: astrolabe.palaces.map(normalizePalace),
    },
    ziwei_addon: generateZiweiAddon(astrolabe),
  };

  return { document, astrolabe };
}

function generateZiweiChart(input) {
  const { document, astrolabe } = createZiweiChart(input);
  if (input.ziweiOutput === 'horoscope') {
    document.horoscope = generateZiweiHoroscope(astrolabe, input);
  }

  return document;
}

module.exports = {
  createZiweiChart,
  generateZiweiChart,
};

const { astro } = require('iztro');

const { correctBirthTime } = require('./time');

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

function generateZiweiChart(input) {
  const correction = correctBirthTime(input);
  const astrolabe = astro.bySolar(
    correction.apparentDate,
    correction.timeIndex,
    input.gender === 'male' ? '男' : '女',
    true,
    'zh-TW',
  );

  return {
    schema_version: '1.0.0',
    source: {
      package: 'iztro',
      version: '2.5.8',
      language: 'zh-TW',
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
      solar_date: astrolabe.solarDate,
      lunar_date: astrolabe.lunarDate,
      chinese_date: astrolabe.chineseDate,
      time: astrolabe.time,
      time_range: astrolabe.timeRange,
      sign: astrolabe.sign,
      zodiac: astrolabe.zodiac,
      soul_palace_branch: astrolabe.earthlyBranchOfSoulPalace,
      body_palace_branch: astrolabe.earthlyBranchOfBodyPalace,
      soul: astrolabe.soul,
      body: astrolabe.body,
      five_elements_class: astrolabe.fiveElementsClass,
      palaces: astrolabe.palaces.map(normalizePalace),
    },
  };
}

module.exports = {
  generateZiweiChart,
};

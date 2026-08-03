const { Solar } = require('lunar-typescript');

const { correctBirthTime } = require('./time');

function toParts(date, time) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);

  return { year, month, day, hour, minute };
}

function normalizePillar(eightChar, prefix) {
  const get = (suffix) => eightChar[`${prefix}${suffix}`]();

  return {
    combined: get(''),
    stem: get('Gan'),
    branch: get('Zhi'),
    hidden_stems: get('HideGan'),
    five_elements: get('WuXing'),
    na_yin: get('NaYin'),
    stem_ten_god: get('ShiShenGan'),
    branch_ten_gods: get('ShiShenZhi'),
    chang_sheng: get('DiShi'),
    xun: get('Xun'),
    xun_kong: get('XunKong'),
  };
}

function auxiliary(eightChar, name, naYinName) {
  return {
    value: eightChar[name](),
    na_yin: eightChar[naYinName](),
  };
}

function generateBaziChart(input) {
  const correction = correctBirthTime(input);
  const parts = toParts(correction.apparentDate, correction.apparentTime);
  const eightChar = Solar.fromYmdHms(
    parts.year,
    parts.month,
    parts.day,
    parts.hour,
    parts.minute,
    0,
  )
    .getLunar()
    .getEightChar();

  return {
    schema_version: '1.0.0',
    source: {
      package: 'lunar-typescript',
      version: '1.8.6',
      day_boundary_sect: eightChar.getSect(),
    },
    input: {
      date: input.date,
      time: input.time,
      latitude: input.latitude,
      longitude: input.longitude,
      time_zone: input.timeZone,
      ...(input.gender ? { gender: input.gender } : {}),
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
    bazi: {
      pillars: {
        year: normalizePillar(eightChar, 'getYear'),
        month: normalizePillar(eightChar, 'getMonth'),
        day: normalizePillar(eightChar, 'getDay'),
        hour: normalizePillar(eightChar, 'getTime'),
      },
      auxiliary: {
        tai_yuan: auxiliary(eightChar, 'getTaiYuan', 'getTaiYuanNaYin'),
        tai_xi: auxiliary(eightChar, 'getTaiXi', 'getTaiXiNaYin'),
        ming_gong: auxiliary(eightChar, 'getMingGong', 'getMingGongNaYin'),
        shen_gong: auxiliary(eightChar, 'getShenGong', 'getShenGongNaYin'),
      },
    },
  };
}

module.exports = {
  generateBaziChart,
};

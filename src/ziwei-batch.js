const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { astro } = require('iztro');
const { Lunar, LunarYear, Solar } = require('lunar-typescript');

const { createZiweiChart } = require('./ziwei');
const { generateZiweiScopes } = require('./ziwei-horoscope');
const { resolveCivilInstant, resolvePeriodBoundary } = require('./time');

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function lunarYearAt(date) {
  const [year, month, day] = date.split('-').map(Number);
  return Solar.fromYmd(year, month, day).getLunar().getYear();
}

function lunarDate(year, month, day) {
  return civilDate(Lunar.fromYmd(year, month, day).getSolar());
}

function civilDate(solar) {
  // The calendar library labels pre-1582 dates as Julian; UTC uses Gregorian.
  return new Date((solar.getJulianDay() - 2440587.5) * 86400000).toISOString().slice(0, 10);
}

function clippedPeriod(start, end, range) {
  const validStart = start.utc < range.start.utc ? range.start : start;
  const validEnd = end.utc > range.end.utc ? range.end : end;
  if (validStart.utc >= validEnd.utc) return null;
  return {
    natural: { start, end },
    valid: { start: validStart, end: validEnd },
    interval: '[start,end)',
  };
}

function scopeAt(astrolabe, input, scopeName, endpoint) {
  return generateZiweiScopes(astrolabe, {
    ...input,
    targetDate: endpoint.date,
    targetTime: endpoint.time,
    targetBoundary: endpoint,
  }, [scopeName]);
}

function* generateZiweiBatch(input) {
  input = { ...input };
  const { document: natal, astrolabe } = createZiweiChart({ ...input, ziweiOutput: 'natal' });
  const engineConfig = natal.calculation_conventions.engine_config;
  for (const key of ['yearDivide', 'horoscopeDivide', 'ageDivide']) {
    if (engineConfig[key] !== 'normal') {
      throw new Error(`Ziwei batch requires ${key}=normal`);
    }
  }
  const baseLunarYear = lunarYearAt(astrolabe.solarDate);
  const firstLunarYear = lunarYearAt(input.date);
  const schedule = astrolabe.palaces.map((palace) => ({
    index: palace.index,
    range: [...palace.decadal.range],
  })).sort((left, right) => left.range[0] - right.range[0]);
  const maxAge = Math.max(...schedule.map(({ range }) => range[1]));
  const endLunarYear = baseLunarYear + maxAge;
  if (endLunarYear > 9999) {
    throw new Error('Ziwei batch lifecycle exceeds the supported year range 0001-9999');
  }
  const boundary = (date) => resolvePeriodBoundary(date, input.timeZone);
  const newYear = (year) => boundary(lunarDate(year, 1, 1));
  const range = {
    start: resolveCivilInstant({ date: input.date, time: input.time, timeZone: input.timeZone }),
    end: newYear(endLunarYear),
  };
  const chartId = sha256(JSON.stringify(canonicalValue({
    input: natal.input,
    source: natal.source,
    time_correction: natal.time_correction,
    calculation_conventions: natal.calculation_conventions,
    chart: natal.chart,
  })));
  const snapshot = (scopeName, endpoint) => {
    if (!isDeepStrictEqual(astro.getConfig(), engineConfig)) {
      throw new Error('Ziwei batch engine configuration changed during generation');
    }
    return scopeAt(astrolabe, input, scopeName, endpoint);
  };
  const files = [];
  const statistics = { natal: 0, decadal: 0, yearly: 0, monthly: 0, monthly_segments: 0, files: 0 };
  const envelope = (layer, layerId, period, natalRef = '../本命/紫微.json') => ({
    schema_version: '1.0.0', chart_id: chartId, name: input.name ?? null, layer_id: layerId, layer,
    natal_ref: natalRef, period,
  });
  const record = (path, document) => {
    files.push({
      path, layer: document.layer, layer_id: document.layer_id,
      sha256: sha256(`${JSON.stringify(document, null, 2)}\n`),
      period: document.period,
      ...(document.layer === 'monthly' ? {
        lunar_identity: {
          lunar_year: document.lunar_year,
          month_number: document.month_number,
          is_leap: document.is_leap,
        },
      } : {}),
    });
    statistics[document.layer] += 1;
    if (document.layer === 'monthly') statistics.monthly_segments += document.segments.length;
    return { path, document };
  };
  const decadalContext = (age) => {
    const index = schedule.findIndex(({ range: ages }) => age >= ages[0] && age <= ages[1]);
    return {
      decadal_ref: index < 0 ? null : `../大限/${String(index + 1).padStart(2, '0')}.json`,
      decadal_status: index >= 0 ? 'available'
        : age < 1 ? 'nominal_age_before_effective_birth_year' : 'before_first_decadal',
    };
  };

  yield record('本命/紫微.json', {
    ...natal,
    ...envelope('natal', 'natal', { natural: null, valid: null, interval: '[start,end)' }, null),
  });

  for (const [index, decadal] of schedule.entries()) {
    const number = String(index + 1).padStart(2, '0');
    const period = clippedPeriod(
      newYear(baseLunarYear + decadal.range[0] - 1),
      newYear(baseLunarYear + decadal.range[1]),
      range,
    );
    yield record(`大限/${number}.json`, {
      ...envelope('decadal', `decadal:${number}`, period),
      decadal_number: index + 1,
      natal_palace_index: decadal.index,
      nominal_age_range: decadal.range,
      ...snapshot('decadal', period.valid.start),
    });
  }

  for (let year = firstLunarYear; year < endLunarYear; year += 1) {
    const nominalAge = year - baseLunarYear + 1;
    const context = decadalContext(nominalAge);
    const yearPeriod = clippedPeriod(newYear(year), newYear(year + 1), range);
    if (!yearPeriod) continue;
    yield record(`流年/${year}.json`, {
      ...envelope('yearly', `yearly:${year}`, yearPeriod),
      lunar_year: year, nominal_age: nominalAge, ...context,
      ...snapshot('yearly', yearPeriod.valid.start),
    });

    const months = LunarYear.fromYear(year).getMonths().filter((month) => month.getYear() === year);
    for (const month of months) {
      const lunarMonth = month.getMonth();
      const number = Math.abs(lunarMonth);
      const isLeap = lunarMonth < 0;
      const startDate = Lunar.fromYmd(year, lunarMonth, 1).getSolar();
      const start = boundary(civilDate(startDate));
      const end = boundary(civilDate(startDate.next(month.getDayCount())));
      const period = clippedPeriod(start, end, range);
      if (!period) continue;
      const monthId = `${year}-${String(number).padStart(2, '0')}${isLeap ? '-leap' : ''}`;
      const layerId = `monthly:${monthId}`;
      const split = isLeap ? boundary(lunarDate(year, lunarMonth, 16)) : null;
      const portions = isLeap
        ? [[start, split, 1, 15], [split, end, 16, month.getDayCount()]]
        : [[start, end, 1, month.getDayCount()]];
      const segments = [];
      for (const [segmentStart, segmentEnd, firstDay, lastDay] of portions) {
        const segmentPeriod = clippedPeriod(segmentStart, segmentEnd, range);
        if (!segmentPeriod) continue;
        segments.push({
          segment_id: `${layerId}:${firstDay}-${lastDay}`,
          lunar_day_range: [firstDay, lastDay],
          period: segmentPeriod,
          ...snapshot('monthly', segmentPeriod.valid.start),
        });
      }
      yield record(`流月/${monthId}.json`, {
        ...envelope('monthly', layerId, period),
        lunar_year: year, month_number: number, is_leap: isLeap,
        nominal_age: nominalAge, ...context, year_ref: `../流年/${year}.json`,
        segments,
      });
    }
  }

  statistics.files = files.length + 1;
  yield {
    path: 'manifest.json',
    document: {
      ...envelope('manifest', 'manifest', {
        natural: { start: range.start, end: range.end },
        valid: { start: range.start, end: range.end },
        interval: '[start,end)',
      }, '本命/紫微.json'),
      range,
      rules: {
        engine_config: engineConfig,
        time_zone: input.timeZone,
        period_boundary: 'local_civil_lunar_calendar_midnight',
        boundary_resolution: 'first_existing_minute_at_or_after_midnight_earlier_fold',
        nominal_age_basis: 'effective_birth_lunar_year',
        effective_birth_lunar_year: baseLunarYear,
        maximum_nominal_age: maxAge,
        leap_month: 'single_file_split_before_day_16',
        childhood: 'no_separate_decadal_file',
      },
      statistics,
      files,
    },
  };
}

module.exports = { generateZiweiBatch };

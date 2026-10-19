const { chineseHourIndex, resolveCivilInstant, resolveCivilTime } = require('./time');
const { setLanguage } = require('iztro/lib/i18n');

const SCOPES = ['decadal', 'age', 'yearly', 'monthly', 'daily', 'hourly'];
const TRANSFORMATIONS = ['祿', '權', '科', '忌'];
const STAR_CATEGORIES = [
  ['major', 'majorStars'],
  ['minor', 'minorStars'],
  ['adjective', 'adjectiveStars'],
];

function palaceReference(palace) {
  return {
    index: palace.index,
    name: palace.name,
    heavenly_stem: palace.heavenlyStem,
    earthly_branch: palace.earthlyBranch,
  };
}

function normalizeDynamicStar(star) {
  return {
    name: star.name,
    type: star.type,
    scope: star.scope,
    brightness: star.brightness || null,
    mutagen: star.mutagen || null,
  };
}

function findNatalStar(astrolabe, starName) {
  for (const palace of astrolabe.palaces) {
    for (const [category, property] of STAR_CATEGORIES) {
      const star = palace[property].find((item) => item.name === starName);
      if (star) {
        return { category, palace: palaceReference(palace) };
      }
    }
  }
  return null;
}

function normalizeDynamicStars(stars) {
  return Array.from({ length: 12 }, (_, index) =>
    (stars?.[index] || []).map(normalizeDynamicStar),
  );
}

function normalizeScope(astrolabe, rawScope, scopeName) {
  if (!Number.isInteger(rawScope.index) || rawScope.index < 0 || rawScope.index > 11) {
    throw new Error(`target date is outside the supported ${scopeName} scope age range`);
  }
  const scope = {
    index: rawScope.index,
    name: rawScope.name,
    heavenly_stem: rawScope.heavenlyStem,
    earthly_branch: rawScope.earthlyBranch,
    palace_names: [...rawScope.palaceNames],
    transformations: rawScope.mutagen.map((star, index) => {
      const location = findNatalStar(astrolabe, star);
      return {
        transformation: TRANSFORMATIONS[index],
        star,
        star_category: location?.category || null,
        target_palace: location?.palace || null,
      };
    }),
    dynamic_stars_by_palace: normalizeDynamicStars(rawScope.stars),
  };

  if (scopeName === 'age') {
    scope.nominal_age = rawScope.nominalAge;
  }
  if (scopeName === 'yearly') {
    scope.jiangqian12_by_palace = [...rawScope.yearlyDecStar.jiangqian12];
    scope.suiqian12_by_palace = [...rawScope.yearlyDecStar.suiqian12];
  }

  return scope;
}

function scopePalaceReference(astrolabe, scope, fixedIndex) {
  return {
    fixed_index: fixedIndex,
    palace_name: scope.palace_names[fixedIndex],
    natal_palace: palaceReference(astrolabe.palaces[fixedIndex]),
  };
}

function buildScopeRelations(astrolabe, rawHoroscope, scopeName, scope) {
  return scope.palace_names.map((palaceName, fixedIndex) => {
    const surrounded = rawHoroscope.surroundPalaces(palaceName, scopeName);
    const isEmpty = astrolabe.palaces[fixedIndex].majorStars.length === 0;
    const sourcePalace = scopePalaceReference(astrolabe, scope, surrounded.opposite.index);

    return {
      scope_palace: scopePalaceReference(astrolabe, scope, fixedIndex),
      is_empty_at_fixed_position: isEmpty,
      borrowed_palace: isEmpty
        ? {
            reason: 'no_natal_major_stars_at_fixed_position',
            source_palace: sourcePalace,
            major_stars: astrolabe.palaces[surrounded.opposite.index].majorStars.map((star) => ({
              name: star.name,
              type: star.type,
              brightness: star.brightness || null,
              natal_mutagen: star.mutagen || null,
            })),
            materialized_into_chart: false,
          }
        : null,
      sanfang_sizheng: {
        target: scopePalaceReference(astrolabe, scope, surrounded.target.index),
        opposite: sourcePalace,
        wealth: scopePalaceReference(astrolabe, scope, surrounded.wealth.index),
        career: scopePalaceReference(astrolabe, scope, surrounded.career.index),
      },
    };
  });
}

function buildPalaceOverlays(astrolabe, scopes) {
  return astrolabe.palaces.map((palace, fixedIndex) => ({
    fixed_index: fixedIndex,
    natal_palace: palaceReference(palace),
    scopes: Object.fromEntries(
      Object.keys(scopes).map((scopeName) => {
        const scope = scopes[scopeName];
        return [
          scopeName,
          {
            palace_name: scope.palace_names[fixedIndex],
            is_focus: scope.index === fixedIndex,
            dynamic_stars: scope.dynamic_stars_by_palace[fixedIndex],
            transformations_targeting_here: scope.transformations.filter(
              ({ target_palace: targetPalace }) => targetPalace?.index === fixedIndex,
            ),
            ...(scopeName === 'yearly'
              ? {
                  jiangqian12: scope.jiangqian12_by_palace[fixedIndex],
                  suiqian12: scope.suiqian12_by_palace[fixedIndex],
                }
              : {}),
          },
        ];
      }),
    ),
  }));
}

function generateZiweiScopes(astrolabe, input, scopeNames) {
  if (!scopeNames.length || new Set(scopeNames).size !== scopeNames.length ||
      scopeNames.some((scope) => !SCOPES.includes(scope))) {
    throw new Error('scope request must contain unique supported scopes');
  }
  const target = {
    date: input.targetDate,
    time: input.targetTime,
    timeZone: input.timeZone,
  };
  let timeIndex;
  if (input.targetBoundary) {
    const endpoint = resolveCivilInstant(target, { disambiguation: 'earlier' });
    if (endpoint.utc !== input.targetBoundary.utc) throw new Error('target boundary UTC mismatch');
    timeIndex = chineseHourIndex(Number(input.targetTime.slice(0, 2)));
  } else {
    ({ timeIndex } = resolveCivilTime(target));
  }
  if (
    input.targetDate < input.date ||
    (input.targetDate === input.date && input.targetTime < input.time)
  ) {
    throw new Error('target date and time must not be before birth');
  }
  // iztro 2.5.8 uses global language state even for an existing astrolabe.
  setLanguage('zh-TW');
  const rawHoroscope = astrolabe.horoscope(input.targetDate, timeIndex);
  const scopes = Object.fromEntries(
    scopeNames.map((scopeName) => [
      scopeName,
      normalizeScope(astrolabe, rawHoroscope[scopeName], scopeName),
    ]),
  );

  return {
    schema_version: '1.0.0',
    target: {
      date: input.targetDate,
      time: input.targetTime,
      time_zone: input.timeZone,
      time_basis: 'local_civil_time',
      apparent_solar_correction_applied: false,
      chinese_hour_index: timeIndex,
      ...(input.targetBoundary ? { resolved_utc: input.targetBoundary.utc } : {}),
      solar_date: rawHoroscope.solarDate,
      lunar_date: rawHoroscope.lunarDate,
    },
    scopes,
    palace_overlays: buildPalaceOverlays(astrolabe, scopes),
    scope_relations: Object.fromEntries(
      scopeNames.map((scopeName) => [
        scopeName,
        buildScopeRelations(astrolabe, rawHoroscope, scopeName, scopes[scopeName]),
      ]),
    ),
  };
}

function generateZiweiHoroscope(astrolabe, input) {
  return generateZiweiScopes(astrolabe, input, SCOPES);
}

module.exports = {
  generateZiweiScopes,
  generateZiweiHoroscope,
};

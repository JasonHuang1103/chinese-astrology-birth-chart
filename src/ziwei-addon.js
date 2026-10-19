const { util } = require('iztro');

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

function starLocations(astrolabe) {
  return astrolabe.palaces.flatMap((palace) =>
    STAR_CATEGORIES.flatMap(([category, property]) =>
      palace[property].map((star) => ({
        name: star.name,
        category,
        type: star.type,
        scope: star.scope,
        brightness: star.brightness || null,
        natal_mutagen: star.mutagen || null,
        palace: palaceReference(palace),
      })),
    ),
  );
}

function indexStarsByName(locations) {
  return locations.reduce((index, location) => {
    if (!index[location.name]) {
      index[location.name] = [];
    }
    index[location.name].push(location);
    return index;
  }, {});
}

function sanfangSizheng(astrolabe, palace, locations) {
  const surrounded = astrolabe.surroundedPalaces(palace.index);
  const palaces = {
    target: palaceReference(surrounded.target),
    opposite: palaceReference(surrounded.opposite),
    wealth: palaceReference(surrounded.wealth),
    career: palaceReference(surrounded.career),
  };

  return {
    palaces,
    star_locations: Object.entries(palaces).flatMap(([role, reference]) =>
      locations
        .filter((location) => location.palace.index === reference.index)
        .map((location) => ({ role, ...location })),
    ),
  };
}

function buildPalaceRelations(astrolabe, locations) {
  return astrolabe.palaces.map((palace) => {
    const opposite = astrolabe.surroundedPalaces(palace.index).opposite;
    const isEmpty = palace.majorStars.length === 0;
    const axis = [palace.index, opposite.index].sort((left, right) => left - right);

    return {
      palace: palaceReference(palace),
      is_empty: isEmpty,
      opposite_palace: palaceReference(opposite),
      adjacent_palaces: {
        previous: palaceReference(astrolabe.palaces[(palace.index + 11) % 12]),
        next: palaceReference(astrolabe.palaces[(palace.index + 1) % 12]),
      },
      axis_id: axis.join('-'),
      borrowed_palace: isEmpty
        ? {
            reason: 'no_major_stars',
            source_palace: palaceReference(opposite),
            major_stars: locations.filter(
              (location) =>
                location.palace.index === opposite.index && location.category === 'major',
            ),
            materialized_into_chart: false,
          }
        : null,
      sanfang_sizheng: sanfangSizheng(astrolabe, palace, locations),
    };
  });
}

function buildTransformations(astrolabe, locations, starsByName) {
  const birthYearTransformations = TRANSFORMATIONS.flatMap((transformation) =>
    locations
      .filter((location) => location.natal_mutagen === transformation)
      .map((location) => ({
        transformation,
        star: location.name,
        star_category: location.category,
        target_palace: location.palace,
      })),
  );

  const palaceStemFlights = astrolabe.palaces.map((palace) => ({
    source_palace: palaceReference(palace),
    heavenly_stem: palace.heavenlyStem,
    flights: util.getMutagensByHeavenlyStem(palace.heavenlyStem).map((star, index) => {
      const location = starsByName[star]?.[0];
      return {
        transformation: TRANSFORMATIONS[index],
        star,
        star_category: location?.category || null,
        target_palace: location?.palace || null,
        is_self_transformation: location?.palace.index === palace.index,
      };
    }),
  }));

  const selfTransformations = palaceStemFlights.flatMap(({ source_palace: sourcePalace, flights }) =>
    flights
      .filter((flight) => flight.is_self_transformation)
      .map((flight) => ({ source_palace: sourcePalace, ...flight })),
  );

  return {
    birth_year_transformations: birthYearTransformations,
    palace_stem_flights: palaceStemFlights,
    self_transformations: selfTransformations,
  };
}

function generateZiweiAddon(astrolabe) {
  const locations = starLocations(astrolabe);
  const starsByName = indexStarsByName(locations);
  const palaceRelations = buildPalaceRelations(astrolabe, locations);
  const transformations = buildTransformations(astrolabe, locations, starsByName);
  const oppositeAxes = [...new Set(palaceRelations.map(({ axis_id: axisId }) => axisId))].map(
    (axisId) => axisId.split('-').map(Number),
  );
  const emptyPalaceIndices = palaceRelations
    .filter(({ is_empty: isEmpty }) => isEmpty)
    .map(({ palace }) => palace.index);

  return {
    schema_version: '1.0.0',
    calculation_conventions: {
      empty_palace: 'no_major_stars',
      borrowing_source: 'opposite_palace',
      borrowed_stars_materialized: false,
      sanfang_sizheng_roles: ['target', 'opposite', 'wealth', 'career'],
      transformation_order: TRANSFORMATIONS,
      interpretation_included: false,
    },
    palace_relations: palaceRelations,
    transformations,
    indexes: {
      palaces_by_name: Object.fromEntries(
        astrolabe.palaces.map((palace) => [palace.name, palace.index]),
      ),
      stars_by_name: starsByName,
      empty_palace_indices: emptyPalaceIndices,
      borrowed_palace_indices: [...emptyPalaceIndices],
      opposite_axes: oppositeAxes,
      transformation_targets: Object.fromEntries(
        TRANSFORMATIONS.map((transformation) => [
          transformation,
          transformations.birth_year_transformations.filter(
            (item) => item.transformation === transformation,
          ),
        ]),
      ),
    },
  };
}

module.exports = {
  generateZiweiAddon,
};

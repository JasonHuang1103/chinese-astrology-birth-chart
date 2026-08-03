# Ziwei derived facts and horoscope JSON design

## Purpose

Extend the existing AI-readable Zi Wei Dou Shu output with deterministic facts
that a rendered chart normally communicates visually, while preserving the
existing normalized `chart` object. The extension covers natal relationships
such as 借宮, 三方四正, 宮干飛化, and 自化. It also adds a separate,
self-contained horoscope output for a requested target date and time.

This project exports chart facts. It does not assign fortune scores, recognize
school-dependent 格局, or produce interpretive prose.

## Compatibility contract

The default command remains `--system ziwei`, and its existing fields retain
their current names and meanings:

- `schema_version`
- `source`
- `input`
- `time_correction`
- `chart`

The normalized `chart` value is not restructured. The natal output gains one
new top-level sibling named `ziwei_addon`. Existing consumers that only read
`chart` continue to work.

The horoscope output is a separate JSON document, but it is self-contained. It
contains every field from the enhanced natal output, including `chart` and
`ziwei_addon`, plus a top-level `horoscope` field. An AI therefore needs only
the horoscope document when analyzing a particular time.

## CLI contract

The Ziwei-specific selector is:

```text
--ziwei-output natal|horoscope
```

`natal` is the default. `horoscope` additionally requires:

```text
--target-date YYYY-MM-DD
--target-time HH:mm
```

The target values are a local civil date and time. They are validated using
the birth input's `--time-zone`, which is also recorded in `horoscope.target`.
No apparent-solar correction is applied to the target time: `iztro`'s
horoscope API accepts a date and Chinese-hour index directly. This convention
is recorded in the output instead of being implicit.

`--ziwei-output`, `--target-date`, and `--target-time` are rejected for
`--system bazi`. Target flags are also rejected for natal output so a typo
cannot silently produce the wrong document.

Example:

```sh
npm run chart -- --system ziwei --ziwei-output horoscope \
  --date 2000-08-16 --time 02:30 --gender female \
  --latitude 25.033 --longitude 121.5654 --time-zone Asia/Taipei \
  --target-date 2026-08-03 --target-time 14:30
```

## Natal add-on schema

`ziwei_addon` has the following stable sections:

```json
{
  "schema_version": "1.0.0",
  "calculation_conventions": {},
  "palace_relations": [],
  "transformations": {},
  "indexes": {}
}
```

### Calculation conventions

`calculation_conventions` records:

- `empty_palace`: `no_major_stars`
- `borrowing_source`: `opposite_palace`
- `borrowed_stars_materialized`: `false`
- `sanfang_sizheng_roles`: `target`, `opposite`, `wealth`, `career`
- `transformation_order`: `祿`, `權`, `科`, `忌`
- `interpretation_included`: `false`

These values make the add-on's rules inspectable. In particular, an empty
palace is defined only by the absence of `majorStars`; minor and adjective
stars do not make it non-empty.

### Palace references

All relationships use compact references instead of duplicating complete
palace objects:

```json
{
  "index": 0,
  "name": "命宮",
  "heavenly_stem": "甲",
  "earthly_branch": "寅"
}
```

Array order follows the existing `chart.palaces` order. Every reference also
contains the explicit index, so consumers do not need to infer identity from
array position.

### Palace relationships

`palace_relations` contains one record per natal palace:

- `palace`: the target palace reference.
- `is_empty`: whether the palace contains no major stars.
- `opposite_palace`: the palace six positions away.
- `adjacent_palaces`: `previous` and `next` in the circular iztro palace
  array. These names describe array direction and do not claim a left/right
  visual orientation.
- `axis_id`: the two opposing indices sorted and joined with `-`, producing
  six stable palace axes.
- `borrowed_palace`: `null` for a non-empty palace. For an empty palace it
  contains the opposite palace reference, that palace's major stars, the
  reason `no_major_stars`, and `materialized_into_chart: false`.
- `sanfang_sizheng`: references for the target, opposite, wealth, and career
  positions returned by iztro, plus a flattened star-location list covering
  major, minor, and adjective stars in those four positions.

Borrowed stars remain references. They are never copied into the empty
palace's original `chart.palaces[index].stars.major` array, preventing an AI
from treating a borrowed star as natally placed there.

Each flattened 三方四正 star location records the star name, category,
brightness, natal mutagen, palace index, palace name, and relationship role.

### Transformations

`transformations` separates three concepts that are easy to conflate:

#### Birth-year transformations

`birth_year_transformations` is derived from natal star `mutagen` values. Each
record contains:

- `transformation`: one of `祿`, `權`, `科`, `忌`
- `star`
- `star_category`
- `target_palace`

#### Palace-stem flights

`palace_stem_flights` contains one source record for every natal palace. The
source palace's heavenly stem is passed to iztro's transformation table. Its
four ordered flight records contain:

- `transformation`
- `star`
- `star_category`
- `target_palace`
- `is_self_transformation`

The source palace is not the destination unless
`is_self_transformation` is true.

#### Self transformations

`self_transformations` is a reverse-index subset of
`palace_stem_flights`. Each item repeats the source palace,
transformation, and transformed star so an AI can query 自化 directly without
searching 48 flight edges.

### Reverse indexes

`indexes` duplicates no astrological claims; it exposes lookup paths over the
same facts:

- `palaces_by_name`: palace name to index.
- `stars_by_name`: star name to one or more locations, including category,
  palace, brightness, and natal mutagen.
- `empty_palace_indices`
- `borrowed_palace_indices`
- `opposite_axes`: six two-index arrays.
- `transformation_targets`: `祿`, `權`, `科`, and `忌` to their natal target
  records.

## Horoscope schema

The `horoscope` sibling is:

```json
{
  "schema_version": "1.0.0",
  "target": {},
  "scopes": {},
  "palace_overlays": [],
  "scope_relations": {}
}
```

### Target

`target` records:

- entered local civil `date` and `time`
- `time_zone`
- `time_basis: local_civil_time`
- calculated `chinese_hour_index`
- iztro's normalized `solar_date` and `lunar_date`

### Scope summaries

`scopes` contains all scopes returned by iztro:

- `decadal` (大限)
- `age` (小限, including nominal age)
- `yearly` (流年)
- `monthly` (流月)
- `daily` (流日)
- `hourly` (流時)

Every scope contains:

- focus `index`, localized `name`, `heavenly_stem`, and `earthly_branch`
- `palace_names`, a twelve-item array mapping each fixed palace index to the
  palace identity used by that scope
- `transformations`, converting iztro's ordered four-star `mutagen` array
  into explicit `祿`/`權`/`科`/`忌` records with natal target-palace references
- `dynamic_stars_by_palace`, always normalized to twelve arrays; a scope that
  supplies no dynamic stars has twelve empty arrays

The yearly scope additionally includes `jiangqian12_by_palace` and
`suiqian12_by_palace`.

### Palace overlays

`palace_overlays` contains one record for each fixed physical/natal palace
index. It has a `natal_palace` reference and one entry for every time scope.
Each scope entry contains:

- the scope's palace name at that fixed position
- whether this is the scope's focus index
- dynamic stars at that position
- scope transformations whose natal star targets that position
- yearly twelve-god values where applicable

Natal stars are not moved or rewritten. The overlay only states which dynamic
palace identity and time-specific facts occupy each fixed natal position.

### Scope relationships

`scope_relations` contains one twelve-item relationship array for each scope.
For every palace identity in that scope it records:

- the fixed position where that identity currently appears
- whether that position has no natal major stars
- an opposite-palace borrowing reference when it is empty
- scope-aware 三方四正 roles, expressed as scope palace names plus fixed
  palace indices

The four positions are calculated through iztro's horoscope relationship API
instead of by changing natal star positions.

## Implementation boundaries

The implementation is split into focused CommonJS modules:

- `src/ziwei.js` continues to construct the astrolabe and normalized base
  chart, then attaches derived output.
- `src/ziwei-addon.js` generates natal relationships, transformations, and
  reverse indexes from an iztro astrolabe.
- `src/ziwei-horoscope.js` normalizes a target horoscope and builds overlays
  and scope relationships.
- `src/chart.js` validates the new CLI flags and dispatches the requested
  Ziwei output.

No Bazi module or Bazi JSON schema is changed.

## Errors

The CLI fails with an actionable message when:

- `--ziwei-output` is not `natal` or `horoscope`
- horoscope output lacks either target flag
- only one target flag is supplied
- a target date or time is malformed or nonexistent in the selected IANA time
  zone
- Ziwei-only flags are supplied with Bazi

An iztro transformation star that cannot be found in the natal chart is kept
as a transformation record with `target_palace: null` and
`star_category: null`. This preserves the library result rather than dropping
data or inventing a destination.

## Verification criteria

Automated tests must prove:

1. The pre-existing `chart` structure and Bazi output still satisfy their
   current tests.
2. A natal document has twelve palace-relation records, six opposing axes,
   correct empty-palace borrowing, and no borrowed stars inserted into the
   original chart.
3. Every natal palace produces four ordered palace-stem flight edges; the
   self-transformation index exactly matches edges whose source and target
   indices are equal.
4. Birth-year transformations and reverse star indexes point to actual chart
   locations.
5. Horoscope CLI validation rejects incomplete or cross-system flags.
6. A horoscope document includes the complete enhanced natal data and all six
   official time scopes.
7. Each horoscope scope maps twelve palace names and twelve dynamic-star
   arrays, while `palace_overlays` retains the original natal palace and star
   positions.
8. Scope transformations, yearly twelve-god values, empty-palace borrowing,
   and scope 三方四正 references resolve to valid fixed palace indices.
9. The CLI emits one parseable JSON document and no stderr for valid natal and
   horoscope commands.

## Research basis

- iztro's official astrolabe API defines 三方四正 as target, opposite, wealth,
  and career positions and exposes palace transformation destinations:
  <https://docs.iztro.com/posts/astrolabe>
- iztro's official horoscope documentation and type definitions expose 大限,
  小限, 流年, 流月, 流日, 流時, palace-name mappings, transformations, and
  dynamic stars: <https://docs.iztro.com/zh_TW/posts/horoscope> and
  <https://docs.iztro.com/type-definition>
- react-iztro demonstrates the visual concepts this adapter makes explicit,
  including 三方四正 lines, time-layer indicators, palace-stem flights, and
  self transformations: <https://github.com/SylarLong/react-iztro>
- ziwei-bazi-agent separates deterministic chart calculation, derived facts,
  time layers, and AI interpretation. Its architecture is a reference only;
  no AGPL source code is copied:
  <https://github.com/Phat-Po/ziwei-bazi-agent>

## Explicit non-goals

- Rendering a visual chart
- Predictive or interpretive prose
- 吉凶 scoring or confidence weights
- School-specific 格局 detection
- Treating borrowed stars as original placements
- Combining Ziwei and Bazi into one output
- Supporting target-place geocoding or travel-location correction

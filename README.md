# Chinese Astrology Birth Chart JSON

Generate auditable, AI-ready Zi Wei Dou Shu (紫微斗數) and Bazi
(八字/Four Pillars) charts as structured JSON from a local birth time,
timezone, and location.

This is a data-only command-line tool. It does not render a chart, assign
fortune scores, or produce an interpretation. The resulting JSON is intended
for analysis by an AI or another application.

Ziwei calculation uses [iztro](https://github.com/SylarLong/iztro). Bazi uses
[`lunar-typescript`](https://github.com/6tail/lunar-typescript). The adapter
also makes relationships normally communicated by a rendered Ziwei chart
explicit, including 借宮, 三方四正, 宮干飛化, and 自化.

## Install

```sh
npm install
```

The calculation dependencies are pinned to iztro 2.5.8 and lunar-typescript
1.8.6 so an installation does not silently change the documented rule tables.

## Generate a natal Ziwei chart

Ziwei is the default system:

```sh
node bin/ziwei-json.js \
  --date 2000-08-16 \
  --time 02:30 \
  --gender female \
  --latitude 25.033 \
  --longitude 121.5654 \
  --time-zone Asia/Taipei \
  > ziwei-natal.json
```

`--system ziwei --ziwei-output natal` is equivalent to the default.

The natal document preserves the original normalized `chart` structure and
adds a separate `ziwei_addon` sibling containing:

- `palace_relations` — empty palaces, opposite and adjacent palaces, 借宮,
  axes, and complete 三方四正 star locations.
- `transformations.birth_year_transformations` — explicit 生年祿權科忌
  destinations.
- `transformations.palace_stem_flights` — four 宮干飛化 edges for each of
  the twelve palaces.
- `transformations.self_transformations` — direct 自化 lookup records.
- `indexes` — palace, star, empty-palace, axis, and transformation reverse
  indexes for efficient machine analysis.

Borrowed stars are references to the opposite palace. They are never inserted
into the original palace's natal star arrays.

## Generate a Ziwei horoscope snapshot

Use `--ziwei-output horoscope` with a target local civil date and time:

```sh
node bin/ziwei-json.js \
  --system ziwei \
  --ziwei-output horoscope \
  --date 2000-08-16 \
  --time 02:30 \
  --gender female \
  --latitude 25.033 \
  --longitude 121.5654 \
  --time-zone Asia/Taipei \
  --target-date 2026-08-03 \
  --target-time 14:30 \
  > ziwei-horoscope.json
```

The horoscope JSON is self-contained: it includes the complete natal `chart`
and `ziwei_addon`, then adds all six time scopes returned by iztro:

- `decadal` — 大限
- `age` — 小限 and nominal age
- `yearly` — 流年, including 將前十二神 and 歲前十二神
- `monthly` — 流月
- `daily` — 流日
- `hourly` — 流時

Natal stars and natal palace positions remain fixed. Each scope supplies a
twelve-palace name mapping, four transformation destinations, and dynamic
stars. `palace_overlays` collects these layers at each fixed natal position,
while `scope_relations` makes scope-aware 借宮 and 三方四正 directly
queryable.

The target time is interpreted as local civil time in `--time-zone` and is
converted directly to a Chinese-hour index. Apparent-solar correction is not
applied to the target time; this convention is recorded in
`horoscope.target`.

This is a snapshot for one target date, not a batch export of every decadal,
year, or lunar month. The natal palaces list all twelve decadal age ranges,
but they do not contain twelve complete dynamic decadal charts. Targets before
the recorded birth date/time or outside an engine-supported scope are rejected.
The combined six-scope snapshot currently requires a valid minor-limit age
(nominal ages 1–120), even when the final natal decadal extends past age 120.

## Export every decadal, year, and lunar month

Use batch mode with a name to export into `output/<name>/`:

```sh
node bin/ziwei-json.js \
  --date 2000-08-16 \
  --time 14:30 \
  --gender female \
  --latitude 0 \
  --longitude 120 \
  --time-zone Asia/Taipei \
  --ziwei-output batch \
  --name example
```

Batch mode exports the complete twelve-decadal schedule, from the recorded
birth instant through the lunar New Year following the final decadal. The
last age depends on the five-elements class and can reach nominal age 125.
Batch layers do not request the unrelated minor-limit scope, so they include
valid final-decadal years after age 120. Do not supply snapshot target flags.

Paths below are relative to `output/example/`. Names are directory labels,
preserved as `name` in each layer document; they do not affect calculations.

| Path | Contents |
| --- | --- |
| `本命/紫微.json` | Complete natal chart, addon, birth inputs and calculation provenance |
| `大限/01.json` … `12.json` | Each decadal's scope, transformations, dynamic stars and palace relationships |
| `流年/<lunar-year>.json` | Every lunar year, clipped at birth where necessary |
| `流月/<year>-<month>.json` | Each actual regular lunar month |
| `流月/<year>-<month>-leap.json` | Each leap month, with separate state segments before and from day 16 |
| `manifest.json` | Chart identity, file list, periods, statistics, rules and SHA-256 hashes |

Layer files share the complete natal data through `natal_ref`; load that file
to resolve natal stars and natal flights. Monthly files also reference their
year and applicable decadal. Each file has a stable `chart_id` and `layer_id`.
The identity includes birth inputs, effective calculation rules and provenance;
it excludes the name, export directory and snapshot arguments.

`--name` must be a single directory name; Chinese names are supported.
The default `output/` parent is created automatically and is ignored by Git.
Local `output/`, `outputs/` and `generated/` directories are private and must
not be committed. JSON files are ignored throughout the repository except
for package metadata and the reviewed synthetic reference fixture, so JSON
exports in custom destinations are also excluded. Check staged files before
pushing; ignore rules do not remove files that Git already tracks.
To choose a different destination, `--output-dir ./ziwei-export` still
specifies the exact personal export directory, with or without `--name`;
its parent must already exist. This layout replaces the former
`natal.json`, `decadals/`, `years/` and `months/` batch paths, so consumers
should resolve files through the new manifest and relative references.

Periods preserve both natural boundaries and valid intervals clipped to birth
and the lifecycle end. UTC intervals are half-open `[start,end)`, with local
date, time and UTC offset also recorded. A nonexistent midnight advances to
the first existing minute; a repeated midnight selects its first occurrence.
These period boundaries use the local civil lunar calendar, not birth-time
solar correction. Leap months retain one calendar identity even when their
two segments use different monthly scopes.

Before the first decadal, year/month files use `decadal_ref: null` with an
explicit reason. If birth-time correction crosses lunar New Year, the initial
civil-time fragment can have nominal age zero or start at age two relative to
the effective birth year; the export preserves it without inventing a
childhood decadal. No separate childhood-decadal file is emitted.

Batch mode currently requires `yearDivide`, `horoscopeDivide` and `ageDivide`
to be `normal`; unsupported settings are rejected. Existing paths, including
empty directories and symlinks, are rejected. Generation and reference/hash
checks finish in a private temporary sibling directory before publication.
`manifest.json` is published last; an interrupted publication can leave a
partial new directory without a manifest, which must not be treated as a
completed export. Existing exports are never replaced.

The example above produces 1,679 JSON files: one natal, twelve decadal,
125 yearly, 1,540 monthly and one manifest. Counts vary with birth date and
five-elements class. Standard output contains one compact JSON result with
the output directory and statistics.

## Generate a Bazi chart

Use `--system bazi` to generate a separate Bazi document. Bazi output does not
contain Ziwei data and does not require gender:

```sh
node bin/ziwei-json.js \
  --system bazi \
  --date 2000-08-16 \
  --time 02:30 \
  --latitude 25.033 \
  --longitude 121.5654 \
  --time-zone Asia/Taipei \
  > bazi.json
```

The Bazi document provides the year, month, day, and hour pillars, including
stems, branches, hidden stems, five elements, ten gods, NaYin, Chang Sheng,
Xun, and Xun Kong. It also includes 胎元, 胎息, 命宮, and 身宮 with their
NaYin values.

Bazi uses `lunar-typescript`'s `sect: 2` day-boundary convention. This
convention and the birth-time correction are recorded so the calculation is
auditable.

An existing person's Bazi document can be stored alongside their Ziwei
export as `output/<name>/本命/八字.json`. The batch manifest indexes Ziwei
layers only; a separately generated Bazi document is not included in its
file counts or hashes.

## Birth input and time correction

Required birth inputs:

- `--date` — local Gregorian birth date in `YYYY-MM-DD`.
- `--time` — recorded local birth time in 24-hour `HH:mm`.
- `--gender` — `male` or `female`; required only for Ziwei.
- `--latitude` — decimal degrees from -90 to 90, recorded as birthplace
  provenance.
- `--longitude` — decimal degrees from -180 to 180, used for birth-time solar
  correction.
- `--time-zone` — an IANA zone such as `Asia/Taipei`, used to resolve the
  historical UTC offset.

The generator adjusts recorded birth time using an equation-of-time
approximation and the longitude difference from the timezone's standard
meridian. It preserves the entered civil time, correction components,
apparent-solar time, and resulting Chinese-hour index in the JSON. Latitude
is retained as provenance but is not part of this longitude-based correction.

The offset includes any historical daylight-saving adjustment. Longitude
differences are normalized modulo 360 degrees so equivalent east/west
longitudes do not shift the birth date by a full day. Historical offsets
containing seconds are preserved as fractional minutes. Nonexistent or
ambiguous civil times are rejected.

The correction targets minute-level charting use, not observatory-grade solar
ephemerides. Its equation-of-time approximation has not been validated against
an astronomical reference ephemeris; births near hour/day boundaries need
additional checking. Ziwei accepts Gregorian birth dates on or after
1582-10-15, with the corrected date also in that range, to avoid mixing
proleptic Gregorian input with the engine's earlier Julian-calendar dates.
Corrections outside the four-digit year range are rejected.

## Calculation provenance and verification limits

Ziwei JSON includes `calculation_conventions`: a snapshot of the effective
`iztro` configuration (including custom table overrides), leap-month handling,
the natal time basis, and Node/ICU/timezone-data versions. `source.version`
reports the installed engine version. These are additive fields; existing
`chart`, `ziwei_addon`, and `horoscope` structures remain available.

With the default installed iztro 2.5.8 configuration, year boundaries use lunar
New Year, late Zi hour uses `dayDivide: forward`, and leap-month adjustment is
enabled. The adapter now applies the late-Zi date change to the entire birth
date before conversion and placement: a late-Zi time and the following early
Zi time use the same effective lunar year, month and day, including at leap
month and lunar-year boundaries. Original birth inputs, apparent solar date,
hour index 12 and the late-Zi display label are preserved. `chart.lunar_date_details`
records the apparent civil date; `chart.calculation_lunar_date_details` records
the effective date and the month used for palace placement. This intentionally
changes affected older outputs. See the [rule derivation and sources](docs/references/ziwei-late-zi-convention.md).

`calculation_conventions.table_variants` explicitly records differences
from the cited classical transcription: the default table uses 左輔 for
壬年化科 and 天魁午／天鉞寅 for 辛年. The independent fixtures preserve the
classical values and verify these declared variants separately. A third entry
records the uncollated 丙丁天鉞 “猪狗／猪雞” transcription difference; the
adopted 酉 placement is separately supported by an independent implementation,
not presented as agreement with the cited classical transcription.
Brightness `null` means the engine did not provide a value; it does
not establish that the star has no brightness classification in every school.

The test suite includes independent fixed natal references derived from
[Hong Kong Observatory calendars](https://www.hko.gov.hk/tc/gts/time/conversion1_text.htm)
and the cited classical placement rules, late-Zi boundary pairs, synthetic
matrices, date/time cases, full lifecycle export and actual CLI file checks.
The fixed natal cases check absolute major-star positions, selected auxiliary
stars and brightness values; they do not independently verify every minor
star, brightness table, dynamic star or astronomical approximation. See the
[implementation verification report](docs/audits/2026-10-19-ziwei-batch-implementation.md).

## Output behavior

The command writes exactly one JSON document to standard output (the compact
export result in batch mode, or the chart in other modes). Keys are
stable English identifiers; traditional-Chinese (`zh-TW`) chart terms are
preserved as values.

`npm run --silent chart -- [flags]` is equivalent to invoking the executable.
Use `--silent` when redirecting npm output so npm's command banner is not
written alongside the JSON.

Programmatic callers can use `generateChart(input)` as before for natal and
horoscope documents. With `ziweiOutput: 'batch'`, it returns the synchronous
`generateZiweiBatch(input)` iterator of `{path, document}` items; it does not
write files. `writeZiweiBatch(input)` performs filesystem export.

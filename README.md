# Chinese Astrology Birth Chart JSON

**紫微斗数 · 八字 · Structured chart data for applications and AI analysis**

Turn a recorded birth time, coordinates and timezone into a traceable Chinese
astrology chart. Generate a natal chart, inspect six time layers at a target
instant, or export separate JSON files for every 大限, 流年 and 流月 in the
supported lifecycle.

The project grew out of a practical problem: chart images are convenient for
people, but an AI can misread a star, palace or time layer. Here, those facts
and relationships are explicit data, with the inputs and calculation rules
preserved for checking. The CLI runs locally and makes no AI service calls.

[Quick start](#quick-start) · [Output modes](#choose-an-output-mode) ·
[JSON guide](#understand-the-json) · [CLI reference](#cli-reference) ·
[Calculation rules](#calculation-rules) · [Verification](#accuracy-and-verification) ·
[Privacy](#privacy) · [Development](#development)

## Why this project

- **Use chart data directly.** Read palace positions, stars, brightness and
  transformations without extracting them from an image.
- **Keep time layers separate.** Natal positions stay fixed; each time layer
  supplies its palace mapping, dynamic stars and transformation destinations.
- **Follow the relationships.** 借宫, 三方四正, 宫干飞化 and 自化 have explicit
  references instead of relying on a chart's visual layout.
- **Check how a result was produced.** Birth inputs, time correction, engine
  versions and effective conventions accompany the data. Batch manifests add
  file hashes, identities and time intervals.

It is useful for chart-reading applications, AI-assisted analysis, rule
comparison and reproducible software tests. The output contains calculation
facts; interpretation and fortune scoring belong to the consuming application.

Ziwei calculation uses [iztro](https://github.com/SylarLong/iztro); calendar
conversion and standalone Bazi use
[lunar-typescript](https://github.com/6tail/lunar-typescript). This repository
adds time handling, structured relationships, provenance and batch export.

## Quick start

Use **Node.js 22** and npm. The documented examples were checked on Node
22.22.3; the project does not currently declare a minimum version or a wider
runtime support matrix.

```sh
git clone https://github.com/JasonHuang1103/chinese-astrology-birth-chart.git
cd chinese-astrology-birth-chart
npm ci
```

Run commands from the repository root. All examples below use the same
**synthetic birth input**: 2000-08-16, 14:30, latitude 0, longitude 120,
timezone `Asia/Taipei`. Ziwei examples specify `female`; Bazi does not
require gender. The committed reference fixtures also use synthetic inputs.

Generate your first natal chart:

```sh
mkdir -p output

node bin/ziwei-json.js \
  --date 2000-08-16 \
  --time 14:30 \
  --gender female \
  --latitude 0 \
  --longitude 120 \
  --time-zone Asia/Taipei \
  > output/example-natal.json
```

Read it with Node, without installing another tool:

```sh
node -e "const doc = require('./output/example-natal.json'); console.log(doc.chart.palaces.length)"
# 12
```

The calculation dependencies are pinned to **iztro 2.5.8** and
**lunar-typescript 1.8.6**. `npm ci` installs the committed dependency lockfile.

## Choose an output mode

| Need | Mode | Result |
| --- | --- | --- |
| Read one birth chart | Ziwei `natal` — default | One JSON containing the natal chart and derived relationships |
| Inspect a particular date and time | Ziwei `horoscope` | One self-contained natal document plus six time scopes |
| Work with every 大限, 流年 and 流月 | Ziwei `batch` | Files organized by name and layer, plus a manifest |
| Read Four Pillars | `--system bazi` | One standalone Bazi JSON document |

### Natal chart · 本命

The [quick-start command](#quick-start) uses the default
`--system ziwei --ziwei-output natal`.

The document includes twelve palaces, palace stems and branches, 命宫, 身宫,
五行局, 命主 and 身主; main, auxiliary and miscellaneous stars; available
brightness classifications; and the natal decadal age schedule.
`ziwei_addon` adds 生年四化, 宫干飞化, 自化, empty-palace and borrowed-palace
relations, 三方四正 and lookup indexes.

A natal palace's decadal age range describes the schedule. Use batch mode
for the complete dynamic chart of each decadal.

### Target snapshot · 运限快照

```sh
mkdir -p output

node bin/ziwei-json.js \
  --date 2000-08-16 \
  --time 14:30 \
  --gender female \
  --latitude 0 \
  --longitude 120 \
  --time-zone Asia/Taipei \
  --ziwei-output horoscope \
  --target-date 2026-08-03 \
  --target-time 14:30 \
  > output/example-horoscope.json
```

`horoscope.scopes` contains `decadal` 大限, `age` 小限, `yearly` 流年,
`monthly` 流月, `daily` 流日 and `hourly` 流时. The yearly layer also includes
将前十二神 and 岁前十二神. `palace_overlays` and `scope_relations` make
layer-specific positions, transformations, 借宫 and 三方四正 queryable.

The target is local civil time in the birth input's timezone. It receives
no apparent-solar correction. It must be at or after the recorded birth
instant. This combined six-scope mode is limited by the engine's minor-limit
age table, currently nominal ages 1–120.

### Full lifecycle export · 本命、大限、流年、流月

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

This creates a **new** `output/example/` directory relative to the current
working directory:

```text
output/example/
├── 本命/
│   └── 紫微.json
├── 大限/
│   ├── 01.json
│   └── … 12.json
├── 流年/
│   ├── 2000.json
│   └── …
├── 流月/
│   ├── 2000-07.json
│   ├── …
│   ├── 2025-06.json
│   ├── 2025-06-leap.json
│   └── …
└── manifest.json
```

Batch exports cover all **twelve natal decadals**, plus every lunar year
and actual lunar month from the recorded birth instant to the lunar New Year
following the final decadal. The maximum nominal age depends on 五行局 and
can reach 125. Batch mode requests only the required scopes, so the
six-scope snapshot's age-120 ceiling does not truncate the final decadal.

For the exact synthetic input above, the result is **1,679 JSON files**:
1 natal, 12 decadal, 125 yearly, 1,540 monthly and 1 manifest. File counts
vary with the birth input. Standard output is one summary JSON containing
`output_directory`, `manifest`, `statistics`, `range` and `chart_id`.

`--name` is a single directory label, supports Chinese characters and does
not affect chart calculation. To select a different location, use
`--output-dir ./my-export`; it specifies the **exact** destination, without
appending the name, and its parent must already exist. The default `output/`
parent is created automatically. Neither destination may already exist,
even as an empty directory or symlink. Snapshot target flags are not accepted
in batch mode.

See [batch references and periods](#batch-references-and-periods) for consuming
these files and [privacy](#privacy) before sharing them.

### Four Pillars · 八字

```sh
mkdir -p output

node bin/ziwei-json.js \
  --system bazi \
  --date 2000-08-16 \
  --time 14:30 \
  --latitude 0 \
  --longitude 120 \
  --time-zone Asia/Taipei \
  > output/example-bazi.json
```

Bazi does not require gender. Its four pillars include stems, branches,
hidden stems, five elements, ten gods, 纳音, 长生, 旬 and 旬空. Auxiliary
data includes 胎元, 胎息, 命宫 and 身宫 with their 纳音. The source records
`day_boundary_sect: 2`.

Bazi currently has single-document output. You may store it alongside a
person's Ziwei export as `output/<name>/本命/八字.json`; the Ziwei manifest
does not index or hash that separately generated file.

## Understand the JSON

Keys use English identifiers. Ziwei chart terms use traditional Chinese
(`zh-TW`); Bazi values retain `lunar-typescript`'s native wording.
Ziwei palace indexes are zero-based fixed positions.
Time layers change the palace-name mapping at those positions, while natal
stars remain in their original arrays.

### A concrete example

For the quick-start input, the life palace is `chart.palaces[11]`. These are
selected fields from the actual generated palace:

```json
{
  "index": 11,
  "name": "命宮",
  "heavenly_stem": "己",
  "earthly_branch": "丑",
  "stars": {
    "major": [
      {
        "name": "天府",
        "type": "major",
        "scope": "origin",
        "brightness": "廟",
        "mutagen": null
      }
    ]
  }
}
```

The same document explicitly locates birth-year 化禄. Selected fields from
`ziwei_addon.transformations.birth_year_transformations[0]`:

```json
{
  "transformation": "祿",
  "star": "太陽",
  "star_category": "major",
  "target_palace": {
    "index": 10,
    "name": "兄弟"
  }
}
```

This lets a consumer distinguish the transformation's star, destination
and layer. A borrowed star is likewise a reference to another palace;
`materialized_into_chart: false` makes clear it was not inserted as an
actual occupant of the empty palace.

### Field map

| JSON path | Meaning |
| --- | --- |
| `schema_version` | Document format version, currently `1.0.0`; distinct from engine and adapter-rule versions |
| `input` / `time_correction` | Recorded birth inputs and the correction used for calculation |
| `source` / `calculation_conventions` | Engine information and effective Ziwei rules, including runtime provenance |
| `chart` | Complete normalized natal Ziwei chart |
| `ziwei_addon.palace_relations` | Empty palaces, neighbors, opposites, 借宫 and 三方四正 |
| `ziwei_addon.transformations` | 生年四化, twelve sets of 宫干飞化, and 自化 |
| `ziwei_addon.indexes` | Star, palace, axis and transformation lookup indexes |
| `horoscope.scopes` | Six scopes in a target snapshot |
| `scopes.decadal` / `scopes.yearly` | The requested scope in a batch decadal or yearly file |
| `segments[i].scopes.monthly` | A monthly state segment in a batch month file |
| `bazi.pillars` / `bazi.auxiliary` | Four Pillars and auxiliary Bazi data |

Batch layer files reference the shared natal document. Load it to obtain
the natal stars and flights; those arrays are not duplicated into every
monthly file. **A batch monthly document has `segments`, not root-level
`scopes.monthly`.**

### Batch references and periods

Every batch file carries `schema_version`, `name`, `chart_id`, `layer_id`
and `layer`. For example, `流月/2005-01.json` includes these references:

```json
{
  "natal_ref": "../本命/紫微.json",
  "year_ref": "../流年/2005.json",
  "decadal_ref": "../大限/01.json"
}
```

Resolve a layer reference **relative to the file containing it**. Manifest
file paths are relative to the export directory. `manifest.files` lists and
hashes all data documents; `statistics.files` also counts the manifest itself.
Check `chart_id` before combining files from different exports.
Names and export paths are excluded from that identity; birth inputs, rules
and provenance are included, so a runtime or rule change can change the ID.

Periods have two meanings:

- `period.natural`: the full calendar period.
- `period.valid`: the portion inside the birth-to-lifecycle-end range.

Compare UTC endpoints as half-open intervals: **start ≤ instant < end**.
Each endpoint also records local date, time, timezone and offset. The natal
file has no time interval, so its natural and valid periods are `null`.
Before the first decadal, `decadal_ref` is `null` with an explicit status;
no separate childhood-decadal file is invented.

**A 流月 filename uses the lunar year and month.** `2025-06-leap.json` is
lunar leap month six, not Gregorian June. A regular month normally has one
state segment. A leap month retains one file and calendar identity, with
separate segments before and from lunar day 16. Birth clipping can leave
only one of those segments.

To select a month by a Gregorian instant, search its recorded interval
instead of constructing a filename from the Gregorian month. After running
the batch example, this script selects the second segment of leap month six:

```js
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const contains = (period, utc) => period.start.utc <= utc && utc < period.end.utc;

const base = path.resolve('output/example');
const manifest = read(path.join(base, 'manifest.json'));
const utc = new Date('2025-08-10T12:00:00+08:00').toISOString();
const entry = manifest.files.find((file) =>
  file.layer === 'monthly' && contains(file.period.valid, utc));
if (!entry) throw new Error('Instant is outside this export');

const monthFile = path.join(base, entry.path);
const month = read(monthFile);
const segment = month.segments.find((item) => contains(item.period.valid, utc));
const natal = read(path.resolve(path.dirname(monthFile), month.natal_ref));

console.log(entry.path);                    // 流月/2025-06-leap.json
console.log(segment.lunar_day_range[0]);    // 16
console.log(natal.chart.palaces.length);    // 12
```

Use `year_ref` and the applicable `decadal_ref` the same way to assemble the
four layers needed for a particular month. For AI-assisted interpretation,
keep each claim tied to its file, JSON path and time layer; the project's
[analysis guidelines](AGENTS.md#方向二根据-json-进行命盘分析) describe that workflow.

<details>
<summary>Export integrity, exceptional boundaries and older layouts</summary>

The writer generates files in a private temporary sibling directory, checks
hashes and references, then publishes data files without overwriting existing
paths. `manifest.json` is published last. The filesystem must support hard
links. An interrupted publication may leave a partial new directory without
a manifest; it is not a completed export and existing exports are never
replaced automatically.

For a missing local midnight, a batch boundary advances to the first existing
minute; a repeated midnight uses its earlier occurrence. Birth correction
across lunar New Year can produce an initial nominal-age-zero or age-two
fragment; it remains in the export with an explicit decadal status.

The Chinese directories replace the earlier `natal.json`, `decadals/`,
`years/` and `months/` layout. Consumers should follow the current manifest
and relative references. Detailed examples and boundary verification are in
the [implementation report](docs/audits/2026-10-19-ziwei-batch-implementation.md).

</details>

## CLI reference

Pass arguments as `--flag value` pairs, once each. The input date is
**Gregorian**; conversion to the lunar calendar happens inside the engine.
Birthplace is supplied as coordinates and an IANA timezone; city-name lookup
and lunar-date input are not implemented.

| Flag | Required / default | Format or behavior |
| --- | --- | --- |
| `--date` | All modes | Local Gregorian birth date, `YYYY-MM-DD` |
| `--time` | All modes | Recorded birth time, 24-hour `HH:mm` |
| `--latitude` | All modes | Decimal degrees, −90 to 90; retained as provenance |
| `--longitude` | All modes | Decimal degrees, −180 to 180; used for solar correction |
| `--time-zone` | All modes | IANA zone, for example `Asia/Taipei` |
| `--gender` | Ziwei required; Bazi optional | `male` or `female` |
| `--system` | `ziwei` | `ziwei` or `bazi` |
| `--ziwei-output` | `natal` | Ziwei only: `natal`, `horoscope` or `batch` |
| `--target-date` | Horoscope required | Target local Gregorian date, `YYYY-MM-DD` |
| `--target-time` | Horoscope required | Target local time, `HH:mm` |
| `--name` | Batch: name or directory required | Single directory label for `output/<name>/` |
| `--output-dir` | Batch: name or directory required | Exact custom destination; overrides the default location |

`--name` and `--output-dir` are batch-only. Target flags are horoscope-only.
Bazi rejects all Ziwei output flags. Unknown, repeated and incomplete flags
are rejected; there is currently no `--help` flag.

The CLI writes exactly one JSON document to stdout: a chart, a snapshot or
a batch summary. Errors go to stderr with a nonzero exit code. The npm
shortcut is `npm run --silent chart -- [flags]`; keep `--silent` when
redirecting JSON to avoid including npm's command banner.

## Calculation rules

The selected conventions are part of the data contract, and can differ
from other schools or charting tools.

| Topic | Current behavior |
| --- | --- |
| Birth time | Corrected to apparent solar time using longitude and an approximate equation of time; the actual historical UTC offset includes DST |
| Latitude | Recorded, but not used in the longitude-based correction |
| Ziwei target time and batch periods | Local civil time in the supplied timezone, without birth-time solar correction |
| Ziwei year and month boundaries | Lunar New Year and actual lunar months under the default `normal` rules |
| Ziwei late Zi · 晚子 | With `dayDivide: forward`, advance the entire effective date before conversion and placement; preserve the entered and apparent civil records |
| Ziwei leap month · 闰月 | Adjustment enabled; lunar day 16 starts the next effective placement month, while the calendar month identity is retained |
| Ziwei age | Nominal age based on the effective birth lunar year; batch permits valid final-decadal ages beyond 120 |
| Bazi day boundary | `lunar-typescript` sect 2, recorded in `source.day_boundary_sect` |

Nonexistent or ambiguous **input** civil times are rejected. Longitude
correction is normalized across the date line; historical offset seconds are
preserved as fractional minutes. Ziwei requires both recorded and corrected
birth dates on or after **1582-10-15**. Corrected dates and complete batch
lifecycles must remain within the supported four-digit year range.

Ziwei records the effective engine configuration, leap-month policy, adapter
rules and Node/ICU/timezone-data versions in `calculation_conventions`.
`chart.lunar_date_details` describes the apparent civil date;
`chart.calculation_lunar_date_details` describes the effective calculation
date and palace-placement month. Batch mode requires `yearDivide`,
`horoscopeDivide` and `ageDivide` to be `normal`; other configurations are
explicitly rejected.

The JSON also names known default-table differences from the cited classical
transcription: 壬年化科 uses 左辅; 辛年 uses 天魁午／天钺寅. The 丙丁天钺
“猪狗／猪雞” transcription remains uncollated; the adopted 酉 position has
separate implementation support. These are declared table choices, not
claims that all sources agree.

See the [late-Zi convention](docs/references/ziwei-late-zi-convention.md) and
[dynamic-layer conventions](docs/references/ziwei-dynamic-conventions.md) for
derivations, references and explicitly retained differences.

## Accuracy and verification

**Traceable output is a way to inspect a calculation, not a proof that every
traditional rule or real-world interpretation is correct.**

| Verification | What it checks |
| --- | --- |
| Independent synthetic natal fixtures | HKO calendar anchors, absolute main-star positions, selected auxiliary stars, brightness and four transformations, with declared table differences |
| Late-Zi and lunar boundaries | Seven fixed late/early-Zi pairs, leap-month transitions and lunar New Year |
| Independent dynamic references | Decadal direction and ages, year/month palace mapping and four transformations, including final-decadal and leap-month cases |
| Structural matrices and lifecycle exports | Star inventory, palace geometry, layer isolation, continuous periods, references and file hashes |
| Actual CLI and writer behavior | Real output files, existing destinations, collisions, damaged staging data and publication failures |

The equation-of-time approximation has **not** been validated against an
authoritative astronomical ephemeris. Births near a Chinese-hour or date
boundary need additional checking. Independent references do not cover every
auxiliary or miscellaneous star, all brightness and dynamic-star tables,
every date or every school. A brightness value of `null` means the engine
provided no value; it does not establish universal inapplicability.

For methods, sources, results and remaining limitations, read the
[current verification report](docs/audits/2026-10-19-ziwei-batch-implementation.md).
The [initial capability audit](docs/audits/2026-10-19-ziwei-capability-audit.md)
is a historical record; its earlier gaps should be read alongside the
subsequent implementation report.

## Privacy

Birth times, coordinates, chart data and interpretations can identify people.
Keep generated files private. The CLI processes inputs locally; sharing a
file with another application or AI service is a separate decision.

The repository ignores `output/`, `outputs/`, `generated/` and JSON files
throughout the tree, including custom export destinations. The only JSON
exceptions are package metadata and the reviewed synthetic reference fixture.
Ignore rules do not untrack an already committed file, and interpretation
reports outside ignored directories still require manual review.

Use synthetic inputs in issues and contributions. Before publishing changes,
check both staged content and outgoing commit history for personal data.

## Development

Run the complete test suite:

```sh
npm test
```

For the additional synthetic lifecycle sampling audit:

```sh
node scripts/audit-ziwei-lifecycle.js
```

### Use the modules from a repository checkout

```js
const { generateChart } = require('./src/chart');

const birth = {
  system: 'ziwei',
  date: '2000-08-16',
  time: '14:30',
  gender: 'female',
  latitude: 0,
  longitude: 120,
  timeZone: 'Asia/Taipei',
};

const natal = generateChart(birth);
console.log(natal.chart.palaces.length); // 12

const batch = generateChart({ ...birth, ziweiOutput: 'batch', name: 'example' });
console.log(batch.next().value.path);    // 本命/紫微.json
batch.return();
```

`generateChart` returns a document for natal/horoscope modes and a synchronous
`{ path, document }` iterator for batch mode. It does not write batch files.
For filesystem export, use `writeZiweiBatch` from
`./src/ziwei-batch-writer`, with the same input and a new destination.
JavaScript options use `timeZone`, `ziweiOutput`, `targetDate`, `targetTime`
and `outputDir` in place of the corresponding CLI flag names. These examples
use repository source modules; a package-root import is not provided.

### Project map

| Location | Responsibility |
| --- | --- |
| `bin/ziwei-json.js` | CLI entry point and JSON/error streams |
| `src/chart.js` | CLI input parsing and system/output selection |
| `src/time.js` | Civil-time resolution, solar correction and period boundaries |
| `src/ziwei.js` / `src/bazi.js` | Engine adapters and normalized natal data |
| `src/ziwei-addon.js` | Natal relationships, flights and indexes |
| `src/ziwei-horoscope.js` | Time scopes, overlays and scope relationships |
| `src/ziwei-batch.js` / `src/ziwei-batch-writer.js` | Lifecycle generation, manifest validation and filesystem export |
| `test/` | Synthetic fixtures, independent references and regression tests |
| `docs/references/` / `docs/audits/` | Adopted rules, provenance and verification records |

### Contributing

For a calculation discrepancy, include a synthetic reproduction command,
expected and actual fields, the engine conventions and a checkable reference.
State whether the difference involves a calendar boundary, a table variant
or a distinct school. For a code change, keep it focused and run `npm test`.
See [AGENTS.md](AGENTS.md) for development and evidence-based analysis rules.

Package metadata declares `ISC` in [package.json](package.json); a standalone
`LICENSE` file has not yet been added. Upstream calculation libraries retain
their own licenses.

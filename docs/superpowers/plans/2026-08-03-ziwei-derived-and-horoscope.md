# Ziwei Derived Facts and Horoscope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic natal Ziwei relationships and a self-contained, target-time horoscope JSON output without restructuring the existing normalized chart or changing Bazi output.

**Architecture:** Build natal facts in a focused `ziwei-addon` module from the live iztro astrolabe, then attach them as `ziwei_addon` beside the unchanged `chart`. Build horoscope summaries, fixed-position overlays, and scope relationships in `ziwei-horoscope`, selected through Ziwei-only CLI flags.

**Tech Stack:** Node.js CommonJS, `iztro` 2.5.8, built-in `node:test`, existing civil/apparent-solar time utilities.

## Global Constraints

- Preserve the names and meanings of `schema_version`, `source`, `input`, `time_correction`, and `chart`.
- Do not insert borrowed stars into `chart.palaces[index].stars.major`.
- Horoscope JSON must include the complete enhanced natal document plus `horoscope`.
- Output deterministic facts only; no 吉凶 scores, 格局 recognition, confidence weights, or interpretive prose.
- Reject Ziwei horoscope flags for Bazi and do not change the Bazi schema.
- Treat horoscope target time as local civil time in the supplied birth timezone; do not apply target apparent-solar correction.

---

### Task 1: Natal relationship and transformation add-on

**Files:**
- Create: `src/ziwei-addon.js`
- Create: `test/ziwei-addon.test.js`
- Modify: `src/ziwei.js`

**Interfaces:**
- Consumes: an iztro `FunctionalAstrolabe` returned by `astro.bySolar(...)`.
- Produces: `generateZiweiAddon(astrolabe) -> { schema_version, calculation_conventions, palace_relations, transformations, indexes }`.
- Produces internally reusable compact palace and star-location records whose field names match the approved specification.

- [ ] **Step 1: Write failing natal add-on tests**

Create a known natal document through the public `generateChart(parseBirthInput(flags))` API and assert the add-on contract:

```js
test('adds deterministic palace relationships without modifying natal stars', () => {
  const document = generateChart(parseBirthInput(flags));
  const empty = document.ziwei_addon.palace_relations.find((item) => item.is_empty);

  assert.equal(document.ziwei_addon.palace_relations.length, 12);
  assert.equal(document.ziwei_addon.indexes.opposite_axes.length, 6);
  assert.equal(empty.borrowed_palace.materialized_into_chart, false);
  assert.deepEqual(
    document.chart.palaces[empty.palace.index].stars.major,
    [],
  );
  assert.equal(empty.sanfang_sizheng.star_locations.length > 0, true);
});

test('exports four palace-stem flights per palace and indexes self transformations', () => {
  const addon = generateChart(parseBirthInput(flags)).ziwei_addon;
  const flights = addon.transformations.palace_stem_flights;
  const selfEdges = flights.flatMap(({ source_palace, flights: edges }) =>
    edges
      .filter((edge) => edge.is_self_transformation)
      .map((edge) => ({ source_palace, ...edge })),
  );

  assert.equal(flights.length, 12);
  assert.equal(flights.every((item) => item.flights.length === 4), true);
  assert.deepEqual(addon.transformations.self_transformations, selfEdges);
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `node --test test/ziwei-addon.test.js`

Expected: FAIL because `document.ziwei_addon` is undefined.

- [ ] **Step 3: Implement the minimal add-on generator**

In `src/ziwei-addon.js`, import `util` from iztro, define the fixed transformation order, and build all values from astrolabe data:

```js
const { util } = require('iztro');

const TRANSFORMATIONS = ['祿', '權', '科', '忌'];

function palaceReference(palace) {
  return {
    index: palace.index,
    name: palace.name,
    heavenly_stem: palace.heavenlyStem,
    earthly_branch: palace.earthlyBranch,
  };
}

function generateZiweiAddon(astrolabe) {
  // Build star locations once, then derive palace relations, 12x4 flights,
  // self-flight subset, birth-year transformations, and reverse indexes.
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
    palace_relations,
    transformations: {
      birth_year_transformations,
      palace_stem_flights,
      self_transformations,
    },
    indexes,
  };
}

module.exports = { generateZiweiAddon };
```

Use `astrolabe.surroundedPalaces(palace.index)` for the four canonical roles
and `util.getMutagensByHeavenlyStem(palace.heavenlyStem)` for ordered flight
stars. When a transformation star is absent, retain the edge with
`target_palace: null` and `star_category: null`.

Attach the result in `src/ziwei.js` without changing `normalizePalace`:

```js
const { generateZiweiAddon } = require('./ziwei-addon');

return {
  ...existingFields,
  chart: existingNormalizedChart,
  ziwei_addon: generateZiweiAddon(astrolabe),
};
```

- [ ] **Step 4: Run natal and regression tests and verify GREEN**

Run: `node --test test/ziwei-addon.test.js test/chart.test.js test/bazi.test.js`

Expected: all tests pass; existing `chart` and Bazi assertions remain green.

- [ ] **Step 5: Commit the natal add-on**

```sh
git add src/ziwei-addon.js src/ziwei.js test/ziwei-addon.test.js
git commit -m "feat: add derived Ziwei natal facts"
```

### Task 2: Ziwei horoscope CLI selection and target-time validation

**Files:**
- Modify: `src/chart.js`
- Modify: `src/time.js`
- Modify: `test/chart.test.js`
- Modify: `test/time.test.js`

**Interfaces:**
- Produces: `parseBirthInput(argv)` fields `ziweiOutput`, `targetDate`, and `targetTime` for valid Ziwei input.
- Produces: `resolveCivilTime({ date, time, timeZone }) -> { timeIndex }`, validating a real, unambiguous local civil time without solar correction.

- [ ] **Step 1: Write failing parser and target-time tests**

```js
test('requires both target fields for horoscope and rejects them for Bazi', () => {
  assert.throws(
    () => parseBirthInput([...flags, '--ziwei-output', 'horoscope']),
    /target-date/,
  );
  assert.throws(
    () => parseBirthInput([...baziFlags, '--target-date', '2026-08-03', '--target-time', '14:30']),
    /Ziwei/i,
  );
});

test('parses a complete Ziwei horoscope request', () => {
  const input = parseBirthInput([
    ...flags,
    '--ziwei-output', 'horoscope',
    '--target-date', '2026-08-03',
    '--target-time', '14:30',
  ]);

  assert.equal(input.ziweiOutput, 'horoscope');
  assert.equal(input.targetDate, '2026-08-03');
  assert.equal(input.targetTime, '14:30');
});

test('resolves target civil time without apparent-solar correction', () => {
  assert.deepEqual(
    resolveCivilTime({ date: '2026-08-03', time: '14:30', timeZone: 'Asia/Taipei' }),
    { timeIndex: 7 },
  );
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test test/chart.test.js test/time.test.js`

Expected: FAIL because the flags are unknown and `resolveCivilTime` is not exported.

- [ ] **Step 3: Implement validation and civil-time resolution**

Extend `ALLOWED_FLAGS` with the three Ziwei flags. After determining `system`,
enforce these exact rules:

```js
const ziweiOutput = values['--ziwei-output'] || 'natal';
const hasTargetDate = values['--target-date'] !== undefined;
const hasTargetTime = values['--target-time'] !== undefined;

if (!['natal', 'horoscope'].includes(ziweiOutput)) {
  throw new Error('--ziwei-output must be natal or horoscope');
}
if (system === 'bazi' && (values['--ziwei-output'] || hasTargetDate || hasTargetTime)) {
  throw new Error('Ziwei output flags cannot be used with --system bazi');
}
if (ziweiOutput === 'horoscope' && (!hasTargetDate || !hasTargetTime)) {
  throw new Error('--ziwei-output horoscope requires --target-date and --target-time');
}
if (ziweiOutput === 'natal' && (hasTargetDate || hasTargetTime)) {
  throw new Error('--target-date and --target-time require --ziwei-output horoscope');
}
```

In `src/time.js`, reuse the existing private parsers and DST-aware
`resolveLocalOffset`:

```js
function resolveCivilTime({ date, time, timeZone }) {
  const { hour } = parseTime(time);
  parseDate(date);
  resolveLocalOffset(date, time, timeZone);
  return { timeIndex: chineseHourIndex(hour) };
}
```

- [ ] **Step 4: Run focused and full tests and verify GREEN**

Run: `npm test`

Expected: all existing and new parser/time tests pass.

- [ ] **Step 5: Commit CLI selection**

```sh
git add src/chart.js src/time.js test/chart.test.js test/time.test.js
git commit -m "feat: select Ziwei horoscope output"
```

### Task 3: Self-contained horoscope scopes, overlays, and relationships

**Files:**
- Create: `src/ziwei-horoscope.js`
- Create: `test/ziwei-horoscope.test.js`
- Modify: `src/ziwei.js`

**Interfaces:**
- Consumes: `generateZiweiHoroscope(astrolabe, input)` with validated `targetDate`, `targetTime`, and `timeZone`.
- Produces: `{ schema_version, target, scopes, palace_overlays, scope_relations }`.
- Updates: `generateZiweiChart(input)` attaches `horoscope` only when `input.ziweiOutput === 'horoscope'`.

- [ ] **Step 1: Write failing horoscope structure tests**

```js
test('generates a self-contained horoscope with all official scopes', () => {
  const document = generateChart(parseBirthInput(horoscopeFlags));

  assert.equal(document.chart.palaces.length, 12);
  assert.equal(document.ziwei_addon.palace_relations.length, 12);
  assert.deepEqual(Object.keys(document.horoscope.scopes), [
    'decadal', 'age', 'yearly', 'monthly', 'daily', 'hourly',
  ]);
  assert.equal(document.horoscope.palace_overlays.length, 12);
});

test('keeps natal positions fixed while mapping every dynamic scope', () => {
  const document = generateChart(parseBirthInput(horoscopeFlags));

  document.horoscope.palace_overlays.forEach((overlay, index) => {
    assert.equal(overlay.natal_palace.index, index);
    assert.equal(overlay.natal_palace.name, document.chart.palaces[index].name);
  });
  Object.values(document.horoscope.scopes).forEach((scope) => {
    assert.equal(scope.palace_names.length, 12);
    assert.equal(scope.dynamic_stars_by_palace.length, 12);
    assert.equal(scope.transformations.length, 4);
  });
});
```

Also assert that each `scope_relations[scope]` has twelve entries, referenced
indices are in `0..11`, yearly twelve-god arrays have length twelve, and an
empty scope position borrows from its opposite without changing natal stars.

- [ ] **Step 2: Run the horoscope test and verify RED**

Run: `node --test test/ziwei-horoscope.test.js`

Expected: FAIL because `document.horoscope` is undefined.

- [ ] **Step 3: Implement scope normalization and overlays**

Use the fixed order:

```js
const SCOPES = ['decadal', 'age', 'yearly', 'monthly', 'daily', 'hourly'];
const TRANSFORMATIONS = ['祿', '權', '科', '忌'];
```

Call:

```js
const { timeIndex } = resolveCivilTime({
  date: input.targetDate,
  time: input.targetTime,
  timeZone: input.timeZone,
});
const raw = astrolabe.horoscope(input.targetDate, timeIndex);
```

Normalize `raw[scope].stars` to twelve arrays with the existing star fields
`name`, `type`, `scope`, `brightness`, and `mutagen`. Resolve each ordered
scope mutagen star back to its natal palace; keep null destinations rather
than dropping results. Build each overlay by fixed index, and build scope
relationships by calling `raw.surroundPalaces(palaceName, scope)`.

Export:

```js
module.exports = { generateZiweiHoroscope };
```

Attach it in `src/ziwei.js` after the natal document exists:

```js
if (input.ziweiOutput === 'horoscope') {
  document.horoscope = generateZiweiHoroscope(astrolabe, input);
}
return document;
```

- [ ] **Step 4: Run horoscope and full tests and verify GREEN**

Run: `node --test test/ziwei-horoscope.test.js && npm test`

Expected: all tests pass with all six scope mappings and unchanged natal/Bazi output.

- [ ] **Step 5: Commit horoscope generation**

```sh
git add src/ziwei-horoscope.js src/ziwei.js test/ziwei-horoscope.test.js
git commit -m "feat: add Ziwei horoscope JSON overlays"
```

### Task 4: CLI integration, public documentation, and final verification

**Files:**
- Modify: `test/cli.test.js`
- Modify: `README.md`
- Create: `.gitignore`

**Interfaces:**
- Verifies the executable writes one valid natal or horoscope document.
- Documents `--ziwei-output horoscope` and the semantic difference between fixed natal positions and dynamic overlays.

- [ ] **Step 1: Write the failing end-to-end CLI test**

```js
test('writes a self-contained Ziwei horoscope document', () => {
  const result = spawnSync(process.execPath, [
    'bin/ziwei-json.js',
    '--system', 'ziwei',
    '--ziwei-output', 'horoscope',
    '--date', '2000-08-16',
    '--time', '02:30',
    '--gender', 'female',
    '--latitude', '25.033',
    '--longitude', '121.5654',
    '--time-zone', 'Asia/Taipei',
    '--target-date', '2026-08-03',
    '--target-time', '14:30',
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0);
  const document = JSON.parse(result.stdout);
  assert.equal(document.chart.palaces.length, 12);
  assert.equal(document.horoscope.scopes.yearly.palace_names.length, 12);
  assert.equal(result.stderr, '');
});
```

- [ ] **Step 2: Run the CLI test and verify RED before completing integration**

Run: `node --test test/cli.test.js`

Expected: FAIL until Tasks 2 and 3 provide the requested output.

- [ ] **Step 3: Document the complete public contract and ignore local artifacts**

Update the README title and introduction to describe both systems and AI-ready
JSON. Add a horoscope example, document all six scopes, explain that natal
stars remain fixed under overlays, and document `ziwei_addon` sections.

Create `.gitignore` covering dependencies, generated output directories and
local JSON exports. Permit only package metadata and reviewed synthetic
reference fixtures; do not name individual people's files in public docs.

- [ ] **Step 4: Run final automated and manual verification**

Run:

```sh
npm test
node bin/ziwei-json.js --system ziwei --date 2000-08-16 --time 02:30 --gender female --latitude 25.033 --longitude 121.5654 --time-zone Asia/Taipei > /tmp/ziwei-natal.json
node bin/ziwei-json.js --system ziwei --ziwei-output horoscope --date 2000-08-16 --time 02:30 --gender female --latitude 25.033 --longitude 121.5654 --time-zone Asia/Taipei --target-date 2026-08-03 --target-time 14:30 > /tmp/ziwei-horoscope.json
node -e "const fs=require('fs'); for (const file of ['/tmp/ziwei-natal.json','/tmp/ziwei-horoscope.json']) JSON.parse(fs.readFileSync(file));"
```

Expected: the complete test suite passes, both commands exit zero, both files
parse as JSON, natal has `ziwei_addon` and no `horoscope`, and horoscope has
both.

- [ ] **Step 5: Commit documentation and integration verification**

```sh
git add .gitignore README.md test/cli.test.js docs/superpowers/specs/2026-08-03-ziwei-derived-and-horoscope-design.md docs/superpowers/plans/2026-08-03-ziwei-derived-and-horoscope.md
git commit -m "docs: describe AI-ready Ziwei horoscope output"
```

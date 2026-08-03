# Bazi System Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `--system` CLI selector that emits either the existing Zi Wei document or a standalone, structured Bazi JSON document.

**Architecture:** Move the existing Zi Wei adapter into its own lazy-loaded module. The CLI parser selects a system and dispatches to either the Zi Wei adapter or a new Bazi adapter; Bazi imports only `lunar-typescript`, reusing the existing apparent-solar-time correction. Each selected system returns an independent five-field JSON document.

**Tech Stack:** Node.js built-in `node:test`, CommonJS, `iztro` 2.5.8, and direct `lunar-typescript` 1.8.6.

## Global Constraints

- `--system ziwei` is the default and must preserve the existing Zi Wei JSON document.
- `--system bazi` emits Bazi JSON only: it contains no Zi Wei `chart` data and does not load or call `iztro`.
- There is no `both` system.
- Both systems require local Gregorian date/time, coordinates, and an IANA time zone; Bazi does not require gender.
- Bazi reuses the apparent-solar-time correction and records `lunar-typescript` day-boundary convention `sect: 2`.
- Bazi output contains natal data only: no prose, luck cycles, or transit data.
- JSON keys are English; Bazi values are traditional Chinese.
- Do not stage, commit, or otherwise operate on Git because `/Users/jason` is the unrelated Git root.

---

## File Structure

- `src/ziwei.js` — existing Zi Wei `iztro` adapter, extracted without behavior changes.
- `src/bazi.js` — Bazi-only `lunar-typescript` adapter and pillar normalization.
- `src/chart.js` — shared flag parsing and lazy dispatch by `input.system`.
- `test/chart.test.js` — existing Zi Wei compatibility and selector validation tests.
- `test/bazi.test.js` — standalone Bazi schema and known-pillar tests.
- `test/cli.test.js` — Bazi CLI stdout/stderr test.
- `package.json` and `package-lock.json` — declare `lunar-typescript` 1.8.6 as a direct dependency.
- `README.md` — document `--system bazi` and that it writes a separate document.

### Task 1: Add Bazi-only output and the system selector

**Files:**
- Create: `src/ziwei.js`
- Create: `src/bazi.js`
- Modify: `src/chart.js`
- Modify: `test/chart.test.js`
- Create: `test/bazi.test.js`
- Modify: `test/cli.test.js`

**Interfaces:**
- Produces `generateZiweiChart(input)` in `src/ziwei.js`; it returns the pre-existing Zi Wei document.
- Produces `generateBaziChart(input)` in `src/bazi.js`; it returns `{ schema_version, source, input, time_correction, bazi }`.
- Updates `parseBirthInput(argv)` to return `system: 'ziwei' | 'bazi'`.
- Updates `generateChart(input)` to lazy-load the selected adapter only.

- [x] **Step 1: Write failing selector and Bazi schema tests**

  Append these tests to `test/chart.test.js`:

  ```js
  test('defaults to Zi Wei and requires gender only for Zi Wei', () => {
    const ziwei = parseBirthInput(flags);
    assert.equal(ziwei.system, 'ziwei');
    assert.throws(() => parseBirthInput(flags.filter((value) => value !== '--gender' && value !== 'female')), /gender/);
  });

  test('accepts Bazi without gender and rejects an unsupported system', () => {
    const baziFlags = [...flags.filter((value) => value !== '--gender' && value !== 'female'), '--system', 'bazi'];
    assert.equal(parseBirthInput(baziFlags).system, 'bazi');
    assert.throws(() => parseBirthInput([...flags, '--system', 'both']), /system/);
  });
  ```

  Create `test/bazi.test.js`:

  ```js
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const { generateChart, parseBirthInput } = require('../src/chart');

  const flags = [
    '--system', 'bazi', '--date', '2000-08-16', '--time', '02:30',
    '--latitude', '25.033', '--longitude', '121.5654', '--time-zone', 'Asia/Taipei',
  ];

  test('generates a standalone Bazi document from apparent solar time', () => {
    const document = generateChart(parseBirthInput(flags));
    assert.deepEqual(Object.keys(document).sort(), ['bazi', 'input', 'schema_version', 'source', 'time_correction']);
    assert.equal(document.source.package, 'lunar-typescript');
    assert.equal(document.source.day_boundary_sect, 2);
    assert.equal(document.chart, undefined);
    assert.equal(document.input.gender, undefined);
    assert.equal(document.bazi.pillars.year.combined, '庚辰');
    assert.equal(document.bazi.pillars.day.stem, '丙');
    assert.deepEqual(document.bazi.pillars.day.hidden_stems, ['丁', '己']);
    assert.equal(document.bazi.pillars.hour.combined, '己丑');
    assert.equal(document.bazi.auxiliary.tai_yuan.value.length, 2);
  });
  ```

  Append this test to `test/cli.test.js`:

  ```js
  test('writes a standalone Bazi document without gender', () => {
    const result = spawnSync(process.execPath, [
      'bin/ziwei-json.js', '--system', 'bazi', '--date', '2000-08-16', '--time', '02:30',
      '--latitude', '25.033', '--longitude', '121.5654', '--time-zone', 'Asia/Taipei',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const document = JSON.parse(result.stdout);
    assert.equal(document.bazi.pillars.month.combined, '甲申');
    assert.equal(document.chart, undefined);
    assert.equal(result.stderr, '');
  });
  ```

- [x] **Step 2: Run the new tests to verify they fail**

  Run: `npm test -- test/chart.test.js test/bazi.test.js test/cli.test.js`

  Expected: Bazi unit and CLI tests fail because `--system` is an unknown flag; current Zi Wei tests continue to pass.

- [x] **Step 3: Extract Zi Wei and implement the Bazi adapter**

  Move the existing `normalizeStar`, `normalizePalace`, and `iztro`-based body of `generateChart` from `src/chart.js` to `src/ziwei.js`, exported as `generateZiweiChart`. Its returned object must be byte-for-byte equivalent in structure to the existing output.

  Create `src/bazi.js` with this complete adapter shape:

  ```js
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
      combined: get(''), stem: get('Gan'), branch: get('Zhi'),
      hidden_stems: get('HideGan'), five_elements: get('WuXing'), na_yin: get('NaYin'),
      stem_ten_god: get('ShiShenGan'), branch_ten_gods: get('ShiShenZhi'),
      chang_sheng: get('DiShi'), xun: get('Xun'), xun_kong: get('XunKong'),
    };
  }

  function auxiliary(eightChar, name, naYinName) {
    return { value: eightChar[name](), na_yin: eightChar[naYinName]() };
  }

  function generateBaziChart(input) {
    const correction = correctBirthTime(input);
    const parts = toParts(correction.apparentDate, correction.apparentTime);
    const eightChar = Solar.fromYmdHms(parts.year, parts.month, parts.day, parts.hour, parts.minute, 0)
      .getLunar().getEightChar();
    return {
      schema_version: '1.0.0',
      source: { package: 'lunar-typescript', version: '1.8.6', day_boundary_sect: eightChar.getSect() },
      input: { date: input.date, time: input.time, latitude: input.latitude,
        longitude: input.longitude, time_zone: input.timeZone,
        ...(input.gender ? { gender: input.gender } : {}) },
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
        pillars: { year: normalizePillar(eightChar, 'getYear'), month: normalizePillar(eightChar, 'getMonth'),
          day: normalizePillar(eightChar, 'getDay'), hour: normalizePillar(eightChar, 'getTime') },
        auxiliary: { tai_yuan: auxiliary(eightChar, 'getTaiYuan', 'getTaiYuanNaYin'),
          tai_xi: auxiliary(eightChar, 'getTaiXi', 'getTaiXiNaYin'),
          ming_gong: auxiliary(eightChar, 'getMingGong', 'getMingGongNaYin'),
          shen_gong: auxiliary(eightChar, 'getShenGong', 'getShenGongNaYin') },
      },
    };
  }

  module.exports = { generateBaziChart };
  ```

  In `src/chart.js`, add `--system` to the accepted flags, initialize missing `--system` to `ziwei`, conditionally require gender only for Zi Wei, and replace the old adapter body with:

  ```js
  function generateChart(input) {
    if (input.system === 'bazi') return require('./bazi').generateBaziChart(input);
    return require('./ziwei').generateZiweiChart(input);
  }
  ```

- [x] **Step 4: Run focused tests to verify selector behavior and Bazi data**

  Run: `npm test -- test/chart.test.js test/bazi.test.js test/cli.test.js`

  Expected: all focused tests pass; Bazi document contains no `chart` key and default Zi Wei tests remain green.

- [x] **Step 5: Run the whole suite**

  Run: `npm test`

  Expected: all original and Bazi tests pass.

### Task 2: Declare the dependency, cover the CLI, and document Bazi mode

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`

**Interfaces:**
- Consumes `bin/ziwei-json.js` unchanged; it calls the selector through existing `parseBirthInput` and `generateChart` imports.
- Produces `node bin/ziwei-json.js --system bazi [flags]` with one standalone Bazi JSON document on stdout.

- [x] **Step 1: Add direct dependency and documentation**

  Run `npm install lunar-typescript@1.8.6 --save` to update `package.json` and `package-lock.json` while preserving the locked version already installed.

  Add a Bazi section to `README.md`:

  ```sh
  node bin/ziwei-json.js --system bazi \
    --date 2000-08-16 --time 02:30 \
    --latitude 25.033 --longitude 121.5654 --time-zone Asia/Taipei \
    > bazi.json
  ```

  State that `--system ziwei` is the default and requires `--gender`, while Bazi is a separate document and does not require gender. List Bazi's four pillars, their elemental/ten-god metadata, the day-boundary convention, and its four auxiliary values.

- [x] **Step 2: Run the Bazi CLI test and direct command smoke test**

  Run: `npm test -- test/cli.test.js`

  Run: `node bin/ziwei-json.js --system bazi --date 2000-08-16 --time 02:30 --latitude 25.033 --longitude 121.5654 --time-zone Asia/Taipei >/tmp/bazi-smoke.json`

  Run: `node -e "const value=require('/tmp/bazi-smoke.json'); if (!value.bazi || value.chart || Object.keys(value).length !== 5) process.exit(1); console.log('valid standalone Bazi JSON')"`

  Expected: all CLI tests pass and the smoke check prints `valid standalone Bazi JSON`.

- [x] **Step 3: Run final verification**

  Run: `npm test`

  Expected: all tests pass and the documented Zi Wei default remains intact.

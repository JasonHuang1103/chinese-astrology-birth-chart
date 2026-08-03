# Ziwei JSON Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js CLI that converts recorded local birth details into auditable, AI-readable Zi Wei Dou Shu natal-chart JSON.

**Architecture:** A small CommonJS library parses and validates CLI input, resolves the entered local civil time in its IANA zone, and applies an equation-of-time plus longitude correction. A second adapter passes the corrected civil date and Chinese-hour index to `iztro`, then copies only data fields into a stable JSON schema. The CLI writes that document to stdout and errors to stderr.

**Tech Stack:** Node.js built-in `node:test`, Node.js `Intl`, CommonJS, and installed `iztro` 2.5.8.

## Global Constraints

- First version supports Zi Wei Dou Shu only; no Bazi, lunar input, UI/chart rendering, transits, or interpretive prose.
- Input must require local Gregorian `--date` and `--time`, `--gender male|female`, numeric `--latitude` and `--longitude`, and IANA `--time-zone`.
- No network or city/country geocoding; latitude is provenance only, while longitude and zone offset determine the apparent-solar-time correction.
- Use `zh-TW` output from `iztro`; retain English JSON keys and traditional-Chinese values.
- JSON is written to stdout only; validation failures are actionable messages on stderr and exit nonzero.
- Do not commit from this project: its Git root is `/Users/jason`, an unrelated uncommitted home-directory repository.

---

## File Structure

- `src/time.js` — validates local date/time fields, resolves IANA-zone offset, calculates apparent-solar time, and maps it to `iztro`'s 0–12 Chinese-hour index.
- `src/chart.js` — validates CLI arguments, calls `iztro.astro.bySolar`, and converts chart/palace/star objects into plain JSON data.
- `bin/ziwei-json.js` — reads CLI flags, emits JSON, and presents errors without stack traces.
- `test/time.test.js` — unit tests for correction math, date rollover, and Chinese-hour boundaries.
- `test/chart.test.js` — unit tests for input validation and plain-JSON normalized chart shape.
- `test/cli.test.js` — end-to-end subprocess tests for stdout JSON and stderr failures.
- `README.md` — installation, a complete command example, and a concise output-schema explanation.
- `package.json` — `chart` and Node test scripts plus a `bin` entry.

### Task 1: Build and verify time-correction primitives

**Files:**
- Create: `src/time.js`
- Create: `test/time.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces `correctBirthTime({ date, time, longitude, timeZone })`, returning `{ apparentDate, apparentTime, offsetMinutes, equationOfTimeMinutes, longitudeCorrectionMinutes, totalCorrectionMinutes, timeIndex }`.
- Produces `chineseHourIndex(hour, minute)`, returning 0 for 00:00–00:59, 1–11 for the intervening two-hour ranges, and 12 for 23:00–23:59.

- [x] **Step 1: Replace the placeholder test script and write failing time tests**

  Update `package.json` scripts to:

  ```json
  {
    "test": "node --test",
    "chart": "node bin/ziwei-json.js"
  }
  ```

  Create `test/time.test.js` containing, at minimum:

  ```js
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const { chineseHourIndex, correctBirthTime } = require('../src/time');

  test('maps corrected time to iztro Chinese-hour indices', () => {
    assert.equal(chineseHourIndex(0, 0), 0);
    assert.equal(chineseHourIndex(1, 0), 1);
    assert.equal(chineseHourIndex(22, 59), 11);
    assert.equal(chineseHourIndex(23, 0), 12);
  });

  test('applies the longitude correction relative to the zone meridian', () => {
    const result = correctBirthTime({
      date: '2000-06-21', time: '12:00', longitude: 121.5654, timeZone: 'Asia/Taipei',
    });
    assert.equal(result.offsetMinutes, 480);
    assert.ok(result.longitudeCorrectionMinutes > 6);
    assert.ok(result.longitudeCorrectionMinutes < 7);
    assert.match(result.apparentTime, /^\d{2}:\d{2}$/);
  });

  test('carries apparent solar time across a calendar boundary', () => {
    const result = correctBirthTime({
      date: '2000-01-01', time: '00:02', longitude: -179, timeZone: 'Etc/GMT-12',
    });
    assert.equal(result.apparentDate, '1999-12-31');
  });
  ```

- [x] **Step 2: Run the tests to verify they fail for missing production code**

  Run: `npm test -- test/time.test.js`

  Expected: failure stating that `../src/time` cannot be found.

- [x] **Step 3: Implement the smallest complete time module**

  Create `src/time.js` with these functions:

  ```js
  const MINUTE = 60 * 1000;

  function parseDate(date) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match) throw new Error('--date must use YYYY-MM-DD');
    const [year, month, day] = match.slice(1).map(Number);
    const instant = new Date(Date.UTC(year, month - 1, day));
    if (instant.getUTCFullYear() !== year || instant.getUTCMonth() !== month - 1 || instant.getUTCDate() !== day) {
      throw new Error('--date must be a real Gregorian date');
    }
    return { year, month, day };
  }

  function parseTime(time) {
    const match = /^(\d{2}):(\d{2})$/.exec(time);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw new Error('--time must use HH:mm');
    return { hour: Number(match[1]), minute: Number(match[2]) };
  }

  function equationOfTimeMinutes(date) {
    const { year } = parseDate(date);
    const start = Date.UTC(year, 0, 1);
    const dayOfYear = Math.floor((Date.parse(`${date}T00:00:00Z`) - start) / 86400000) + 1;
    const b = (2 * Math.PI * (dayOfYear - 81)) / 364;
    return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  }

  function getOffsetMinutes(date, time, timeZone) {
    const { year, month, day } = parseDate(date);
    const { hour, minute } = parseTime(time);
    let parts;
    try {
      parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
        .formatToParts(new Date(Date.UTC(year, month - 1, day, hour, minute)));
    } catch {
      throw new Error('--time-zone must be a valid IANA zone');
    }
    const zoneName = parts.find((part) => part.type === 'timeZoneName')?.value;
    if (zoneName === 'GMT') return 0;
    const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(zoneName || '');
    if (!match) throw new Error('--time-zone must provide a numeric UTC offset');
    const offset = Number(match[2]) * 60 + Number(match[3]);
    return match[1] === '+' ? offset : -offset;
  }

  function chineseHourIndex(hour) {
    if (hour === 23) return 12;
    return hour === 0 ? 0 : Math.floor((hour + 1) / 2);
  }

  function correctBirthTime({ date, time, longitude, timeZone }) {
    const { year, month, day } = parseDate(date);
    const { hour, minute } = parseTime(time);
    const offsetMinutes = getOffsetMinutes(date, time, timeZone);
    const equation = equationOfTimeMinutes(date);
    const longitudeCorrection = 4 * (longitude - offsetMinutes / 4);
    const total = equation + longitudeCorrection;
    const apparent = new Date(Date.UTC(year, month - 1, day, hour, minute) + total * MINUTE);
    const apparentDate = apparent.toISOString().slice(0, 10);
    const apparentTime = apparent.toISOString().slice(11, 16);
    return { apparentDate, apparentTime, offsetMinutes,
      equationOfTimeMinutes: Number(equation.toFixed(3)),
      longitudeCorrectionMinutes: Number(longitudeCorrection.toFixed(3)),
      totalCorrectionMinutes: Number(total.toFixed(3)),
      timeIndex: chineseHourIndex(apparent.getUTCHours()) };
  }

  module.exports = { chineseHourIndex, correctBirthTime, equationOfTimeMinutes };
  ```

  Use UTC date arithmetic for rollover so the host machine time zone never changes results. Round reported correction values to three decimal places, but use full precision until the final clock-minute conversion.

- [x] **Step 4: Run the focused tests to verify they pass**

  Run: `npm test -- test/time.test.js`

  Expected: all three tests pass.

- [x] **Step 5: Run the complete suite and record the project-local change**

  Run: `npm test && git -C /Users/jason/Desktop/my-ziwei-chart status --short`

  Expected: tests pass; do not stage or commit because Git resolves to the unrelated home repository.

### Task 2: Add parsed input and normalized `iztro` chart data

**Files:**
- Create: `src/chart.js`
- Create: `test/chart.test.js`

**Interfaces:**
- Consumes `correctBirthTime` from `src/time.js`.
- Produces `parseBirthInput(argv)`, returning `{ date, time, gender, latitude, longitude, timeZone }` or throwing an `Error` whose message names the invalid flag.
- Produces `generateChart(input)`, returning the versioned plain JSON document.

- [x] **Step 1: Write failing validation and normalization tests**

  Create `test/chart.test.js` containing:

  ```js
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const { parseBirthInput, generateChart } = require('../src/chart');

  const flags = [
    '--date', '2000-08-16', '--time', '02:30', '--gender', 'female',
    '--latitude', '25.033', '--longitude', '121.5654', '--time-zone', 'Asia/Taipei',
  ];

  test('rejects an invalid IANA time zone', () => {
    assert.throws(() => parseBirthInput([...flags.slice(0, -1), 'Moon/Base']), /time-zone/);
  });

  test('rejects out-of-range coordinates', () => {
    assert.throws(() => parseBirthInput(flags.map((value) => value === '25.033' ? '91' : value)), /latitude/);
  });

  test('normalizes an iztro chart into plain, AI-readable JSON', () => {
    const document = generateChart(parseBirthInput(flags));
    assert.equal(document.schema_version, '1.0.0');
    assert.equal(document.source.package, 'iztro');
    assert.equal(document.input.time_zone, 'Asia/Taipei');
    assert.equal(document.chart.palaces.length, 12);
    assert.deepEqual(Object.keys(document.chart.palaces[0].stars).sort(), ['adjective', 'major', 'minor']);
    assert.equal(JSON.stringify(document).includes('rawDates'), false);
  });
  ```

- [x] **Step 2: Run the tests to verify they fail for missing production code**

  Run: `npm test -- test/chart.test.js`

  Expected: failure stating that `../src/chart` cannot be found.

- [x] **Step 3: Implement input parsing and chart normalization**

  Create `src/chart.js` with these exported functions and document construction:

  ```js
  const { astro } = require('iztro');
  const { correctBirthTime } = require('./time');

  function parseBirthInput(argv) {
    const names = new Set(['--date', '--time', '--gender', '--latitude', '--longitude', '--time-zone']);
    const values = {};
    for (let index = 0; index < argv.length; index += 2) {
      const flag = argv[index];
      const value = argv[index + 1];
      if (!names.has(flag)) throw new Error(`unknown flag: ${flag}`);
      if (value === undefined || value.startsWith('--')) throw new Error(`${flag} requires a value`);
      if (values[flag] !== undefined) throw new Error(`${flag} may be supplied only once`);
      values[flag] = value;
    }
    for (const flag of names) if (values[flag] === undefined) throw new Error(`missing required flag: ${flag}`);
    if (!['male', 'female'].includes(values['--gender'])) throw new Error('--gender must be male or female');
    const latitude = Number(values['--latitude']);
    const longitude = Number(values['--longitude']);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error('--latitude must be between -90 and 90');
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error('--longitude must be between -180 and 180');
    try { new Intl.DateTimeFormat('en-US', { timeZone: values['--time-zone'] }); }
    catch { throw new Error('--time-zone must be a valid IANA zone'); }
    return { date: values['--date'], time: values['--time'], gender: values['--gender'],
      latitude, longitude, timeZone: values['--time-zone'] };
  }

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
      index: palace.index, name: palace.name,
      is_body_palace: palace.isBodyPalace,
      is_original_palace: palace.isOriginalPalace,
      heavenly_stem: palace.heavenlyStem,
      earthly_branch: palace.earthlyBranch,
      stars: {
        major: palace.majorStars.map(normalizeStar),
        minor: palace.minorStars.map(normalizeStar),
        adjective: palace.adjectiveStars.map(normalizeStar),
      },
      changsheng12: palace.changsheng12, boshi12: palace.boshi12,
      jiangqian12: palace.jiangqian12, suiqian12: palace.suiqian12,
      decadal: { range: palace.decadal.range,
        heavenly_stem: palace.decadal.heavenlyStem,
        earthly_branch: palace.decadal.earthlyBranch },
      ages: palace.ages,
    };
  }

  function generateChart(input) {
    const correction = correctBirthTime(input);
    const astrolabe = astro.bySolar(correction.apparentDate, correction.timeIndex,
      input.gender === 'male' ? '男' : '女', true, 'zh-TW');
    return {
      schema_version: '1.0.0',
      source: { package: 'iztro', version: '2.5.8', language: 'zh-TW' },
      input: { date: input.date, time: input.time, gender: input.gender,
        latitude: input.latitude, longitude: input.longitude, time_zone: input.timeZone },
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
        gender: astrolabe.gender, solar_date: astrolabe.solarDate,
        lunar_date: astrolabe.lunarDate, chinese_date: astrolabe.chineseDate,
        time: astrolabe.time, time_range: astrolabe.timeRange,
        sign: astrolabe.sign, zodiac: astrolabe.zodiac,
        soul_palace_branch: astrolabe.earthlyBranchOfSoulPalace,
        body_palace_branch: astrolabe.earthlyBranchOfBodyPalace,
        soul: astrolabe.soul, body: astrolabe.body,
        five_elements_class: astrolabe.fiveElementsClass,
        palaces: astrolabe.palaces.map(normalizePalace),
      },
    };
  }

  module.exports = { generateChart, parseBirthInput };
  ```

  Include every `Palace` data property from `iztro`'s published type: index, name, `is_body_palace`, `is_original_palace`, heavenly/earthly branches, grouped normalized stars, `changsheng12`, `boshi12`, `jiangqian12`, `suiqian12`, `decadal` (`range`, heavenly stem, earthly branch), and `ages`. Include chart-level gender, solar/lunar/chinese dates, time/time range, sign, zodiac, soul/body palace branches, soul/body, and five-elements class. Never serialize `rawDates`, methods, or `copyright`.

- [x] **Step 4: Run chart tests to verify they pass**

  Run: `npm test -- test/chart.test.js`

  Expected: all validation and normalized-shape tests pass.

- [x] **Step 5: Run all tests and inspect a generated document**

  Run: `npm test && node -e "const {generateChart,parseBirthInput}=require('./src/chart'); console.log(JSON.stringify(generateChart(parseBirthInput(['--date','2000-08-16','--time','02:30','--gender','female','--latitude','25.033','--longitude','121.5654','--time-zone','Asia/Taipei'])), null, 2))"`

  Expected: all tests pass and stdout is valid, readable JSON with no function properties.

### Task 3: Expose the JSON-only CLI and document it

**Files:**
- Create: `bin/ziwei-json.js`
- Create: `test/cli.test.js`
- Create: `README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes `parseBirthInput` and `generateChart` from `src/chart.js`.
- Produces the executable package command `npm run chart -- [flags]`.

- [x] **Step 1: Write failing CLI tests**

  Create `test/cli.test.js` using `node:child_process`:

  ```js
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const { spawnSync } = require('node:child_process');

  test('writes one JSON document to stdout', () => {
    const result = spawnSync(process.execPath, ['bin/ziwei-json.js',
      '--date', '2000-08-16', '--time', '02:30', '--gender', 'female',
      '--latitude', '25.033', '--longitude', '121.5654', '--time-zone', 'Asia/Taipei'],
      { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).chart.palaces.length, 12);
    assert.equal(result.stderr, '');
  });

  test('writes invalid input errors to stderr and exits nonzero', () => {
    const result = spawnSync(process.execPath, ['bin/ziwei-json.js', '--date', 'bad'], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /date/i);
    assert.equal(result.stdout, '');
  });
  ```

- [x] **Step 2: Run the tests to verify they fail**

  Run: `npm test -- test/cli.test.js`

  Expected: failure because `bin/ziwei-json.js` is missing.

- [x] **Step 3: Implement the command and package metadata**

  Create `bin/ziwei-json.js`:

  ```js
  #!/usr/bin/env node
  const { generateChart, parseBirthInput } = require('../src/chart');

  try {
    const document = generateChart(parseBirthInput(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exitCode = 1;
  }
  ```

  Add `"bin": { "ziwei-json": "bin/ziwei-json.js" }` to `package.json`. Write `README.md` with the one command above, redirection example `> chart.json`, required input meanings, the apparent-solar-time caveat, and a compact explanation of the five top-level JSON fields.

- [x] **Step 4: Run the CLI test and a command-line smoke test**

  Run: `npm test -- test/cli.test.js && npm run chart -- --date 2000-08-16 --time 02:30 --gender female --latitude 25.033 --longitude 121.5654 --time-zone Asia/Taipei >/tmp/ziwei-chart-smoke.json && node -e "JSON.parse(require('fs').readFileSync('/tmp/ziwei-chart-smoke.json', 'utf8')); console.log('valid JSON')"`

  Expected: CLI tests pass and the smoke test prints `valid JSON`.

- [x] **Step 5: Run final verification and inspect the focused diff**

  Run: `npm test && git -C /Users/jason/Desktop/my-ziwei-chart diff -- package.json src bin test README.md docs`

  Expected: full suite passes; diff is limited to the generator, tests, README, and approved design/plan documents.

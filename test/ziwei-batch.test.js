const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { astro } = require('iztro');

const birth = {
  system: 'ziwei', ziweiOutput: 'batch', date: '2000-08-16', time: '14:30',
  gender: 'female', latitude: 0, longitude: 120, timeZone: 'Asia/Taipei',
};

function batch(input = birth) {
  return require('../src/ziwei-batch').generateZiweiBatch(input);
}

function assertOnlyScope(snapshot, name) {
  assert.deepEqual(Object.keys(snapshot.scopes), [name]);
  assert.deepEqual(Object.keys(snapshot.scope_relations), [name]);
  assert.equal(snapshot.palace_overlays.length, 12);
  for (const palace of snapshot.palace_overlays) {
    assert.deepEqual(Object.keys(palace.scopes), [name]);
  }
  assert.equal(snapshot.scopes[name].palace_names.length, 12);
  for (const star of snapshot.scopes[name].dynamic_stars_by_palace.flat()) {
    assert.equal(star.scope, name);
  }
}

test('streams all twelve decadals and every year/month through nominal age 125 with valid references and hashes', () => {
  const paths = new Set();
  const references = [];
  const hashes = new Map();
  const samples = new Map();
  const wanted = new Set([
    '大限/12.json', '流年/2000.json', '流年/2005.json', '流年/2124.json',
    '流月/2025-06.json', '流月/2025-06-leap.json', '流月/2025-07.json',
  ]);
  let chartId;
  let manifest;
  let previousYearEnd;
  let previousMonthEnd;
  let years = 0;
  let months = 0;
  let decadals = 0;
  let segmentCount = 0;
  for (const item of batch({ ...birth, name: '测试甲' })) {
    const document = item.document;
    assert.ok(!paths.has(item.path), `duplicate path: ${item.path}`);
    paths.add(item.path);
    chartId ||= document.chart_id;
    assert.equal(document.chart_id, chartId);
    assert.equal(document.schema_version, '1.0.0');
    assert.equal(document.name, '测试甲');
    assert.ok(document.layer_id);
    assert.equal(document.period.interval, '[start,end)');
    if (item.path === 'manifest.json') {
      manifest = document;
      continue;
    }
    assert.match(item.path, /^(本命\/紫微|大限\/\d{2}|流年\/\d{4}|流月\/\d{4}-\d{2}(?:-leap)?)\.json$/);
    hashes.set(item.path, crypto.createHash('sha256')
      .update(`${JSON.stringify(document, null, 2)}\n`).digest('hex'));
    if (document.natal_ref) references.push([item.path, document.natal_ref]);
    if (document.decadal_ref) references.push([item.path, document.decadal_ref]);
    if (document.year_ref) references.push([item.path, document.year_ref]);
    if (wanted.has(item.path)) samples.set(item.path, document);
    if (document.layer === 'natal') continue;
    assert.ok(document.period.valid.start.utc < document.period.valid.end.utc);
    assert.ok(document.period.valid.start.utc >= '2000-08-16T06:30:00.000Z');
    if (document.layer === 'decadal') {
      decadals += 1;
      assertOnlyScope(document, 'decadal');
    } else if (document.layer === 'yearly') {
      years += 1;
      if (previousYearEnd) assert.equal(document.period.valid.start.utc, previousYearEnd);
      previousYearEnd = document.period.valid.end.utc;
      assertOnlyScope(document, 'yearly');
    } else if (document.layer === 'monthly') {
      months += 1;
      if (previousMonthEnd) assert.equal(document.period.valid.start.utc, previousMonthEnd);
      previousMonthEnd = document.period.valid.end.utc;
      let segmentEnd = document.period.valid.start.utc;
      for (const segment of document.segments) {
        segmentCount += 1;
        assert.equal(segment.period.valid.start.utc, segmentEnd);
        segmentEnd = segment.period.valid.end.utc;
        assertOnlyScope(segment, 'monthly');
        assert.equal(segment.target.date, segment.period.valid.start.date);
        assert.equal(segment.target.time, segment.period.valid.start.time);
      }
      assert.equal(segmentEnd, document.period.valid.end.utc);
    }
  }
  assert.ok(manifest);
  assert.equal(manifest.natal_ref, '本命/紫微.json');
  assert.equal(decadals, 12);
  assert.equal(years, 125);
  assert.ok(months > 1450);
  assert.ok(segmentCount > months);
  assert.equal(previousYearEnd, manifest.range.end.utc);
  assert.equal(previousMonthEnd, manifest.range.end.utc);
  assert.equal(manifest.range.start.utc, '2000-08-16T06:30:00.000Z');
  assert.equal(manifest.statistics.decadal, 12);
  assert.equal(manifest.statistics.yearly, years);
  assert.equal(manifest.statistics.monthly, months);
  assert.equal(manifest.statistics.monthly_segments, segmentCount);
  assert.equal(manifest.files.length, hashes.size);
  assert.equal(manifest.statistics.files, paths.size);
  for (const entry of manifest.files) {
    assert.equal(entry.sha256, hashes.get(entry.path));
    assert.ok(entry.period);
    if (entry.layer === 'monthly') {
      assert.equal(typeof entry.lunar_identity.lunar_year, 'number');
      assert.equal(typeof entry.lunar_identity.month_number, 'number');
      assert.equal(typeof entry.lunar_identity.is_leap, 'boolean');
    }
  }
  for (const [from, reference] of references) {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(from), reference));
    assert.ok(paths.has(resolved), `${from}: unresolved reference ${reference}`);
  }
  const last = samples.get('大限/12.json');
  assert.deepEqual(last.nominal_age_range, [116, 125]);
  assert.equal(samples.get('流年/2124.json').nominal_age, 125);
  assert.equal(samples.get('流年/2000.json').decadal_ref, null);
  assert.equal(samples.get('流年/2000.json').decadal_status, 'before_first_decadal');
  assert.equal(samples.get('流年/2005.json').decadal_ref, '../大限/01.json');
  const regular = samples.get('流月/2025-06.json');
  const leap = samples.get('流月/2025-06-leap.json');
  const next = samples.get('流月/2025-07.json');
  assert.equal(regular.period.natural.start.date, '2025-06-25');
  assert.equal(regular.period.natural.end.date, '2025-07-25');
  assert.equal(leap.is_leap, true);
  assert.equal(leap.segments.length, 2);
  assert.equal(leap.segments[0].period.natural.start.date, '2025-07-25');
  assert.equal(leap.segments[0].period.natural.end.date, '2025-08-09');
  assert.equal(leap.segments[1].period.natural.end.date, '2025-08-23');
  assert.deepEqual(regular.segments[0].scopes.monthly, leap.segments[0].scopes.monthly);
  assert.deepEqual(leap.segments[1].scopes.monthly, next.segments[0].scopes.monthly);
});

test('clips a birth in a leap month second half without exporting an earlier segment', () => {
  const input = { ...birth, date: '2025-08-10', time: '14:30' };
  let month;
  for (const item of batch(input)) {
    if (item.path === '流月/2025-06-leap.json') { month = item.document; break; }
  }
  assert.ok(month);
  assert.equal(month.segments.length, 1);
  assert.equal(month.period.natural.start.date, '2025-07-25');
  assert.equal(month.period.valid.start.utc, '2025-08-10T06:30:00.000Z');
  assert.equal(month.segments[0].period.natural.start.date, '2025-08-09');
  assert.equal(month.segments[0].period.valid.start.utc, '2025-08-10T06:30:00.000Z');
});

test('preserves the actual birth year age-zero fragment when apparent time crosses lunar New Year', () => {
  const input = { ...birth, date: '2000-02-04', time: '23:50', gender: 'male', longitude: 130 };
  let year;
  let month;
  for (const item of batch(input)) {
    if (item.path === '流年/1999.json') year = item.document;
    if (item.path === '流月/1999-12.json') { month = item.document; break; }
  }
  assert.ok(year && month);
  for (const document of [year, month]) {
    assert.equal(document.nominal_age, 0);
    assert.equal(document.decadal_ref, null);
    assert.equal(document.decadal_status, 'nominal_age_before_effective_birth_year');
    assert.equal(document.period.valid.start.utc, '2000-02-04T15:50:00.000Z');
    assert.equal(document.period.valid.end.utc, '2000-02-04T16:00:00.000Z');
  }
});

test('uses a stable chart identity independent of export and snapshot arguments', () => {
  const first = batch().next().value.document;
  const second = batch({ ...birth, outputDir: '/tmp/elsewhere', targetDate: '2026-01-01', targetTime: '00:30' })
    .next().value.document;
  const different = batch({ ...birth, time: '15:30' }).next().value.document;
  assert.match(first.chart_id, /^[a-f0-9]{64}$/);
  assert.equal(first.chart_id, second.chart_id);
  assert.notEqual(first.chart_id, different.chart_id);
});

test('rejects batch boundaries that do not follow the supported lunar-year conventions', () => {
  const original = JSON.parse(JSON.stringify(astro.getConfig()));
  try {
    for (const [key, value] of [['yearDivide', 'exact'], ['horoscopeDivide', 'exact'], ['ageDivide', 'birthday']]) {
      astro.config({ ...original, [key]: value });
      assert.throws(() => batch().next(), /batch.*normal|normal.*batch|unsupported.*(year|age|horoscope)/i);
    }
  } finally {
    astro.config(original);
  }
});

test('resolves a missing lunar-month midnight forward and a repeated midnight to its first instant', () => {
  const cases = [
    {
      input: { ...birth, date: '2009-10-17', time: '12:00', latitude: -23.55, longitude: -46.63, timeZone: 'America/Sao_Paulo' },
      file: '流月/2009-09.json', date: '2009-10-18', time: '01:00', utc: '2009-10-18T03:00:00.000Z',
    },
    {
      input: { ...birth, date: '2013-11-02', time: '12:00', latitude: 23.13, longitude: -82.36, timeZone: 'America/Havana' },
      file: '流月/2013-10.json', date: '2013-11-03', time: '00:00', utc: '2013-11-03T04:00:00.000Z',
    },
  ];
  for (const sample of cases) {
    let month;
    for (const item of batch(sample.input)) {
      if (item.path === sample.file) { month = item.document; break; }
    }
    assert.ok(month);
    assert.equal(month.period.natural.start.date, sample.date);
    assert.equal(month.period.natural.start.time, sample.time);
    assert.equal(month.period.natural.start.utc, sample.utc);
    assert.equal(month.segments[0].target.date, sample.date);
    assert.equal(month.segments[0].target.time, sample.time);
    assert.equal(month.segments[0].period.valid.start.utc, sample.utc);
  }
});

test('rejects a lifecycle whose final decadal would exceed the four-digit year range before yielding output', () => {
  assert.throws(() => batch({ ...birth, date: '9990-08-16' }).next(), /supported year range|exceeds.*year/i);
});

test('rejects an engine configuration change between generator yields before mixing rules', () => {
  const original = JSON.parse(JSON.stringify(astro.getConfig()));
  const generator = batch();
  assert.equal(generator.next().value.document.layer, 'natal');
  try {
    astro.config({ ...original, ageDivide: 'birthday' });
    assert.throws(() => generator.next(), /engine configuration changed/i);
    assert.equal(astro.getConfig().ageDivide, 'birthday');
  } finally {
    astro.config(original);
  }
});

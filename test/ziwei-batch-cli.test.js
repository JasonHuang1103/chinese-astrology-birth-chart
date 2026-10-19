const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseBirthInput } = require('../src/chart');

const birth = ['--date', '2000-08-16', '--time', '14:30', '--gender', 'female',
  '--latitude', '0', '--longitude', '120', '--time-zone', 'Asia/Taipei'];

test('requires a batch directory and keeps batch flags separate from snapshots and Bazi', () => {
  const parsed = parseBirthInput([...birth, '--ziwei-output', 'batch', '--output-dir', '/tmp/new-batch']);
  assert.equal(parsed.ziweiOutput, 'batch');
  assert.equal(parsed.outputDir, '/tmp/new-batch');
  for (const flags of [
    [...birth, '--ziwei-output', 'batch'],
    [...birth, '--output-dir', '/tmp/new-batch'],
    [...birth, '--ziwei-output', 'batch', '--output-dir', '/tmp/new-batch', '--target-date', '2026-01-01'],
    [...birth, '--system', 'bazi', '--ziwei-output', 'batch', '--output-dir', '/tmp/new-batch'],
  ]) assert.throws(() => parseBirthInput(flags), /batch|output-dir|target-date|Ziwei/);
});

test('exports a real complete batch and writes exactly one JSON result to stdout', () => {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ziwei-batch-cli-')));
  const output = path.join(parent, 'output', '测试命盘');
  try {
    const result = spawnSync(process.execPath, [path.resolve(__dirname, '../bin/ziwei-json.js'), ...birth,
      '--ziwei-output', 'batch', '--name', '测试命盘'], { cwd: parent, encoding: 'utf8', timeout: 60000 });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.output_directory, output);
    assert.equal(summary.name, '测试命盘');
    assert.equal(summary.manifest, 'manifest.json');
    assert.equal(summary.statistics.decadal, 12);
    assert.equal(summary.statistics.yearly, 125);
    assert.ok(summary.statistics.monthly > 1500);
    const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8'));
    assert.equal(manifest.name, '测试命盘');
    assert.equal(manifest.chart_id, summary.chart_id);
    assert.equal(manifest.files.length + 1, summary.statistics.files);
    const last = JSON.parse(fs.readFileSync(path.join(output, '大限/12.json'), 'utf8'));
    assert.deepEqual(last.nominal_age_range, [116, 125]);
    assert.equal(last.chart_id, summary.chart_id);
    const leap = JSON.parse(fs.readFileSync(path.join(output, '流月/2025-06-leap.json'), 'utf8'));
    assert.equal(leap.segments.length, 2);
    assert.equal(leap.year_ref, '../流年/2025.json');
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('fails without stdout or replacing an existing export directory', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ziwei-batch-cli-existing-'));
  const marker = path.join(parent, 'keep.txt');
  try {
    fs.writeFileSync(marker, 'existing');
    const result = spawnSync(process.execPath, ['bin/ziwei-json.js', ...birth,
      '--ziwei-output', 'batch', '--output-dir', parent], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /exist/i);
    assert.equal(result.stdout, '');
    assert.deepEqual(fs.readdirSync(parent), ['keep.txt']);
    assert.equal(fs.readFileSync(marker, 'utf8'), 'existing');
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

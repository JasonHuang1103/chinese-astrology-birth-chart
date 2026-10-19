const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { astro } = require('iztro');

const birth = {
  system: 'ziwei', ziweiOutput: 'batch', date: '2000-08-16', time: '14:30',
  gender: 'female', latitude: 0, longitude: 120, timeZone: 'Asia/Taipei',
};

function temporaryParent(t) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ziwei-writer-test-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  return parent;
}

function write(input) {
  return require('../src/ziwei-batch-writer').writeZiweiBatch(input);
}

test('writes a complete real batch with matching hashes, resolved references and a compact result', (t) => {
  const parent = temporaryParent(t);
  const outputDir = path.join(parent, 'chart');
  const result = write({ ...birth, outputDir });
  const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, 'manifest.json'), 'utf8'));
  assert.deepEqual(result, {
    schema_version: '1.0.0', chart_id: manifest.chart_id,
    output_directory: outputDir, manifest: 'manifest.json',
    statistics: manifest.statistics, range: manifest.range,
  });
  assert.equal(manifest.statistics.natal, 1);
  assert.equal(manifest.statistics.decadal, 12);
  assert.equal(manifest.statistics.yearly, 125);
  assert.ok(manifest.statistics.monthly > 1500);
  assert.equal(manifest.statistics.files, manifest.files.length + 1);
  assert.equal(fs.readdirSync(outputDir, { recursive: true }).filter((name) => name.endsWith('.json')).length,
    manifest.statistics.files);
  assert.equal(fs.statSync(outputDir).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(outputDir, 'manifest.json')).mode & 0o777, 0o600);
  const chartIds = new Map([['manifest.json', manifest.chart_id]]);
  const references = [];
  for (const entry of manifest.files) {
    const filename = path.join(outputDir, entry.path);
    const bytes = fs.readFileSync(filename);
    const document = JSON.parse(bytes);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    assert.equal(bytes.toString(), `${JSON.stringify(document, null, 2)}\n`);
    assert.equal(document.chart_id, manifest.chart_id);
    assert.equal(fs.statSync(filename).mode & 0o777, 0o600);
    chartIds.set(entry.path, document.chart_id);
    for (const key of ['natal_ref', 'year_ref', 'decadal_ref']) {
      if (document[key]) references.push([entry.path, document[key]]);
    }
  }
  for (const [filename, reference] of references) {
    assert.equal(path.posix.isAbsolute(reference), false);
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(filename), reference));
    assert.equal(chartIds.get(resolved), manifest.chart_id);
  }
  assert.deepEqual(fs.readdirSync(parent), ['chart']);
});

test('rejects existing empty directories, contents, files and symlinks without changing them', (t) => {
  const parent = temporaryParent(t);
  const empty = path.join(parent, 'empty');
  const populated = path.join(parent, 'populated');
  const file = path.join(parent, 'file');
  const link = path.join(parent, 'link');
  const dangling = path.join(parent, 'dangling');
  fs.mkdirSync(empty);
  fs.mkdirSync(populated);
  fs.writeFileSync(path.join(populated, 'keep.txt'), 'keep this');
  fs.writeFileSync(file, 'keep file');
  fs.symlinkSync(populated, link);
  fs.symlinkSync(path.join(parent, 'missing'), dangling);
  const before = fs.readdirSync(parent).sort();
  for (const outputDir of [empty, populated, file, link, dangling]) {
    assert.throws(() => write({ ...birth, outputDir }), /exist|overwrite/i);
  }
  assert.deepEqual(fs.readdirSync(parent).sort(), before);
  assert.deepEqual(fs.readdirSync(empty), []);
  assert.equal(fs.readFileSync(path.join(populated, 'keep.txt'), 'utf8'), 'keep this');
  assert.equal(fs.readFileSync(file, 'utf8'), 'keep file');
  assert.equal(fs.readlinkSync(link), populated);
  assert.equal(fs.readlinkSync(dangling), path.join(parent, 'missing'));
});

test('requires an existing parent and leaves missing parents uncreated', (t) => {
  const parent = temporaryParent(t);
  assert.throws(() => write({ ...birth, outputDir: path.join(parent, 'missing', 'chart') }), /parent|ENOENT/i);
  assert.deepEqual(fs.readdirSync(parent), []);
});

test('cleans only its staging directory after a real generator error following the natal write', (t) => {
  const parent = temporaryParent(t);
  const outputDir = path.join(parent, 'chart');
  const originalConfig = JSON.parse(JSON.stringify(astro.getConfig()));
  const originalWrite = fs.writeFileSync;
  let natalWritten = false;
  t.mock.method(fs, 'writeFileSync', (filename, ...args) => {
    originalWrite(filename, ...args);
    if (path.basename(filename) === '紫微.json') {
      natalWritten = fs.existsSync(filename);
      astro.config({ ...originalConfig, ageDivide: 'birthday' });
    }
  });
  try {
    assert.throws(() => write({ ...birth, outputDir }), /configuration changed/i);
  } finally {
    astro.config(originalConfig);
  }
  assert.equal(natalWritten, true);
  assert.deepEqual(fs.readdirSync(parent), []);
});

test('preserves a directory created by a competitor at the final publication step', (t) => {
  const parent = temporaryParent(t);
  const outputDir = path.join(parent, 'chart');
  const originalMkdir = fs.mkdirSync;
  let raced = false;
  let competingInode;
  t.mock.method(fs, 'mkdirSync', (filename, ...args) => {
    if (path.resolve(filename) === outputDir && !raced) {
      raced = true;
      originalMkdir(outputDir);
      competingInode = fs.statSync(outputDir).ino;
    }
    return originalMkdir(filename, ...args);
  });
  assert.throws(() => write({ ...birth, outputDir }), /exist|EEXIST/i);
  assert.equal(raced, true);
  assert.deepEqual(fs.readdirSync(parent), ['chart']);
  assert.deepEqual(fs.readdirSync(outputDir), []);
  assert.equal(fs.statSync(outputDir).ino, competingInode);
});

test('rejects damaged on-disk bytes against the real manifest and removes staging', (t) => {
  const parent = temporaryParent(t);
  const outputDir = path.join(parent, 'chart');
  const originalWrite = fs.writeFileSync;
  t.mock.method(fs, 'writeFileSync', (filename, bytes, ...args) => {
    originalWrite(filename, path.basename(filename) === '紫微.json' ? `${bytes} ` : bytes, ...args);
  });
  assert.throws(() => write({ ...birth, outputDir }), /sha256.*紫微\.json/i);
  assert.deepEqual(fs.readdirSync(parent), []);
});

test('preserves a competing file during publication and leaves the incomplete target without a manifest', (t) => {
  const parent = temporaryParent(t);
  const outputDir = path.join(parent, 'chart');
  const competingFile = path.join(outputDir, '大限', '01.json');
  const originalLink = fs.linkSync;
  t.mock.method(fs, 'linkSync', (source, destination) => {
    if (destination === competingFile) fs.writeFileSync(destination, 'competing file');
    return originalLink(source, destination);
  });
  assert.throws(() => write({ ...birth, outputDir }), /EEXIST|exist/i);
  assert.deepEqual(fs.readdirSync(parent), ['chart']);
  assert.equal(fs.readFileSync(competingFile, 'utf8'), 'competing file');
  assert.equal(JSON.parse(fs.readFileSync(path.join(outputDir, '本命/紫微.json'), 'utf8')).layer, 'natal');
  assert.equal(fs.existsSync(path.join(outputDir, 'manifest.json')), false);
});

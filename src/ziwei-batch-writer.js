const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { generateZiweiBatch } = require('./ziwei-batch');
const { normalizeOutputName, resolveOutputDirectory } = require('./output-path');

function relativeFile(value) {
  if (typeof value !== 'string' || !value || /[\\\0:]/.test(value)
    || path.posix.isAbsolute(value) || path.posix.normalize(value) !== value
    || value.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`invalid batch relative file path: ${value}`);
  }
  return value;
}

function validateManifest(manifest, records, staging) {
  if (!manifest || manifest.layer !== 'manifest' || !Array.isArray(manifest.files)) {
    throw new Error('Ziwei batch must end with manifest.json');
  }
  const listed = new Set();
  for (const entry of manifest.files) {
    const filename = relativeFile(entry.path);
    if (filename === 'manifest.json' || listed.has(filename) || !records.has(filename)) {
      throw new Error(`manifest contains a duplicate or unknown batch file: ${filename}`);
    }
    listed.add(filename);
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(staging, filename))).digest('hex');
    if (hash !== entry.sha256) throw new Error(`manifest sha256 mismatch: ${filename}`);
  }
  if (listed.size !== records.size - 1 || manifest.statistics?.files !== records.size) {
    throw new Error('manifest file count does not match the written batch');
  }
  const layers = { natal_ref: 'natal', year_ref: 'yearly', decadal_ref: 'decadal' };
  for (const [filename, record] of records) {
    for (const [key, reference] of Object.entries(record.references)) {
      if (reference === null || reference === undefined) continue;
      if (typeof reference !== 'string' || !reference || /[\\\0:]/.test(reference)
        || path.posix.isAbsolute(reference)) {
        throw new Error(`invalid ${key} in ${filename}`);
      }
      const resolved = relativeFile(path.posix.join(path.posix.dirname(filename), reference));
      const target = records.get(resolved);
      if (!target || target.chartId !== record.chartId || target.layer !== layers[key]) {
        throw new Error(`unresolved or incompatible ${key} in ${filename}: ${reference}`);
      }
    }
  }
}

function writeZiweiBatch(input) {
  input = { ...input, ...(input.name === undefined ? {} : { name: normalizeOutputName(input.name) }) };
  const outputDirectory = resolveOutputDirectory(input);
  const parent = path.dirname(outputDirectory);
  if (input.outputDir === undefined) fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  if (!fs.statSync(parent).isDirectory()) throw new Error('batch output parent must be a directory');
  try {
    fs.lstatSync(outputDirectory);
    throw new Error(`batch output already exists; refusing to overwrite: ${outputDirectory}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const staging = fs.mkdtempSync(path.join(parent, '.ziwei-batch-'));
  const records = new Map();
  let chartId;
  let manifest;
  try {
    fs.chmodSync(staging, 0o700);
    for (const item of generateZiweiBatch(input)) {
      if (manifest) throw new Error('batch yielded a document after manifest.json');
      const filename = relativeFile(item.path);
      const document = item.document;
      chartId ||= document.chart_id;
      if (!chartId || document.chart_id !== chartId) throw new Error(`batch chart_id mismatch: ${filename}`);
      if (records.has(filename)) throw new Error(`duplicate batch file: ${filename}`);
      const destination = path.join(staging, filename);
      fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
      fs.writeFileSync(destination, `${JSON.stringify(document, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      records.set(filename, {
        chartId: document.chart_id,
        layer: document.layer,
        references: { natal_ref: document.natal_ref, year_ref: document.year_ref, decadal_ref: document.decadal_ref },
      });
      if (filename === 'manifest.json') manifest = document;
    }
    validateManifest(manifest, records, staging);

    // mkdir is the final exclusive claim. Never rename over another directory.
    fs.mkdirSync(outputDirectory, { mode: 0o700 });
    const directories = new Set([outputDirectory]);
    for (const filename of [...records.keys()].filter((name) => name !== 'manifest.json').concat('manifest.json')) {
      let directory = outputDirectory;
      for (const part of path.posix.dirname(filename).split('/').filter((part) => part !== '.')) {
        directory = path.join(directory, part);
        if (!directories.has(directory)) {
          fs.mkdirSync(directory, { mode: 0o700 });
          directories.add(directory);
        }
      }
      // Hard links on the same filesystem fail if a destination appeared.
      // Staging cleanup removes the old links after publication, without copies.
      fs.linkSync(path.join(staging, filename), path.join(outputDirectory, filename));
    }
    return {
      schema_version: manifest.schema_version,
      chart_id: chartId,
      ...(input.name === undefined ? {} : { name: input.name }),
      output_directory: outputDirectory,
      manifest: 'manifest.json',
      statistics: manifest.statistics,
      range: manifest.range,
    };
  } finally {
    // Publication failures may leave an incomplete target without a manifest.
    // Only this invocation's private staging directory is ever removed.
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

module.exports = { writeZiweiBatch };

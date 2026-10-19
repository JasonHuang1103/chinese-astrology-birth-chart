const path = require('node:path');

function normalizeOutputName(value) {
  if (typeof value !== 'string') throw new Error('--name must be a single directory name');
  const name = value.trim();
  if (!name || name === '.' || name === '..' || /[/\\\u0000-\u001f\u007f]/.test(name)) {
    throw new Error('--name must be a nonempty single directory name');
  }
  return name;
}

function resolveOutputDirectory(input) {
  const name = input.name === undefined ? undefined : normalizeOutputName(input.name);
  if (input.outputDir !== undefined) {
    if (typeof input.outputDir !== 'string' || !input.outputDir.trim()) {
      throw new Error('Ziwei batch requires a valid output directory');
    }
    return path.resolve(input.outputDir);
  }
  if (!name) throw new Error('Ziwei batch requires --name or an output directory');
  return path.resolve('output', name);
}

module.exports = { normalizeOutputName, resolveOutputDirectory };

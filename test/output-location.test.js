const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { parseBirthInput } = require('../src/chart');

const birth = ['--date', '2000-08-16', '--time', '14:30', '--gender', 'female',
  '--latitude', '0', '--longitude', '120', '--time-zone', 'Asia/Taipei', '--ziwei-output', 'batch'];

test('accepts a named batch without an explicit output directory', () => {
  const input = parseBirthInput([...birth, '--name', ' 測試姓名 ']);
  assert.equal(input.name, '測試姓名');
  assert.equal(input.outputDir, undefined);
  const { resolveOutputDirectory } = require('../src/output-path');
  assert.equal(resolveOutputDirectory(input), path.resolve('output', '測試姓名'));
});

test('retains an explicit export directory override', () => {
  const { resolveOutputDirectory } = require('../src/output-path');
  const input = parseBirthInput([...birth, '--name', '測試姓名', '--output-dir', './custom-export']);
  assert.equal(resolveOutputDirectory(input), path.resolve('custom-export'));
});

test('rejects missing names and unsafe directory components before generation', () => {
  assert.throws(() => parseBirthInput(birth), /name|output-dir/);
  for (const name of ['..', '.', '../outside', 'one/two', 'one\\two', 'bad\nname', 'bad\u0000name']) {
    assert.throws(() => parseBirthInput([...birth, '--name', name]), /name/);
    const { resolveOutputDirectory } = require('../src/output-path');
    assert.throws(() => resolveOutputDirectory({ name }), /name/);
  }
});

test('does not silently apply a batch name to unrelated single-document modes', () => {
  const natal = birth.filter((value) => value !== '--ziwei-output' && value !== 'batch');
  assert.throws(() => parseBirthInput([...natal, '--name', '測試姓名']), /batch/);
});

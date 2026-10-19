const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { generateZiweiBatch } = require('../src/ziwei-batch');

const birth = {
  system: 'ziwei', ziweiOutput: 'batch', date: '2000-08-16', time: '14:30',
  gender: 'female', latitude: 0, longitude: 120, timeZone: 'Asia/Taipei',
};

test('exports named layers in Chinese directories with resolvable relative references', () => {
  const generator = generateZiweiBatch({ ...birth, name: '测试甲' });
  const natal = generator.next().value;
  assert.equal(natal.path, '本命/紫微.json');
  assert.equal(natal.document.natal_ref, null);
  const records = new Map([[natal.path, natal.document]]);
  for (const item of generator) {
    assert.equal(item.document.name, '测试甲');
    records.set(item.path, item.document);
    if (item.path === '流月/2005-01.json') break;
  }
  assert.equal(natal.document.name, '测试甲');
  assert.equal(records.get('大限/01.json').natal_ref, '../本命/紫微.json');
  assert.equal(records.get('流年/2005.json').decadal_ref, '../大限/01.json');
  assert.equal(records.get('流月/2005-01.json').year_ref, '../流年/2005.json');
  assert.equal(records.get('流月/2005-01.json').decadal_ref, '../大限/01.json');
  for (const [filename, document] of records) {
    assert.match(filename, /^(本命\/紫微|大限\/\d{2}|流年\/\d{4}|流月\/\d{4}-\d{2}(?:-leap)?)\.json$/);
    if (document.layer !== 'natal') assert.equal(document.natal_ref, '../本命/紫微.json');
    for (const key of ['natal_ref', 'year_ref', 'decadal_ref']) {
      if (!document[key]) continue;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(filename), document[key]));
      assert.ok(records.has(resolved), `${filename}: unresolved ${key}`);
    }
  }
});

test('records optional names without changing chart identity when the name or output directory changes', () => {
  const unnamed = generateZiweiBatch(birth).next().value.document;
  const named = generateZiweiBatch({ ...birth, name: '测试甲', outputDir: '/tmp/first' }).next().value.document;
  const renamed = generateZiweiBatch({ ...birth, name: '测试乙', outputDir: '/tmp/second' }).next().value.document;
  assert.equal(unnamed.name, null);
  assert.equal(named.name, '测试甲');
  assert.equal(renamed.name, '测试乙');
  assert.equal(unnamed.chart_id, named.chart_id);
  assert.equal(named.chart_id, renamed.chart_id);
});

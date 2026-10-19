const test = require('node:test');
const assert = require('node:assert/strict');
const { astro } = require('iztro');
const { createZiweiChart } = require('../src/ziwei');
const { generateZiweiBatch } = require('../src/ziwei-batch');
const { generateZiweiScopes } = require('../src/ziwei-horoscope');

const input = { date: '2000-08-16', time: '02:30', gender: 'female',
  latitude: 0, longitude: 120, timeZone: 'Asia/Taipei' };

function assertChineseScope(document) {
  const scope = document.scopes.decadal;
  assert.equal(scope.name, '大限');
  assert.equal(scope.palace_names[scope.index], '命宮');
  // First decadal 癸未: the adopted table gives 破巨陰貪.
  assert.deepEqual(scope.transformations.map((item) => item.star), ['破軍', '巨門', '太陰', '貪狼']);
  assert.ok(scope.transformations.every((item) => Number.isInteger(item.target_palace?.index)));
}

test('keeps streamed layers in Chinese after another caller changes the engine language', () => {
  const generator = generateZiweiBatch(input);
  assert.equal(generator.next().value.document.source.language, 'zh-TW');
  astro.bySolar('2000-01-01', 0, '女', true, 'en-US');
  assertChineseScope(generator.next().value.document);
});

test('normalizes the language of selected scope calculations on an existing astrolabe', () => {
  const { astrolabe } = createZiweiChart(input);
  astro.bySolar('2000-01-01', 0, '女', true, 'en-US');
  assertChineseScope(generateZiweiScopes(astrolabe, {
    ...input, targetDate: '2003-08-16', targetTime: '12:00',
  }, ['decadal']));
});

test('snapshots scalar birth inputs before yielding the first batch document', () => {
  const mutable = { ...input };
  const generator = generateZiweiBatch(mutable);
  const natal = generator.next().value.document;
  mutable.timeZone = 'UTC';
  const decadal = generator.next().value.document;
  assert.equal(decadal.chart_id, natal.chart_id);
  assert.equal(decadal.period.natural.start.time_zone, 'Asia/Taipei');
  assert.equal(decadal.target.time_zone, 'Asia/Taipei');
});

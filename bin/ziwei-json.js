#!/usr/bin/env node

const { generateChart, parseBirthInput } = require('../src/chart');

try {
  const input = parseBirthInput(process.argv.slice(2));
  const document = input.ziweiOutput === 'batch'
    ? require('../src/ziwei-batch-writer').writeZiweiBatch(input)
    : generateChart(input);
  process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
}

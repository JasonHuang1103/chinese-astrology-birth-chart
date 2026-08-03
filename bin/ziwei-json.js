#!/usr/bin/env node

const { generateChart, parseBirthInput } = require('../src/chart');

try {
  const document = generateChart(parseBirthInput(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
}

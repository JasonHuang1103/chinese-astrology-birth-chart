const { resolveCivilTime } = require('./time');
const { normalizeOutputName } = require('./output-path');

const REQUIRED_FLAGS = new Set([
  '--date',
  '--time',
  '--latitude',
  '--longitude',
  '--time-zone',
]);

const ALLOWED_FLAGS = new Set([
  ...REQUIRED_FLAGS,
  '--gender',
  '--system',
  '--ziwei-output',
  '--target-date',
  '--target-time',
  '--output-dir',
  '--name',
]);

function parseBirthInput(argv) {
  const values = {};

  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];

    if (!ALLOWED_FLAGS.has(flag)) {
      throw new Error(`unknown flag: ${flag}`);
    }
    if (value === undefined || value.startsWith('--') || value.trim() === '') {
      throw new Error(`${flag} requires a value`);
    }
    if (values[flag] !== undefined) {
      throw new Error(`${flag} may be supplied only once`);
    }

    values[flag] = value;
  }

  for (const flag of REQUIRED_FLAGS) {
    if (values[flag] === undefined) {
      throw new Error(`missing required flag: ${flag}`);
    }
  }

  const system = values['--system'] || 'ziwei';
  if (!['ziwei', 'bazi'].includes(system)) {
    throw new Error('--system must be ziwei or bazi');
  }

  const hasZiweiOutput = values['--ziwei-output'] !== undefined;
  const hasTargetDate = values['--target-date'] !== undefined;
  const hasTargetTime = values['--target-time'] !== undefined;
  const hasOutputDir = values['--output-dir'] !== undefined;
  const hasName = values['--name'] !== undefined;
  const name = hasName ? normalizeOutputName(values['--name']) : undefined;
  const ziweiOutput = values['--ziwei-output'] || 'natal';

  if (system === 'bazi' && (hasZiweiOutput || hasTargetDate || hasTargetTime || hasOutputDir || hasName)) {
    throw new Error('Ziwei output flags cannot be used with Bazi');
  }
  if (!['natal', 'horoscope', 'batch'].includes(ziweiOutput)) {
    throw new Error('--ziwei-output must be natal, horoscope, or batch');
  }
  if (ziweiOutput === 'horoscope' && (!hasTargetDate || !hasTargetTime)) {
    throw new Error('--ziwei-output horoscope requires --target-date and --target-time');
  }
  if (ziweiOutput !== 'horoscope' && (hasTargetDate || hasTargetTime)) {
    throw new Error('--target-date and --target-time require --ziwei-output horoscope');
  }
  if (ziweiOutput === 'batch' && !hasOutputDir && !hasName) {
    throw new Error('--ziwei-output batch requires --name or --output-dir');
  }
  if (ziweiOutput !== 'batch' && hasOutputDir) {
    throw new Error('--output-dir requires --ziwei-output batch');
  }
  if (ziweiOutput !== 'batch' && hasName) {
    throw new Error('--name requires --ziwei-output batch');
  }
  if (system === 'ziwei' && values['--gender'] === undefined) {
    throw new Error('missing required flag: --gender');
  }
  if (values['--gender'] !== undefined && !['male', 'female'].includes(values['--gender'])) {
    throw new Error('--gender must be male or female');
  }

  const latitude = Number(values['--latitude']);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('--latitude must be between -90 and 90');
  }

  const longitude = Number(values['--longitude']);
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('--longitude must be between -180 and 180');
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: values['--time-zone'] });
  } catch {
    throw new Error('--time-zone must be a valid IANA zone');
  }

  if (ziweiOutput === 'horoscope') {
    resolveCivilTime({
      date: values['--target-date'],
      time: values['--target-time'],
      timeZone: values['--time-zone'],
    });
  }

  return {
    date: values['--date'],
    time: values['--time'],
    system,
    ...(values['--gender'] ? { gender: values['--gender'] } : {}),
    latitude,
    longitude,
    timeZone: values['--time-zone'],
    ...(system === 'ziwei' ? { ziweiOutput } : {}),
    ...(hasTargetDate ? { targetDate: values['--target-date'] } : {}),
    ...(hasTargetTime ? { targetTime: values['--target-time'] } : {}),
    ...(hasOutputDir ? { outputDir: values['--output-dir'] } : {}),
    ...(hasName ? { name } : {}),
  };
}

function generateChart(input) {
  if (input.system === 'bazi') {
    return require('./bazi').generateBaziChart(input);
  }
  if (input.ziweiOutput === 'batch') {
    return require('./ziwei-batch').generateZiweiBatch(input);
  }
  return require('./ziwei').generateZiweiChart(input);
}

module.exports = {
  generateChart,
  parseBirthInput,
};

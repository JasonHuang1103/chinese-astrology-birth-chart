const REQUIRED_FLAGS = new Set([
  '--date',
  '--time',
  '--latitude',
  '--longitude',
  '--time-zone',
]);

const ALLOWED_FLAGS = new Set([...REQUIRED_FLAGS, '--gender', '--system']);

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

  return {
    date: values['--date'],
    time: values['--time'],
    system,
    ...(values['--gender'] ? { gender: values['--gender'] } : {}),
    latitude,
    longitude,
    timeZone: values['--time-zone'],
  };
}

function generateChart(input) {
  if (input.system === 'bazi') {
    return require('./bazi').generateBaziChart(input);
  }
  return require('./ziwei').generateZiweiChart(input);
}

module.exports = {
  generateChart,
  parseBirthInput,
};

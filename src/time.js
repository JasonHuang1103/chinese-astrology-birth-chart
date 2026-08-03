const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function parseDate(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error('--date must use YYYY-MM-DD');
  }

  const [year, month, day] = match.slice(1).map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== day
  ) {
    throw new Error('--date must be a real Gregorian date');
  }

  return { year, month, day };
}

function parseTime(time) {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) {
    throw new Error('--time must use HH:mm');
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    throw new Error('--time must be a real 24-hour time');
  }

  return { hour, minute };
}

function timeZoneFormatter(timeZone, options) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone, ...options });
  } catch {
    throw new Error('--time-zone must be a valid IANA zone');
  }
}

function getOffsetAt(timeZone, instant) {
  const formatter = timeZoneFormatter(timeZone, { timeZoneName: 'longOffset' });
  const zoneName = formatter
    .formatToParts(instant)
    .find((part) => part.type === 'timeZoneName')?.value;

  if (zoneName === 'GMT') {
    return 0;
  }

  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(zoneName || '');
  if (!match) {
    throw new Error('--time-zone must provide a numeric UTC offset');
  }

  const offset = Number(match[2]) * 60 + Number(match[3] || 0);
  return match[1] === '+' ? offset : -offset;
}

function localFieldsAt(timeZone, instant) {
  const formatter = timeZoneFormatter(timeZone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  };
}

function resolveLocalOffset(date, time, timeZone) {
  const expectedDate = parseDate(date);
  const expectedTime = parseTime(time);
  const localAsUtc = Date.UTC(
    expectedDate.year,
    expectedDate.month - 1,
    expectedDate.day,
    expectedTime.hour,
    expectedTime.minute,
  );
  const offsets = new Set([-DAY_MS, 0, DAY_MS].map((delta) => getOffsetAt(timeZone, new Date(localAsUtc + delta))));
  const candidates = [...offsets]
    .map((offset) => ({ offset, instant: new Date(localAsUtc - offset * MINUTE_MS) }))
    .filter(({ instant }) => {
      const actual = localFieldsAt(timeZone, instant);
      return (
        actual.year === expectedDate.year &&
        actual.month === expectedDate.month &&
        actual.day === expectedDate.day &&
        actual.hour === expectedTime.hour &&
        actual.minute === expectedTime.minute
      );
    });

  if (candidates.length === 0) {
    throw new Error('--time does not exist in the supplied --time-zone');
  }
  if (candidates.length > 1) {
    throw new Error('--time is ambiguous in the supplied --time-zone');
  }

  return candidates[0].offset;
}

function equationOfTimeMinutes(date) {
  const { year } = parseDate(date);
  const firstDay = Date.UTC(year, 0, 1);
  const dayOfYear = Math.floor((Date.parse(`${date}T00:00:00Z`) - firstDay) / DAY_MS) + 1;
  const angle = (2 * Math.PI * (dayOfYear - 81)) / 364;
  return 9.87 * Math.sin(2 * angle) - 7.53 * Math.cos(angle) - 1.5 * Math.sin(angle);
}

function chineseHourIndex(hour) {
  if (hour === 23) {
    return 12;
  }
  if (hour === 0) {
    return 0;
  }
  return Math.floor((hour + 1) / 2);
}

function rounded(value) {
  return Number(value.toFixed(3));
}

function correctBirthTime({ date, time, longitude, timeZone }) {
  const { year, month, day } = parseDate(date);
  const { hour, minute } = parseTime(time);
  const offsetMinutes = resolveLocalOffset(date, time, timeZone);
  const equation = equationOfTimeMinutes(date);
  const longitudeCorrection = 4 * (longitude - offsetMinutes / 4);
  const totalCorrection = equation + longitudeCorrection;
  const apparent = new Date(
    Date.UTC(year, month - 1, day, hour, minute) + Math.round(totalCorrection * MINUTE_MS),
  );

  return {
    apparentDate: apparent.toISOString().slice(0, 10),
    apparentTime: apparent.toISOString().slice(11, 16),
    offsetMinutes,
    equationOfTimeMinutes: rounded(equation),
    longitudeCorrectionMinutes: rounded(longitudeCorrection),
    totalCorrectionMinutes: rounded(totalCorrection),
    timeIndex: chineseHourIndex(apparent.getUTCHours()),
  };
}

module.exports = {
  chineseHourIndex,
  correctBirthTime,
  equationOfTimeMinutes,
};

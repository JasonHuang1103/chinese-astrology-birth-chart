# Ziwei and Bazi JSON generator

Generate either a Zi Wei Dou Shu or Bazi natal-chart document for an AI to
review. This is a data-only tool: it does not render a chart or produce an
interpretation.

It uses [iztro](https://github.com/SylarLong/iztro) for Zi Wei and
`lunar-typescript` for Bazi, emitting a stable, plain JSON adapter for the
selected system.

## Usage

Install dependencies, then run the executable directly when saving JSON:

```sh
node bin/ziwei-json.js \
  --date 2000-08-16 \
  --time 02:30 \
  --gender female \
  --latitude 25.033 \
  --longitude 121.5654 \
  --time-zone Asia/Taipei \
  > chart.json
```

`npm run --silent chart -- [the same flags]` is equivalent. The `--silent`
option is necessary when redirecting, because ordinary `npm run` writes its
own command banner to stdout.

## Bazi mode

Use `--system bazi` to generate a separate Bazi document. It does not contain
Zi Wei data and does not require `--gender`:

```sh
node bin/ziwei-json.js --system bazi \
  --date 2000-08-16 --time 02:30 \
  --latitude 25.033 --longitude 121.5654 --time-zone Asia/Taipei \
  > bazi.json
```

Without `--system`, the generator defaults to Zi Wei mode, which requires
`--gender male|female` as shown above. Bazi mode provides the four pillars
(year, month, day, hour), including stems, branches, hidden stems, five
elements, ten gods, NaYin, Chang Sheng, Xun, and Xun Kong. It also includes
胎元, 胎息, 命宮, and 身宮 with their NaYin values.

Bazi uses `lunar-typescript`'s `sect: 2` day-boundary convention. This
convention, together with the apparent-solar-time correction, is recorded in
the document so an AI can audit the calculation.

Required inputs:

- `--date` — local Gregorian birth date in `YYYY-MM-DD`.
- `--time` — recorded local birth time in 24-hour `HH:mm`.
- `--gender` — `male` or `female`, as required by the charting system.
- `--latitude` — decimal degrees from -90 to 90. Recorded as birthplace
  provenance.
- `--longitude` — decimal degrees from -180 to 180. Used for the solar-time
  correction.
- `--time-zone` — IANA zone, such as `Asia/Taipei`. Used to resolve the
  historical UTC offset.

The generator adjusts recorded civil time using a standard equation-of-time
approximation and the longitude difference from the zone meridian. The JSON
preserves the entered time, correction components, resulting apparent-solar
time, and Chinese-hour index so the calculation is auditable. The correction
is intended for minute-level charting use, not observatory-grade ephemerides.

## Output

The command writes exactly one JSON document to standard output. Zi Wei mode
has these five top-level fields:

- `schema_version` — adapter schema version.
- `source` — the charting package/version and output language.
- `input` — entered birth details and coordinates.
- `time_correction` — inputs and result of the apparent-solar-time
  calculation.
- `chart` — traditional-Chinese Zi Wei Dou Shu data, including calendar
  metadata and all 12 normalized palaces with stars and decadal ranges.

Keys are English for predictable AI use. Chart terms and values are emitted in
traditional Chinese (`zh-TW`).

Bazi mode also has five top-level fields: `schema_version`, `source`, `input`,
`time_correction`, and `bazi`. Its computed values are traditional Chinese.

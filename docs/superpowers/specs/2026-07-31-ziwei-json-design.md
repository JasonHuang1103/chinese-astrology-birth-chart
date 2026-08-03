# Ziwei JSON generator design

## Purpose

Generate a machine-readable Zi Wei Dou Shu natal-chart JSON document from a
recorded Gregorian local birth time. The output is designed for a separate AI
to interpret; this project does not render a visual chart or produce
fortune-telling prose.

## Scope

The first version supports only Zi Wei Dou Shu. It uses the installed
`iztro` 2.5.8 package as the charting engine and accepts command-line input:

```sh
npm run chart -- --date YYYY-MM-DD --time HH:mm --gender male|female \
  --latitude N --longitude E --time-zone Area/City
```

The input date and time are the local civil time recorded at birth. Coordinates
and an IANA time-zone identifier are required. City/country geocoding, lunar
input, Bazi, chart rendering, dynamic transits, and interpretive prose are out
of scope.

## Calculation

The generator obtains the historical UTC offset for the local date/time from
the supplied IANA time zone. It calculates the equation of time and the
longitude correction relative to the standard meridian for that offset, then
derives local apparent solar time. The corrected date and its Chinese-hour
index are passed to `iztro`.

Latitude is recorded as birth-place provenance; it is not an input to the
standard longitude-based apparent-solar-time correction. The result reports
the entered civil time, UTC offset, correction components, and corrected time
so an AI or a human can audit the calculation. The approximation targets
minute-level charting use, not observatory-grade solar ephemerides.

## JSON schema

The CLI writes one JSON document to stdout. It is a stable adapter rather than
a raw serialization of `iztro` objects:

- `schema_version`: adapter schema version.
- `source`: `iztro` package and version used.
- `input`: the supplied civil birth details and coordinates.
- `time_correction`: UTC offset, equation-of-time adjustment, longitude
  adjustment, total adjustment, and apparent-solar date/time.
- `chart`: normalized output from `iztro`, including birth calendar metadata,
  zodiac, sign, 命宮/身宮 branches, 命主/身主, five-elements class, and all 12
  palaces. Each palace holds its identity, heavenly stem, earthly branch,
  decadal range, and stars as ordinary JSON objects/arrays.

Keys are English and predictable; traditional-Chinese terms and values are
preserved in values by requesting `zh-TW` output from `iztro`.

## Error handling and verification

The CLI rejects malformed dates/times, unsupported gender values,
out-of-range coordinates, and invalid IANA time zones with actionable errors.
Tests are written before implementation and cover validation, apparent-solar
correction, Chinese-hour boundary mapping, and normalization of a known
`iztro` chart.

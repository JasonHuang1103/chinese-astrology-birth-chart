# Bazi JSON generator design

## Purpose

Add a command-line selector that generates either a Zi Wei Dou Shu JSON
document or a separate, AI-readable Bazi JSON document. The systems are never
combined into one response.

## Command contract

The CLI adds `--system ziwei|bazi`.

- `ziwei` is the default and preserves the existing Zi Wei JSON document.
- `bazi` emits a Bazi JSON document only. It contains no Zi Wei `chart` data
  and makes no call to `iztro`.

Both modes require `--date`, `--time`, `--latitude`, `--longitude`, and
`--time-zone`. `--gender` remains required for `ziwei` and is optional for
`bazi`, because the requested natal Bazi data does not use gender.

## Calculation and source

Bazi mode reuses the existing apparent-solar-time correction unchanged. It
passes the resulting date and time to `lunar-typescript`'s `Solar` and
`EightChar` APIs, which are declared as a direct project dependency even
though they are currently installed transitively by `iztro`.

The Bazi result uses `lunar-typescript`'s default day-boundary convention:
`sect: 2`. The output records this explicitly. It contains no fortune-telling
prose, luck cycles, or transit data.

## Bazi JSON schema

The Bazi document has exactly five top-level fields:

- `schema_version`: Bazi adapter schema version.
- `source`: the `lunar-typescript` package, version, and Bazi convention.
- `input`: supplied birth details; `gender` is included only when supplied.
- `time_correction`: the existing auditable correction components and
  apparent-solar time.
- `bazi`: structured natal Bazi data.

`bazi.pillars` contains the year, month, day, and hour pillars. Every pillar
contains the combined stem-branch, stem, branch, hidden stems, combined
five-elements value, NaYin, stem ten-god, branch ten-gods, Chang Sheng stage,
Xun, and Xun Kong. `bazi.auxiliary` contains 胎元, 胎息, 命宮, and 身宮, each
with its NaYin value.

JSON keys are English and stable. Computed Bazi values remain traditional
Chinese as returned by `lunar-typescript`.

## Verification

Tests cover the default `ziwei` output remaining unchanged, `bazi` flag
validation and optional gender, Bazi-only top-level shape, four structured
pillars, and CLI stdout containing one valid Bazi JSON document.

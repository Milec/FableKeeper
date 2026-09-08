# Hospital MRF Filter

A local Tkinter desktop application for streaming large CMS hospital price-transparency Machine-Readable Files and exporting a standardized, filtered CSV.

Current version: **1.3.0**

## What it does

1. **Schema discovery:** for delimited files, inspects a bounded 2 MiB / 250-record window to locate the probable header row. For record-shaped JSON and JSON Lines, streams records and unions their field names until the schema has settled, because those formats declare no header.
2. **Distinct-value scan:** streams the file once for every group of selected free-text fields, collecting only unique nonblank values. The scan computes the full SHA-256 at the same time.
3. **Filter and export:** streams the file again and writes matching rows immediately to a temporary CSV, then atomically renames it when complete.

The application never loads the complete input or complete output into memory, and nothing it holds grows with the number of rows. Measured end to end on a 9 GB, 50-million-row MRF, peak resident memory is 62 MB. See [Working at scale](#working-at-scale). The app performs no network or scraping operations.

## Supported input

- CSV, TSV, pipe-delimited, and semicolon-delimited text
- JSON Lines / NDJSON
- JSON containing an array of objects
- CMS-style JSON with a `standard_charge_information` array and nested charge arrays
- Any of the above inside a `.gz` file, or as the largest data entry of a `.zip` archive

Containers are recognized by magic bytes rather than file extension, so a `.csv` that is really gzip is still read correctly. A UTF-8 BOM, which many hospital exports carry, is handled on every path.

For generic JSON, the app detects a likely object-array path within the first 8 MiB. Extremely unusual JSON with no record array in that window should first be converted to JSON Lines.

## Run on Windows

1. Install [Python 3.11 or newer](https://www.python.org/downloads/) and enable **Add Python to PATH**.
2. Extract this folder.
3. Double-click `run_windows.bat`.

The first launch creates a private virtual environment and installs `ijson` and `rapidfuzz`. Later launches start directly.

## Run on macOS or Linux

```bash
chmod +x run_mac_linux.sh
./run_mac_linux.sh
```

On some Linux distributions, install the OS package for Tk first, usually `python3-tk`.

## Workflow

1. Choose one local MRF and enter a stable source or hospital name.
2. Click **Sample schema**. For CSV files, confirm the proposed 1-based header row; the app shows six ranked candidates and permits a manual row override through record 250, and rows above the confirmed one are skipped as facility metadata in every later pass. For JSON and JSON Lines the app streams records to discover the field list, reporting progress; **Cancel** stops it.
3. Review every mapping suggestion. Change wrong suggestions and use **(not mapped)** where appropriate. Nothing is accepted until **Confirm mapping** is clicked.
4. Select one or more mapped fields, then click **Scan selected fields**. All chosen fields are collected in one pass. Description is deliberately not offered: it is close to unique per row, so it is exported but never scanned.
5. In each value tab, search and select the values to keep. Leaving a tab unselected means that field is not used as a filter. Selections survive changing the search text. Any value can also be typed in directly, which is how a column with too many distinct values to list is filtered.
6. Optionally select MS-DRG codes from the bundled FY 2026 MS-DRG v43.0 list and apply them to `billing_code`. This never scans the MRF to build the code list.
7. Choose an output path and run the export.

Filters across columns use AND. Multiple values inside one column use OR. Comparisons are exact after trimming surrounding whitespace. MS-DRG inputs are normalized to three digits.

## How columns are mapped

Each standard output field carries the canonical CMS v2.x/v3.0 column names as its leading aliases, so a conforming file maps exactly rather than approximately: `standard_charge|negotiated_dollar`, `payers_information.standard_charge_dollar`, `code|1|type` and their siblings are matched by name.

Beyond that:

- **Every field/column pair is scored, and the best pairs are consumed first.** Assigning fields one at a time in a fixed order let an early field claim a column that a later field matched far better.
- **Deep JSON paths are matched on their leaf.** `standard_charges.payers_information.count` and `...payers_information.estimated_amount` share three quarters of their path, so comparing whole paths rewarded the wrong column.
- **Similarity is token-based.** `WRatio`'s partial-ratio component scores a short junk column against a long field name ("count" against "discounted cash price" scores 90), which is exactly how a statistics column ends up exported as a rate.
- **Weak matches are left unmapped.** Below a blended score of 78 the app offers nothing rather than a confident guess, on the view that a wrong mapping silently corrupts the export while a blank one is visible. Fill those in from the dropdown.

Against the real CMS files tested below, 18 to 19 of the 21 standard fields map exactly and the rest are genuinely absent from those files.

## MS-DRG codes and revenue codes

MS-DRG numbers occupy the same three-digit space as revenue codes and as the other DRG groupers. Filtering Stanford Health Care's file for MS-DRG 291, 470 and 871 by code number alone returns 68 rows, of which 14 are revenue codes that happen to share a number.

The MS-DRG reference filter therefore also requires the row's billing code type to be `MS-DRG`, `MS DRG` or `DRG`; `APR-DRG` and the other groupers are excluded because the bundled list is not theirs. Mapping **Billing code type** is what makes this possible, and the app warns before running an unguarded code-number filter if it is left unmapped.

## Mapping and cache storage

Confirmed mappings and distinct-value caches are stored under:

- Windows: `%USERPROFILE%\.hospital_mrf_filter`
- macOS/Linux: `~/.hospital_mrf_filter`

Mappings and confirmed CSV header-row offsets are keyed by the source/hospital name. Cached distinct values are keyed by the SHA-256, the parser/header settings, and the raw input column name. A small path/size/modified-time index allows the app to recognize an unchanged local file without hashing it again.

For plain and gzip input the SHA-256 is the file's own. A ZIP archive must be opened seekably to read its central directory, so there the digest covers the selected member's decompressed bytes instead; the cache key records which, so the two can never be confused.

## Failure safety

- Cancelled or failed exports delete the `.partial` file.
- Existing output is replaced only after a successful full export.
- Selecting the input file itself as output is rejected.
- The GUI does file work in a background thread and reports records processed, records matched, and byte progress.
- An undecodable byte is replaced rather than raising. A 300 MB export carrying a handful of stray bytes finishes instead of aborting partway through, at the cost of one replacement character per bad byte.
- A malformed CSV or JSON Lines file fails with the row or line number it failed on, not a bare parser error.

## Working at scale

Every pass is streaming, and the structures the app keeps are bounded rather than proportional to the file:

- **Rows** are read, mapped and discarded one at a time. Both readers yield plain strings, and the CSV reader builds each row with `dict(zip(...))` in C.
- **Description is never scanned.** A per-service description is close to unique per row, so enumerating it costs a large set and produces a pick list nobody can use. It is mapped and exported like any other field, but not offered as a filter column (`filterable=False` on its `TargetField`).
- **Distinct values** stop being collected at 250,000 per column (`DISTINCT_VALUE_LIMIT` in `mrf_filter/engine.py`), for the columns that are offered. A billing code column on a multi-hospital file still runs to hundreds of thousands. Such a column is marked partial in the UI and in the cache, and the values to keep are typed in instead.
- **The value list widget** renders at most 5,000 rows at a time; the search box reaches the rest.
- **CSV fields** are capped at 8 MiB (`CSV_MAX_FIELD_BYTES` in `mrf_filter/readers.py`). One unbalanced quote otherwise makes `csv.reader` accumulate a single field to end of file, which on a multi-gigabyte MRF is an out-of-memory kill rather than an error message.
- **Schema discovery** on record-shaped JSON is bounded by the `SCHEMA_*` budgets, and stops as soon as the CMS core fields have been seen.

Progress reports rows, percentage of file bytes, throughput and projected time remaining, and **Cancel** takes effect within a row, so a ten-minute pass is interruptible.

Measured on this hardware (4 cores, ijson's `yajl2_c` backend), against generated CMS-format files of 50 million rows each:

| Input | Schema | Distinct scan | Filter and export | Peak RSS |
| --- | --- | --- | --- | --- |
| 9.0 GB CSV, 50,000,000 rows | 0.4 s | 317 s (158k rows/s, 4 columns) | 419 s (119k rows/s, 4,166,667 rows written) | 62 MB |
| 7.3 GB JSON Lines, 50,000,000 logical rows | 0.6 s | 591 s (85k rows/s, 2 columns) | 691 s (72k rows/s, 5,000,000 rows written) | 56 MB |

Both exports were re-read afterwards and every row checked against the filter. Wall time is dominated by `csv.reader` and by JSON record expansion; on files this size, plan for minutes per pass rather than seconds.

To recheck these numbers, build the same fixtures:

```bash
python scripts/make_scale_fixture.py csv   50000000 /tmp/scale.csv     # ~9.0 GB
python scripts/make_scale_fixture.py jsonl  5000000 /tmp/scale.jsonl   # ~7.3 GB
```

## Development and tests

```bash
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

The suite covers the CMS tall-CSV template, deep JSON paths, BOM-prefixed JSON, late-appearing payer fields, gzip and zip input, undecodable bytes, the MS-DRG/revenue-code collision, bounded header scoring, cancellation, and a headless run of the real Tk widgets through the whole workflow. The GUI test skips itself when no display is available.

### Verified against real hospital files

| Hospital | File | Format | Records | Schema | Scan | Export |
| --- | --- | --- | --- | --- | --- | --- |
| MaineHealth (Franklin Memorial) | 71 MB `.csv` | CMS v3.0 tall CSV | 351,148 | 0.3 s | 1.9 s | 2.3 s |
| Oregon Health & Science University | 13.5 MB `.zip` → 298 MB `.csv` | CMS v3.0 tall CSV | 976,657 | 0.3 s | 7.4 s | 8.6 s |
| Stanford Health Care | 155 MB `.json` | CMS v3.0 JSON, BOM-prefixed | 691,901 logical rows | 15.7 s | 16.1 s | 19.6 s |

Each was taken from the hospital's own `cms-hpt.txt`, mapped from the app's suggestions with no manual correction, filtered by payer, and the exported CSV was re-read and checked against the filter.

## Boundaries

This tool intentionally has no downloader, scraper, database, multi-hospital aggregation, or patient-data functionality. It processes one user-selected public rate file at a time.

Known limitations:

- **The CMS "wide" CSV layout is not usefully filterable.** It gives each payer/plan pair its own set of columns rather than a `payer_name` column, so there is no single column to filter on. The mapper declines to match a leaf shared by more than two columns, which keeps it from arbitrarily picking one payer's column, but the tool cannot reshape such a file. Use the hospital's tall CSV or JSON file where one is published.
- **A record-shaped JSON field that first appears very late in a huge file may be missed.** Field discovery stops once the CMS core fields have been seen plus a grace window, or at 250,000 records / 256 MiB, whichever comes first. The budgets are the `SCHEMA_*` constants in `mrf_filter/readers.py`.
- **Only one billing code column is exported.** CMS files carry up to four (`code|1` … `code|4`); the mapper takes `code|1` and its type.
- **A column with more than 250,000 distinct values is listed only partially.** The count reads `250,000+` and the tab says so; filter such a column by typing the values, or by filtering a different column instead.
- **There is no resume.** A cancelled or failed export discards its partial file and starts over, which on a 50-million-row input means repeating a pass of several minutes.

The bundled fixed-code reference was transcribed from the [CMS FY 2026 MS-DRG v43.0 Definitions Manual, Appendix A](https://www.cms.gov/icd10m/FY2026-fr-v43-fullcode-cms/fullcode_cms/P0392.html). It contains 772 active MS-DRG codes. Replace that small CSV resource when a different fiscal-year grouper is required.

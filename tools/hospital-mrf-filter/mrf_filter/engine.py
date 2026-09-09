from __future__ import annotations

import csv
import hashlib
import threading
import time
from pathlib import Path

from .model import CancelledError, FileSpec, Progress, ProgressCallback, ScanResult
from .readers import TrackedBinaryReader, iter_rows
from .standards import TARGET_FIELDS, is_ms_drg_type, normalize_drg
from .storage import AppStorage


# A free-text column over tens of millions of rows can hold millions of distinct
# values. Collecting them all is both a memory risk (roughly 145 bytes per value
# held in a set) and pointless, since nobody picks from a list that long.
# Collection stops at this many values per column, and the column is reported as
# truncated so the operator can type the values to keep instead.
DISTINCT_VALUE_LIMIT = 250_000

# Rows between clock reads while streaming. Reading the clock on every row costs
# about 5% of a pass at 50M rows.
TICK_ROW_STRIDE = 512


def _cache_column_key(spec: FileSpec, column: str, digest_scope: str, limit: int) -> str:
    """Cache identity for one column's distinct values.

    The limit is part of the key: a list collected under a smaller cap is a
    different, smaller answer, and must not come back for a larger one.
    """
    parser_signature = (
        f"kind={spec.kind}|header={spec.header_row}|delimiter={spec.delimiter}|"
        f"json_prefix={spec.json_prefix or ''}|wide={spec.wide}|scope={digest_scope}|limit={limit}"
    )
    return f"{parser_signature}|column={column}"


def _tick(callback: ProgressCallback | None, phase: str, records: int, matched: int,
          tracker: TrackedBinaryReader, total: int, force: bool = False,
          state: list[float] | None = None) -> None:
    """Report progress, at most every 0.2s and without a clock read per row.

    ``state`` is [last report, rows left before the next clock read, start time].
    """
    if callback is None:
        return
    if not force and state is not None:
        state[1] -= 1
        if state[1] > 0:
            return
        state[1] = TICK_ROW_STRIDE
    now = time.monotonic()
    if force or state is None or now - state[0] >= 0.2:
        elapsed = now - state[2] if state is not None else 0.0
        callback(Progress(phase, records, matched, tracker.bytes_read, total, elapsed))
        if state is not None:
            state[0] = now


def scan_distinct(spec: FileSpec, columns: list[str], storage: AppStorage,
                  callback: ProgressCallback | None = None,
                  cancel: threading.Event | None = None,
                  limit: int = DISTINCT_VALUE_LIMIT) -> ScanResult:
    """Collect the distinct values of each column in one streaming pass.

    A column stops collecting at ``limit`` values and is named in
    ``ScanResult.truncated``; the pass still runs to the end of the file so the
    digest and the record count stay correct.
    """
    columns = list(dict.fromkeys(columns))
    digest = hashlib.sha256()
    tracker = TrackedBinaryReader(spec.path, digest)
    total = tracker.total_bytes
    scope = tracker.digest_scope
    known = storage.known_hash(spec.path)
    if known:
        cached = {
            column: storage.load_distinct(known, _cache_column_key(spec, column, scope, limit))
            for column in columns
        }
        if all(entry is not None for entry in cached.values()):
            tracker.close()
            return ScanResult(
                {column: entry[0] for column, entry in cached.items()},
                frozenset(column for column, entry in cached.items() if entry[1]),
                known,
                True,
            )

    values = {column: set() for column in columns}
    truncated: set[str] = set()
    records = 0
    update_state = [0.0, TICK_ROW_STRIDE, time.monotonic()]
    try:
        for row in iter_rows(spec, tracker):
            if cancel and cancel.is_set():
                raise CancelledError("Distinct-value scan cancelled.")
            records += 1
            for column in columns:
                found = values[column]
                if len(found) >= limit:
                    truncated.add(column)
                    continue
                value = row.get(column, "")
                if value:
                    value = value.strip()
                    if value:
                        found.add(value)
            _tick(callback, "Distinct-value scan", records, 0, tracker, total, state=update_state)
    finally:
        if not tracker.closed:
            tracker.close()
    file_hash = digest.hexdigest()
    storage.remember_hash(spec.path, file_hash)
    for column, found in values.items():
        storage.save_distinct(
            file_hash, _cache_column_key(spec, column, scope, limit), found, column in truncated)
    _tick(callback, "Distinct-value scan", records, 0, tracker, total, force=True,
          state=update_state)
    return ScanResult(
        {column: sorted(found, key=str.casefold) for column, found in values.items()},
        frozenset(truncated),
        file_hash,
        False,
    )


def export_filtered(spec: FileSpec, output: Path, mapping: dict[str, str],
                    filters: dict[str, set[str]], drg_fields: set[str] | None = None,
                    callback: ProgressCallback | None = None,
                    cancel: threading.Event | None = None,
                    drg_type_column: str | None = None) -> tuple[int, int]:
    """Stream the MRF once and write the mapped, filtered rows.

    ``drg_type_column`` is the raw column holding the billing code type. When
    the MS-DRG reference filter is in use it should always be supplied: a
    hospital's revenue code 470 and MS-DRG 470 are different things that would
    otherwise both be exported.
    """
    output = output.expanduser().resolve()
    if output == spec.path:
        raise ValueError("The output file must be different from the input MRF.")
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = output.with_suffix(output.suffix + ".partial")
    ordered_targets = [field.name for field in TARGET_FIELDS if mapping.get(field.name)]
    if not ordered_targets:
        raise ValueError("At least one standard field must be mapped.")
    pairs = [(target, mapping[target]) for target in ordered_targets]
    normalized_filters = {
        target: {str(value).strip() for value in selected}
        for target, selected in filters.items() if selected
    }
    drg_fields = drg_fields or set()
    tracker = TrackedBinaryReader(spec.path)
    total = tracker.total_bytes
    records = matched = 0
    update_state = [0.0, TICK_ROW_STRIDE, time.monotonic()]
    try:
        with temp.open("w", encoding="utf-8-sig", newline="", buffering=1024 * 1024) as handle:
            writer = csv.DictWriter(handle, fieldnames=ordered_targets, extrasaction="ignore")
            writer.writeheader()
            for raw_row in iter_rows(spec, tracker):
                if cancel and cancel.is_set():
                    raise CancelledError("Export cancelled.")
                records += 1
                # Both readers already yield strings, so no str() per cell, and
                # the target/column pairing is resolved once rather than per row.
                standardized = {target: raw_row.get(column, "") for target, column in pairs}
                keep = not (drg_fields and drg_type_column) or is_ms_drg_type(
                    raw_row.get(drg_type_column, ""))
                if keep:
                    for target, selected in normalized_filters.items():
                        candidate = standardized.get(target, "").strip()
                        if target in drg_fields:
                            candidate = normalize_drg(candidate)
                        if candidate not in selected:
                            keep = False
                            break
                if keep:
                    writer.writerow(standardized)
                    matched += 1
                _tick(callback, "Filter and export", records, matched, tracker, total, state=update_state)
        temp.replace(output)
    except BaseException:
        try:
            temp.unlink(missing_ok=True)
        finally:
            raise
    finally:
        if not tracker.closed:
            tracker.close()
    _tick(callback, "Filter and export", records, matched, tracker, total, force=True,
          state=update_state)
    return records, matched

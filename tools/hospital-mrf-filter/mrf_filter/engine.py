from __future__ import annotations

import csv
import hashlib
import threading
import time
from pathlib import Path

from .model import CancelledError, FileSpec, Progress, ProgressCallback
from .readers import TrackedBinaryReader, iter_rows
from .standards import TARGET_FIELDS, is_ms_drg_type, normalize_drg
from .storage import AppStorage


def _cache_column_key(spec: FileSpec, column: str, digest_scope: str) -> str:
    parser_signature = (
        f"kind={spec.kind}|header={spec.header_row}|delimiter={spec.delimiter}|"
        f"json_prefix={spec.json_prefix or ''}|scope={digest_scope}"
    )
    return f"{parser_signature}|column={column}"


def _tick(callback: ProgressCallback | None, phase: str, records: int, matched: int,
          tracker: TrackedBinaryReader, total: int, force: bool = False,
          state: list[float] | None = None) -> None:
    if callback is None:
        return
    now = time.monotonic()
    if force or state is None or now - state[0] >= 0.2:
        callback(Progress(phase, records, matched, tracker.bytes_read, total))
        if state is not None:
            state[0] = now


def scan_distinct(spec: FileSpec, columns: list[str], storage: AppStorage,
                  callback: ProgressCallback | None = None,
                  cancel: threading.Event | None = None) -> tuple[dict[str, list[str]], str, bool]:
    columns = list(dict.fromkeys(columns))
    digest = hashlib.sha256()
    tracker = TrackedBinaryReader(spec.path, digest)
    total = tracker.total_bytes
    scope = tracker.digest_scope
    known = storage.known_hash(spec.path)
    if known:
        cached = {
            column: storage.load_distinct(known, _cache_column_key(spec, column, scope))
            for column in columns
        }
        if all(values is not None for values in cached.values()):
            tracker.close()
            return {column: values or [] for column, values in cached.items()}, known, True

    values = {column: set() for column in columns}
    records = 0
    update_state = [0.0]
    try:
        for row in iter_rows(spec, tracker):
            if cancel and cancel.is_set():
                raise CancelledError("Distinct-value scan cancelled.")
            records += 1
            for column in columns:
                value = str(row.get(column, "")).strip()
                if value:
                    values[column].add(value)
            _tick(callback, "Distinct-value scan", records, 0, tracker, total, state=update_state)
    finally:
        if not tracker.closed:
            tracker.close()
    file_hash = digest.hexdigest()
    storage.remember_hash(spec.path, file_hash)
    for column, found in values.items():
        storage.save_distinct(file_hash, _cache_column_key(spec, column, scope), found)
    _tick(callback, "Distinct-value scan", records, 0, tracker, total, force=True)
    return {column: sorted(found, key=str.casefold) for column, found in values.items()}, file_hash, False


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
    normalized_filters = {
        target: {str(value).strip() for value in selected}
        for target, selected in filters.items() if selected
    }
    drg_fields = drg_fields or set()
    tracker = TrackedBinaryReader(spec.path)
    total = tracker.total_bytes
    records = matched = 0
    update_state = [0.0]
    try:
        with temp.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=ordered_targets, extrasaction="ignore")
            writer.writeheader()
            for raw_row in iter_rows(spec, tracker):
                if cancel and cancel.is_set():
                    raise CancelledError("Export cancelled.")
                records += 1
                standardized = {target: str(raw_row.get(mapping[target], "")) for target in ordered_targets}
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
    _tick(callback, "Filter and export", records, matched, tracker, total, force=True)
    return records, matched

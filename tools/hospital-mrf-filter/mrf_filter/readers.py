from __future__ import annotations

import csv
import gzip
import hashlib
import io
import json
import sys
import zipfile
from collections.abc import Iterator, Mapping
from pathlib import Path
from typing import Any

import ijson
from rapidfuzz import fuzz

from .model import CancelledError, FileSpec, Progress, ProgressCallback, SchemaSample
from .standards import TARGET_FIELDS, normalize_header


SAMPLE_LIMIT = 8 * 1024 * 1024
CSV_HEADER_SAMPLE_LIMIT = 2 * 1024 * 1024
CSV_HEADER_SCAN_RECORDS = 50
CSV_OVERRIDE_MAX_RECORDS = 250
CSV_DELIMITERS = (",", "\t", "|", ";")

# Header scoring is quadratic in cells x aliases. A malformed or misdetected
# file can present a single "row" of tens of thousands of cells, so the number
# of cells scored per candidate row is capped.
HEADER_SCORE_MAX_CELLS = 60

# Record-shaped JSON/JSONL has no declared header, so fields are discovered by
# unioning keys across records. Hospitals commonly emit tens of thousands of
# gross-charge-only records before the first payer-specific one (Stanford's
# file reaches it at record 59,982), so "no new field lately" is not a safe
# stopping rule: it stops before payer_name exists and leaves the tool unable
# to filter by payer at all. The scan therefore runs until the payer-side
# fields have actually been seen, or until an explicit budget is spent.
SCHEMA_MIN_RECORDS = 200
SCHEMA_MAX_RECORDS = 250_000
SCHEMA_MAX_BYTES = 256 * 1024 * 1024
SCHEMA_GRACE_RECORDS = 5_000
SCHEMA_EXAMPLE_ROWS = 4

# Once all of these have been seen, a CMS-shaped file has revealed the record
# shape that matters, and the scan stops after a short grace window.
CMS_CORE_LEAVES = frozenset({"description", "payer name", "plan name", "methodology"})

HEADER_ALIASES = tuple(
    normalize_header(alias)
    for field in TARGET_FIELDS
    for alias in (field.name, field.label, *field.aliases)
)

GZIP_MAGIC = b"\x1f\x8b"
ZIP_MAGIC = b"PK\x03\x04"
UTF8_BOM = b"\xef\xbb\xbf"


def detect_container(path: Path) -> str:
    """Classify by magic bytes, not by suffix: MRFs are frequently mislabelled."""
    with path.open("rb") as handle:
        magic = handle.read(4)
    if magic.startswith(GZIP_MAGIC):
        return "gzip"
    if magic.startswith(ZIP_MAGIC):
        return "zip"
    return "plain"


def zip_member(archive: zipfile.ZipFile) -> zipfile.ZipInfo:
    members = [info for info in archive.infolist() if not info.is_dir()]
    if not members:
        raise ValueError("The ZIP archive is empty.")
    data_members = [
        info for info in members
        if Path(info.filename).suffix.lower() in {".csv", ".txt", ".tsv", ".psv", ".json", ".jsonl", ".ndjson"}
    ]
    pool = data_members or members
    return max(pool, key=lambda info: info.file_size)


class _CountingRaw(io.RawIOBase):
    """Feeds a decompressor while charging the owner for compressed bytes."""

    def __init__(self, handle, owner: "TrackedBinaryReader"):
        self._handle = handle
        self._owner = owner

    def readable(self) -> bool:
        return True

    def readinto(self, buffer: bytearray) -> int:
        data = self._handle.read(len(buffer))
        count = len(data)
        if count:
            buffer[:count] = data
            self._owner.bytes_read += count
            if self._owner.digest:
                self._owner.digest.update(data)
        return count


class TrackedBinaryReader(io.RawIOBase):
    """Decompressed byte stream that reports progress and hashes as it reads.

    For plain and gzip input the counter and digest run over the file's own
    bytes. A ZIP archive has to be opened seekably for its central directory,
    so there the counter and digest run over the selected member's decompressed
    bytes instead; ``digest_scope`` records which, and the distinct-value cache
    key includes it.
    """

    def __init__(self, path: Path, digest: "hashlib._Hash | None" = None):
        self.digest = digest
        self.bytes_read = 0
        self.container = detect_container(path)
        self._archive: zipfile.ZipFile | None = None
        self._handle = None
        self._count_output = True
        if self.container == "gzip":
            self._handle = path.open("rb")
            self.total_bytes = path.stat().st_size
            self.digest_scope = "file"
            self._count_output = False
            self._stream = gzip.GzipFile(
                fileobj=io.BufferedReader(_CountingRaw(self._handle, self), 1024 * 1024)
            )
        elif self.container == "zip":
            self._archive = zipfile.ZipFile(path)
            info = zip_member(self._archive)
            self.total_bytes = info.file_size
            self.digest_scope = f"zip:{info.filename}"
            self._stream = self._archive.open(info)
        else:
            self._handle = path.open("rb")
            self.total_bytes = path.stat().st_size
            self.digest_scope = "file"
            self._stream = self._handle

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return False

    def readinto(self, buffer: bytearray) -> int:
        data = self._stream.read(len(buffer))
        count = len(data)
        if count:
            buffer[:count] = data
            if self._count_output:
                self.bytes_read += count
                if self.digest:
                    self.digest.update(data)
        return count

    def close(self) -> None:
        if not self.closed:
            for resource in (self._stream, self._handle, self._archive):
                if resource is not None:
                    try:
                        resource.close()
                    except OSError:
                        pass
        super().close()


class LimitedReader(io.RawIOBase):
    """Bounded view over the decompressed stream, for sampling passes."""

    def __init__(self, path: Path, limit: int = SAMPLE_LIMIT):
        self._inner = TrackedBinaryReader(path)
        self.remaining = limit

    def readable(self) -> bool:
        return True

    def readinto(self, buffer: bytearray) -> int:
        if self.remaining <= 0:
            return 0
        view = memoryview(buffer)[: min(len(buffer), self.remaining)]
        count = self._inner.readinto(view)
        self.remaining -= count
        return count

    def close(self) -> None:
        if not self.closed:
            self._inner.close()
        super().close()


def _buffered(raw: io.RawIOBase) -> io.BufferedReader:
    return io.BufferedReader(raw, buffer_size=1024 * 1024)


def _skip_bom(binary: io.BufferedReader) -> io.BufferedReader:
    """Consume a leading UTF-8 BOM, which ijson rejects as a syntax error.

    Hospital MRFs are very often written by tools that emit one. The bytes are
    consumed from the parser's view only; the digest and byte counter still see
    the file exactly as it is on disk.
    """
    head = binary.peek(len(UTF8_BOM))
    if head[: len(UTF8_BOM)] == UTF8_BOM:
        binary.read(len(UTF8_BOM))
    return binary


def read_head(path: Path, size: int) -> bytes:
    reader = LimitedReader(path, size)
    try:
        with _buffered(reader) as handle:
            return handle.read(size)
    finally:
        reader.close()


def container_suffix(path: Path) -> str:
    """The data suffix, seeing through .gz and single-entry .zip wrappers."""
    container = detect_container(path)
    if container == "gzip":
        stem = Path(path.stem if path.suffix.lower() in {".gz", ".gzip"} else path.name)
        return stem.suffix.lower()
    if container == "zip":
        with zipfile.ZipFile(path) as archive:
            return Path(zip_member(archive).filename).suffix.lower()
    return path.suffix.lower()


def detect_kind(path: Path) -> str:
    suffix = container_suffix(path)
    if suffix in {".csv", ".txt", ".tsv", ".psv"}:
        return "csv"
    if suffix in {".jsonl", ".ndjson"}:
        return "jsonl"
    head = read_head(path, 4096)
    if head.startswith(UTF8_BOM):
        head = head[len(UTF8_BOM) :]
    if head.lstrip().startswith((b"{", b"[")):
        return "json"
    return "csv"


def _decode(sample: bytes) -> tuple[str, str]:
    """Pick a text encoding from the header window.

    cp1252 comes before latin-1 because a spreadsheet-exported MRF that is not
    UTF-8 is almost always cp1252, and the two differ exactly on the smart
    quotes and dashes such files are full of.
    """
    for encoding in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return encoding, sample.decode(encoding)
        except UnicodeDecodeError:
            continue
    return "latin-1", sample.decode("latin-1", errors="replace")


def _read_csv_window(path: Path) -> tuple[str, str]:
    sample = read_head(path, CSV_HEADER_SAMPLE_LIMIT)
    return _decode(sample)


def _parse_csv_window(text: str, delimiter: str) -> list[list[str]]:
    rows: list[list[str]] = []
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    try:
        for row in reader:
            rows.append([str(cell).strip() for cell in row])
            if len(rows) >= CSV_OVERRIDE_MAX_RECORDS:
                break
    except csv.Error:
        pass
    return rows


def _is_number_like(value: str) -> bool:
    cleaned = value.strip().replace("$", "").replace(",", "").replace("%", "")
    try:
        float(cleaned)
        return bool(cleaned)
    except ValueError:
        return False


def _header_score(rows: list[list[str]], index: int) -> int:
    row = rows[index]
    cells = [cell for cell in row if cell]
    width = len(row)
    if len(cells) < 2:
        return -100
    scored = cells[:HEADER_SCORE_MAX_CELLS]
    normalized = [normalize_header(cell) for cell in scored]
    best_alias_scores = [max(fuzz.WRatio(cell, alias) for alias in HEADER_ALIASES) for cell in normalized]
    strong = sum(score >= 76 for score in best_alias_scores)
    possible = sum(score >= 60 for score in best_alias_scores)
    number_ratio = sum(_is_number_like(cell) for cell in scored) / len(scored)
    duplicate_count = len(normalized) - len(set(normalized))
    following = [candidate for candidate in rows[index + 1:index + 6] if any(candidate)]
    consistent = sum(abs(len(candidate) - width) <= 1 for candidate in following)
    score = strong * 35 + possible * 8 + min(width, 30) * 2 + consistent * 7
    score -= round(number_ratio * 45) + duplicate_count * 8
    if width < 3:
        score -= 35
    if len(" ".join(scored)) > 1000:
        score -= 20
    return int(score)


def _header_preview(row: list[str]) -> str:
    text = " | ".join(cell or "(blank)" for cell in row[:6])
    if len(row) > 6:
        text += " | ..."
    return text[:180]


def _detect_csv(path: Path, header_row_override: int | None = None) -> tuple[str, str, int, list[tuple[int, str, int]]]:
    encoding, text = _read_csv_window(path)
    best: tuple[int, str, int, list[list[str]], dict[int, int]] | None = None
    for delimiter in CSV_DELIMITERS:
        rows = _parse_csv_window(text, delimiter)
        if not rows:
            continue
        if header_row_override is not None:
            if not 0 <= header_row_override < len(rows):
                continue
            indices = [header_row_override]
        else:
            indices = list(range(min(len(rows), CSV_HEADER_SCAN_RECORDS)))
        scores = {index: _header_score(rows, index) for index in indices}
        top = max(scores, key=lambda index: (scores[index], -index))
        if best is None or scores[top] > best[0]:
            best = (scores[top], delimiter, top, rows, scores)
    if best is None:
        if header_row_override is not None:
            raise ValueError(
                f"Header row {header_row_override + 1} is not available within the first "
                f"{CSV_HEADER_SAMPLE_LIMIT // (1024 * 1024)} MiB / {CSV_OVERRIDE_MAX_RECORDS} records."
            )
        raise ValueError("Could not detect a delimited header row in the bounded CSV sample.")
    _score, delimiter, header_row, rows, scores = best
    if header_row_override is None:
        ranked = sorted(((score, index) for index, score in scores.items()), reverse=True)
    else:
        ranked = sorted(
            ((_header_score(rows, index), index) for index in range(min(len(rows), CSV_HEADER_SCAN_RECORDS))),
            reverse=True,
        )
    candidates = [(index, _header_preview(rows[index]), score) for score, index in ranked[:6]]
    return encoding, delimiter, header_row, candidates


def _clean_headers(row: list[str]) -> list[str]:
    headers: list[str] = []
    counts: dict[str, int] = {}
    for position, value in enumerate(row, 1):
        base = str(value).strip() or f"unnamed_column_{position}"
        counts[base] = counts.get(base, 0) + 1
        headers.append(base if counts[base] == 1 else f"{base} [{counts[base]}]")
    return headers


def _looks_like_jsonl(path: Path) -> bool:
    """Cheap NDJSON check that never materialises a whole single-line document.

    Reading a line at a time would pull an entire 150 MB single-line JSON
    document into memory before deciding it is not NDJSON.
    """
    window = 4 * 1024 * 1024
    if container_suffix(path) in {".jsonl", ".ndjson"}:
        return True
    head = read_head(path, window)
    if head.startswith(UTF8_BOM):
        head = head[len(UTF8_BOM) :]
    chunks = head.split(b"\n")
    if len(head) >= window and chunks:
        chunks.pop()  # the window may have cut the final line in half
    chunks = [chunk for chunk in chunks if chunk.strip()]
    if len(chunks) < 2:
        return False
    valid = 0
    for chunk in chunks[:3]:
        try:
            valid += isinstance(json.loads(chunk.decode("utf-8", "replace")), dict)
        except json.JSONDecodeError:
            return False
    return valid >= 2


def _array_score(prefix: str) -> int:
    normalized = prefix.lower()
    score = 0
    if normalized == "standard_charge_information.item":
        score += 1000
    elif normalized.endswith(".standard_charge_information.item"):
        score += 900
    elif normalized == "item":
        score += 600
    elif "standard_charge_information" in normalized:
        score += 200
    if "charge" in normalized and not normalized.endswith("standard_charge_information.item"):
        score += 200
    if "rate" in normalized or "service" in normalized:
        score += 80
    score -= prefix.count(".") * 8
    return score


def discover_json_prefix(path: Path) -> str:
    candidates: list[str] = []
    raw = LimitedReader(path)
    try:
        with _buffered(raw) as handle:
            _skip_bom(handle)
            try:
                for prefix, event, _value in ijson.parse(handle):
                    if event == "start_array":
                        candidates.append(f"{prefix}.item" if prefix else "item")
            except ijson.JSONError:
                pass
    finally:
        raw.close()
    if not candidates:
        raise ValueError("No record array was found in the first 8 MiB of this JSON file.")
    candidates = sorted(dict.fromkeys(candidates), key=_array_score, reverse=True)
    for prefix in candidates:
        raw = LimitedReader(path)
        try:
            with _buffered(raw) as handle:
                _skip_bom(handle)
                try:
                    item = next(ijson.items(handle, prefix))
                    if isinstance(item, Mapping):
                        return prefix
                except (StopIteration, ijson.JSONError):
                    continue
        finally:
            raw.close()
    raise ValueError("JSON arrays were found, but none contained object records in the sample window.")


def _stringify(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def expand_record(value: Any, prefix: str = "") -> Iterator[dict[str, str]]:
    """Lazily flatten mappings and explode arrays of objects into logical rows."""
    if isinstance(value, Mapping):
        items = list(value.items())

        def walk(index: int, current: dict[str, str]) -> Iterator[dict[str, str]]:
            if index == len(items):
                yield dict(current)
                return
            key, child = items[index]
            child_prefix = f"{prefix}.{key}" if prefix else str(key)
            for fragment in expand_record(child, child_prefix):
                old = {name: current.get(name) for name in fragment}
                missing = [name for name in fragment if name not in current]
                current.update(fragment)
                yield from walk(index + 1, current)
                for name in missing:
                    current.pop(name, None)
                for name, previous in old.items():
                    if previous is not None:
                        current[name] = previous

        yield from walk(0, {})
    elif isinstance(value, list):
        if not value:
            yield {prefix: ""}
        elif all(not isinstance(item, (Mapping, list)) for item in value):
            yield {prefix: "|".join(_stringify(item) for item in value)}
        else:
            for item in value:
                yield from expand_record(item, prefix)
    else:
        yield {prefix: _stringify(value)}


def _iter_json_records(path: Path, spec: FileSpec) -> Iterator[tuple[Any, int]]:
    """Whole-file record iterator used by schema discovery."""
    tracker = TrackedBinaryReader(path)
    try:
        with _buffered(tracker) as binary:
            if spec.kind == "jsonl":
                with io.TextIOWrapper(binary, encoding=spec.encoding, errors="replace") as text:
                    for line in text:
                        if line.strip():
                            yield json.loads(line), tracker.bytes_read
            else:
                _skip_bom(binary)
                for item in ijson.items(binary, spec.json_prefix):
                    yield item, tracker.bytes_read
    finally:
        if not tracker.closed:
            tracker.close()


def discover_record_fields(
    path: Path,
    spec: FileSpec,
    total_bytes: int,
    callback: ProgressCallback | None = None,
    cancel: Any = None,
) -> tuple[list[str], list[dict[str, str]], int]:
    """Union the field names of record-shaped input under an explicit budget.

    Stops on whichever comes first: the CMS core fields are all present and the
    grace window has passed, or the record/byte cap is reached.
    """
    fields: dict[str, None] = {}
    examples: list[dict[str, str]] = []
    records = 0
    core_complete_at: int | None = None
    seen_leaves: set[str] = set()
    for item, bytes_read in _iter_json_records(path, spec):
        if cancel is not None and cancel.is_set():
            raise CancelledError("Schema scan cancelled.")
        records += 1
        for row in expand_record(item):
            for key in row:
                if key not in fields:
                    fields[key] = None
                    seen_leaves.add(normalize_header(key.rsplit(".", 1)[-1]))
            if len(examples) < SCHEMA_EXAMPLE_ROWS:
                examples.append(row)
        if callback is not None and records % 5_000 == 0:
            callback(Progress("Schema scan", records, len(fields), bytes_read, total_bytes))
        if records >= SCHEMA_MAX_RECORDS or bytes_read >= SCHEMA_MAX_BYTES:
            break
        if records < SCHEMA_MIN_RECORDS:
            continue
        if core_complete_at is None and CMS_CORE_LEAVES <= seen_leaves:
            core_complete_at = records
        if core_complete_at is not None and records - core_complete_at >= SCHEMA_GRACE_RECORDS:
            break
    if callback is not None:
        callback(Progress("Schema scan", records, len(fields), total_bytes, total_bytes))
    return sorted(fields), examples, records


def sample_schema(
    path_value: str | Path,
    header_row: int | None = None,
    callback: ProgressCallback | None = None,
    cancel: Any = None,
) -> SchemaSample:
    path = Path(path_value).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(path)
    kind = detect_kind(path)
    if kind == "csv":
        encoding, delimiter, detected_header, candidates = _detect_csv(path, header_row)
        spec = FileSpec(
            path=path, kind=kind, encoding=encoding, delimiter=delimiter, header_row=detected_header
        )
        csv.field_size_limit(min(2**31 - 1, sys.maxsize))
        reader = TrackedBinaryReader(path)
        try:
            with _buffered(reader) as binary:
                with io.TextIOWrapper(binary, encoding=encoding, newline="", errors="replace") as text:
                    rows = csv.reader(text, delimiter=delimiter)
                    for _ in range(detected_header):
                        next(rows, None)
                    raw_headers = next(rows, None)
                    if not raw_headers:
                        raise ValueError("The file does not contain a CSV header row.")
                    headers = _clean_headers(raw_headers)
                    examples = [
                        dict(zip(headers, row))
                        for row, _ in zip(rows, range(SCHEMA_EXAMPLE_ROWS))
                    ]
        finally:
            if not reader.closed:
                reader.close()
        return SchemaSample(spec, headers, examples, candidates)

    if kind == "json" and _looks_like_jsonl(path):
        kind = "jsonl"
    if kind == "jsonl":
        spec = FileSpec(path=path, kind=kind)
    else:
        spec = FileSpec(path=path, kind="json", json_prefix=discover_json_prefix(path))
    total_bytes = TrackedBinaryReader(path)
    try:
        size = total_bytes.total_bytes
    finally:
        total_bytes.close()
    headers, examples, records = discover_record_fields(path, spec, size, callback, cancel)
    if not headers:
        raise ValueError("No object records were found in the file.")
    return SchemaSample(spec, headers, examples, [], records_scanned=records)


def iter_rows(spec: FileSpec, tracker: TrackedBinaryReader | None = None) -> Iterator[dict[str, str]]:
    raw = tracker or TrackedBinaryReader(spec.path)
    owns_tracker = tracker is None
    try:
        if spec.kind == "csv":
            csv.field_size_limit(min(2**31 - 1, sys.maxsize))
            with _buffered(raw) as binary:
                with io.TextIOWrapper(binary, encoding=spec.encoding, newline="", errors="replace") as text:
                    reader = csv.reader(text, delimiter=spec.delimiter)
                    for _ in range(spec.header_row):
                        next(reader, None)
                    raw_headers = next(reader, None)
                    if raw_headers is None:
                        return
                    headers = _clean_headers(raw_headers)
                    for values in reader:
                        yield {
                            header: _stringify(values[index]) if index < len(values) else ""
                            for index, header in enumerate(headers)
                        }
        elif spec.kind == "jsonl":
            with _buffered(raw) as binary:
                with io.TextIOWrapper(binary, encoding=spec.encoding, errors="replace") as text:
                    for line in text:
                        if line.strip():
                            for row in expand_record(json.loads(line)):
                                yield row
        else:
            with _buffered(raw) as binary:
                _skip_bom(binary)
                for item in ijson.items(binary, spec.json_prefix):
                    yield from expand_record(item)
                # Ensure trailing bytes contribute to the full-file digest.
                while binary.read(1024 * 1024):
                    pass
    finally:
        if owns_tracker and not raw.closed:
            raw.close()

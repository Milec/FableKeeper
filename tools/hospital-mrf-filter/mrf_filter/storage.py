from __future__ import annotations

import gzip
import json
import os
import re
from pathlib import Path
from typing import Any


class AppStorage:
    def __init__(self, root: Path | None = None):
        self.root = root or Path(os.environ.get("MRF_FILTER_HOME", Path.home() / ".hospital_mrf_filter"))
        self.cache_dir = self.root / "cache"
        self.root.mkdir(parents=True, exist_ok=True)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.config_path = self.root / "config.json"
        self.index_path = self.root / "file_index.json"

    @staticmethod
    def _read_json(path: Path, default: Any) -> Any:
        try:
            with path.open("r", encoding="utf-8") as handle:
                return json.load(handle)
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return default

    @staticmethod
    def _write_json_atomic(path: Path, value: Any) -> None:
        temp = path.with_suffix(path.suffix + ".tmp")
        with temp.open("w", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2, sort_keys=True)
        temp.replace(path)

    @staticmethod
    def _source_key(source: str) -> str:
        return re.sub(r"[^a-z0-9]+", "-", source.lower()).strip("-")

    def load_mapping(self, source: str, headers: list[str]) -> dict[str, str]:
        data = self._read_json(self.config_path, {"mappings": {}})
        saved = data.get("mappings", {}).get(self._source_key(source), {})
        return {target: raw for target, raw in saved.items() if raw in headers}

    def save_mapping(self, source: str, mapping: dict[str, str]) -> None:
        data = self._read_json(self.config_path, {"mappings": {}})
        data.setdefault("mappings", {})[self._source_key(source)] = mapping
        self._write_json_atomic(self.config_path, data)

    def load_header_row(self, source: str) -> int | None:
        data = self._read_json(self.config_path, {"header_rows": {}})
        value = data.get("header_rows", {}).get(self._source_key(source))
        return value if isinstance(value, int) and value >= 0 else None

    def save_header_row(self, source: str, header_row: int) -> None:
        data = self._read_json(self.config_path, {"header_rows": {}})
        data.setdefault("header_rows", {})[self._source_key(source)] = header_row
        self._write_json_atomic(self.config_path, data)

    def _metadata_key(self, path: Path) -> str:
        stat = path.stat()
        return f"{path.resolve()}|{stat.st_size}|{stat.st_mtime_ns}"

    def known_hash(self, path: Path) -> str | None:
        return self._read_json(self.index_path, {}).get(self._metadata_key(path))

    def remember_hash(self, path: Path, digest: str) -> None:
        data = self._read_json(self.index_path, {})
        data[self._metadata_key(path)] = digest
        if len(data) > 100:
            data = dict(list(data.items())[-100:])
        self._write_json_atomic(self.index_path, data)

    @staticmethod
    def _column_key(column: str) -> str:
        import hashlib
        return hashlib.sha256(column.encode("utf-8")).hexdigest()[:16]

    def _cache_path(self, digest: str, column: str) -> Path:
        return self.cache_dir / f"{digest}.{self._column_key(column)}.json.gz"

    def load_distinct(self, digest: str, column: str) -> tuple[list[str], bool] | None:
        """Return (values, truncated) for a cached column, or None if not cached."""
        path = self._cache_path(digest, column)
        try:
            with gzip.open(path, "rt", encoding="utf-8") as handle:
                payload = json.load(handle)
            if payload.get("file_sha256") == digest and payload.get("column") == column:
                return payload.get("values", []), bool(payload.get("truncated"))
        except (FileNotFoundError, OSError, json.JSONDecodeError):
            pass
        return None

    def save_distinct(self, digest: str, column: str, values: set[str],
                      truncated: bool = False) -> None:
        """Cache a column's distinct values, recording whether the list is partial.

        A truncated list must never come back looking complete, or a later run
        would filter against a silently partial set of values.
        """
        path = self._cache_path(digest, column)
        temp = path.with_suffix(path.suffix + ".tmp")
        payload = {
            "file_sha256": digest,
            "column": column,
            "truncated": truncated,
            "values": sorted(values, key=str.casefold),
        }
        with gzip.open(temp, "wt", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False)
        temp.replace(path)

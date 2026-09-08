from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable


class CancelledError(RuntimeError):
    """Raised when a caller-supplied cancel event is set during a streaming pass."""


@dataclass(frozen=True)
class FileSpec:
    path: Path
    kind: str
    encoding: str = "utf-8-sig"
    delimiter: str = ","
    json_prefix: str | None = None
    header_row: int = 0


@dataclass
class SchemaSample:
    spec: FileSpec
    headers: list[str]
    examples: list[dict[str, str]] = field(default_factory=list)
    header_candidates: list[tuple[int, str, int]] = field(default_factory=list)
    records_scanned: int = 0


@dataclass(frozen=True)
class Progress:
    phase: str
    records: int
    matched: int
    bytes_read: int
    total_bytes: int
    elapsed: float = 0.0

    @property
    def fraction(self) -> float:
        return min(1.0, self.bytes_read / self.total_bytes) if self.total_bytes else 0.0

    @property
    def records_per_second(self) -> float:
        return self.records / self.elapsed if self.elapsed > 0 else 0.0

    @property
    def seconds_remaining(self) -> float | None:
        """Projected from bytes consumed; None until there is enough to project."""
        done = self.fraction
        if self.elapsed < 2.0 or done <= 0.01 or done >= 1.0:
            return None
        return self.elapsed * (1.0 - done) / done


@dataclass(frozen=True)
class ScanResult:
    """Distinct values for the scanned columns, and whether any list is partial."""

    values: dict[str, list[str]]
    truncated: frozenset[str]
    file_sha256: str
    from_cache: bool


ProgressCallback = Callable[[Progress], None]

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

    @property
    def fraction(self) -> float:
        return min(1.0, self.bytes_read / self.total_bytes) if self.total_bytes else 0.0


ProgressCallback = Callable[[Progress], None]

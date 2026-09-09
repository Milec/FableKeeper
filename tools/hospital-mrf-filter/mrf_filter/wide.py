"""Read the CMS "wide" CSV layout by unpivoting it into the tall one.

The tall layout gives every payer/plan its own row, with `payer_name` and
`plan_name` columns. The wide layout gives every payer/plan its own *columns*
and one row per item, so there is no payer column to filter on:

    standard_charge|Region Health Insurance|HMO|negotiated_dollar
    standard_charge|Region Health Insurance|HMO|methodology
    median_amount|Region Health Insurance|HMO

Rather than teach the rest of the application a second shape, one wide row is
expanded here into one row per payer/plan that actually carries a value, with
the block's columns renamed to their tall equivalents. Everything downstream —
the column mapper, the distinct-value scan, the filters, the export — then sees
a tall file and needs no special case.

Column names follow the CMS v3.0.0 template (and v2.0.0, whose only difference
here is `estimated_amount` in place of the percentile statistics).
"""
from __future__ import annotations

from collections.abc import Iterator, Sequence
from dataclasses import dataclass

SEPARATOR = "|"
CHARGE_PREFIX = "standard_charge"

# Four-part columns: standard_charge | payer | plan | <metric>
PAYER_METRICS = frozenset({
    "negotiated_dollar", "negotiated_percentage", "negotiated_algorithm", "methodology",
})

# Three-part columns: <statistic> | payer | plan. The prefix is the whole name,
# so these must be listed: "code|1|type" is also three parts and is not a payer
# column.
PAYER_STATISTICS = frozenset({
    "median_amount", "10th_percentile", "90th_percentile", "count",
    "additional_payer_notes", "estimated_amount",
})

PAYER_NAME = "payer_name"
PLAN_NAME = "plan_name"


@dataclass(frozen=True)
class PayerColumn:
    """One wide column, and the tall column it becomes."""

    payer: str
    plan: str
    tall_name: str


def parse_payer_column(header: str) -> PayerColumn | None:
    """Recognise a payer-specific wide column, or return None for a shared one."""
    parts = [part.strip() for part in header.split(SEPARATOR)]
    if len(parts) >= 4 and parts[0] == CHARGE_PREFIX and parts[-1] in PAYER_METRICS:
        # A plan name containing a separator is not legal, but splitting the
        # middle towards the plan keeps such a file readable rather than fatal.
        return PayerColumn(parts[1], SEPARATOR.join(parts[2:-1]),
                           f"{CHARGE_PREFIX}{SEPARATOR}{parts[-1]}")
    if len(parts) >= 3 and parts[0] in PAYER_STATISTICS:
        return PayerColumn(parts[1], SEPARATOR.join(parts[2:]), parts[0])
    return None


@dataclass(frozen=True)
class PayerBlock:
    payer: str
    plan: str
    fields: tuple[tuple[int, str], ...]  # (column index, tall column name)


@dataclass(frozen=True)
class WideLayout:
    """How to turn one physical wide row into its logical tall rows."""

    shared: tuple[tuple[int, str], ...]
    blocks: tuple[PayerBlock, ...]
    tall_headers: tuple[str, ...]

    @property
    def payer_plans(self) -> int:
        return len(self.blocks)

    def expand(self, values: Sequence[str]) -> Iterator[dict[str, str]]:
        """Yield one row per payer/plan that carries any value on this row.

        A hospital with 60 payers publishes 60 blocks on every row and fills a
        handful; emitting the empty ones would multiply the file by 60 and add
        nothing.
        """
        width = len(values)
        base = {name: values[index] for index, name in self.shared if index < width}
        for block in self.blocks:
            cells = [(name, values[index]) for index, name in block.fields if index < width]
            if not any(value for _name, value in cells):
                continue
            row = dict(base)
            row[PAYER_NAME] = block.payer
            row[PLAN_NAME] = block.plan
            row.update(cells)
            yield row


def detect_wide(headers: Sequence[str]) -> WideLayout | None:
    """Build a layout if these headers are the wide shape, else None.

    A file that already has its own `payer_name` column is tall (or malformed);
    either way its payer column is authoritative and nothing is unpivoted.
    """
    if PAYER_NAME in headers:
        return None

    shared: list[tuple[int, str]] = []
    grouped: dict[tuple[str, str], list[tuple[int, str]]] = {}
    tall_field_names: list[str] = []
    for index, header in enumerate(headers):
        column = parse_payer_column(header)
        if column is None:
            shared.append((index, header))
            continue
        grouped.setdefault((column.payer, column.plan), []).append((index, column.tall_name))
        if column.tall_name not in tall_field_names:
            tall_field_names.append(column.tall_name)

    if not grouped:
        return None

    blocks = tuple(
        PayerBlock(payer, plan, tuple(fields)) for (payer, plan), fields in grouped.items()
    )
    tall_headers = tuple(
        [name for _index, name in shared] + [PAYER_NAME, PLAN_NAME] + tall_field_names
    )
    return WideLayout(tuple(shared), blocks, tall_headers)

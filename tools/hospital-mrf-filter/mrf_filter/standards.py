from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from rapidfuzz import fuzz


@dataclass(frozen=True)
class TargetField:
    name: str
    label: str
    aliases: tuple[str, ...]
    # Whether the field is offered as a filter column. A per-service description
    # is close to unique per row — millions of values on a system-wide file —
    # and nobody picks a rate by matching its full description text, so scanning
    # it only costs a pass and a large set.
    filterable: bool = True


# ``aliases`` leads with the canonical CMS column names for the v2.x/v3.0 CSV
# template and the equivalent JSON keys, so a conforming file maps exactly and
# fuzzy matching is only ever a fallback for hospital-specific wording.
TARGET_FIELDS = (
    TargetField("description", "Description", (
        "description", "service description", "item description", "procedure description"),
        filterable=False),
    TargetField("setting", "Setting", (
        "setting", "patient setting", "inpatient outpatient")),
    TargetField("billing_class", "Billing class", (
        "billing_class", "billing class", "facility professional")),
    TargetField("billing_code", "Billing code", (
        "code|1", "code_information.code", "code", "billing code", "service code", "procedure code", "ms drg")),
    TargetField("billing_code_type", "Billing code type", (
        "code|1|type", "code_information.type", "billing code type", "code type", "coding system")),
    TargetField("billing_code_type_version", "Code type version", (
        "code|1|version", "billing code type version", "code version")),
    TargetField("payer_name", "Payer name", (
        "payer_name", "payers_information.payer_name", "payer", "mao name",
        "insurance company", "contracting entity")),
    TargetField("plan_name", "Plan name", (
        "plan_name", "payers_information.plan_name", "plan", "product name", "network name")),
    TargetField("negotiated_dollar_amount", "Negotiated dollar amount", (
        "standard_charge|negotiated_dollar", "payers_information.standard_charge_dollar",
        "standard_charge_dollar", "negotiated dollar amount", "negotiated rate",
        "contracted rate", "allowed amount", "negotiated charge")),
    TargetField("negotiated_percentage", "Negotiated percentage", (
        "standard_charge|negotiated_percentage", "payers_information.standard_charge_percentage",
        "standard_charge_percentage", "negotiated percentage", "percent of charge")),
    TargetField("negotiated_algorithm", "Negotiated algorithm", (
        "standard_charge|negotiated_algorithm", "payers_information.standard_charge_algorithm",
        "standard_charge_algorithm", "negotiated algorithm", "formula")),
    TargetField("standard_charge_methodology", "Charge methodology", (
        "standard_charge|methodology", "payers_information.methodology",
        "standard charge methodology", "rate methodology")),
    TargetField("estimated_amount", "Estimated amount", (
        "estimated_amount", "payers_information.estimated_amount",
        "estimated allowed amount", "consumer friendly expected amount")),
    TargetField("gross_charge", "Gross charge", (
        "standard_charge|gross", "gross_charge", "gross price", "charge amount")),
    TargetField("discounted_cash_price", "Discounted cash price", (
        "standard_charge|discounted_cash", "discounted_cash", "discounted cash price",
        "cash price", "self pay price")),
    TargetField("minimum", "Minimum negotiated charge", (
        "standard_charge|min", "minimum", "minimum negotiated charge", "min rate")),
    TargetField("maximum", "Maximum negotiated charge", (
        "standard_charge|max", "maximum", "maximum negotiated charge", "max rate")),
    TargetField("drug_unit_of_measurement", "Drug unit of measurement", (
        "drug_unit_of_measurement", "drug_information.unit", "drug unit", "unit of measure")),
    TargetField("drug_type_of_measurement", "Drug measurement type", (
        "drug_type_of_measurement", "drug_information.type", "measurement type")),
    TargetField("modifiers", "Modifiers", (
        "modifiers", "modifier_code", "modifier")),
    TargetField("additional_generic_notes", "Additional notes", (
        "additional_generic_notes", "additional notes", "notes", "comments")),
)

TARGET_BY_NAME = {field.name: field for field in TARGET_FIELDS}

# Below this blended token score a fuzzy guess is more likely to mislead than
# to help, so the field is left unmapped for the operator to fill in.
MATCH_THRESHOLD = 78
EXACT_SCORE = 100

# A leaf shared by this many columns is a repeated per-payer block in a "wide"
# CMS file; matching on it would pick one payer's column arbitrarily.
MAX_SHARED_LEAF = 2


def normalize_header(value: str) -> str:
    """Reduce a raw column name or JSON path to lowercase alphanumeric words."""
    value = value.replace(".item.", ".")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", value.lower())).strip()


def _segments(header: str) -> list[str]:
    return [segment for segment in header.replace(".item.", ".").split(".") if segment]


@dataclass(frozen=True)
class HeaderForms:
    """How one MRF column is offered to the matcher.

    ``exact`` holds the full path and its trailing segments, so the canonical
    alias ``payers_information.payer_name`` matches the real column
    ``standard_charges.payers_information.payer_name``. ``fuzzy`` holds the leaf
    alone: fuzzy-matching whole JSON paths rewards a shared path prefix, which
    scored "...payers_information.count" 83 against "estimated amount".
    """

    exact: frozenset[str]
    fuzzy: str


def header_forms(header: str, allow_leaf: bool = True) -> HeaderForms:
    full = normalize_header(header)
    segments = _segments(header)
    exact = {full}
    if allow_leaf and len(segments) > 1:
        exact.add(normalize_header(segments[-1]))
        exact.add(normalize_header(".".join(segments[-2:])))
    fuzzy = normalize_header(segments[-1]) if allow_leaf and segments else full
    return HeaderForms(frozenset(form for form in exact if form), fuzzy or full)


def _blended(left: str, right: str) -> float:
    """Token-based similarity.

    ``WRatio`` is deliberately avoided: its partial-ratio component scores short
    junk columns against long names ("count" against "discounted cash price"
    scores 90), which produced confidently wrong CMS mappings.
    """
    return 0.6 * fuzz.token_set_ratio(left, right) + 0.4 * fuzz.token_sort_ratio(left, right)


def score_header(field: TargetField, forms: HeaderForms) -> int:
    best = 0.0
    for alias in field.aliases:
        if normalize_header(alias) in forms.exact:
            return EXACT_SCORE
        best = max(best, _blended(forms.fuzzy, normalize_header(alias.split(".")[-1])))
    return int(round(best))


def suggest_mappings(headers: list[str]) -> dict[str, tuple[str | None, int]]:
    """Assign each standard field at most one MRF column, best pairs first.

    Scoring every (field, column) pair and then consuming them in descending
    score order avoids the field-order bias of a per-field greedy search, where
    an early field could claim a column that a later field matched far better.
    """
    leaf_counts: dict[str, int] = {}
    for header in headers:
        segments = _segments(header)
        if len(segments) > 1:
            leaf = normalize_header(segments[-1])
            leaf_counts[leaf] = leaf_counts.get(leaf, 0) + 1
    forms_by_header = {}
    for header in headers:
        segments = _segments(header)
        leaf = normalize_header(segments[-1]) if len(segments) > 1 else ""
        allow_leaf = leaf_counts.get(leaf, 0) <= MAX_SHARED_LEAF
        forms_by_header[header] = header_forms(header, allow_leaf=allow_leaf)

    pairs: list[tuple[int, int, int, str, str]] = []
    best_scores: dict[str, int] = {}
    for field_index, field in enumerate(TARGET_FIELDS):
        for header_index, header in enumerate(headers):
            score = score_header(field, forms_by_header[header])
            best_scores[field.name] = max(best_scores.get(field.name, 0), score)
            if score >= MATCH_THRESHOLD:
                pairs.append((-score, field_index, header_index, field.name, header))
    pairs.sort()

    suggestions: dict[str, tuple[str | None, int]] = {}
    taken_headers: set[str] = set()
    for negative_score, _field_index, _header_index, target, header in pairs:
        if target in suggestions or header in taken_headers:
            continue
        suggestions[target] = (header, -negative_score)
        taken_headers.add(header)
    for field in TARGET_FIELDS:
        suggestions.setdefault(field.name, (None, best_scores.get(field.name, 0)))
    return {field.name: suggestions[field.name] for field in TARGET_FIELDS}


# MS-DRG numbers collide with 3-digit revenue codes and with the other DRG
# groupers, whose 470 is not this 470. Only these spellings identify a code as
# belonging to the bundled MS-DRG reference; "APR-DRG" and friends are excluded
# on purpose.
MS_DRG_CODE_TYPES = frozenset({"ms drg", "msdrg", "drg"})


def is_ms_drg_type(value: object) -> bool:
    return normalize_header(str(value or "")) in MS_DRG_CODE_TYPES


def normalize_drg(value: object) -> str:
    text = str(value or "").strip()
    if text.isdigit() and len(text) <= 3:
        return text.zfill(3)
    match = re.search(r"(?<!\d)(\d{1,3})(?!\d)", text)
    return match.group(1).zfill(3) if match else text.upper()


def ms_drg_reference() -> list[str]:
    path = Path(__file__).with_name("reference") / "ms_drg_codes_fy2026.csv"
    return [code.strip() for code in path.read_text(encoding="ascii").replace("\n", ",").split(",") if code.strip()]

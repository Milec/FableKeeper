"""End-to-end check that a built application actually works on this machine.

A PyInstaller build can compile cleanly and still be broken: the MS-DRG
reference not bundled, ijson silently falling back to its pure-Python backend
(roughly ten times slower on the JSON path), or Tk missing. This runs the whole
pipeline over a small generated file and reports what it found, so a release
binary can be checked on a platform without a developer install.
"""
from __future__ import annotations

import csv
import json
import sys
import tempfile
from pathlib import Path

from . import __version__
from .engine import export_filtered, scan_distinct
from .readers import sample_schema
from .standards import ms_drg_reference, suggest_mappings
from .storage import AppStorage

CMS_TALL_HEADER = (
    "description,code|1,code|1|type,setting,standard_charge|gross,"
    "standard_charge|discounted_cash,payer_name,plan_name,"
    "standard_charge|negotiated_dollar,standard_charge|methodology,billing_class"
)

# The same services in the CMS wide layout, which the reader unpivots. Column
# names here are pipe-heavy on purpose: they are what made delimiter detection
# pick "|" over "," on a comma-separated file.
CMS_WIDE_HEADER = (
    "description,code|1,code|1|type,setting,standard_charge|gross,"
    "standard_charge|discounted_cash,"
    "standard_charge|Aetna|PPO|negotiated_dollar,standard_charge|Aetna|PPO|methodology,"
    "standard_charge|Cigna|HMO|negotiated_dollar,standard_charge|Cigna|HMO|methodology"
)
CSV_ROWS = [
    ("Septicemia", "871", "MS-DRG", "Aetna", "PPO", "12500"),
    ("Septicemia", "871", "MS-DRG", "Cigna", "HMO", "11800"),
    ("Major joint replacement", "470", "MS-DRG", "Aetna", "PPO", "22000"),
    ("Nystagmus test", "470", "RC", "Aetna", "PPO", "1245"),
]


def _write_csv(path: Path) -> None:
    lines = [
        "hospital_name,last_updated_on,version,location_name,hospital_address,license_number|ME",
        'Self Test Health,2026-01-01,3.0.0,Self Test Hospital,"1 Test Way, Portland, ME 04101",1',
        CMS_TALL_HEADER,
    ]
    for description, code, code_type, payer, plan, dollar in CSV_ROWS:
        lines.append(f"{description},{code},{code_type},inpatient,30000.00,24000.00,"
                     f"{payer},{plan},{dollar},fee schedule,facility")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _write_wide_csv(path: Path) -> None:
    """One line per service, one column block per payer."""
    lines = [
        "hospital_name,last_updated_on,version,location_name",
        "Self Test Health,2026-01-01,3.0.0,Self Test Hospital",
        CMS_WIDE_HEADER,
    ]
    by_service: dict[tuple[str, str, str], dict[str, str]] = {}
    for description, code, code_type, payer, _plan, dollar in CSV_ROWS:
        by_service.setdefault((description, code, code_type), {})[payer] = dollar
    for (description, code, code_type), payers in by_service.items():
        aetna, cigna = payers.get("Aetna", ""), payers.get("Cigna", "")
        lines.append(
            f"{description},{code},{code_type},inpatient,30000.00,24000.00,"
            f"{aetna},{'fee schedule' if aetna else ''},"
            f"{cigna},{'fee schedule' if cigna else ''}"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _write_json(path: Path) -> None:
    payload = {
        "hospital_name": "Self Test Hospital",
        "standard_charge_information": [
            {
                "description": description,
                "code_information": [{"code": code, "type": code_type}],
                "standard_charges": [{
                    "setting": "inpatient",
                    "billing_class": "facility",
                    "gross_charge": 30000.0,
                    "discounted_cash": 24000.0,
                    "payers_information": [{
                        "payer_name": payer,
                        "plan_name": plan,
                        "standard_charge_dollar": float(dollar),
                        "methodology": "fee schedule",
                    }],
                }],
            }
            for description, code, code_type, payer, plan, dollar in CSV_ROWS
        ],
    }
    # A BOM, as most real hospital exports carry.
    path.write_bytes(b"\xef\xbb\xbf" + json.dumps(payload).encode("utf-8"))


def _check_pipeline(source: Path, storage: AppStorage, expect_kind: str,
                    expect_wide: bool = False) -> list[str]:
    problems: list[str] = []
    sample = sample_schema(source)
    if sample.spec.kind != expect_kind:
        problems.append(f"{source.name}: detected as {sample.spec.kind}, expected {expect_kind}")
    if expect_wide and not sample.spec.wide:
        problems.append(f"{source.name}: the wide layout was not recognised, so it was read "
                        f"with delimiter {sample.spec.delimiter!r} and has no payer column")
    mapping = {target: raw for target, (raw, _score) in suggest_mappings(sample.headers).items() if raw}
    for required in ("description", "payer_name", "billing_code", "billing_code_type",
                     "negotiated_dollar_amount"):
        if required not in mapping:
            problems.append(f"{source.name}: {required} did not map")
    if problems:
        return problems

    scan = scan_distinct(sample.spec, [mapping["payer_name"]], storage)
    if scan.values[mapping["payer_name"]] != ["Aetna", "Cigna"]:
        problems.append(f"{source.name}: distinct payers were {scan.values[mapping['payer_name']]}")

    output = source.with_suffix(".out.csv")
    processed, matched = export_filtered(
        sample.spec, output, mapping, {"payer_name": {"Aetna"}, "billing_code": {"470"}},
        {"billing_code"}, drg_type_column=mapping["billing_code_type"])
    if (processed, matched) != (4, 1):
        problems.append(f"{source.name}: processed/matched were {processed}/{matched}, expected 4/1")
    with output.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if len(rows) != 1 or rows[0]["billing_code_type"] != "MS-DRG":
        problems.append(f"{source.name}: the MS-DRG guard let a revenue code through")
    return problems


def run(stream=None) -> int:
    """Run the checks, print a report, and return a process exit code."""
    out = stream or sys.stdout
    problems: list[str] = []

    print(f"Hospital MRF Filter {__version__}", file=out)
    print(f"  python           {sys.version.split()[0]} on {sys.platform}", file=out)
    print(f"  frozen           {getattr(sys, 'frozen', False)}", file=out)

    try:
        import ijson
        backend = ijson.backend
    except Exception as exc:  # pragma: no cover - only in a broken build
        backend = f"unavailable ({exc})"
    print(f"  ijson backend    {backend}", file=out)
    if "yajl2_c" not in str(backend):
        problems.append(f"ijson is using the {backend} backend; the C backend was not bundled, "
                        "so JSON files will parse roughly ten times slower")

    try:
        import tkinter
        tk_version = str(tkinter.TkVersion)
    except Exception as exc:
        tk_version = f"unavailable ({exc})"
        problems.append(f"tkinter could not be imported: {exc}")
    print(f"  tk               {tk_version}", file=out)

    try:
        codes = ms_drg_reference()
        print(f"  MS-DRG reference {len(codes)} codes", file=out)
        if len(codes) != 772:
            problems.append(f"the MS-DRG reference holds {len(codes)} codes, expected 772")
    except Exception as exc:
        print("  MS-DRG reference unavailable", file=out)
        problems.append(f"the MS-DRG reference was not bundled: {exc}")

    with tempfile.TemporaryDirectory(prefix="mrf-selftest-") as temp:
        root = Path(temp)
        storage = AppStorage(root / "state")
        _write_csv(root / "rates.csv")
        _write_wide_csv(root / "wide.csv")
        _write_json(root / "rates.json")
        checks = (
            ("tall csv", root / "rates.csv", "csv", False),
            ("wide csv", root / "wide.csv", "csv", True),
            ("json", root / "rates.json", "json", False),
        )
        for label, source, kind, wide in checks:
            try:
                problems.extend(_check_pipeline(source, storage, kind, wide))
                print(f"  {label:16s} sampled, scanned, filtered and exported", file=out)
            except Exception as exc:
                problems.append(f"{source.name}: {type(exc).__name__}: {exc}")

    if problems:
        print("\nFAILED", file=out)
        for problem in problems:
            print(f"  - {problem}", file=out)
        return 1
    print("\nOK", file=out)
    return 0

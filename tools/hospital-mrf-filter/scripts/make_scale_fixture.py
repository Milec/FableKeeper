#!/usr/bin/env python3
"""Generate a large CMS-format MRF so the scale numbers in the README can be rechecked.

    python scripts/make_scale_fixture.py csv   50000000 /tmp/scale.csv     #  ~9.0 GB
    python scripts/make_scale_fixture.py jsonl  5000000 /tmp/scale.jsonl   #  ~7.3 GB

The CSV is the CMS v3.0 "tall" template, two metadata rows then the header row.
The JSON Lines file is one CMS ``standard_charge_information`` record per line,
each expanding to ten logical rows. Descriptions cycle through two million
distinct values so the distinct-value cap is exercised; payers and settings use
coprime cycle lengths so any payer/setting pair actually occurs.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

DISTINCT_DESCRIPTIONS = 2_000_000
PAYERS = ["Aetna", "Anthem", "Cigna", "United Healthcare", "Humana", "Wellcare",
          "Blue Cross Regence", "Molina Healthcare", "Centene", "Kaiser Permanente"]
PLANS = ["HMO Commercial", "PPO Commercial", "Medicare Advantage", "EPO Select",
         "POS Choice", "PPO Preferred", "HMO Essential"]
SETTINGS = ["inpatient", "outpatient", "both"]
CODE_TYPES = ["CPT", "HCPCS", "RC", "MS-DRG", "CDM"]
METHODS = ["fee schedule", "percent of total billed charges", "case rate", "per diem", "other"]
PROCS = ["ANGIOGRAPHY NECK", "MAMMOTOME MARKER", "CRISIS PSYCHOTHRPY", "ASSAY VASOPRESSIN",
         "SUCTION SECRETIONS", "CHEMO ANTINEOPL", "SPINE STIM ANALYSIS", "CT ABDOMEN",
         "MRI BRAIN", "ECHO TRANSTHORACIC"]

CMS_TALL_HEADER = (
    "description,code|1,code|1|type,code|2,code|2|type,code|3,code|3|type,code|4,code|4|type,"
    "modifiers,setting,drug_unit_of_measurement,drug_type_of_measurement,standard_charge|gross,"
    "standard_charge|discounted_cash,payer_name,plan_name,standard_charge|negotiated_dollar,"
    "standard_charge|negotiated_percentage,standard_charge|negotiated_algorithm,median_amount,"
    "10th_percentile,90th_percentile,count,standard_charge|methodology,standard_charge|min,"
    "standard_charge|max,additional_generic_notes,additional_payer_notes,billing_class"
)


def description(index: int) -> str:
    return f"HC {PROCS[index % 10]} {index % DISTINCT_DESCRIPTIONS:07d}"


def write_csv(rows: int, out: Path) -> None:
    with out.open("w", encoding="utf-8", newline="\n", buffering=8 * 1024 * 1024) as handle:
        handle.write("hospital_name,last_updated_on,version,location_name,"
                     "hospital_address,license_number|OR\n")
        handle.write('Scale Test Health,2026-09-01,3.0.0,Scale Test Hospital,'
                     '"1 Test Way, Portland, OR 97201",99999\n')
        handle.write(CMS_TALL_HEADER + "\n")
        chunk: list[str] = []
        for index in range(rows):
            gross = 100 + index % 90000
            chunk.append(
                f"{description(index)},{10000 + index % 89999},{CODE_TYPES[index % 5]},"
                f"{10001 + index % 89999},RC,,,,,,{SETTINGS[index % 3]},,,{gross}.00,"
                f"{gross * 0.8:.2f},{PAYERS[index % 10]},{PLANS[index % 7]},"
                f"{gross * 0.62:.2f},62.00,,,,,{index % 97},{METHODS[index % 5]},"
                f"{gross * 0.4:.2f},{gross * 0.9:.2f},,,facility\n"
            )
            if len(chunk) >= 100_000:
                handle.write("".join(chunk))
                chunk = []
        handle.write("".join(chunk))


def write_jsonl(records: int, out: Path) -> None:
    with out.open("w", encoding="utf-8", buffering=8 * 1024 * 1024) as handle:
        chunk: list[str] = []
        for index in range(records):
            gross = 100 + index % 90000
            chunk.append(json.dumps({
                "description": description(index),
                "code_information": [{"code": str(10000 + index % 89999), "type": "CPT"}],
                "standard_charges": [{
                    "setting": SETTINGS[index % 3],
                    "billing_class": "facility",
                    "gross_charge": gross,
                    "discounted_cash": round(gross * 0.8, 2),
                    "minimum": round(gross * 0.4, 2),
                    "maximum": round(gross * 0.9, 2),
                    "payers_information": [
                        {"payer_name": PAYERS[(index + offset) % 10],
                         "plan_name": PLANS[(index + offset) % 7],
                         "standard_charge_dollar": round(gross * (0.5 + offset / 40), 2),
                         "methodology": METHODS[offset % 5]}
                        for offset in range(10)
                    ],
                }],
            }, separators=(",", ":")))
            if len(chunk) >= 20_000:
                handle.write("\n".join(chunk) + "\n")
                chunk = []
        if chunk:
            handle.write("\n".join(chunk) + "\n")


def main() -> int:
    if len(sys.argv) != 4 or sys.argv[1] not in {"csv", "jsonl"}:
        print(__doc__)
        return 2
    kind, count, out = sys.argv[1], int(sys.argv[2]), Path(sys.argv[3])
    started = time.time()
    (write_csv if kind == "csv" else write_jsonl)(count, out)
    size = out.stat().st_size
    rows = count if kind == "csv" else count * 10
    print(f"{out}: {rows:,} logical rows, {size / 1e9:.2f} GB, {time.time() - started:.0f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

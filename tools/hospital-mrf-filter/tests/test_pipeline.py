from __future__ import annotations

import csv
import gzip
import json
import subprocess
import sys
import threading
import time
import zipfile
from pathlib import Path

import pytest

from mrf_filter.engine import export_filtered, scan_distinct
from mrf_filter.model import CancelledError, FileSpec, Progress
from mrf_filter.readers import container_suffix, detect_kind, iter_rows, sample_schema
from mrf_filter.standards import (
    is_ms_drg_type,
    ms_drg_reference,
    normalize_drg,
    suggest_mappings,
)
from mrf_filter.storage import AppStorage


# The column list published in the CMS v3.0 "tall" CSV template, verbatim. Both
# MaineHealth's and OHSU's real files use exactly this header row.
CMS_TALL_HEADER = (
    "description,code|1,code|1|type,code|2,code|2|type,code|3,code|3|type,code|4,code|4|type,"
    "modifiers,setting,drug_unit_of_measurement,drug_type_of_measurement,standard_charge|gross,"
    "standard_charge|discounted_cash,payer_name,plan_name,standard_charge|negotiated_dollar,"
    "standard_charge|negotiated_percentage,standard_charge|negotiated_algorithm,median_amount,"
    "10th_percentile,90th_percentile,count,standard_charge|methodology,standard_charge|min,"
    "standard_charge|max,additional_generic_notes,additional_payer_notes,billing_class"
)


def write_cms_csv(path: Path, rows: list[str]) -> Path:
    """A CMS tall CSV: two metadata rows, then the header row, then data."""
    body = "\n".join([
        "hospital_name,last_updated_on,version,location_name,hospital_address,license_number|ME",
        'Example Health,2026-04-01,3.0.0,Example Hospital,"1 Main St, Portland, ME 04101",39953',
        CMS_TALL_HEADER,
        *rows,
    ])
    path.write_text(body + "\n", encoding="utf-8")
    return path


def cms_row(description: str, code: str, code_type: str, payer: str, plan: str, dollar: str) -> str:
    cells = [""] * 30
    cells[0] = description
    cells[1], cells[2] = code, code_type
    cells[10] = "inpatient"
    cells[13], cells[14] = "1000.00", "800.00"
    cells[15], cells[16], cells[17] = payer, plan, dollar
    cells[23] = "7"
    cells[24] = "fee schedule"
    cells[29] = "facility"
    return ",".join(cells)


def cms_json_record(description: str, code: str, code_type: str, payers: list[dict] | None) -> dict:
    charge: dict = {"setting": "inpatient", "billing_class": "facility", "gross_charge": 1000.0,
                    "discounted_cash": 800.0}
    if payers is not None:
        charge["payers_information"] = payers
        charge["minimum"] = 500.0
        charge["maximum"] = 900.0
    return {
        "description": description,
        "code_information": [{"code": code, "type": code_type}],
        "standard_charges": [charge],
    }


def payer(name: str, plan: str, dollar: float) -> dict:
    return {"payer_name": name, "plan_name": plan, "standard_charge_dollar": dollar,
            "methodology": "fee schedule"}


def test_csv_end_to_end_and_cache(tmp_path: Path) -> None:
    source = tmp_path / "rates.csv"
    source.write_text(
        "Service Description,Code Type,Code,Payer / MAO,Plan,Negotiated Rate\n"
        "Sepsis,MS-DRG,871,Aetna,PPO,12500\n"
        "Sepsis,MS-DRG,871,Cigna,HMO,11800\n"
        "Joint replacement,MS-DRG,470,Aetna,PPO,22000\n",
        encoding="utf-8",
    )
    sample = sample_schema(source)
    assert sample.spec.kind == "csv"
    suggestions = suggest_mappings(sample.headers)
    assert suggestions["payer_name"][0] == "Payer / MAO"
    storage = AppStorage(tmp_path / "state")
    scan = scan_distinct(sample.spec, ["Payer / MAO", "Plan"], storage)
    assert scan.values["Payer / MAO"] == ["Aetna", "Cigna"]
    assert len(scan.file_sha256) == 64 and not scan.from_cache and not scan.truncated
    again = scan_distinct(sample.spec, ["Payer / MAO", "Plan"], storage)
    assert again.values == scan.values and again.file_sha256 == scan.file_sha256
    assert again.from_cache and not again.truncated

    output = tmp_path / "out.csv"
    mapping = {
        "description": "Service Description", "billing_code_type": "Code Type",
        "billing_code": "Code", "payer_name": "Payer / MAO",
        "plan_name": "Plan", "negotiated_dollar_amount": "Negotiated Rate",
    }
    processed, matched = export_filtered(
        sample.spec, output, mapping,
        {"payer_name": {"Aetna"}, "billing_code": {"871"}}, {"billing_code"},
        drg_type_column="Code Type")
    assert (processed, matched) == (3, 1)
    with output.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    assert rows[0]["payer_name"] == "Aetna"
    assert set(rows[0]) == set(mapping)


def test_csv_metadata_preamble_header_detection_override_and_persistence(tmp_path: Path) -> None:
    source = tmp_path / "hospital_preamble.csv"
    source.write_text(
        "Hospital Name,East Tennessee Medical Center\n"
        "Hospital Location,Knoxville TN\n"
        "Last Updated,2026-08-01\n"
        "Description,Code Type,Code,Payer Name,Plan Name,Negotiated Dollar Amount\n"
        "Sepsis,MS-DRG,871,Aetna,PPO,12500\n"
        "Joint replacement,MS-DRG,470,Cigna,HMO,22000\n",
        encoding="utf-8",
    )
    sample = sample_schema(source)
    assert sample.spec.header_row == 3
    assert sample.headers[0] == "Description"
    assert any(candidate[0] == 3 for candidate in sample.header_candidates)

    storage = AppStorage(tmp_path / "state")
    storage.save_header_row("ETMC", sample.spec.header_row)
    storage.save_mapping("ETMC", {"payer_name": "Payer Name"})
    assert storage.load_header_row("ETMC") == 3
    assert storage.load_mapping("ETMC", sample.headers) == {"payer_name": "Payer Name"}

    assert scan_distinct(sample.spec, ["Payer Name"], storage).values["Payer Name"] == ["Aetna", "Cigna"]
    output = tmp_path / "preamble_out.csv"
    processed, matched = export_filtered(
        sample.spec,
        output,
        {"description": "Description", "payer_name": "Payer Name"},
        {"payer_name": {"Cigna"}},
    )
    assert (processed, matched) == (2, 1)
    assert "Joint replacement" in output.read_text(encoding="utf-8-sig")

    overridden = sample_schema(source, header_row=3)
    assert overridden.spec.header_row == 3


def test_pipe_file_with_comma_rich_preamble(tmp_path: Path) -> None:
    source = tmp_path / "rates.psv"
    source.write_text(
        'Facility note|"Rates for Knoxville, Maryville, and Oak Ridge"\n'
        "Generated|2026-08-01\n"
        "Item Description|Billing Code Type|Billing Code|MAO Name|Plan|Contracted Rate\n"
        "CT scan|CPT|74177|Acme Health|Commercial PPO|725.00\n",
        encoding="utf-8",
    )
    sample = sample_schema(source)
    assert sample.spec.delimiter == "|"
    assert sample.spec.header_row == 2
    assert sample.headers == [
        "Item Description", "Billing Code Type", "Billing Code",
        "MAO Name", "Plan", "Contracted Rate",
    ]


def test_nested_cms_json_is_streamed_and_exploded(tmp_path: Path) -> None:
    source = tmp_path / "rates.json"
    payload = {
        "hospital_name": "Example Hospital",
        "standard_charge_information": [
            {
                "description": "Sepsis",
                "code_information": [{"code": "871", "type": "MS-DRG"}],
                "standard_charges": [
                    {"payer_name": "Aetna", "plan_name": "PPO", "negotiated_dollar_amount": 10000},
                    {"payer_name": "Cigna", "plan_name": "HMO", "negotiated_dollar_amount": 9000},
                ],
            },
            {
                "description": "Joint replacement",
                "code_information": [{"code": "470", "type": "MS-DRG"}],
                "standard_charges": [
                    {"payer_name": "Aetna", "plan_name": "PPO", "negotiated_dollar_amount": 20000}
                ],
            },
        ],
    }
    source.write_text(json.dumps(payload), encoding="utf-8")
    sample = sample_schema(source)
    assert sample.spec.kind == "json"
    assert sample.spec.json_prefix == "standard_charge_information.item"
    assert "standard_charges.payer_name" in sample.headers
    storage = AppStorage(tmp_path / "state")
    scan = scan_distinct(sample.spec, ["standard_charges.payer_name"], storage)
    assert scan.values["standard_charges.payer_name"] == ["Aetna", "Cigna"]
    mapping = {
        "description": "description",
        "billing_code": "code_information.code",
        "billing_code_type": "code_information.type",
        "payer_name": "standard_charges.payer_name",
        "plan_name": "standard_charges.plan_name",
        "negotiated_dollar_amount": "standard_charges.negotiated_dollar_amount",
    }
    output = tmp_path / "aetna.csv"
    processed, matched = export_filtered(sample.spec, output, mapping, {"payer_name": {"Aetna"}})
    assert (processed, matched) == (3, 2)


def test_drg_normalization() -> None:
    assert normalize_drg("1") == "001"
    assert normalize_drg("MS-DRG 87") == "087"
    assert normalize_drg("871") == "871"
    codes = ms_drg_reference()
    assert len(codes) == 772
    assert "871" in codes and "009" not in codes


def test_cms_tall_csv_template_maps_to_the_right_columns(tmp_path: Path) -> None:
    """Every standard field present in the CMS template must map exactly.

    Fuzzy matching used to hand `negotiated_dollar_amount` the methodology
    column and `discounted_cash_price` the `count` column, which silently
    exported the wrong numbers.
    """
    source = write_cms_csv(tmp_path / "cms.csv", [
        cms_row("Sepsis", "871", "MS-DRG", "Aetna", "PPO", "12500"),
    ])
    sample = sample_schema(source)
    assert sample.spec.header_row == 2
    mapping = {target: raw for target, (raw, _score) in suggest_mappings(sample.headers).items()}
    assert mapping["description"] == "description"
    assert mapping["billing_code"] == "code|1"
    assert mapping["billing_code_type"] == "code|1|type"
    assert mapping["payer_name"] == "payer_name"
    assert mapping["plan_name"] == "plan_name"
    assert mapping["negotiated_dollar_amount"] == "standard_charge|negotiated_dollar"
    assert mapping["negotiated_percentage"] == "standard_charge|negotiated_percentage"
    assert mapping["standard_charge_methodology"] == "standard_charge|methodology"
    assert mapping["gross_charge"] == "standard_charge|gross"
    assert mapping["discounted_cash_price"] == "standard_charge|discounted_cash"
    assert mapping["minimum"] == "standard_charge|min"
    assert mapping["maximum"] == "standard_charge|max"
    assert mapping["billing_class"] == "billing_class"
    # Statistics columns are not standard charge fields and must stay unclaimed.
    assert mapping["estimated_amount"] is None
    assert mapping["billing_code_type_version"] is None
    assert "count" not in set(mapping.values())
    assert "median_amount" not in set(mapping.values())
    assert "10th_percentile" not in set(mapping.values())


def test_deep_json_paths_map_on_their_leaf(tmp_path: Path) -> None:
    """A shared path prefix must not lend a column someone else's meaning."""
    headers = [
        "description",
        "code_information.code",
        "code_information.type",
        "standard_charges.setting",
        "standard_charges.gross_charge",
        "standard_charges.discounted_cash",
        "standard_charges.minimum",
        "standard_charges.maximum",
        "standard_charges.payers_information.payer_name",
        "standard_charges.payers_information.plan_name",
        "standard_charges.payers_information.standard_charge_dollar",
        "standard_charges.payers_information.methodology",
        "standard_charges.payers_information.count",
        "standard_charges.payers_information.median_amount",
    ]
    mapping = {target: raw for target, (raw, _score) in suggest_mappings(headers).items()}
    assert mapping["payer_name"] == "standard_charges.payers_information.payer_name"
    assert mapping["negotiated_dollar_amount"] == "standard_charges.payers_information.standard_charge_dollar"
    assert mapping["standard_charge_methodology"] == "standard_charges.payers_information.methodology"
    assert mapping["minimum"] == "standard_charges.minimum"
    assert mapping["gross_charge"] == "standard_charges.gross_charge"
    assert mapping["estimated_amount"] is None
    assert "standard_charges.payers_information.count" not in set(mapping.values())


def test_utf8_bom_json_is_not_mistaken_for_csv(tmp_path: Path) -> None:
    """Stanford's 154 MB file starts with a BOM; suffix and content both say JSON."""
    source = tmp_path / "bom.json"
    payload = {"standard_charge_information": [cms_json_record(
        "Sepsis", "871", "MS-DRG", [payer("Aetna", "PPO", 12500.0)])]}
    source.write_bytes(b"\xef\xbb\xbf" + json.dumps(payload).encode("utf-8"))
    assert detect_kind(source) == "json"
    sample = sample_schema(source)
    assert sample.spec.kind == "json"
    assert "standard_charges.payers_information.payer_name" in sample.headers


def test_schema_scan_finds_payer_fields_that_appear_late(tmp_path: Path) -> None:
    """Payer fields commonly start thousands of records into a hospital's file.

    Sampling the first handful of records finds only the gross-charge shape, so
    payer_name is never offered and the tool cannot filter by payer at all.
    """
    records = [cms_json_record(f"Item {index}", f"PX-{index}", "CDM", None) for index in range(1200)]
    records.append(cms_json_record("Sepsis", "871", "MS-DRG", [payer("Aetna", "PPO", 12500.0)]))
    source = tmp_path / "late_payers.json"
    source.write_text(json.dumps({"standard_charge_information": records}), encoding="utf-8")

    sample = sample_schema(source)
    assert sample.records_scanned == 1201
    assert "standard_charges.payers_information.payer_name" in sample.headers
    mapping = {target: raw for target, (raw, _s) in suggest_mappings(sample.headers).items() if raw}
    assert mapping["payer_name"] == "standard_charges.payers_information.payer_name"


def test_schema_scan_stops_once_the_cms_core_fields_are_seen(tmp_path: Path, monkeypatch) -> None:
    from mrf_filter import readers

    monkeypatch.setattr(readers, "SCHEMA_MIN_RECORDS", 10)
    monkeypatch.setattr(readers, "SCHEMA_GRACE_RECORDS", 20)
    records = [cms_json_record("Sepsis", "871", "MS-DRG", [payer("Aetna", "PPO", 12500.0)])]
    records += [cms_json_record(f"Item {index}", f"PX-{index}", "CDM", None) for index in range(500)]
    source = tmp_path / "early_payers.json"
    source.write_text(json.dumps({"standard_charge_information": records}), encoding="utf-8")

    sample = sample_schema(source)
    assert sample.records_scanned < len(records)
    assert "standard_charges.payers_information.payer_name" in sample.headers


def test_gzip_and_zip_inputs_are_read_transparently(tmp_path: Path) -> None:
    rows = [cms_row("Sepsis", "871", "MS-DRG", "Aetna", "PPO", "12500"),
            cms_row("Sepsis", "871", "MS-DRG", "Cigna", "HMO", "11800")]
    plain = write_cms_csv(tmp_path / "plain.csv", rows)

    gz = tmp_path / "rates.csv.gz"
    gz.write_bytes(gzip.compress(plain.read_bytes()))
    archive = tmp_path / "rates.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as handle:
        handle.write(plain, arcname="standardcharges.csv")

    for source in (gz, archive):
        assert container_suffix(source) == ".csv"
        sample = sample_schema(source)
        assert sample.spec.kind == "csv"
        assert sample.spec.header_row == 2
        assert "payer_name" in sample.headers
        storage = AppStorage(tmp_path / f"state-{source.suffix}")
        scan = scan_distinct(sample.spec, ["payer_name"], storage)
        assert scan.values["payer_name"] == ["Aetna", "Cigna"]
        assert len(scan.file_sha256) == 64
        output = tmp_path / f"out{source.suffix}.csv"
        processed, matched = export_filtered(
            sample.spec, output, {"description": "description", "payer_name": "payer_name"},
            {"payer_name": {"Cigna"}})
        assert (processed, matched) == (2, 1)


def test_header_detection_is_bounded_on_a_pathological_row(tmp_path: Path) -> None:
    """A misdetected single-line document must not stall header scoring.

    Scoring every cell against every alias is quadratic, and a JSON document
    read as CSV presents one row of tens of thousands of cells.
    """
    source = tmp_path / "wide.txt"
    source.write_text(",".join(f"field_{index}" for index in range(60_000)) + "\n", encoding="utf-8")
    started = time.monotonic()
    sample = sample_schema(source)
    # Uncapped this row costs ~12s per delimiter tried; capped it is ~0.1s total.
    assert time.monotonic() - started < 15
    assert len(sample.headers) == 60_000


def test_undecodable_byte_does_not_abort_the_stream(tmp_path: Path) -> None:
    """OHSU's 298 MB export carries stray 0xDF bytes inside descriptions."""
    source = write_cms_csv(tmp_path / "bad_byte.csv", [
        cms_row("Acculink Carotid Sys", "C1876", "HCPCS", "Moda", "Select", "236.56"),
        cms_row("Vanseq Panel", "81479", "CPT", "Cigna", "Commercial", "100.00"),
    ])
    raw = source.read_bytes().replace(b"Vanseq Panel", b"Vanseq\xdfPanel")
    source.write_bytes(raw)

    sample = sample_schema(source)
    storage = AppStorage(tmp_path / "state")
    assert scan_distinct(sample.spec, ["payer_name"], storage).values["payer_name"] == ["Cigna", "Moda"]
    output = tmp_path / "out.csv"
    processed, matched = export_filtered(
        sample.spec, output, {"description": "description", "payer_name": "payer_name"}, {})
    assert (processed, matched) == (2, 2)
    assert "Vanseq" in output.read_text(encoding="utf-8-sig")


def test_ms_drg_filter_excludes_colliding_revenue_codes(tmp_path: Path) -> None:
    """Revenue code 470 is not MS-DRG 470."""
    source = write_cms_csv(tmp_path / "drg.csv", [
        cms_row("Major joint replacement", "470", "MS-DRG", "Aetna", "PPO", "22000"),
        cms_row("Nystagmus test", "470", "RC", "Aetna", "PPO", "1245"),
        cms_row("Septicemia", "871", "MS-DRG", "Aetna", "PPO", "12500"),
    ])
    sample = sample_schema(source)
    mapping = {target: raw for target, (raw, _s) in suggest_mappings(sample.headers).items() if raw}
    output = tmp_path / "drg_out.csv"
    processed, matched = export_filtered(
        sample.spec, output, mapping, {"billing_code": {"470", "871"}}, {"billing_code"},
        drg_type_column=mapping["billing_code_type"])
    assert (processed, matched) == (3, 2)
    with output.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    assert {row["billing_code_type"] for row in rows} == {"MS-DRG"}

    unguarded = tmp_path / "drg_unguarded.csv"
    _processed, unguarded_matched = export_filtered(
        sample.spec, unguarded, mapping, {"billing_code": {"470", "871"}}, {"billing_code"})
    assert unguarded_matched == 3

    assert is_ms_drg_type("MS-DRG") and is_ms_drg_type("ms drg") and is_ms_drg_type("DRG")
    assert not is_ms_drg_type("APR-DRG") and not is_ms_drg_type("RC")


def test_cancelling_an_export_removes_the_partial_file(tmp_path: Path) -> None:
    source = write_cms_csv(tmp_path / "cancel.csv", [
        cms_row(f"Item {index}", str(index), "CPT", "Aetna", "PPO", "100") for index in range(200)
    ])
    sample = sample_schema(source)
    output = tmp_path / "cancelled.csv"
    cancel = threading.Event()
    cancel.set()
    with pytest.raises(CancelledError):
        export_filtered(sample.spec, output, {"description": "description"}, {}, cancel=cancel)
    assert not output.exists()
    assert not output.with_suffix(".csv.partial").exists()


def test_exporting_over_the_input_file_is_refused(tmp_path: Path) -> None:
    source = write_cms_csv(tmp_path / "same.csv", [
        cms_row("Sepsis", "871", "MS-DRG", "Aetna", "PPO", "12500")])
    sample = sample_schema(source)
    with pytest.raises(ValueError):
        export_filtered(sample.spec, source, {"description": "description"}, {})


def test_gui_workflow_end_to_end(tmp_path: Path, monkeypatch) -> None:
    """Drive the real widgets: sample, map, scan, search, select, export."""
    tkinter = pytest.importorskip("tkinter")
    from mrf_filter import gui as gui_module

    try:
        root = tkinter.Tk()
    except tkinter.TclError as exc:  # no display available
        pytest.skip(f"Tk is unavailable: {exc}")
    root.destroy()

    monkeypatch.setenv("MRF_FILTER_HOME", str(tmp_path / "home"))

    class SilentDialogs:
        def showerror(self, title, message):
            raise AssertionError(f"unexpected error dialog: {title}: {message}")

        def showinfo(self, title, message):
            self.info = (title, message)

        def askyesno(self, title, message):
            return True

    monkeypatch.setattr(gui_module, "messagebox", SilentDialogs())

    source = write_cms_csv(tmp_path / "gui.csv", [
        cms_row("Sepsis", "871", "MS-DRG", "Aetna", "PPO", "12500"),
        cms_row("Sepsis", "871", "MS-DRG", "Cigna", "Commercial", "11800"),
        cms_row("Joint replacement", "470", "MS-DRG", "Cigna", "Commercial", "22000"),
    ])
    output = tmp_path / "gui_out.csv"
    app = gui_module.MRFApp()
    try:
        def pump(seconds: float, until) -> bool:
            deadline = time.monotonic() + seconds
            while time.monotonic() < deadline:
                app.update()
                if until():
                    return True
                time.sleep(0.01)
            return False

        app.file_var.set(str(source))
        app.source_var.set("Example Hospital")
        app._sample()
        assert pump(60, lambda: app.sample is not None and not app.busy)
        assert app.sample.spec.header_row == 2

        app._confirm_mapping()
        assert app.mapping["payer_name"] == "payer_name"
        # Description is mapped and exported, but never offered as a filter,
        # so the widget's rows are not the mapping's keys.
        assert "description" in app.mapping
        assert "description" not in app.scan_targets
        assert app.scan_fields.size() == len(app.scan_targets) == len(app.mapping) - 1

        app.scan_fields.selection_set(app.scan_targets.index("payer_name"))
        assert app._selected_scan_targets() == ["payer_name"]
        app._scan()
        assert pump(60, lambda: bool(app.selectors) and not app.busy)

        selector = app.selectors["payer_name"]
        assert selector.values == ["Aetna", "Cigna"]
        selector.query.set("cig")
        app.update()
        assert selector.shown == ["Cigna"]
        selector._select_shown()
        selector.query.set("")
        app.update()
        assert selector.selected == {"Cigna"}

        app.output_var.set(str(output))
        app._export()
        assert pump(60, lambda: not app.busy and str(app.open_button.cget("state")) == "normal")
    finally:
        app.destroy()

    with output.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    assert len(rows) == 2
    assert {row["payer_name"] for row in rows} == {"Cigna"}


def test_ragged_rows_keep_the_old_column_alignment(tmp_path: Path) -> None:
    """Short rows pad, long rows truncate — unchanged by the dict(zip) fast path."""
    source = tmp_path / "ragged.csv"
    source.write_text(
        "description,code,payer_name\n"
        "Sepsis,871,Aetna\n"
        "Short row,470\n"
        "Long row,291,Cigna,extra,more\n",
        encoding="utf-8",
    )
    sample = sample_schema(source)
    spec = FileSpec(path=source, kind="csv", encoding="utf-8-sig", delimiter=",", header_row=0)
    rows = list(iter_rows(spec))
    assert rows[0] == {"description": "Sepsis", "code": "871", "payer_name": "Aetna"}
    assert rows[1] == {"description": "Short row", "code": "470", "payer_name": ""}
    assert rows[2] == {"description": "Long row", "code": "291", "payer_name": "Cigna"}
    assert sample.headers == ["description", "code", "payer_name"]


def test_distinct_scan_stops_collecting_at_the_limit(tmp_path: Path) -> None:
    """Bounds memory on a free-text column with millions of distinct values."""
    rows = [cms_row(f"Item {index}", str(index), "CPT", f"Payer {index % 4}", "PPO", "100")
            for index in range(500)]
    source = write_cms_csv(tmp_path / "wide_cardinality.csv", rows)
    sample = sample_schema(source)
    storage = AppStorage(tmp_path / "state")

    scan = scan_distinct(sample.spec, ["description", "payer_name"], storage, limit=50)
    assert scan.truncated == frozenset({"description"})
    assert len(scan.values["description"]) == 50
    assert len(scan.values["payer_name"]) == 4
    # The pass still runs to the end, so the digest and record count stay right.
    assert len(scan.file_sha256) == 64

    cached = scan_distinct(sample.spec, ["description", "payer_name"], storage, limit=50)
    assert cached.from_cache
    assert cached.truncated == frozenset({"description"}), "a partial list must not look complete"


def test_progress_reports_rate_and_projected_time_remaining() -> None:
    early = Progress("Filter and export", 1_000_000, 10, 1_000, 10_000, elapsed=10.0)
    assert early.records_per_second == 100_000
    assert early.seconds_remaining == pytest.approx(90.0)

    # Too early, and already finished, both project nothing.
    assert Progress("x", 10, 0, 1, 10_000, elapsed=0.5).seconds_remaining is None
    assert Progress("x", 10, 0, 10_000, 10_000, elapsed=30.0).seconds_remaining is None
    assert Progress("x", 0, 0, 0, 0).records_per_second == 0.0

    format_duration = pytest.importorskip("mrf_filter.gui").format_duration
    assert format_duration(45) == "45s"
    assert format_duration(600) == "10m"
    assert format_duration(9000) == "2.5h"


def test_value_selector_handles_a_truncated_column(tmp_path: Path, monkeypatch) -> None:
    """A value missing from a partial list is still reachable by typing it."""
    tkinter = pytest.importorskip("tkinter")
    from mrf_filter import gui as gui_module

    try:
        root = tkinter.Tk()
    except tkinter.TclError as exc:
        pytest.skip(f"Tk is unavailable: {exc}")

    try:
        selector = gui_module.ValueSelector(root, ["Aetna", "Anthem", "Cigna"], truncated=True)
        assert "partial sample" in selector.summary.get() or selector.truncated
        assert "3+ distinct" in selector.summary.get()

        selector.manual_value.set("  United Healthcare  ")
        selector._add_typed()
        assert selector.selected == {"United Healthcare"}
        assert selector.shown[0] == "United Healthcare", "typed values pin to the top"

        selector.query.set("aet")
        root.update()
        assert selector.shown == ["Aetna"]
        assert selector.selected == {"United Healthcare"}, "search must not drop a selection"
    finally:
        root.destroy()


def test_unbalanced_quote_fails_with_a_locating_message(tmp_path: Path, monkeypatch) -> None:
    """Without a field bound, one stray quote in a 9 GB MRF is an OOM kill."""
    from mrf_filter import readers

    monkeypatch.setattr(readers, "CSV_MAX_FIELD_BYTES", 2048)
    source = tmp_path / "unbalanced.csv"
    runaway = "x" * 4096
    source.write_text(
        "description,code,payer_name\n"
        "Sepsis,871,Aetna\n"
        "Joint replacement,470,Cigna\n"
        f'"{runaway},291,Humana\n',
        encoding="utf-8",
    )
    spec = FileSpec(path=source, kind="csv", encoding="utf-8-sig", delimiter=",", header_row=0)
    with pytest.raises(ValueError) as caught:
        list(iter_rows(spec))
    message = str(caught.value)
    assert "after 2 data rows" in message
    assert "unbalanced quote" in message


def test_bad_jsonl_line_is_reported_by_line_number(tmp_path: Path) -> None:
    source = tmp_path / "broken.jsonl"
    source.write_text(
        json.dumps({"description": "Sepsis", "payer_name": "Aetna"}) + "\n"
        + json.dumps({"description": "Joint", "payer_name": "Cigna"}) + "\n"
        + "{not valid json\n",
        encoding="utf-8",
    )
    spec = FileSpec(path=source, kind="jsonl")
    with pytest.raises(ValueError, match="Line 3"):
        list(iter_rows(spec))


def test_expand_record_semantics_for_tricky_shapes() -> None:
    """Pins the flattening rules the fast path must preserve."""
    from mrf_filter.readers import expand_record

    assert list(expand_record({})) == [{}]
    assert list(expand_record({"a": None})) == [{"a": ""}]
    assert list(expand_record({"a": True, "b": False})) == [{"a": "true", "b": "false"}]
    assert list(expand_record({"a": []})) == [{"a": ""}]
    assert list(expand_record({"a": [1, 2, 3]})) == [{"a": "1|2|3"}]

    # Scalars on the parent repeat onto every exploded child row.
    assert list(expand_record({"s": "top", "a": [{"x": 1}, {"x": 2}]})) == [
        {"s": "top", "a.x": "1"},
        {"s": "top", "a.x": "2"},
    ]
    # Siblings need not carry the same keys, and one sibling's key must not
    # leak onto the next row.
    assert list(expand_record({"a": [{"x": 1, "z": 5}, {"x": 2}]})) == [
        {"a.x": "1", "a.z": "5"},
        {"a.x": "2"},
    ]
    # Two array branches produce the cartesian product.
    assert list(expand_record({"a": [{"x": 1}, {"x": 2}], "b": [{"y": 3}, {"y": 4}]})) == [
        {"a.x": "1", "b.y": "3"},
        {"a.x": "1", "b.y": "4"},
        {"a.x": "2", "b.y": "3"},
        {"a.x": "2", "b.y": "4"},
    ]
    # A CMS record: codes x payers, with the charge-level scalars on each row.
    record = cms_json_record("Sepsis", "871", "MS-DRG",
                             [payer("Aetna", "PPO", 1.0), payer("Cigna", "HMO", 2.0)])
    record["code_information"].append({"code": "272", "type": "RC"})
    rows = list(expand_record(record))
    assert len(rows) == 4
    assert {(row["code_information.code"], row["standard_charges.payers_information.payer_name"])
            for row in rows} == {("871", "Aetna"), ("871", "Cigna"),
                                 ("272", "Aetna"), ("272", "Cigna")}
    assert all(row["description"] == "Sepsis" for row in rows)
    assert all(row["standard_charges.gross_charge"] == "1000.0" for row in rows)


def test_cache_is_keyed_by_the_distinct_value_limit(tmp_path: Path) -> None:
    """A list collected under a smaller cap must not answer for a larger one."""
    rows = [cms_row(f"Item {index}", str(index), "CPT", f"Payer {index}", "PPO", "100")
            for index in range(40)]
    source = write_cms_csv(tmp_path / "limits.csv", rows)
    sample = sample_schema(source)
    storage = AppStorage(tmp_path / "state")

    small = scan_distinct(sample.spec, ["payer_name"], storage, limit=5)
    assert len(small.values["payer_name"]) == 5 and small.truncated

    large = scan_distinct(sample.spec, ["payer_name"], storage, limit=1000)
    assert not large.from_cache, "the smaller cached list must not be reused"
    assert len(large.values["payer_name"]) == 40 and not large.truncated

    assert scan_distinct(sample.spec, ["payer_name"], storage, limit=1000).from_cache


def test_description_is_exported_but_never_offered_as_a_filter() -> None:
    """A per-service description is near-unique per row; scanning it is wasted work."""
    from mrf_filter.standards import TARGET_BY_NAME, TARGET_FIELDS

    assert TARGET_BY_NAME["description"].filterable is False
    unfilterable = {field.name for field in TARGET_FIELDS if not field.filterable}
    assert unfilterable == {"description"}
    # It stays a standard output column.
    assert "description" in {field.name for field in TARGET_FIELDS}


def test_scan_field_selection_survives_the_hidden_description_row(tmp_path: Path, monkeypatch) -> None:
    """Widget rows are offset from the mapping, so the two must not be conflated."""
    tkinter = pytest.importorskip("tkinter")
    from mrf_filter import gui as gui_module

    try:
        probe = tkinter.Tk()
    except tkinter.TclError as exc:
        pytest.skip(f"Tk is unavailable: {exc}")
    probe.destroy()

    monkeypatch.setenv("MRF_FILTER_HOME", str(tmp_path / "home"))
    monkeypatch.setattr(gui_module, "messagebox", type("D", (), {
        "showerror": lambda self, t, m: (_ for _ in ()).throw(AssertionError(f"{t}: {m}")),
        "showinfo": lambda self, t, m: None,
        "askyesno": lambda self, t, m: True,
    })())

    source = write_cms_csv(tmp_path / "offsets.csv", [
        cms_row("Sepsis", "871", "MS-DRG", "Aetna", "PPO", "12500")])
    app = gui_module.MRFApp()
    try:
        app.file_var.set(str(source))
        app.source_var.set("Offset Hospital")
        app._sample()
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline and (app.sample is None or app.busy):
            app.update()
            time.sleep(0.01)
        app._confirm_mapping()

        rows = [app.scan_fields.get(index) for index in range(app.scan_fields.size())]
        assert not any("[description]" in row for row in rows)
        for offset, target in enumerate(app.scan_targets):
            assert f"[{target}]" in rows[offset]

        # Selecting the last row must resolve to the last scannable target, not
        # the mapping key that happens to sit at that index.
        app.scan_fields.selection_set(len(app.scan_targets) - 1)
        assert app._selected_scan_targets() == [app.scan_targets[-1]]
    finally:
        app.destroy()


def test_scanning_with_only_unfilterable_fields_mapped_is_refused(tmp_path: Path, monkeypatch) -> None:
    """Mapping description alone leaves nothing to scan; say that, not 'select a field'."""
    tkinter = pytest.importorskip("tkinter")
    from mrf_filter import gui as gui_module

    try:
        probe = tkinter.Tk()
    except tkinter.TclError as exc:
        pytest.skip(f"Tk is unavailable: {exc}")
    probe.destroy()

    monkeypatch.setenv("MRF_FILTER_HOME", str(tmp_path / "home"))
    errors: list[tuple[str, str]] = []
    monkeypatch.setattr(gui_module, "messagebox", type("D", (), {
        "showerror": lambda self, title, message: errors.append((title, message)),
        "showinfo": lambda self, title, message: None,
        "askyesno": lambda self, title, message: True,
    })())

    source = write_cms_csv(tmp_path / "desc_only.csv", [
        cms_row("Sepsis", "871", "MS-DRG", "Aetna", "PPO", "12500")])
    app = gui_module.MRFApp()
    try:
        app.file_var.set(str(source))
        app.source_var.set("Description Only")
        app._sample()
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline and (app.sample is None or app.busy):
            app.update()
            time.sleep(0.01)
        for target, var in app.mapping_vars.items():
            if target != "description":
                var.set(gui_module.NOT_MAPPED)
        app._confirm_mapping()
        assert app.mapping == {"description": "description"}
        assert app.scan_targets == [] and app.scan_fields.size() == 0

        app._scan()
        assert errors and errors[-1][0] == "Nothing to scan"
        assert not app.busy
    finally:
        app.destroy()


def test_reference_data_resolves_in_a_frozen_build(monkeypatch, tmp_path: Path) -> None:
    """PyInstaller unpacks data under sys._MEIPASS, not beside the source."""
    from mrf_filter import standards

    assert standards.package_root() == Path(standards.__file__).resolve().parent
    assert len(ms_drg_reference()) == 772

    bundle = tmp_path / "meipass"
    reference = bundle / "mrf_filter" / "reference"
    reference.mkdir(parents=True)
    (reference / "ms_drg_codes_fy2026.csv").write_text("001,002,003", encoding="ascii")
    monkeypatch.setattr(sys, "_MEIPASS", str(bundle), raising=False)
    assert standards.package_root() == bundle / "mrf_filter"
    assert ms_drg_reference() == ["001", "002", "003"]


def test_selftest_exercises_both_formats_and_reports_the_ijson_backend() -> None:
    """What a built binary runs to prove it works on a machine without Python."""
    import io

    from mrf_filter.selftest import run

    report = io.StringIO()
    code = run(report)
    text = report.getvalue()
    assert code == 0, text
    assert "yajl2_c" in text, "the C backend should be in use from source"
    assert "772 codes" in text
    assert "csv" in text and "json" in text
    assert text.strip().endswith("OK")


def test_command_line_entry_points() -> None:
    """--version and --selftest must not need a display."""
    entry = Path(__file__).resolve().parent.parent / "app.py"
    for args, expected in ((["--version"], __import__("mrf_filter").__version__), (["--help"], "--selftest")):
        result = subprocess.run([sys.executable, str(entry), *args],
                                capture_output=True, text=True, timeout=120)
        assert result.returncode == 0, result.stderr
        assert expected in result.stdout

    rejected = subprocess.run([sys.executable, str(entry), "--nope"],
                              capture_output=True, text=True, timeout=120)
    assert rejected.returncode == 2 and "Unrecognized argument" in rejected.stderr

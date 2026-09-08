from __future__ import annotations

import csv
import gzip
import json
import threading
import time
import zipfile
from pathlib import Path

import pytest

from mrf_filter.engine import export_filtered, scan_distinct
from mrf_filter.model import CancelledError
from mrf_filter.readers import container_suffix, detect_kind, sample_schema
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
    values, digest, cached = scan_distinct(sample.spec, ["Payer / MAO", "Plan"], storage)
    assert values["Payer / MAO"] == ["Aetna", "Cigna"]
    assert len(digest) == 64 and not cached
    values2, digest2, cached2 = scan_distinct(sample.spec, ["Payer / MAO", "Plan"], storage)
    assert values2 == values and digest2 == digest and cached2

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

    values, _, _ = scan_distinct(sample.spec, ["Payer Name"], storage)
    assert values["Payer Name"] == ["Aetna", "Cigna"]
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
    values, _, _ = scan_distinct(sample.spec, ["standard_charges.payer_name"], storage)
    assert values["standard_charges.payer_name"] == ["Aetna", "Cigna"]
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
        values, digest, _cached = scan_distinct(sample.spec, ["payer_name"], storage)
        assert values["payer_name"] == ["Aetna", "Cigna"]
        assert len(digest) == 64
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
    values, _digest, _cached = scan_distinct(sample.spec, ["payer_name"], storage)
    assert values["payer_name"] == ["Cigna", "Moda"]
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
        assert app.scan_fields.size() == len(app.mapping)

        targets = list(app.mapping)
        app.scan_fields.selection_set(targets.index("payer_name"))
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

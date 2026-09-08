from __future__ import annotations

import queue
import subprocess
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from .engine import export_filtered, scan_distinct
from .model import CancelledError, Progress, SchemaSample
from .readers import sample_schema
from .standards import TARGET_BY_NAME, TARGET_FIELDS, ms_drg_reference, suggest_mappings
from .storage import AppStorage


NOT_MAPPED = "(not mapped)"

# A hospital-wide description column can hold hundreds of thousands of distinct
# values. Rendering them all freezes the list widget, so the view is capped and
# the search box is the way to reach the rest.
MAX_SHOWN_VALUES = 5000


class ValueSelector(ttk.Frame):
    """Searchable, capped list of distinct values with selection kept by value."""

    def __init__(self, parent: tk.Misc, values: list[str]):
        super().__init__(parent, padding=6)
        self.values = values
        self.selected: set[str] = set()
        self.shown: list[str] = []
        self.match_count = len(values)
        self._syncing = False

        controls = ttk.Frame(self)
        controls.pack(fill="x")
        ttk.Label(controls, text="Search:").pack(side="left")
        self.query = tk.StringVar()
        entry = ttk.Entry(controls, textvariable=self.query)
        entry.pack(side="left", fill="x", expand=True, padx=(6, 10))
        self.query.trace_add("write", lambda *_: self._refresh())
        ttk.Button(controls, text="Select all shown", command=self._select_shown).pack(side="left")
        ttk.Button(controls, text="Clear selection", command=self._clear).pack(side="left", padx=(6, 0))

        self.summary = tk.StringVar()
        ttk.Label(self, textvariable=self.summary, foreground="#555").pack(anchor="w", pady=(6, 0))

        body = ttk.Frame(self)
        body.pack(fill="both", expand=True, pady=(4, 0))
        self.listbox = tk.Listbox(body, selectmode="extended", exportselection=False)
        scrollbar = ttk.Scrollbar(body, orient="vertical", command=self.listbox.yview)
        self.listbox.configure(yscrollcommand=scrollbar.set)
        self.listbox.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        self.listbox.bind("<<ListboxSelect>>", self._on_select)
        self._refresh()

    def _refresh(self) -> None:
        needle = self.query.get().strip().casefold()
        matches = [value for value in self.values if needle in value.casefold()] if needle else self.values
        self.match_count = len(matches)
        self.shown = list(matches[:MAX_SHOWN_VALUES])
        self._syncing = True
        self.listbox.delete(0, "end")
        for value in self.shown:
            self.listbox.insert("end", value)
        for index, value in enumerate(self.shown):
            if value in self.selected:
                self.listbox.selection_set(index)
        self._syncing = False
        self._update_summary()

    def _update_summary(self) -> None:
        match_count = self.match_count
        hidden = match_count - len(self.shown)
        text = f"{len(self.selected):,} selected of {len(self.values):,} distinct"
        if match_count != len(self.values):
            text += f" · {match_count:,} match the search"
        if hidden > 0:
            text += f" · showing the first {len(self.shown):,}, narrow the search to reach the other {hidden:,}"
        self.summary.set(text)

    def _on_select(self, _event: object) -> None:
        if self._syncing:
            return
        visible = set(self.shown)
        chosen = {self.shown[index] for index in self.listbox.curselection()}
        self.selected = (self.selected - visible) | chosen
        self._update_summary()

    def _select_shown(self) -> None:
        self.selected |= set(self.shown)
        self._refresh()

    def _clear(self) -> None:
        self.selected = set()
        self._refresh()


class MRFApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Hospital MRF Filter")
        self.geometry("1120x760")
        self.minsize(900, 640)
        self.storage = AppStorage()
        self.sample: SchemaSample | None = None
        self.mapping: dict[str, str] = {}
        self.mapping_vars: dict[str, tk.StringVar] = {}
        self.header_row_var = tk.StringVar(value="1")
        self.header_candidate_lookup: dict[str, int] = {}
        self.selectors: dict[str, ValueSelector] = {}
        self.cancel_event = threading.Event()
        self.events: queue.Queue[tuple[str, object]] = queue.Queue()
        self.busy = False
        self._build()
        self.after(100, self._drain_events)

    def _build(self) -> None:
        header = ttk.Frame(self, padding=(18, 14, 18, 6))
        header.pack(fill="x")
        ttk.Label(header, text="Hospital MRF Filter", font=("TkDefaultFont", 18, "bold")).pack(side="left")
        ttk.Label(header, text="Local, streaming rate-file extraction", foreground="#555").pack(side="left", padx=14)

        self.notebook = ttk.Notebook(self)
        self.notebook.pack(fill="both", expand=True, padx=18, pady=8)
        self.file_tab = ttk.Frame(self.notebook, padding=18)
        self.map_tab = ttk.Frame(self.notebook, padding=12)
        self.filter_tab = ttk.Frame(self.notebook, padding=12)
        self.export_tab = ttk.Frame(self.notebook, padding=18)
        for tab, label in ((self.file_tab, "1  File"), (self.map_tab, "2  Header mapping"),
                           (self.filter_tab, "3  Filters"), (self.export_tab, "4  Export")):
            self.notebook.add(tab, text=label)
        self._build_file_tab()
        self._build_filter_tab()
        self._build_export_tab()

        footer = ttk.Frame(self, padding=(18, 4, 18, 14))
        footer.pack(fill="x")
        self.progress = ttk.Progressbar(footer, maximum=100)
        self.progress.pack(fill="x")
        self.status = tk.StringVar(value="Choose a local JSON, JSONL, CSV, TSV, or pipe-delimited MRF (.gz and .zip are read directly).")
        ttk.Label(footer, textvariable=self.status).pack(side="left", pady=(5, 0))
        self.cancel_button = ttk.Button(footer, text="Cancel", command=self._cancel, state="disabled")
        self.cancel_button.pack(side="right", pady=(5, 0))

    def _build_file_tab(self) -> None:
        ttk.Label(self.file_tab, text="MRF file", font=("TkDefaultFont", 11, "bold")).grid(row=0, column=0, sticky="w")
        self.file_var = tk.StringVar()
        ttk.Entry(self.file_tab, textvariable=self.file_var).grid(row=1, column=0, sticky="ew", pady=(6, 14))
        ttk.Button(self.file_tab, text="Browse...", command=self._browse_input).grid(row=1, column=1, padx=(8, 0), pady=(6, 14))
        ttk.Label(self.file_tab, text="Source / hospital name", font=("TkDefaultFont", 11, "bold")).grid(row=2, column=0, sticky="w")
        self.source_var = tk.StringVar()
        ttk.Entry(self.file_tab, textvariable=self.source_var).grid(row=3, column=0, sticky="ew", pady=(6, 4))
        ttk.Label(self.file_tab, text="Confirmed mappings are remembered under this name.", foreground="#555").grid(row=4, column=0, sticky="w")
        ttk.Button(self.file_tab, text="Sample schema", command=self._sample).grid(row=5, column=0, sticky="w", pady=(24, 0))
        ttk.Label(
            self.file_tab,
            text="Record-shaped JSON has no header row, so its fields are discovered by streaming records until\n"
                 "the schema settles. Payer fields often appear only well into the file.",
            foreground="#555",
        ).grid(row=6, column=0, sticky="w", pady=(14, 0))
        self.file_tab.columnconfigure(0, weight=1)

    def _build_mapping_tab(self) -> None:
        for child in self.map_tab.winfo_children():
            child.destroy()
        ttk.Label(self.map_tab, text="Review every suggestion, change anything needed, then confirm.",
                  font=("TkDefaultFont", 11, "bold")).pack(anchor="w", padx=6, pady=(2, 8))
        if self.sample and self.sample.spec.kind == "csv":
            header_box = ttk.LabelFrame(self.map_tab, text="CSV header row", padding=8)
            header_box.pack(fill="x", padx=6, pady=(0, 10))
            ttk.Label(header_box, text="Confirmed row (1-based):").grid(row=0, column=0, sticky="w")
            self.header_row_var.set(str(self.sample.spec.header_row + 1))
            ttk.Spinbox(header_box, from_=1, to=250, textvariable=self.header_row_var, width=7).grid(
                row=0, column=1, sticky="w", padx=(8, 14)
            )
            ttk.Button(header_box, text="Use this row", command=self._resample_header).grid(row=0, column=2, sticky="w")
            ttk.Label(
                header_box,
                text="Rows above it are treated as hospital metadata and skipped in every streaming pass.",
                foreground="#555",
            ).grid(row=0, column=3, sticky="w", padx=(14, 0))
            candidate_values: list[str] = []
            self.header_candidate_lookup = {}
            for row_index, preview, score in self.sample.header_candidates:
                label = f"Row {row_index + 1}  |  score {score}  |  {preview}"
                candidate_values.append(label)
                self.header_candidate_lookup[label] = row_index
            if candidate_values:
                ttk.Label(header_box, text="Other likely rows:").grid(row=1, column=0, sticky="w", pady=(8, 0))
                candidate_box = ttk.Combobox(header_box, values=candidate_values, state="readonly")
                candidate_box.grid(row=1, column=1, columnspan=3, sticky="ew", padx=(8, 0), pady=(8, 0))
                candidate_box.bind("<<ComboboxSelected>>", self._choose_header_candidate)
            header_box.columnconfigure(3, weight=1)
        outer = ttk.Frame(self.map_tab)
        outer.pack(fill="both", expand=True)
        canvas = tk.Canvas(outer, highlightthickness=0)
        scrollbar = ttk.Scrollbar(outer, orient="vertical", command=canvas.yview)
        rows = ttk.Frame(canvas)
        rows.bind("<Configure>", lambda _e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.create_window((0, 0), window=rows, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        ttk.Label(rows, text="Standard output field", font=("TkDefaultFont", 10, "bold")).grid(row=0, column=0, sticky="w", padx=8, pady=6)
        ttk.Label(rows, text="MRF field (editable)", font=("TkDefaultFont", 10, "bold")).grid(row=0, column=1, sticky="w", padx=8, pady=6)
        ttk.Label(rows, text="Match", font=("TkDefaultFont", 10, "bold")).grid(row=0, column=2, sticky="w", padx=8, pady=6)
        suggestions = suggest_mappings(self.sample.headers) if self.sample else {}
        saved = self.storage.load_mapping(self.source_var.get(), self.sample.headers) if self.sample else {}
        choices = [NOT_MAPPED] + (self.sample.headers if self.sample else [])
        self.mapping_vars = {}
        for index, field in enumerate(TARGET_FIELDS, 1):
            suggestion, score = suggestions.get(field.name, (None, 0))
            value = saved.get(field.name, suggestion or NOT_MAPPED)
            var = tk.StringVar(value=value)
            self.mapping_vars[field.name] = var
            ttk.Label(rows, text=field.label).grid(row=index, column=0, sticky="w", padx=8, pady=3)
            combo = ttk.Combobox(rows, textvariable=var, values=choices, state="readonly", width=72)
            combo.grid(row=index, column=1, sticky="ew", padx=8, pady=3)
            match_text = "saved" if field.name in saved else (f"{score}%" if suggestion else "")
            ttk.Label(rows, text=match_text, foreground="#555").grid(row=index, column=2, sticky="w", padx=8)
        rows.columnconfigure(1, weight=1)
        ttk.Button(self.map_tab, text="Confirm mapping", command=self._confirm_mapping).pack(anchor="e", padx=6, pady=(10, 0))

    def _build_filter_tab(self) -> None:
        top = ttk.Frame(self.filter_tab)
        top.pack(fill="x")
        ttk.Label(top, text="Free-text fields to scan", font=("TkDefaultFont", 11, "bold")).pack(anchor="w")
        ttk.Label(top, text="Select one or more mapped fields. They are scanned together in one streaming pass.", foreground="#555").pack(anchor="w")
        self.scan_fields = tk.Listbox(top, selectmode="extended", exportselection=False, height=6)
        self.scan_fields.pack(fill="x", pady=(8, 8))
        ttk.Button(top, text="Scan selected fields", command=self._scan).pack(anchor="w")
        self.value_notebook = ttk.Notebook(self.filter_tab)
        self.value_notebook.pack(fill="both", expand=True, pady=(12, 8))

        fixed = ttk.LabelFrame(self.filter_tab, text="Fixed reference filter: FY 2026 MS-DRG v43.0", padding=8)
        fixed.pack(fill="x")
        row = ttk.Frame(fixed)
        row.pack(fill="x")
        ttk.Label(row, text="Apply codes to:").pack(side="left")
        self.drg_target = tk.StringVar(value=NOT_MAPPED)
        self.drg_combo = ttk.Combobox(row, textvariable=self.drg_target, values=[NOT_MAPPED], state="readonly", width=28)
        self.drg_combo.pack(side="left", padx=(8, 18))
        ttk.Label(row, text="Choose codes below; no file scan is used.", foreground="#555").pack(side="left")
        ttk.Label(
            fixed,
            text="Rows are also required to carry an MS-DRG billing code type, because a revenue code 470 "
                 "is not MS-DRG 470.",
            foreground="#555",
        ).pack(anchor="w", pady=(6, 0))
        self.drg_list = tk.Listbox(fixed, selectmode="extended", exportselection=False, height=5)
        for code in ms_drg_reference():
            self.drg_list.insert("end", code)
        self.drg_list.pack(fill="x", pady=(8, 0))

    def _build_export_tab(self) -> None:
        ttk.Label(self.export_tab, text="Output CSV", font=("TkDefaultFont", 11, "bold")).grid(row=0, column=0, sticky="w")
        self.output_var = tk.StringVar()
        ttk.Entry(self.export_tab, textvariable=self.output_var).grid(row=1, column=0, sticky="ew", pady=(6, 14))
        ttk.Button(self.export_tab, text="Browse...", command=self._browse_output).grid(row=1, column=1, padx=(8, 0), pady=(6, 14))
        ttk.Label(self.export_tab, text="All selected free-text and MS-DRG filters are combined with AND.\n"
                  "The output contains standardized mapped columns only.", foreground="#555").grid(row=2, column=0, sticky="w")
        ttk.Button(self.export_tab, text="Run export", command=self._export).grid(row=3, column=0, sticky="w", pady=(24, 0))
        self.open_button = ttk.Button(self.export_tab, text="Open output folder", command=self._open_output_folder, state="disabled")
        self.open_button.grid(row=3, column=0, sticky="e", pady=(24, 0))
        self.export_tab.columnconfigure(0, weight=1)

    def _browse_input(self) -> None:
        value = filedialog.askopenfilename(filetypes=[
            ("MRF files", "*.json *.jsonl *.ndjson *.csv *.tsv *.txt *.psv *.gz *.zip"),
            ("All files", "*.*"),
        ])
        if value:
            self.file_var.set(value)
            if not self.source_var.get():
                self.source_var.set(Path(value).stem[:80])

    def _browse_output(self) -> None:
        value = filedialog.asksaveasfilename(defaultextension=".csv", filetypes=[("CSV", "*.csv")])
        if value:
            self.output_var.set(value)

    def _start(self, label: str, worker) -> None:
        if self.busy:
            return
        self.busy = True
        self.cancel_event.clear()
        self.cancel_button.configure(state="normal")
        self.progress.configure(value=0)
        self.status.set(label)
        threading.Thread(target=worker, daemon=True).start()

    def _report(self, value: Progress) -> None:
        self.events.put(("progress", value))

    def _sample(self) -> None:
        path, source = self.file_var.get(), self.source_var.get().strip()
        if not path or not source:
            messagebox.showerror("Missing information", "Choose a file and enter a source/hospital name.")
            return

        def worker():
            try:
                saved_row = self.storage.load_header_row(source)
                try:
                    result = sample_schema(path, saved_row, self._report, self.cancel_event)
                    if saved_row is not None and not self.storage.load_mapping(source, result.headers):
                        result = sample_schema(path, None, self._report, self.cancel_event)
                except ValueError:
                    if saved_row is None:
                        raise
                    result = sample_schema(path, None, self._report, self.cancel_event)
                self.events.put(("sample_done", result))
            except BaseException as exc:
                self.events.put(("error", exc))
        self._start("Sampling schema...", worker)

    def _choose_header_candidate(self, event) -> None:
        label = event.widget.get()
        if label in self.header_candidate_lookup:
            self.header_row_var.set(str(self.header_candidate_lookup[label] + 1))

    def _resample_header(self) -> None:
        if not self.sample or self.sample.spec.kind != "csv":
            return
        try:
            row_number = int(self.header_row_var.get())
            if not 1 <= row_number <= 250:
                raise ValueError
        except ValueError:
            messagebox.showerror("Invalid header row", "Enter a header row between 1 and 250.")
            return
        path = self.file_var.get()

        def worker():
            try:
                self.events.put(("sample_done", sample_schema(path, row_number - 1)))
            except BaseException as exc:
                self.events.put(("error", exc))
        self._start(f"Reading header row {row_number}...", worker)

    def _confirm_mapping(self) -> None:
        if not self.sample:
            return
        mapping = {target: var.get() for target, var in self.mapping_vars.items() if var.get() != NOT_MAPPED}
        if not mapping:
            messagebox.showerror("No mapping", "Map at least one output field.")
            return
        self.mapping = mapping
        self.storage.save_mapping(self.source_var.get(), mapping)
        if self.sample.spec.kind == "csv":
            self.storage.save_header_row(self.source_var.get(), self.sample.spec.header_row)
        self.scan_fields.delete(0, "end")
        for target in mapping:
            self.scan_fields.insert("end", f"{TARGET_BY_NAME[target].label}  [{target}]")
        drg_choices = [NOT_MAPPED] + [target for target in ("billing_code",) if target in mapping]
        self.drg_combo.configure(values=drg_choices)
        self.drg_target.set(drg_choices[-1] if len(drg_choices) > 1 else NOT_MAPPED)
        self.notebook.select(self.filter_tab)
        self.status.set(f"Mapping confirmed: {len(mapping)} standardized fields.")

    def _selected_scan_targets(self) -> list[str]:
        targets = list(self.mapping)
        return [targets[index] for index in self.scan_fields.curselection()]

    def _scan(self) -> None:
        if not self.sample or not self.mapping:
            messagebox.showerror("Mapping required", "Confirm the header mapping first.")
            return
        targets = self._selected_scan_targets()
        if not targets:
            messagebox.showerror("No fields selected", "Select at least one mapped free-text field to scan.")
            return
        columns = [self.mapping[target] for target in targets]
        spec = self.sample.spec

        def worker():
            try:
                found, _digest, cached = scan_distinct(
                    spec, columns, self.storage, callback=self._report, cancel=self.cancel_event)
                self.events.put(("scan_done", (targets, found, cached)))
            except BaseException as exc:
                self.events.put(("error", exc))
        self._start("Scanning distinct values...", worker)

    def _populate_values(self, targets: list[str], found: dict[str, list[str]]) -> None:
        for child in self.value_notebook.winfo_children():
            child.destroy()
        self.selectors.clear()
        for target in targets:
            values = found[self.mapping[target]]
            selector = ValueSelector(self.value_notebook, values)
            self.value_notebook.add(selector, text=f"{TARGET_BY_NAME[target].label} ({len(values):,})")
            self.selectors[target] = selector

    def _export(self) -> None:
        if not self.sample or not self.mapping:
            messagebox.showerror("Mapping required", "Confirm the header mapping first.")
            return
        if not self.output_var.get():
            self._browse_output()
        if not self.output_var.get():
            return
        filters: dict[str, set[str]] = {
            target: set(selector.selected)
            for target, selector in self.selectors.items() if selector.selected
        }
        drg_fields: set[str] = set()
        drg_type_column = None
        drg_target = self.drg_target.get()
        drg_selected = {self.drg_list.get(index) for index in self.drg_list.curselection()}
        if drg_target != NOT_MAPPED and drg_selected:
            drg_type_column = self.mapping.get("billing_code_type")
            if drg_type_column is None and not messagebox.askyesno(
                "Billing code type not mapped",
                "MS-DRG numbers overlap 3-digit revenue codes, so without a mapped "
                "billing code type the export will also match unrelated codes.\n\n"
                "Filter on the code number alone anyway?",
            ):
                return
            filters[drg_target] = drg_selected
            drg_fields.add(drg_target)
        if not filters and not messagebox.askyesno("No filters selected", "Export every record with the confirmed mapping?"):
            return
        output = Path(self.output_var.get())
        spec, mapping = self.sample.spec, dict(self.mapping)

        def worker():
            try:
                result = export_filtered(
                    spec, output, mapping, filters, drg_fields,
                    callback=self._report, cancel=self.cancel_event,
                    drg_type_column=drg_type_column)
                self.events.put(("export_done", (output, result)))
            except BaseException as exc:
                self.events.put(("error", exc))
        self._start("Filtering and exporting...", worker)

    def _cancel(self) -> None:
        self.cancel_event.set()
        self.status.set("Cancelling after the current record...")

    def _drain_events(self) -> None:
        try:
            while True:
                event, payload = self.events.get_nowait()
                if event == "progress":
                    value: Progress = payload
                    self.progress.configure(value=value.fraction * 100)
                    text = f"{value.phase}: {value.records:,} records"
                    if value.phase == "Filter and export":
                        text += f", {value.matched:,} matched"
                    elif value.phase == "Schema scan":
                        text += f", {value.matched:,} fields found"
                    text += f" ({value.fraction:.1%} of file bytes)"
                    self.status.set(text)
                elif event == "sample_done":
                    self.sample = payload
                    self._finish_busy()
                    self._build_mapping_tab()
                    self.notebook.select(self.map_tab)
                    if self.sample.spec.kind == "csv":
                        detail = f"; header row: {self.sample.spec.header_row + 1}"
                    else:
                        detail = f"; {self.sample.records_scanned:,} records scanned"
                    self.status.set(
                        f"Found {len(self.sample.headers)} fields; format: {self.sample.spec.kind.upper()}{detail}."
                    )
                elif event == "scan_done":
                    targets, found, cached = payload
                    self._finish_busy()
                    self._populate_values(targets, found)
                    count = sum(len(values) for values in found.values())
                    suffix = " (loaded from cache)" if cached else ""
                    self.status.set(f"Found {count:,} distinct values{suffix}.")
                elif event == "export_done":
                    output, (processed, matched) = payload
                    self._finish_busy()
                    self.open_button.configure(state="normal")
                    self.status.set(f"Done: {matched:,} of {processed:,} records written to {output.name}.")
                    messagebox.showinfo("Export complete", f"Wrote {matched:,} matched records to:\n{output}")
                elif event == "error":
                    self._finish_busy()
                    if isinstance(payload, CancelledError):
                        self.status.set(str(payload))
                    else:
                        self.status.set("Operation failed.")
                        messagebox.showerror("MRF Filter", f"{type(payload).__name__}: {payload}")
        except queue.Empty:
            pass
        self.after(100, self._drain_events)

    def _finish_busy(self) -> None:
        self.busy = False
        self.cancel_button.configure(state="disabled")

    def _open_output_folder(self) -> None:
        folder = str(Path(self.output_var.get()).resolve().parent)
        if sys.platform == "win32":
            subprocess.Popen(["explorer", folder])
        elif sys.platform == "darwin":
            subprocess.Popen(["open", folder])
        else:
            subprocess.Popen(["xdg-open", folder])


def main() -> None:
    MRFApp().mainloop()

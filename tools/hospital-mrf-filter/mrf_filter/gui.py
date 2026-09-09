from __future__ import annotations

import queue
import subprocess
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from .engine import DISTINCT_VALUE_LIMIT, export_filtered, scan_distinct
from .model import CancelledError, Progress, ScanResult, SchemaSample
from .readers import PREVIEW_COLUMNS, PREVIEW_ROWS, sample_schema
from .standards import TARGET_BY_NAME, TARGET_FIELDS, ms_drg_reference, suggest_mappings
from .storage import AppStorage
from .wide import PAYER_NAME, PLAN_NAME


NOT_MAPPED = "(not mapped)"

# A description or an algorithm note runs past any sane column width. The
# preview is for recognising a column, not for reading its contents.
PREVIEW_CELL_CHARS = 40
PREVIEW_VALUE_COLUMNS = 3

# Column names are the point of the sideways view, so they get more room than a
# value cell: a wide name carries the payer, the plan and the metric.
PREVIEW_NAME_CHARS = 62

# A hospital-wide description column can hold hundreds of thousands of distinct
# values. Rendering them all freezes the list widget, so the view is capped and
# the search box is the way to reach the rest.
MAX_SHOWN_VALUES = 5000


def format_duration(seconds: float) -> str:
    if seconds < 90:
        return f"{seconds:.0f}s"
    if seconds < 5400:
        return f"{seconds / 60:.0f}m"
    return f"{seconds / 3600:.1f}h"


def _preview_cell(value: str) -> str:
    """One cell as a single short line: newlines and tabs wreck a Treeview row."""
    text = " ".join(str(value).split())
    return text if len(text) <= PREVIEW_CELL_CHARS else text[:PREVIEW_CELL_CHARS - 1] + "\u2026"


def _preview_middle(text: str, limit: int) -> str:
    """Elide the middle, not the tail.

    A wide column is named standard_charge|<payer>|<plan>|<metric>: cutting the
    end leaves three columns that all read the same.
    """
    if len(text) <= limit:
        return text
    head = (limit - 1) * 5 // 9
    return text[:head] + "\u2026" + text[-(limit - 1 - head):]


def _preview_width(characters: int, cap: int = 340) -> int:
    return min(max(characters, 8) * 8 + 20, cap)


class ValueSelector(ttk.Frame):
    """Searchable list of distinct values, with selection kept by value.

    ``truncated`` says the scan stopped collecting before the column ran out of
    distinct values, so the list is a partial sample. Values that are not in the
    list can still be filtered on by typing them.
    """

    def __init__(self, parent: tk.Misc, values: list[str], truncated: bool = False):
        super().__init__(parent, padding=6)
        self.values = values
        self.truncated = truncated
        self.selected: set[str] = set()
        self.typed: set[str] = set()
        self.shown: list[str] = []
        self.match_count = len(values)
        self._syncing = False
        # Casefolding on every keystroke over a quarter of a million values is
        # a visible stall; fold once and search the folded copy.
        self._folded = [value.casefold() for value in values]

        controls = ttk.Frame(self)
        controls.pack(fill="x")
        ttk.Label(controls, text="Search:").pack(side="left")
        self.query = tk.StringVar()
        entry = ttk.Entry(controls, textvariable=self.query)
        entry.pack(side="left", fill="x", expand=True, padx=(6, 10))
        self.query.trace_add("write", lambda *_: self._refresh())
        ttk.Button(controls, text="Select all shown", command=self._select_shown).pack(side="left")
        ttk.Button(controls, text="Clear selection", command=self._clear).pack(side="left", padx=(6, 0))

        if truncated:
            ttk.Label(
                self,
                text=f"This column has more than {len(values):,} distinct values, so the list below is "
                     "a partial sample. Type any value you need and click Add.",
                foreground="#8a4b00",
                wraplength=1000,
                justify="left",
            ).pack(anchor="w", pady=(6, 0))

        manual = ttk.Frame(self)
        manual.pack(fill="x", pady=(6, 0))
        ttk.Label(manual, text="Add exact value:").pack(side="left")
        self.manual_value = tk.StringVar()
        manual_entry = ttk.Entry(manual, textvariable=self.manual_value)
        manual_entry.pack(side="left", fill="x", expand=True, padx=(6, 10))
        manual_entry.bind("<Return>", lambda _event: self._add_typed())
        ttk.Button(manual, text="Add", command=self._add_typed).pack(side="left")

        self.summary = tk.StringVar()
        ttk.Label(self, textvariable=self.summary, foreground="#555").pack(anchor="w", pady=(6, 0))

        body = ttk.Frame(self)
        body.pack(fill="both", expand=True, pady=(4, 0))
        self.listbox = tk.Listbox(body, selectmode="extended", exportselection=False, height=6)
        scrollbar = ttk.Scrollbar(body, orient="vertical", command=self.listbox.yview)
        self.listbox.configure(yscrollcommand=scrollbar.set)
        self.listbox.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        self.listbox.bind("<<ListboxSelect>>", self._on_select)
        self._refresh()

    def _matches(self, needle: str) -> list[str]:
        # Values typed by hand are pinned to the top so they stay reachable even
        # when they are not in the scanned list at all.
        typed = sorted(self.typed, key=str.casefold)
        if not needle:
            return typed + self.values
        return ([value for value in typed if needle in value.casefold()]
                + [value for value, folded in zip(self.values, self._folded) if needle in folded])

    def _refresh(self) -> None:
        matches = self._matches(self.query.get().strip().casefold())
        self.match_count = len(matches)
        self.shown = matches[:MAX_SHOWN_VALUES]
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
        total = len(self.values) + len(self.typed)
        hidden = self.match_count - len(self.shown)
        distinct = f"{len(self.values):,}+" if self.truncated else f"{total:,}"
        text = f"{len(self.selected):,} selected of {distinct} distinct"
        if self.match_count != total:
            text += f" · {self.match_count:,} match the search"
        if hidden > 0:
            text += f" · showing the first {len(self.shown):,}, narrow the search to reach the other {hidden:,}"
        self.summary.set(text)

    def _add_typed(self) -> None:
        value = self.manual_value.get().strip()
        if not value:
            return
        if value not in self.values:
            self.typed.add(value)
        self.selected.add(value)
        self.manual_value.set("")
        self.query.set("")
        self._refresh()

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
        self.geometry("1120x900")
        self.minsize(940, 680)
        self.storage = AppStorage()
        self.sample: SchemaSample | None = None
        self.mapping: dict[str, str] = {}
        self.mapping_vars: dict[str, tk.StringVar] = {}
        self.header_row_var = tk.StringVar(value="1")
        self.header_candidate_lookup: dict[str, int] = {}
        self.preview_mode = tk.StringVar(value="rows")
        self.preview_visible = tk.BooleanVar(value=True)
        self.preview_buttons: list[ttk.Radiobutton] = []
        self.selectors: dict[str, ValueSelector] = {}
        self.scan_targets: list[str] = []
        self.cancel_event = threading.Event()
        self.events: queue.Queue[tuple[str, object]] = queue.Queue()
        self.busy = False
        self._drain_job: str | None = None
        self._build()
        self._drain_job = self.after(100, self._drain_events)

    def _build(self) -> None:
        header = ttk.Frame(self, padding=(18, 14, 18, 6))
        header.pack(fill="x")
        ttk.Label(header, text="Hospital MRF Filter", font=("TkDefaultFont", 18, "bold")).pack(side="left")
        ttk.Label(header, text="Local, streaming rate-file extraction", foreground="#555").pack(side="left", padx=14)

        # The footer claims its space before the notebook expands into what is
        # left. Packed the other way round, a tall tab pushes the progress bar
        # and status line off the bottom of the window.
        footer = ttk.Frame(self, padding=(18, 4, 18, 14))
        footer.pack(side="bottom", fill="x")
        self.progress = ttk.Progressbar(footer, maximum=100)
        self.progress.pack(fill="x")
        self.status = tk.StringVar(value="Choose a local JSON, JSONL, CSV, TSV, or pipe-delimited MRF (.gz and .zip are read directly).")
        ttk.Label(footer, textvariable=self.status).pack(side="left", pady=(5, 0))
        self.cancel_button = ttk.Button(footer, text="Cancel", command=self._cancel, state="disabled")
        self.cancel_button.pack(side="right", pady=(5, 0))

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
        # Packed before the mapping list so the list expands into what is left:
        # the other way round, a long field list pushes the preview off-screen.
        ttk.Button(self.map_tab, text="Confirm mapping", command=self._confirm_mapping).pack(
            side="bottom", anchor="e", padx=6, pady=(10, 0))
        self._build_preview()
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

    def _build_preview(self) -> None:
        """Show real data next to the mapping, so a wrong column is obvious.

        Two orientations, because the two CMS CSV layouts fail differently. A
        tall file is read down: ten rows show what each column holds. A wide file
        gives every payer its own column block, so a single row can be a thousand
        cells long and only the column list is legible.
        """
        if self.sample is None:
            return
        box = ttk.LabelFrame(self.map_tab, text="Data preview", padding=8)
        box.pack(side="bottom", fill="x", padx=6, pady=(10, 0))
        controls = ttk.Frame(box)
        controls.pack(fill="x")
        ttk.Checkbutton(controls, text="Show", variable=self.preview_visible,
                        command=self._toggle_preview).pack(side="left", padx=(0, 14))
        self.preview_buttons = [
            ttk.Radiobutton(controls, text=f"First {PREVIEW_ROWS} rows", value="rows",
                            variable=self.preview_mode, command=self._refresh_preview),
            ttk.Radiobutton(controls, text=f"First {PREVIEW_COLUMNS} columns", value="columns",
                            variable=self.preview_mode, command=self._refresh_preview),
        ]
        for button in self.preview_buttons:
            button.pack(side="left", padx=(0, 12))
        self.preview_note = ttk.Label(box, foreground="#555", wraplength=1020, justify="left")
        self.preview_host = ttk.Frame(box)
        self._toggle_preview()

    def _toggle_preview(self) -> None:
        """Collapse the panel to its controls; the mapping list takes the space."""
        host = getattr(self, "preview_host", None)
        if host is None or not host.winfo_exists():
            return
        state = "normal" if self.preview_visible.get() else "disabled"
        for button in self.preview_buttons:
            button.configure(state=state)
        if not self.preview_visible.get():
            host.pack_forget()
            self.preview_note.pack_forget()
            return
        self.preview_note.pack(fill="x", anchor="w", pady=(4, 0))
        host.pack(fill="both", expand=True, pady=(8, 0))
        self._refresh_preview()

    def _refresh_preview(self) -> None:
        host = getattr(self, "preview_host", None)
        if host is None or self.sample is None or not host.winfo_exists():
            return
        if not self.preview_visible.get():
            return
        for child in host.winfo_children():
            child.destroy()
        if self.preview_mode.get() == "columns":
            columns, rows, note = self._preview_by_column()
        else:
            columns, rows, note = self._preview_by_row()
        self.preview_note.configure(text=note)
        tree = ttk.Treeview(host, columns=[f"c{index}" for index in range(len(columns))],
                            show="headings", height=min(PREVIEW_ROWS, max(len(rows), 1)),
                            selectmode="none")
        for index, (title, width) in enumerate(columns):
            tree.heading(f"c{index}", text=title)
            tree.column(f"c{index}", width=width, minwidth=60, stretch=False, anchor="w")
        for values in rows:
            tree.insert("", "end", values=values)
        horizontal = ttk.Scrollbar(host, orient="horizontal", command=tree.xview)
        tree.configure(xscrollcommand=horizontal.set)
        tree.pack(fill="both", expand=True)
        horizontal.pack(fill="x")

    def _preview_by_row(self) -> tuple[list[tuple[str, int]], list[list[str]], str]:
        """Ten rows as the rest of the application will read them."""
        sample = self.sample
        headers = sample.headers
        if sample.spec.wide:
            # One wide row becomes one row per payer, so ten preview rows can all
            # be the same service. Lead with the columns that differ.
            lead = [name for name in (PAYER_NAME, PLAN_NAME) if name in headers]
            headers = lead + [name for name in headers if name not in lead]
        rows = [[_preview_cell(row.get(name, "")) for name in headers] for row in sample.examples]
        widths = [
            _preview_width(max([len(name)] + [len(row[index]) for row in rows], default=len(name)))
            for index, name in enumerate(headers)
        ]
        note = f"{len(rows)} of the rows the tool will read"
        if sample.spec.wide:
            note += f", after unpivoting {sample.payer_plans:,} payer/plan column blocks into rows"
        elif sample.spec.kind != "csv":
            note += f", flattened from {len(headers)} discovered fields"
        return list(zip(headers, widths)), rows, note

    def _preview_by_column(self) -> tuple[list[tuple[str, int]], list[list[str]], str]:
        """The file's own columns, one per line, with the values under each."""
        sample = self.sample
        names = sample.raw_headers[:PREVIEW_COLUMNS]
        depth = min(PREVIEW_VALUE_COLUMNS, len(sample.raw_examples))
        rows = []
        for index, name in enumerate(names):
            values = [
                _preview_cell(record[index] if index < len(record) else "")
                for record in sample.raw_examples[:depth]
            ]
            rows.append([name, *values])
        rows = [[_preview_middle(row[0], PREVIEW_NAME_CHARS), *row[1:]] for row in rows]
        name_width = _preview_width(
            max([len(row[0]) for row in rows], default=20), cap=PREVIEW_NAME_CHARS * 8 + 20)
        columns = [("Column in the file", max(name_width, 220))]
        columns += [(f"Row {number}", 200) for number in range(1, depth + 1)]
        total = len(sample.raw_headers)
        note = f"{len(names)} of {total:,} columns published in the file"
        if sample.spec.wide:
            note += (f" — wide layout: the payer blocks become {sample.payer_plans:,} rows, "
                     "which is why the fields below include payer name and plan name")
        return columns, rows, note

    def _build_filter_tab(self) -> None:
        top = ttk.Frame(self.filter_tab)
        top.pack(fill="x")
        ttk.Label(top, text="Fields to filter on", font=("TkDefaultFont", 11, "bold")).pack(anchor="w")
        ttk.Label(
            top,
            text="Select one or more mapped fields. They are scanned together in one streaming pass.\n"
                 "Description is not listed: it is close to unique per row, so it is exported but never scanned.",
            foreground="#555",
            justify="left",
        ).pack(anchor="w")
        self.scan_fields = tk.Listbox(top, selectmode="extended", exportselection=False, height=6)
        self.scan_fields.pack(fill="x", pady=(8, 8))
        ttk.Button(top, text="Scan selected fields", command=self._scan).pack(anchor="w")

        # Packed before the value notebook so the reference list keeps its own
        # height; the notebook then expands into whatever is left.
        fixed = ttk.LabelFrame(self.filter_tab, text="Fixed reference filter: FY 2026 MS-DRG v43.0", padding=8)
        fixed.pack(side="bottom", fill="x", pady=(12, 0))
        self.value_notebook = ttk.Notebook(self.filter_tab)
        self.value_notebook.pack(fill="both", expand=True, pady=(12, 0))

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
        self.drg_list = tk.Listbox(fixed, selectmode="extended", exportselection=False, height=4)
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
        self.scan_targets = [target for target in mapping if TARGET_BY_NAME[target].filterable]
        self.scan_fields.delete(0, "end")
        for target in self.scan_targets:
            self.scan_fields.insert("end", f"{TARGET_BY_NAME[target].label}  [{target}]")
        drg_choices = [NOT_MAPPED] + [target for target in ("billing_code",) if target in mapping]
        self.drg_combo.configure(values=drg_choices)
        self.drg_target.set(drg_choices[-1] if len(drg_choices) > 1 else NOT_MAPPED)
        self.notebook.select(self.filter_tab)
        self.status.set(f"Mapping confirmed: {len(mapping)} standardized fields.")

    def _selected_scan_targets(self) -> list[str]:
        # Indexes the list the widget was filled from, which is not the mapping:
        # unfilterable fields are mapped and exported but never listed here.
        return [self.scan_targets[index] for index in self.scan_fields.curselection()]

    def _scan(self) -> None:
        if not self.sample or not self.mapping:
            messagebox.showerror("Mapping required", "Confirm the header mapping first.")
            return
        if not self.scan_targets:
            messagebox.showerror(
                "Nothing to scan",
                "None of the mapped fields can be used as a filter. Map a field such as "
                "payer name, plan name or setting, then scan again.")
            return
        targets = self._selected_scan_targets()
        if not targets:
            messagebox.showerror("No fields selected", "Select at least one mapped field to scan.")
            return
        columns = [self.mapping[target] for target in targets]
        spec = self.sample.spec

        def worker():
            try:
                result = scan_distinct(
                    spec, columns, self.storage, callback=self._report, cancel=self.cancel_event)
                self.events.put(("scan_done", (targets, result)))
            except BaseException as exc:
                self.events.put(("error", exc))
        self._start("Scanning distinct values...", worker)

    def _populate_values(self, targets: list[str], result: ScanResult) -> None:
        for child in self.value_notebook.winfo_children():
            child.destroy()
        self.selectors.clear()
        for target in targets:
            column = self.mapping[target]
            values = result.values[column]
            truncated = column in result.truncated
            selector = ValueSelector(self.value_notebook, values, truncated)
            count = f"{len(values):,}+" if truncated else f"{len(values):,}"
            self.value_notebook.add(selector, text=f"{TARGET_BY_NAME[target].label} ({count})")
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
                    text += f" · {value.fraction:.1%} of file bytes"
                    if value.records_per_second:
                        text += f" · {value.records_per_second / 1000:,.0f}k rows/s"
                    remaining = value.seconds_remaining
                    if remaining is not None:
                        text += f" · about {format_duration(remaining)} left"
                    self.status.set(text)
                elif event == "sample_done":
                    self.sample = payload
                    self._finish_busy()
                    # A wide file's rows are unreadable across; start it sideways.
                    self.preview_mode.set("columns" if payload.spec.wide else "rows")
                    self._build_mapping_tab()
                    self.notebook.select(self.map_tab)
                    if self.sample.spec.kind == "csv":
                        detail = f"; header row: {self.sample.spec.header_row + 1}"
                        if self.sample.spec.wide:
                            detail += (f"; wide layout, unpivoted into "
                                       f"{self.sample.payer_plans:,} payer/plan combinations")
                    else:
                        detail = f"; {self.sample.records_scanned:,} records scanned"
                    self.status.set(
                        f"Found {len(self.sample.headers)} fields; format: {self.sample.spec.kind.upper()}{detail}."
                    )
                elif event == "scan_done":
                    targets, result = payload
                    self._finish_busy()
                    self._populate_values(targets, result)
                    count = sum(len(values) for values in result.values.values())
                    suffix = " (loaded from cache)" if result.from_cache else ""
                    if result.truncated:
                        labels = ", ".join(
                            TARGET_BY_NAME[target].label for target in targets
                            if self.mapping[target] in result.truncated)
                        suffix += (f" — {labels} exceeded {DISTINCT_VALUE_LIMIT:,} distinct values, "
                                   "so those lists are partial")
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
        self._drain_job = self.after(100, self._drain_events)

    def destroy(self) -> None:
        """Stop the event pump and any worker before the widgets go away."""
        self.cancel_event.set()
        if self._drain_job is not None:
            self.after_cancel(self._drain_job)
            self._drain_job = None
        super().destroy()

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

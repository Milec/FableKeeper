#!/usr/bin/env python3
"""Build the standalone application and prove the result actually runs.

    python -m pip install -r requirements-dev.txt
    python scripts/build.py

Produces `dist/HospitalMRFFilter` (`.exe` on Windows, `.app` alongside it on
macOS) for whichever platform this runs on; PyInstaller cannot cross-compile,
so each operating system's download has to be built on that operating system.
The build is followed by the binary's own `--selftest`, because a PyInstaller
build can compile cleanly and still be missing its data files or its ijson C
backend.
"""
from __future__ import annotations

import importlib.util
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = ROOT / "hospital-mrf-filter.spec"
NAME = "HospitalMRFFilter"


def built_binary() -> Path:
    """The application people launch."""
    return ROOT / "dist" / (f"{NAME}.exe" if sys.platform == "win32" else NAME)


def diagnostic_binary() -> Path:
    """The one whose output is visible.

    On Windows the GUI executable is windowed and has no stdout, so it can set
    an exit code but cannot print a report; the console twin does both.
    """
    if sys.platform == "win32":
        return ROOT / "dist" / f"{NAME}-console.exe"
    return built_binary()


def main() -> int:
    if not SPEC.is_file():
        print(f"missing spec file: {SPEC}", file=sys.stderr)
        return 2
    if importlib.util.find_spec("PyInstaller") is None:
        print("PyInstaller is not installed. Run:\n"
              "  python -m pip install -r requirements-dev.txt", file=sys.stderr)
        return 2

    for stale in (ROOT / "build", ROOT / "dist"):
        shutil.rmtree(stale, ignore_errors=True)

    build = subprocess.run(
        [sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", str(SPEC)],
        cwd=ROOT,
    )
    if build.returncode != 0:
        return build.returncode

    binary, diagnostic = built_binary(), diagnostic_binary()
    for produced in {binary, diagnostic}:
        if not produced.is_file():
            print(f"build reported success but {produced} is missing", file=sys.stderr)
            return 1
        print(f"built {produced} ({produced.stat().st_size / (1024 * 1024):.0f} MB)", flush=True)

    print(f"\nrunning {diagnostic.name} --selftest:\n", flush=True)
    check = subprocess.run([str(diagnostic), "--selftest"])
    if check.returncode != 0:
        print("\nthe built application failed its own self-test", file=sys.stderr)
        return check.returncode

    if diagnostic != binary:
        # The GUI binary cannot report, but it can still pass or fail.
        silent = subprocess.run([str(binary), "--selftest"])
        if silent.returncode != 0:
            print(f"\n{binary.name} failed its self-test (exit {silent.returncode})", file=sys.stderr)
            return silent.returncode
        print(f"{binary.name} passed the same self-test silently, as a windowed build does.",
              flush=True)

    print(f"\n{binary} is ready to hand out; it needs no Python installed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

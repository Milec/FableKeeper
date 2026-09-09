# PyInstaller spec: build with `pyinstaller hospital-mrf-filter.spec`, or via
# `python scripts/build.py`, which also runs the built binary's self-test.
#
# Two things are easy to lose in a build and neither raises at build time:
#
#   * ijson selects its backend by importlib at run time, so PyInstaller cannot
#     see yajl2_c by static analysis. Without it listed here the build silently
#     falls back to the pure-Python backend, which is about ten times slower on
#     the JSON path. `--selftest` fails the build if that happens.
#   * The MS-DRG reference CSV is package data, not a module, so it has to be
#     carried explicitly and read through standards.package_root().
import sys
from pathlib import Path

app_name = "HospitalMRFFilter"
here = Path(SPECPATH)

a = Analysis(
    [str(here / "app.py")],
    pathex=[str(here)],
    binaries=[],
    datas=[(str(here / "mrf_filter" / "reference"), "mrf_filter/reference")],
    hiddenimports=[
        "ijson.backends.yajl2_c",
        "ijson.backends.yajl2_cffi",
        "ijson.backends.yajl2",
        "ijson.backends.python",
    ],
    hookspath=[],
    runtime_hooks=[],
    # Nothing here imports these; leaving them out keeps the download small.
    excludes=["numpy", "pandas", "matplotlib", "PIL", "pytest", "setuptools", "pip"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name=app_name,
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    runtime_tmpdir=None,
    # Windowed, so no console flashes up behind the GUI.
    console=False,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

if sys.platform == "win32":
    # A windowed Windows executable has no stdout at all, so `--selftest` on the
    # GUI binary prints nothing: it sets an exit code and stays silent. This
    # console-subsystem twin shares the same entry point and payload, and is
    # what the docs point at for diagnostics. It costs a second copy of the
    # bundle on disk; attaching to the parent console with ctypes instead is one
    # binary but breaks output redirection.
    console_exe = EXE(
        pyz,
        a.scripts,
        a.binaries,
        a.datas,
        [],
        name=f"{app_name}-console",
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=False,
        runtime_tmpdir=None,
        console=True,
        disable_windowed_traceback=False,
        target_arch=None,
        codesign_identity=None,
        entitlements_file=None,
    )

if sys.platform == "darwin":
    app = BUNDLE(
        exe,
        name=f"{app_name}.app",
        icon=None,
        bundle_identifier="org.hospitalmrffilter.app",
        info_plist={
            "NSHighResolutionCapable": True,
            "LSApplicationCategoryType": "public.app-category.utilities",
        },
    )

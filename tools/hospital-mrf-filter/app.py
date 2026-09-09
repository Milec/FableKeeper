"""Entry point for both the source checkout and the PyInstaller build."""
from __future__ import annotations

import sys

USAGE = """Hospital MRF Filter

  (no arguments)   open the application
  --selftest       run the pipeline over a generated file and report what works
  --version        print the version and exit
"""


def main() -> int:
    args = sys.argv[1:]
    if args and args[0] in {"-h", "--help"}:
        print(USAGE)
        return 0
    if args and args[0] == "--version":
        from mrf_filter import __version__
        print(__version__)
        return 0
    if args and args[0] == "--selftest":
        from mrf_filter.selftest import run
        return run()
    if args:
        print(f"Unrecognized argument: {args[0]}\n\n{USAGE}", file=sys.stderr)
        return 2
    # Imported here so --version and --selftest work with no display attached.
    from mrf_filter.gui import main as gui_main
    gui_main()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

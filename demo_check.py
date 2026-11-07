"""Checks that the demo can start on this machine, and prints the exact commands. Stdlib only.
Run: python demo_check.py [--api-port 8000] [--app-port 3000]
Exit 0 when every required file and Python version are present. Bun and ports are reported, not required,
because the zero-dependency fallback (reviewer.html) needs neither."""
import argparse
import shutil
import socket
import sys
from pathlib import Path

HERE = Path(__file__).parent
REQUIRED = ["server.py", "ui_view.py", "policy.py", "engine.py", "io_csv.py", "triage.py", "decision_log.py",
            "policies/v1.json", "policies/v2.json", "unlabelled_practice_cases.csv", "reviewer.html",
            "frontend/package.json", "frontend/src/data/live.ts"]


def port_free(port):
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api-port", type=int, default=8000)
    ap.add_argument("--app-port", type=int, default=3000)
    args = ap.parse_args()
    ok = True
    py = sys.version_info >= (3, 10)
    print(f"[{'ok' if py else 'FAIL'}] Python {sys.version.split()[0]} (needs 3.10 or newer)")
    ok &= py
    missing = [f for f in REQUIRED if not (HERE / f).exists()]
    print(f"[{'ok' if not missing else 'FAIL'}] required files" + (f": missing {missing}" if missing else ""))
    ok &= not missing
    bun = shutil.which("bun")
    print(f"[{'ok' if bun else 'info'}] Bun {'found' if bun else 'not found: the team app will not start; use the fallback page'}")
    for name, port in [("engine", args.api_port), ("app", args.app_port)]:
        free = port_free(port)
        print(f"[{'ok' if free else 'info'}] port {port} for {name} {'is free' if free else 'is in use: choose another'}")
    print("\nStart the demo (two terminals, from the repository root):")
    print(f"  python server.py --port {args.api_port}")
    print(f"  cd frontend && bun install && VITE_API_BASE=http://127.0.0.1:{args.api_port} bun run dev -- --port {args.app_port}")
    print(f"Then open http://127.0.0.1:{args.app_port}/claims")
    print("Fallback (no Bun, no server): open reviewer.html in Chrome. It applies the same rules as the engine; its browser checks run in our own Chrome tests, not in the judges' command.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

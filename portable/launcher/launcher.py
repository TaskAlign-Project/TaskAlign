"""TaskAlign launcher (portable Windows build).

Starts the API and the web page on this computer only (127.0.0.1, so Windows
never shows a firewall prompt), opens the browser, and stops both again when
this window is closed. Needs no installation and no administrator rights.

Uses only the Python standard library, so it runs on the bundled Python.

    launcher.py                start and open the browser
    launcher.py --self-test    start, check both servers answer, stop (exit 0 = ok)
    launcher.py --no-browser   start without opening the browser

For testing on a non-Windows machine, TASKALIGN_PYTHON and TASKALIGN_NODE
override the bundled runtimes.
"""
from __future__ import annotations

import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from datetime import datetime
from pathlib import Path

INTERNAL = Path(__file__).resolve().parent
ROOT = INTERNAL.parent
DATA = ROOT / "data"
LOGS = DATA / "logs"
DB = DATA / "taskalign.db"
SEED = INTERNAL / "seed" / "taskalign.db"
HOST = "127.0.0.1"
IS_WINDOWS = os.name == "nt"
STARTUP_TIMEOUT_SECONDS = 120  # first start on an old PC compiles and loads a lot

_launcher_log = None


def load_config() -> dict:
    config = {"backend_port": 47831, "web_port": 47832}
    path = INTERNAL / "config.json"
    if path.exists():
        config.update(json.loads(path.read_text(encoding="utf-8")))
    return config


def say(message: str = "") -> None:
    """Print to the window and keep a copy in the launcher log."""
    print(message, flush=True)
    if _launcher_log is not None:
        _launcher_log.write(f"{datetime.now():%Y-%m-%d %H:%M:%S}  {message}\n")
        _launcher_log.flush()


def fail(message: str, *details: str) -> int:
    say()
    say("TaskAlign could not start.")
    say(message)
    for line in details:
        say(line)
    say()
    say(f"A log is kept in: {LOGS}")
    return 1


def runtime_paths() -> tuple[Path, Path]:
    python = os.environ.get("TASKALIGN_PYTHON") or (
        str(INTERNAL / "python" / "python.exe") if IS_WINDOWS else sys.executable
    )
    node = os.environ.get("TASKALIGN_NODE") or (
        str(INTERNAL / "node" / "node.exe") if IS_WINDOWS else (shutil.which("node") or "")
    )
    return Path(python), Path(node)


def is_listening(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((HOST, port)) == 0


def fetch(url: str, timeout: float = 2.0) -> tuple[int, str] | None:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return response.status, response.read(2000).decode("utf-8", "replace")
    except (urllib.error.URLError, OSError, ValueError):
        return None


def taskalign_running(backend_port: int, web_port: int) -> bool:
    api = fetch(f"http://{HOST}:{backend_port}/")
    web = fetch(f"http://{HOST}:{web_port}/")
    return bool(api and "TaskAlign API" in api[1] and web and web[0] == 200)


def ensure_data_folder() -> str | None:
    """Create the data folder and database; return an error message if it cannot be used."""
    try:
        LOGS.mkdir(parents=True, exist_ok=True)
        probe = DATA / ".write-test"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
    except OSError as exc:
        return (
            f"TaskAlign cannot save files in {DATA} ({exc.strerror or exc}).\n"
            "Move the whole TaskAlign folder somewhere you can save files, such as\n"
            "your Desktop or Documents folder (not inside a zip file, and not in\n"
            "Program Files), and start it again."
        )

    if not DB.exists():
        if not SEED.exists():
            return f"The database {DB} is missing and there is no original copy to restore it from."
        shutil.copyfile(SEED, DB)
        say("Created a fresh database from the original data.")
    return None


def tail(path: Path, lines: int = 15) -> list[str]:
    try:
        return path.read_text(encoding="utf-8", errors="replace").splitlines()[-lines:]
    except OSError:
        return []


def start_process(name: str, command: list[str], cwd: Path, env: dict) -> subprocess.Popen:
    # No new console window: the child shares this window, so closing it also
    # ends the servers (a hidden console of their own would leave them running).
    log = open(LOGS / f"{name}.log", "ab")
    log.write(f"\n===== {datetime.now():%Y-%m-%d %H:%M:%S} starting {name} =====\n".encode())
    log.flush()
    return subprocess.Popen(
        command, cwd=str(cwd), env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT
    )


def stop(processes: list[subprocess.Popen]) -> None:
    for p in processes:
        if p.poll() is None:
            p.terminate()
    deadline = time.time() + 5
    for p in processes:
        try:
            p.wait(timeout=max(0.1, deadline - time.time()))
        except subprocess.TimeoutExpired:
            p.kill()


def _stop_on_signal(signum, frame):  # noqa: ARG001
    raise KeyboardInterrupt


def main(argv: list[str]) -> int:
    global _launcher_log
    # Stop the servers on every kind of "please stop" (Ctrl+C, Ctrl+Break, terminate, hang-up),
    # not only Ctrl+C. Closing the console window is handled by the servers sharing that window.
    for name in ("SIGTERM", "SIGHUP", "SIGBREAK"):
        if hasattr(signal, name):
            signal.signal(getattr(signal, name), _stop_on_signal)
    self_test = "--self-test" in argv
    open_browser = "--no-browser" not in argv and not self_test

    config = load_config()
    backend_port, web_port = config["backend_port"], config["web_port"]
    url = f"http://{HOST}:{web_port}"

    say("=" * 60)
    say("  TaskAlign")
    say("=" * 60)

    problem = ensure_data_folder()
    if problem:
        return fail(problem)
    _launcher_log = open(LOGS / "launcher.log", "a", encoding="utf-8")

    # Double-clicked twice? Reuse the running copy instead of starting another.
    if taskalign_running(backend_port, web_port):
        say("TaskAlign is already running. Opening it in your browser.")
        if open_browser:
            webbrowser.open(url)
        return 0
    for port in (backend_port, web_port):
        if is_listening(port):
            return fail(
                f"Another program is already using port {port}.",
                "Close the other program (or restart the computer) and try again.",
            )

    python, node = runtime_paths()
    for label, path in (("Python", python), ("Node", node)):
        if not path.exists():
            return fail(f"The bundled {label} program is missing: {path}",
                        "The TaskAlign folder looks incomplete. Extract the zip file again.")

    backend_dir = INTERNAL / "backend"
    web_dir = INTERNAL / "web"
    common = dict(os.environ)
    backend_env = {
        **common,
        "DATABASE_URL": "sqlite:///" + DB.resolve().as_posix(),
        "CORS_ORIGINS": f"http://{HOST}:{web_port},http://localhost:{web_port}",
        "PYTHONPATH": str(backend_dir),
        "PYTHONUNBUFFERED": "1",
    }
    web_env = {
        **common,
        "HOSTNAME": HOST,  # loopback only: no Windows Firewall prompt
        "PORT": str(web_port),
        "NODE_ENV": "production",
        "NEXT_TELEMETRY_DISABLED": "1",
    }

    say("Starting TaskAlign. The first start can take up to a minute on an older")
    say("computer. Please wait...")
    say()

    processes: list[subprocess.Popen] = []
    try:
        backend = start_process(
            "backend",
            [str(python), "-X", "utf8", "-m", "uvicorn", "app.main:app", "--host", HOST,
             "--port", str(backend_port), "--log-level", "warning", "--no-access-log"],
            backend_dir, backend_env,
        )
        processes.append(backend)
        web = start_process("web", [str(node), "server.js"], web_dir, web_env)
        processes.append(web)

        deadline = time.time() + STARTUP_TIMEOUT_SECONDS
        while not taskalign_running(backend_port, web_port):
            for name, proc in (("backend", backend), ("web", web)):
                if proc.poll() is not None:
                    return fail(
                        f"The {name} part stopped while starting (exit code {proc.returncode}).",
                        "Last lines of its log:", *("    " + line for line in tail(LOGS / f"{name}.log")),
                    )
            if time.time() > deadline:
                return fail(
                    f"TaskAlign did not become ready within {STARTUP_TIMEOUT_SECONDS} seconds.",
                    "Last lines of the backend log:", *("    " + line for line in tail(LOGS / "backend.log")),
                )
            time.sleep(0.5)

        say("TaskAlign is ready.")
        say(f"    Address: {url}")
        say()
        if self_test:
            say("Self-test passed.")
            return 0
        if open_browser:
            say("Opening it in your browser...")
            webbrowser.open(url)
        say()
        say("Keep this window open while you use TaskAlign.")
        say("To stop TaskAlign, close this window.")

        while True:
            time.sleep(1)
            for name, proc in (("backend", backend), ("web", web)):
                if proc.poll() is not None:
                    return fail(f"The {name} part stopped unexpectedly (exit code {proc.returncode}).",
                                "Last lines of its log:", *("    " + line for line in tail(LOGS / f"{name}.log")))
    except KeyboardInterrupt:
        say("Stopping TaskAlign...")
        return 0
    finally:
        stop(processes)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

#!/usr/bin/env python3
"""Build the portable Windows package of TaskAlign.

    python portable/build.py                       # data copied from the Docker/PostgreSQL database
    python portable/build.py --empty               # ship with no data
    python portable/build.py --skip-plan gg        # leave a test plan out of the copied data

Result: portable/dist/TaskAlign-Windows-<date>-<commit>.zip

Runs on macOS or Linux (no Windows needed). Needs: Python 3.11, pnpm, Node, internet
for the first build (later builds reuse portable/cache), and for the data copy the
Docker database running. See portable/README.md.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
CACHE = HERE / "cache"
BUILD = HERE / "build"
DIST = HERE / "dist"
STAGE = BUILD / "TaskAlign"
INTERNAL = STAGE / "_internal"

# The browser talks to these on 127.0.0.1 only. The backend port is baked into the web page at build time.
BACKEND_PORT = 47831
WEB_PORT = 47832

# Official portable runtimes. Each file is checked against the hash below after download.
NODE_VERSION = "22.23.4"
NODE_ZIP = f"node-v{NODE_VERSION}-win-x64.zip"
NODE_URL = f"https://nodejs.org/dist/v{NODE_VERSION}/{NODE_ZIP}"
NODE_SHA256 = "cbc74b5e0982c9dbb41525fd8fb5dcd32fbee237863f7829072f4639a1ce5f20"  # = nodejs.org SHASUMS256.txt

PY_VERSION = "3.11.9"  # the last 3.11 release python.org ships a Windows binary for
PY_ZIP = f"python-{PY_VERSION}-embed-amd64.zip"
PY_URL = f"https://www.python.org/ftp/python/{PY_VERSION}/{PY_ZIP}"
# = python.org's published MD5 6d9aa085... and Steve Dower's GPG signature (both checked when pinning)
PY_SHA256 = "009d6bf7e3b2ddca3d784fa09f90fe54336d5b60f0e0f305c37f400bf83cfd3b"

# Packages that never ship: a Mac-only image library (the app does not use next/image) and
# the TypeScript compiler (needed to build, not to run).
WEB_PRUNE = ["sharp", "@img", "detect-libc", "typescript"]


def step(message: str) -> None:
    print(f"\n==> {message}", flush=True)


def run(cmd: list, **kwargs) -> subprocess.CompletedProcess:
    print("    $ " + " ".join(str(c) for c in cmd), flush=True)
    return subprocess.run([str(c) for c in cmd], check=True, **kwargs)


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def download(url: str, dest: Path, sha256: str) -> Path:
    if dest.exists() and sha256_of(dest) == sha256:
        print(f"    cached: {dest.name}")
        return dest
    print(f"    downloading {url}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(url, timeout=60) as response, tmp.open("wb") as out:
        shutil.copyfileobj(response, out)
    actual = sha256_of(tmp)
    if actual != sha256:
        tmp.unlink()
        raise SystemExit(f"CHECKSUM MISMATCH for {url}\n  expected {sha256}\n  got      {actual}\nRefusing to use it.")
    tmp.replace(dest)
    return dest


def find_python311() -> Path:
    for candidate in (
        os.environ.get("PYTHON311"),
        "/opt/homebrew/opt/python@3.11/bin/python3.11",
        "/usr/local/opt/python@3.11/bin/python3.11",
        shutil.which("python3.11"),
    ):
        if candidate and Path(candidate).exists():
            return Path(candidate)
    raise SystemExit("Python 3.11 is required to build (bytecode must match the bundled Python 3.11). "
                     "Install it (brew install python@3.11) or set PYTHON311.")


def build_venv() -> Path:
    """A throwaway Python 3.11 environment with the tools the build needs."""
    venv = CACHE / "venv-build"
    python = venv / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not python.exists():
        run([find_python311(), "-m", "venv", venv])
        run([python, "-m", "pip", "install", "-q", "--upgrade", "pip"])
        run([python, "-m", "pip", "install", "-q", "pefile"])
    return python


# ---------------------------------------------------------------------------
# Pieces of the package
# ---------------------------------------------------------------------------

def stage_python(py: Path) -> None:
    step("Bundled Python (python.org embeddable build) and its libraries")
    zip_path = download(PY_URL, CACHE / PY_ZIP, PY_SHA256)
    dest = INTERNAL / "python"
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(dest)

    # Embedded Python ignores PYTHONPATH and reads only this file. Add the libraries and the backend.
    major_minor = "".join(PY_VERSION.split(".")[:2])
    (dest / f"python{major_minor}._pth").write_text(
        f"python{major_minor}.zip\n.\nLib\\site-packages\n..\\backend\nimport site\n", newline="\r\n"
    )

    wheels = CACHE / "wheels"
    requirements = HERE / "requirements-win.txt"
    stamp = wheels / ".requirements.sha256"
    wanted = sha256_of(requirements)
    if not wheels.exists() or not stamp.exists() or stamp.read_text() != wanted:
        shutil.rmtree(wheels, ignore_errors=True)
        wheels.mkdir(parents=True)
        # Windows 64-bit builds of the pinned versions; --platform lets a Mac fetch them.
        run([py, "-m", "pip", "download", "-q", "--no-deps", "--only-binary=:all:",
             "--platform", "win_amd64", "--platform", "any", "--python-version", "3.11",
             "--implementation", "cp", "--abi", "cp311", "-d", wheels, "-r", requirements])
        stamp.write_text(wanted)

    site_packages = dest / "Lib" / "site-packages"
    site_packages.mkdir(parents=True, exist_ok=True)
    for wheel in sorted(wheels.glob("*.whl")):
        with zipfile.ZipFile(wheel) as z:
            z.extractall(site_packages)
    print(f"    installed {len(list(wheels.glob('*.whl')))} libraries")


def stage_node() -> None:
    step("Bundled Node.js (nodejs.org portable build)")
    zip_path = download(NODE_URL, CACHE / NODE_ZIP, NODE_SHA256)
    dest = INTERNAL / "node"
    dest.mkdir(parents=True)
    root = f"node-v{NODE_VERSION}-win-x64/"
    with zipfile.ZipFile(zip_path) as z:
        for name in ("node.exe", "LICENSE"):  # npm, corepack etc. are not needed to run a built site
            (dest / name).write_bytes(z.read(root + name))


def stage_backend() -> None:
    step("Backend code")
    shutil.copytree(
        REPO / "backend" / "app", INTERNAL / "backend" / "app",
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store"),
    )


def stage_web(reuse: bool) -> None:
    step("Web page (Next.js standalone build)")
    src = BUILD / "frontend-src"
    built = src / ".next" / "standalone"
    if not (reuse and built.exists()):
        shutil.rmtree(src, ignore_errors=True)
        shutil.copytree(
            REPO / "frontend", src,
            ignore=shutil.ignore_patterns("node_modules", ".next", ".DS_Store", ".env*"),
        )
        # Flat node_modules (no pnpm symlink tree): zip files keep symlinks, Windows cannot extract
        # them, and the nested .pnpm folders also blow past Windows' 260-character path limit.
        (src / ".npmrc").write_text("node-linker=hoisted\n")
        config = src / "next.config.mjs"
        text = config.read_text()
        assert "const nextConfig = {\n" in text, "next.config.mjs changed shape; update build.py"
        config.write_text(text.replace("const nextConfig = {\n", 'const nextConfig = {\n  output: "standalone",\n', 1))

        env = {**os.environ, "NEXT_PUBLIC_API_BASE_URL": f"http://127.0.0.1:{BACKEND_PORT}",
               "NEXT_TELEMETRY_DISABLED": "1"}
        run(["pnpm", "install", "--frozen-lockfile"], cwd=src, env=env)
        run(["pnpm", "build"], cwd=src, env=env)
    else:
        print("    reusing the previous web build (--reuse-web)")

    dest = INTERNAL / "web"
    shutil.copytree(built, dest, symlinks=False)
    shutil.copytree(src / ".next" / "static", dest / ".next" / "static")
    if (src / "public").exists():
        shutil.copytree(src / "public", dest / "public")
    for name in WEB_PRUNE:
        shutil.rmtree(dest / "node_modules" / name, ignore_errors=True)

    # Next records the build machine's folder in two config files. It is not used when running, but it
    # would put the developer's user name and folders into every client's copy.
    for name in ("server.js", ".next/required-server-files.json"):
        path = dest / name
        path.write_text(path.read_text(encoding="utf-8").replace(str(src.resolve()), "/build/frontend"), encoding="utf-8")


def stage_database(args: argparse.Namespace) -> None:
    step("Database (SQLite)")
    out = STAGE / "data" / "taskalign.db"
    cmd = [REPO / "backend" / "venv" / "bin" / "python", HERE / "make_database.py", out]
    if not args.empty:
        url = args.pg_url or os.environ.get("TASKALIGN_PG_URL") or read_database_url()
        cmd += ["--from-postgres", url]
        for name in args.skip_plan:
            cmd += ["--skip-plan", name]
    run(cmd)
    # Original copy, used to recreate the database if the client ever deletes theirs.
    (INTERNAL / "seed").mkdir(parents=True)
    shutil.copyfile(out, INTERNAL / "seed" / "taskalign.db")


def read_database_url() -> str:
    for env_file in (REPO / ".env", REPO / "backend" / ".env"):
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith("DATABASE_URL="):
                    return line.split("=", 1)[1].strip()
    raise SystemExit("No DATABASE_URL found. Pass --pg-url, or --empty to build without data.")


def write_text_windows(path: Path, text: str) -> None:
    """Launcher scripts must be plain ASCII with CRLF line endings for cmd.exe."""
    text.encode("ascii")  # raises if a non-ASCII character slipped in
    path.write_bytes(text.replace("\r\n", "\n").replace("\n", "\r\n").encode("ascii"))


START_BAT = """@echo off
title TaskAlign
cd /d "%~dp0"
if not exist "%~dp0_internal\\python\\python.exe" (
    echo.
    echo  TaskAlign cannot start from here.
    echo  Please extract the WHOLE zip file first ^(right-click it, Extract All^),
    echo  then open the extracted TaskAlign folder and double-click START TaskAlign again.
    echo.
    pause
    exit /b 1
)
"%~dp0_internal\\python\\python.exe" -X utf8 "%~dp0_internal\\launcher.py" %*
if errorlevel 1 (
    echo.
    pause
)
"""

STOP_BAT = """@echo off
title Stop TaskAlign
echo Stopping TaskAlign...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort {backend},{web} -State Listen -ErrorAction SilentlyContinue | ForEach-Object {{ Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }}"
echo Done. TaskAlign is stopped.
pause
"""

README_TXT = """TASKALIGN  -  READ ME FIRST
=====================================================

HOW TO START
------------
1. Extract the zip file.  Right-click it and choose "Extract All...".
   Put the TaskAlign folder somewhere you can save files, for example your
   Desktop or Documents folder.  Do NOT run it from inside the zip file.

2. Open the TaskAlign folder and double-click:   START TaskAlign

3. A black window opens and, after a short wait (up to a minute the very first
   time), your web browser opens TaskAlign by itself.

   Keep the black window open while you work.
   To stop TaskAlign, just close the black window.

{first_steps}

NOTHING ELSE TO INSTALL
-----------------------
TaskAlign contains everything it needs.  It does not need Docker, Python,
internet, or administrator rights, and it does not change anything in Windows.
It only works on this computer (it is not reachable from the network).

IF WINDOWS ASKS "Do you want to run this file?" OR SAYS "Windows protected your PC"
-------------------------------------------------------------------------------------
This is normal for a program that is not from the Microsoft Store.
Click "Run", or "More info" and then "Run anyway".  Administrator rights are
not needed.
(Tip: before extracting, right-click the zip file > Properties > tick
"Unblock" > OK.  Then these messages usually do not appear at all.)

YOUR DATA
---------
Everything you enter is saved in this file:

    data\\taskalign.db

* To make a backup, close TaskAlign and copy that one file somewhere safe.
* To move to another computer, copy the whole TaskAlign folder.
* To start again from the original data, close TaskAlign, delete
  data\\taskalign.db, and start TaskAlign again.

IF SOMETHING GOES WRONG
-----------------------
* "Another program is already using port ..."  ->  Restart the computer, or
  close TaskAlign (double-click STOP TaskAlign) and start it again.
* The page does not open  ->  Open your browser and type this address:
      http://127.0.0.1:{web}
* Still stuck  ->  Send the files in the folder  data\\logs  to your contact.

REQUIREMENTS
------------
Windows 10 or Windows 11 (64-bit), about 500 MB of free disk space, and a
modern web browser (Microsoft Edge, Google Chrome or Firefox).

Version: {version}
"""


FIRST_STEPS_WITH_DATA = (
    'The first time, go to "Plans" in the top menu and press "Select" on your plan.'
)

FIRST_STEPS_EMPTY = """FIRST STEPS  (TaskAlign starts empty)
-------------------------------------
Do these once, in this order. Everything is in the top menu.

 1. Machines     Press "Import from Excel" and choose your list of machines.
                 (The window has "Download Template" to show the columns.)
                 Or add them one by one with "Add Machine".

 2. Plans        Press "Create New Plan", type a name (for example "Nov 2025"),
                 press "Create Plan", then press "Select" on it.

 3. Components   Press "Import from Excel" and choose your two files
                 (Overview and ZPPI010). This also creates your molds.

 4. Setup Plan   Set "Current Date (Start)" (the first day of the schedule) and
                 "Month Days", then press "Run Scheduler". When it finishes,
                 open "Output" to see the schedule.

Do step 1 first: it lets TaskAlign check the molds against your machines."""


def stage_launcher(version: str, empty: bool) -> None:
    step("Launcher, start/stop scripts and instructions")
    shutil.copyfile(HERE / "launcher" / "launcher.py", INTERNAL / "launcher.py")
    (INTERNAL / "config.json").write_text(json.dumps({"backend_port": BACKEND_PORT, "web_port": WEB_PORT}, indent=2))
    write_text_windows(STAGE / "START TaskAlign.bat", START_BAT)
    write_text_windows(STAGE / "STOP TaskAlign.bat", STOP_BAT.format(backend=BACKEND_PORT, web=WEB_PORT))
    write_text_windows(
        STAGE / "READ ME FIRST.txt",
        README_TXT.format(web=WEB_PORT, version=version,
                          first_steps=FIRST_STEPS_EMPTY if empty else FIRST_STEPS_WITH_DATA),
    )

    licenses = INTERNAL / "licenses"
    licenses.mkdir()
    shutil.copyfile(INTERNAL / "node" / "LICENSE", licenses / "NODE-LICENSE.txt")
    shutil.copyfile(INTERNAL / "python" / "LICENSE.txt", licenses / "PYTHON-LICENSE.txt")

    info = {
        "version": version,
        "built": datetime.now().isoformat(timespec="seconds"),
        "python": PY_VERSION,
        "node": NODE_VERSION,
        "ports": {"backend": BACKEND_PORT, "web": WEB_PORT},
    }
    (INTERNAL / "build-info.json").write_text(json.dumps(info, indent=2))


def precompile(py: Path) -> None:
    step("Pre-compiling Python code (faster first start on an old PC)")
    # Hash-checked bytecode that is never compared with file dates: unzipping changes the dates,
    # which would otherwise make Python throw this work away and redo it on the client's PC.
    run([py, "-m", "compileall", "-q", "-j", "0", "--invalidation-mode", "unchecked-hash",
         INTERNAL / "python" / "Lib" / "site-packages", INTERNAL / "backend"])


def git_version() -> str:
    def git(*args: str) -> str:
        return subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True).stdout.strip()

    commit = git("rev-parse", "--short=8", "HEAD") or "nogit"
    dirty = "-dirty" if git("status", "--porcelain", "--", "backend", "frontend", "portable") else ""
    return f"{datetime.now():%Y%m%d}-{commit}{dirty}"


def make_zip(version: str) -> Path:
    step("Zip file")
    DIST.mkdir(exist_ok=True)
    out = DIST / f"TaskAlign-Windows-{version}.zip"
    out.unlink(missing_ok=True)
    count = 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for path in sorted(STAGE.rglob("*")):
            if path.is_file():
                z.write(path, ("TaskAlign/" + path.relative_to(STAGE).as_posix()))
                count += 1
    print(f"    {count} files, {out.stat().st_size / 1024 / 1024:.1f} MB -> {out}")
    return out


def smoke_test() -> None:
    """Start the staged package for real (on this machine's own Python/Node) and check it answers.

    Windows-only parts (the bundled python.exe/node.exe) cannot run here, so those are covered by
    verify_package.py instead. Runs on a copy so the test's logs and database edits never ship.
    """
    step("Smoke test: start the staged package and check both servers answer")
    minimal = CACHE / "venv-minimal" / "bin" / "python"
    node = shutil.which("node")
    if sys.platform == "win32" or not minimal.exists() or not node:
        print("    skipped (needs macOS/Linux, node, and portable/cache/venv-minimal; see portable/README.md)")
        return
    with tempfile.TemporaryDirectory() as tmp:
        copy = Path(tmp) / "TaskAlign"
        shutil.copytree(STAGE, copy)
        env = {**os.environ, "TASKALIGN_PYTHON": str(minimal), "TASKALIGN_NODE": node}
        run([minimal, copy / "_internal" / "launcher.py", "--self-test"], env=env)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--empty", action="store_true", help="ship an empty database")
    parser.add_argument("--pg-url", help="PostgreSQL database to copy data from (default: DATABASE_URL in .env)")
    parser.add_argument("--skip-plan", action="append", default=[], metavar="NAME",
                        help="leave this plan (and its components/runs) out; repeatable")
    parser.add_argument("--reuse-web", action="store_true",
                        help="skip rebuilding the web page (only safe if the frontend has not changed)")
    parser.add_argument("--no-smoke-test", action="store_true")
    args = parser.parse_args()

    version = git_version() + ("-empty" if args.empty else "")
    print(f"Building TaskAlign portable package {version}")
    shutil.rmtree(STAGE, ignore_errors=True)
    INTERNAL.mkdir(parents=True)
    CACHE.mkdir(exist_ok=True)

    py = build_venv()
    stage_python(py)
    stage_node()
    stage_backend()
    stage_web(args.reuse_web)
    stage_database(args)
    stage_launcher(version, args.empty)
    precompile(py)

    step("Verifying the package for Windows")
    run([py, HERE / "verify_package.py", STAGE])
    if not args.no_smoke_test:
        smoke_test()
    make_zip(version)
    print("\nDone.")


if __name__ == "__main__":
    main()

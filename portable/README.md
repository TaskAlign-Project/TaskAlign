# Portable Windows package

Builds one zip file that a Windows user can extract and double-click. No Docker, no installer,
no administrator rights, no internet.

```bash
python3 portable/build.py                    # copies the data from the running Docker database
python3 portable/build.py --skip-plan gg     # ...but leaves a test plan out (repeat the flag for more)
python3 portable/build.py --empty            # ships with no data
```

Result: `portable/dist/TaskAlign-Windows-<date>-<commit>.zip` (about 60 MB). Too big and too "executable"
for an email attachment (mail servers block `.exe`/`.bat`/`.dll` and cap size at about 25 MB), so share it
through a download link (Google Drive, OneDrive, WeTransfer ...) and email the link.

## What you need to build

* macOS or Linux (Windows is **not** needed to build).
* Python 3.11 (`brew install python@3.11`), `pnpm`, `node`, internet on the first build.
* For the data copy: the Docker stack running (the script reads PostgreSQL on `localhost:5432`).
* Optional, for the end-of-build smoke test: `portable/cache/venv-minimal` (Python 3.11 with
  `requirements-win.txt`); the build skips the test if it is missing.

## What is inside the zip

```
TaskAlign/
  START TaskAlign.bat      double-click; starts everything and opens the browser
  STOP TaskAlign.bat       frees the ports if something is stuck
  READ ME FIRST.txt        instructions for the client
  data/taskalign.db        the client's data (SQLite, one file); data/logs/ appears when running
  _internal/
    python/                python.org embeddable Python 3.11 + the libraries from requirements-win.txt
    node/node.exe          Node.js (runs the web page)
    backend/app/           the FastAPI backend
    web/                   the Next.js standalone build
    seed/taskalign.db      pristine copy, used if the client deletes data/taskalign.db
    launcher.py            starts/stops both servers (standard library only)
```

How it differs from Docker:

| | Docker | Portable |
|---|---|---|
| Database | PostgreSQL | SQLite file (`data/taskalign.db`) |
| Ports | 3000 / 8000 | 47832 (web) / 47831 (API), **127.0.0.1 only** (no firewall prompt) |
| Migrations | `alembic upgrade head` at start | none: ships a finished database (alembic version is stamped) |

The backend picks SQLite when `DATABASE_URL` starts with `sqlite` (`app/database.py`); everything else
is the same code. `CORS_ORIGINS` limits which page may call the API (set by the launcher).

## Why it is built this way

* **SQLite, not PostgreSQL:** nothing to start, one file holds the data, and no extra Windows runtime
  pieces to depend on. PostgreSQL would need a server process on an old PC with no admin rights.
* **Flat `node_modules`:** pnpm's symlink tree cannot be extracted by Windows and exceeds the
  260-character path limit. `verify_package.py` checks path lengths, reserved names, symlinks and that
  every `.exe`/`.dll`/`.pyd` only needs DLLs that ship with the package or with Windows itself.
* **Pinned runtimes:** `build.py` pins Node and Python by SHA-256 (Node matches nodejs.org's
  `SHASUMS256.txt`; Python matches python.org's MD5 and Steve Dower's GPG signature). Libraries are the
  exact versions the Docker image uses.
* **Launcher in Python:** so the whole start-up flow can be tested on a Mac. Servers share the launcher's
  console window, so closing that window stops them.

## What has and has not been tested

Tested on macOS with the same code and data: the launcher (start, stop, double start, busy port, deleted
or read-only data folder, missing runtime), the whole API against SQLite vs PostgreSQL (identical
answers), writes, the scheduler, Excel exports, the Overview/ZPPI import, and the UI in a browser.

**Not tested: running the Windows programs on Windows.** There was no Windows machine. Before sending
it to a client, extract it on one real Windows 10/11 PC and double-click it once.

## Updating a client who already has it

Replace the `_internal` folder, keep `data/`. If the database *structure* changed, `data/taskalign.db`
needs migrating (the existing alembic migrations are written for PostgreSQL), so ship a fresh database
instead, or write an SQLite-safe migration first.

## Tests

```bash
cd backend
DATABASE_URL=sqlite:// ../portable/cache/venv-minimal/bin/python -m pytest   # what the package runs on
venv/bin/python -m pytest                                                    # the normal PostgreSQL setup
```

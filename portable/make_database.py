#!/usr/bin/env python3
"""Build the SQLite database that ships inside the portable Windows package.

    python make_database.py OUT.db --from-postgres postgresql://user:pw@localhost:5432/taskalign
    python make_database.py OUT.db            # empty database, schema only

Copies every row from PostgreSQL, then re-reads both databases and compares them
value by value (including the JSON columns and timestamps), so a mismatch stops
the build instead of reaching a client.

Run it with a Python that has the backend's requirements *and* psycopg2 (the
backend's normal venv works). The app code is imported from ../backend.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
TABLE_ORDER = ["plans", "machines", "molds", "components", "runs"]  # parents before children


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("out", type=Path, help="SQLite file to create (replaced if it exists)")
    p.add_argument("--from-postgres", metavar="URL", help="copy all data from this PostgreSQL database")
    p.add_argument(
        "--skip-plan", action="append", default=[], metavar="NAME",
        help="leave out the plan with this exact name (and its components and runs); repeatable",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    out = args.out.resolve()
    if out.exists():
        out.unlink()
    out.parent.mkdir(parents=True, exist_ok=True)

    # app.database builds its engine at import time from this variable.
    os.environ["DATABASE_URL"] = f"sqlite:///{out.as_posix()}"
    sys.path.insert(0, str(BACKEND))

    from sqlalchemy import create_engine, insert, select, text

    from app.database import Base, create_db_engine
    from app.models import db_models  # noqa: F401 - registers the tables on Base

    target = create_db_engine(os.environ["DATABASE_URL"])
    Base.metadata.create_all(target)
    tables = {name: Base.metadata.tables[name] for name in TABLE_ORDER}

    skipped_plan_ids: set[str] = set()
    copied: dict[str, int] = {}

    if args.from_postgres:
        source = create_engine(args.from_postgres)
        with source.connect() as src, target.begin() as dst:
            for name in TABLE_ORDER:
                table = tables[name]
                rows = [dict(r) for r in src.execute(select(table)).mappings()]

                if name == "plans":
                    skipped_plan_ids = {r["id"] for r in rows if r["name"] in args.skip_plan}
                    rows = [r for r in rows if r["id"] not in skipped_plan_ids]
                elif "plan_id" in table.c:
                    rows = [r for r in rows if r["plan_id"] not in skipped_plan_ids]

                # One row at a time for runs: each carries the whole schedule as JSON.
                chunk = 1 if name == "runs" else 200
                for i in range(0, len(rows), chunk):
                    dst.execute(insert(table), rows[i:i + chunk])
                copied[name] = len(rows)
                print(f"  copied {name:<11} {len(rows):>6} rows")

        missing = set(args.skip_plan) - {n for n in args.skip_plan if skipped_plan_ids}
        if args.skip_plan and not skipped_plan_ids:
            print(f"  WARNING: no plan named {sorted(missing)} was found to skip", file=sys.stderr)

    # Keep the migration marker so a future update can still run `alembic` against
    # this file. Without it, the database would look like it predates every migration.
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config()
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    head = ScriptDirectory.from_config(cfg).get_current_head()
    with target.begin() as conn:
        conn.execute(text(
            "CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL, "
            "CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))"
        ))
        conn.execute(text("INSERT INTO alembic_version (version_num) VALUES (:v)"), {"v": head})

    failures: list[str] = []
    if args.from_postgres:
        failures += verify(source, target, tables, skipped_plan_ids)

    with target.connect() as conn:
        integrity = conn.execute(text("PRAGMA integrity_check")).scalar()
        broken_fks = conn.execute(text("PRAGMA foreign_key_check")).fetchall()
        if integrity != "ok":
            failures.append(f"integrity_check: {integrity}")
        if broken_fks:
            failures.append(f"foreign_key_check found {len(broken_fks)} broken reference(s)")
        conn.execute(text("VACUUM"))
    target.dispose()

    if failures:
        print("\nDATABASE BUILD FAILED:", file=sys.stderr)
        for f in failures:
            print("  - " + f, file=sys.stderr)
        return 1

    print(f"\nOK: {out} ({out.stat().st_size / 1024 / 1024:.2f} MB), migration marker {head}")
    return 0


def verify(source, target, tables, skipped_plan_ids) -> list[str]:
    """Compare every row of every table between PostgreSQL and the new file."""
    from sqlalchemy import select

    failures: list[str] = []
    with source.connect() as src, target.connect() as dst:
        for name in TABLE_ORDER:
            table = tables[name]
            key = lambda r: r["id"]  # noqa: E731 - every table's primary key is "id"
            want = [dict(r) for r in src.execute(select(table)).mappings()]
            if name == "plans":
                want = [r for r in want if r["id"] not in skipped_plan_ids]
            elif "plan_id" in table.c:
                want = [r for r in want if r["plan_id"] not in skipped_plan_ids]
            got = [dict(r) for r in dst.execute(select(table)).mappings()]

            want.sort(key=key)
            got.sort(key=key)
            if len(want) != len(got):
                failures.append(f"{name}: {len(want)} rows in PostgreSQL, {len(got)} in SQLite")
                continue
            bad = [w["id"] for w, g in zip(want, got) if w != g]
            if bad:
                w = next(x for x in want if x["id"] == bad[0])
                g = next(x for x in got if x["id"] == bad[0])
                column = next((c for c in w if w[c] != g.get(c)), "?")
                failures.append(f"{name}: {len(bad)} row(s) differ (first id {bad[0]}, column {column})")
            else:
                print(f"  verified {name:<10} {len(got):>6} rows identical")
    return failures


if __name__ == "__main__":
    sys.exit(main())

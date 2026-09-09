from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Optional, Sequence

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import db_models
from app.services.overview_import import (
    ImportReport,
    estimate_capacity,
    import_from_client_files,
)


@dataclass
class ImportOutcome:
    molds_created: int = 0
    molds_updated: int = 0
    molds_removed: int = 0
    components_created: int = 0
    components_skipped: int = 0
    components_deleted: int = 0
    dry_run: bool = False
    report: ImportReport = field(default_factory=ImportReport)

    def as_dict(self) -> dict[str, Any]:
        return {
            "dry_run": self.dry_run,
            "molds": {
                "created": self.molds_created,
                "updated": self.molds_updated,
                "removed": self.molds_removed,
            },
            "components": {
                "created": self.components_created,
                "skipped": self.components_skipped,
                "deleted": self.components_deleted,
            },
            **self.report.as_dict(),
        }


# --------------------------------------------------------------------------
# Capacity
# --------------------------------------------------------------------------


def check_capacity(
    db: Session,
    components: list[dict[str, Any]],
    molds: list[dict[str, Any]],
    month_days: int,
    report: ImportReport,
) -> None:
    """Compare required machine-hours against the available fleet.

    The GA does not fail on an over-subscribed plan: it schedules what fits and
    returns the rest in `unmet`. Without this warning that outcome is easy to
    misread as a broken scheduler rather than a machine shortage.
    """
    required = estimate_capacity(components, molds)
    if not required:
        return

    available: dict[str, float] = defaultdict(float)
    machines = db.query(db_models.Machine).all()
    for m in machines:
        if (m.status or "available") != "available":
            continue
        # Mirrors ga_scheduler: usable hours per day are hours_per_day * efficiency.
        available[m.group] += float(m.hours_per_day or 0) * float(m.efficiency or 1.0) * month_days

    for group in sorted(required):
        need = required[group]
        have = available.get(group, 0.0)
        if have <= 0:
            report.warn(
                f"Capacity: group {group!r} needs ~{need:,.0f} machine-hours but no "
                f"available machine is in that group. Nothing in {group!r} can be scheduled."
            )
        elif need > have:
            report.warn(
                f"Capacity: group {group!r} needs ~{need:,.0f} machine-hours but only "
                f"~{have:,.0f} are available over {month_days} days "
                f"({need / have:.1f}x over capacity). Expect a large unmet list."
            )

    report.stats["capacity_hours_available"] = {k: round(v, 1) for k, v in sorted(available.items())}


# --------------------------------------------------------------------------
# Writes
# --------------------------------------------------------------------------


def persist_molds(
    db: Session,
    molds: list[dict[str, Any]],
    outcome: ImportOutcome,
    dry_run: bool,
) -> None:
    """Upsert molds by code.

    Molds are global while components are plan-scoped, so this never deletes a
    mold here -- dropping one while its own soon-to-be-replaced components are
    still on the books would look identical to it still being needed. Removing
    truly-obsolete molds is handled separately, after components are written,
    by remove_obsolete_molds().
    """
    existing = {m.code: m for m in db.query(db_models.Mold).all()}

    for mold in molds:
        current = existing.get(mold["code"])
        if current is None:
            outcome.molds_created += 1
            if not dry_run:
                db.add(
                    db_models.Mold(
                        code=mold["code"],
                        name=mold["name"],
                        group=mold["group"],
                        tonnage=mold["tonnage"],
                        component_id=mold["component_id"],
                    )
                )
        else:
            changed = (
                current.group != mold["group"]
                or current.tonnage != mold["tonnage"]
                or current.name != mold["name"]
            )
            if changed:
                outcome.molds_updated += 1
                if not dry_run:
                    current.name = mold["name"]
                    current.group = mold["group"]
                    current.tonnage = mold["tonnage"]


def remove_obsolete_molds(
    db: Session,
    obsolete_codes: Sequence[str],
    outcome: ImportOutcome,
    dry_run: bool,
    report: Optional[ImportReport] = None,
) -> None:
    """Drop bare mold codes that build_molds() split into per-tonnage variants
    this run (e.g. "11C202AN" -> "11C202AN-90T" + "11C202AN-160T"), but only if
    no component anywhere -- in any plan -- still points at the bare code.

    Must run after persist_components() so a plan's own replaced components
    (deleted earlier in this same import, in "replace" mode) don't count as
    still using it and block the cleanup.
    """
    if not obsolete_codes:
        return
    existing = {
        m.code: m
        for m in db.query(db_models.Mold).filter(db_models.Mold.code.in_(obsolete_codes)).all()
    }
    for code in obsolete_codes:
        current = existing.get(code)
        if current is None:
            continue
        still_used = (
            db.query(func.count(db_models.Component.id))
            .filter(db_models.Component.mold_id == code)
            .scalar()
        )
        if still_used:
            if report is not None:
                report.warn(
                    f"Mold {code}: superseded by its split variants, but {still_used} "
                    f"existing component(s) still reference it, so it was kept."
                )
            continue
        outcome.molds_removed += 1
        if not dry_run:
            db.delete(current)


def persist_components(
    db: Session,
    plan_id: str,
    components: list[dict[str, Any]],
    mode: str,
    outcome: ImportOutcome,
    dry_run: bool,
) -> None:
    """Insert components for a plan.

    mode="replace" clears the plan's existing components first; "append" keeps
    them and skips any component_id already present. Unlike molds, deleting here
    is safe because components belong to exactly one plan.
    """
    if mode == "replace":
        outcome.components_deleted = (
            db.query(db_models.Component)
            .filter(db_models.Component.plan_id == plan_id)
            .count()
        )
        if not dry_run:
            db.query(db_models.Component).filter(
                db_models.Component.plan_id == plan_id
            ).delete(synchronize_session=False)
        seen: set[str] = set()
    else:
        seen = {
            c.component_id
            for c in db.query(db_models.Component.component_id)
            .filter(db_models.Component.plan_id == plan_id)
            .all()
        }

    pending: list[db_models.Component] = []
    for comp in components:
        if comp["component_id"] in seen:
            outcome.components_skipped += 1
            continue
        seen.add(comp["component_id"])
        outcome.components_created += 1
        if dry_run:
            continue
        pending.append(
            db_models.Component(
                plan_id=plan_id,
                component_id=comp["component_id"],
                order_code=comp["order_code"],
                name=comp["name"],
                quantity=comp["quantity"],
                finished=comp["finished"],
                cycle_time_sec=comp["cycle_time_sec"],
                mold_id=comp["mold_id"],
                color=comp["color"],
                start_date=comp["start_date"],
                due_date=comp["due_date"],
                lead_time_days=comp["lead_time_days"],
                dependency_mode=comp["dependency_mode"],
                dependency_transfer_time_minutes=comp["dependency_transfer_time_minutes"],
                prerequisites=comp["prerequisites"],
                status="pending",
            )
        )

    if pending:
        # 700+ rows: one bulk insert rather than that many individual db.add()
        # calls, each of which would otherwise get its own identity-map bookkeeping.
        db.bulk_save_objects(pending)


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------


def _readable_db_error(exc: Exception) -> str:
    """SQLAlchemy wraps driver errors with the full statement and every bound
    parameter appended, which is unreadable for anything but debugging. The
    driver's own message (psycopg2's ``pgerror``, e.g. "ERROR: duplicate key
    ... DETAIL: Key (code)=(X) already exists.") is the human-readable part;
    strip the "[SQL: ...] [parameters: ...]" tail SQLAlchemy adds on top.
    """
    orig = getattr(exc, "orig", None)
    text = str(getattr(orig, "pgerror", None) or orig or exc).strip()
    return " ".join(text.splitlines())


def run_client_import(
    db: Session,
    plan_id: str,
    overview_bytes: bytes,
    zppi_bytes: bytes,
    mode: str = "append",
    skip_completed: bool = False,
    dry_run: bool = False,
    month_days: Optional[int] = None,
) -> ImportOutcome:
    """Parse both workbooks and write the result for one plan.

    dry_run parses, validates and counts without touching the database, which is
    what the import dialog calls to render its preview.
    """
    if mode not in ("append", "replace"):
        raise ValueError(f"mode must be 'append' or 'replace', got {mode!r}")

    machine_specs = {m.code: (m.group, m.tonnage) for m in db.query(db_models.Machine).all()}
    molds, components, report = import_from_client_files(
        overview_bytes, zppi_bytes, skip_completed=skip_completed, machine_specs=machine_specs
    )
    outcome = ImportOutcome(dry_run=dry_run, report=report)
    if not report.ok:
        return outcome

    plan = db.query(db_models.Plan).filter(db_models.Plan.id == plan_id).first()
    if plan is None:
        report.error(f"Plan {plan_id} not found.")
        return outcome

    window = month_days or plan.month_days or 30
    _warn_if_dates_exceed_window(components, plan, window, report)
    check_capacity(db, components, molds, window, report)

    try:
        persist_molds(db, molds, outcome, dry_run)
        persist_components(db, plan_id, components, mode, outcome, dry_run)
        obsolete_codes = report.stats.get("obsoleted_mold_codes", [])
        remove_obsolete_molds(db, obsolete_codes, outcome, dry_run, report=report)
        if dry_run:
            db.rollback()
        else:
            db.commit()
    except Exception as exc:  # noqa: BLE001 - a partial import is worse than none
        db.rollback()
        report.error(f"Import failed and was rolled back: {_readable_db_error(exc)}")

    return outcome


def _warn_if_dates_exceed_window(
    components: list[dict[str, Any]],
    plan,
    month_days: int,
    report: ImportReport,
) -> None:
    """The GA only schedules days 1..month_days from the plan's current_date;
    anything due beyond that silently lands in `unmet`."""
    from datetime import date, timedelta

    dues = [c["due_date"] for c in components if c["due_date"]]
    starts = [c["start_date"] for c in components if c["start_date"]]
    if not dues or not starts:
        return

    first, last = min(starts), max(dues)
    report.stats["date_range"] = {"first_start": first, "last_due": last}

    try:
        anchor = date.fromisoformat(plan.current_date)
    except (TypeError, ValueError):
        return

    horizon = anchor + timedelta(days=month_days - 1)
    late = sum(1 for d in dues if date.fromisoformat(d) > horizon)
    if late:
        report.warn(
            f"{late} order(s) are due after the plan horizon "
            f"({anchor.isoformat()} + {month_days} days = {horizon.isoformat()}). "
            f"They will be imported but cannot be scheduled; the data runs to {last}."
        )
    if date.fromisoformat(first) < anchor:
        report.warn(
            f"The earliest order starts {first}, before the plan's current_date "
            f"({anchor.isoformat()}). Consider moving the plan start back."
        )
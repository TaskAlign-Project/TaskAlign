import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import db_models
from app.services.client_import import (
    ImportOutcome,
    _readable_db_error,
    check_capacity,
    persist_components,
    persist_molds,
    remove_obsolete_molds,
)
from app.services.overview_import import ImportReport


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


@pytest.fixture
def plan(db):
    p = db_models.Plan(id="plan-1", name="Nov", current_date="2025-11-01",
                       start_time="04:00", month_days=30)
    db.add(p)
    db.commit()
    return p


def _mold(code="11A206AN", group="small", tonnage=120):
    return {"code": code, "name": code, "group": group,
            "tonnage": tonnage, "component_id": None}


def _component(cid="300000006233-209000089627", mold="3K201AN", qty=100, finished=0):
    return {
        "component_id": cid, "order_code": cid.split("-")[-1], "name": "PART",
        "quantity": qty, "finished": finished, "cycle_time_sec": 30.0,
        "mold_id": mold, "color": "BLACK", "start_date": "2025-11-01",
        "due_date": "2025-11-04", "lead_time_days": 2, "prerequisites": [],
        "dependency_mode": "wait_all", "dependency_transfer_time_minutes": 0,
    }


# --- molds -----------------------------------------------------------------

def test_new_molds_are_inserted(db):
    outcome = ImportOutcome()
    persist_molds(db, [_mold("A"), _mold("B")], outcome, dry_run=False)
    db.commit()
    assert outcome.molds_created == 2
    assert db.query(db_models.Mold).count() == 2


def test_reimport_does_not_duplicate_molds(db):
    persist_molds(db, [_mold("A")], ImportOutcome(), dry_run=False)
    db.commit()
    second = ImportOutcome()
    persist_molds(db, [_mold("A")], second, dry_run=False)
    db.commit()
    assert second.molds_created == 0
    assert db.query(db_models.Mold).count() == 1


def test_existing_mold_has_group_and_tonnage_refreshed(db):
    persist_molds(db, [_mold("A", group="small", tonnage=120)], ImportOutcome(), dry_run=False)
    db.commit()
    outcome = ImportOutcome()
    persist_molds(db, [_mold("A", group="medium", tonnage=250)], outcome, dry_run=False)
    db.commit()
    stored = db.query(db_models.Mold).one()
    assert outcome.molds_updated == 1
    assert (stored.group, stored.tonnage) == ("medium", 250)


def test_molds_are_never_deleted(db):
    """Molds are global; dropping one would break components in other plans."""
    persist_molds(db, [_mold("OLD")], ImportOutcome(), dry_run=False)
    db.commit()
    persist_molds(db, [_mold("NEW")], ImportOutcome(), dry_run=False)
    db.commit()
    assert {m.code for m in db.query(db_models.Mold).all()} == {"OLD", "NEW"}


def test_manual_component_id_on_a_mold_survives_reimport(db):
    persist_molds(db, [_mold("A")], ImportOutcome(), dry_run=False)
    db.commit()
    db.query(db_models.Mold).one().component_id = "hand-set"
    db.commit()
    persist_molds(db, [_mold("A", tonnage=999)], ImportOutcome(), dry_run=False)
    db.commit()
    assert db.query(db_models.Mold).one().component_id == "hand-set"


# --- obsolete mold cleanup ---------------------------------------------------

def test_obsolete_mold_is_removed_when_unreferenced(db):
    """A bare code split into "-90T"/"-160T" variants should not linger once
    nothing points at it any more."""
    persist_molds(db, [_mold("11C202AN")], ImportOutcome(), dry_run=False)
    db.commit()
    outcome = ImportOutcome()
    remove_obsolete_molds(db, ["11C202AN"], outcome, dry_run=False)
    db.commit()
    assert outcome.molds_removed == 1
    assert db.query(db_models.Mold).filter_by(code="11C202AN").first() is None


def test_obsolete_mold_is_kept_if_a_component_still_references_it(db, plan):
    """An older plan (or the same plan, if remove_obsolete_molds ran before its
    components were replaced) can still point at the bare code -- deleting it
    would make that component unschedulable, so it's kept and reported."""
    persist_molds(db, [_mold("11C202AN")], ImportOutcome(), dry_run=False)
    db.add(db_models.Component(plan_id=plan.id, **_component(mold="11C202AN")))
    db.commit()

    outcome = ImportOutcome()
    report = ImportReport()
    remove_obsolete_molds(db, ["11C202AN"], outcome, dry_run=False, report=report)
    db.commit()

    assert outcome.molds_removed == 0
    assert db.query(db_models.Mold).filter_by(code="11C202AN").first() is not None
    assert any("still reference it" in w for w in report.warnings)


def test_dry_run_reports_removal_without_deleting(db):
    persist_molds(db, [_mold("11C202AN")], ImportOutcome(), dry_run=False)
    db.commit()
    outcome = ImportOutcome()
    remove_obsolete_molds(db, ["11C202AN"], outcome, dry_run=True)
    db.commit()
    assert outcome.molds_removed == 1
    assert db.query(db_models.Mold).filter_by(code="11C202AN").first() is not None


def test_remove_obsolete_molds_is_a_noop_for_unknown_codes(db):
    outcome = ImportOutcome()
    remove_obsolete_molds(db, ["NEVER-EXISTED"], outcome, dry_run=False)
    db.commit()
    assert outcome.molds_removed == 0


# --- components ------------------------------------------------------------

def test_components_are_inserted_for_the_plan(db, plan):
    outcome = ImportOutcome()
    persist_components(db, "plan-1", [_component("X"), _component("Y")], "append", outcome, False)
    db.commit()
    assert outcome.components_created == 2
    assert db.query(db_models.Component).count() == 2


def test_append_skips_component_ids_already_in_the_plan(db, plan):
    persist_components(db, "plan-1", [_component("X")], "append", ImportOutcome(), False)
    db.commit()
    outcome = ImportOutcome()
    persist_components(db, "plan-1", [_component("X"), _component("Y")], "append", outcome, False)
    db.commit()
    assert (outcome.components_created, outcome.components_skipped) == (1, 1)
    assert db.query(db_models.Component).count() == 2


def test_replace_clears_the_plan_first(db, plan):
    persist_components(db, "plan-1", [_component("OLD")], "append", ImportOutcome(), False)
    db.commit()
    outcome = ImportOutcome()
    persist_components(db, "plan-1", [_component("NEW")], "replace", outcome, False)
    db.commit()
    assert outcome.components_deleted == 1
    assert [c.component_id for c in db.query(db_models.Component).all()] == ["NEW"]


def test_replace_leaves_other_plans_untouched(db, plan):
    db.add(db_models.Plan(id="plan-2", name="Dec", current_date="2025-12-01", start_time="04:00"))
    db.commit()
    persist_components(db, "plan-2", [_component("KEEP")], "append", ImportOutcome(), False)
    db.commit()
    persist_components(db, "plan-1", [_component("NEW")], "replace", ImportOutcome(), False)
    db.commit()
    others = db.query(db_models.Component).filter_by(plan_id="plan-2").all()
    assert [c.component_id for c in others] == ["KEEP"]


def test_duplicate_ids_within_one_batch_are_skipped(db, plan):
    outcome = ImportOutcome()
    persist_components(db, "plan-1", [_component("X"), _component("X")], "append", outcome, False)
    db.commit()
    assert (outcome.components_created, outcome.components_skipped) == (1, 1)


def test_component_fields_round_trip(db, plan):
    persist_components(db, "plan-1", [_component()], "append", ImportOutcome(), False)
    db.commit()
    stored = db.query(db_models.Component).one()
    assert stored.order_code == "209000089627"
    assert stored.mold_id == "3K201AN"
    assert stored.prerequisites == []
    assert stored.status == "pending"


# --- dry run ---------------------------------------------------------------

def test_dry_run_counts_without_writing(db, plan):
    outcome = ImportOutcome(dry_run=True)
    persist_molds(db, [_mold("A")], outcome, dry_run=True)
    persist_components(db, "plan-1", [_component("X")], "append", outcome, dry_run=True)
    db.rollback()
    assert (outcome.molds_created, outcome.components_created) == (1, 1)
    assert db.query(db_models.Mold).count() == 0
    assert db.query(db_models.Component).count() == 0


def test_dry_run_replace_reports_deletions_without_deleting(db, plan):
    persist_components(db, "plan-1", [_component("OLD")], "append", ImportOutcome(), False)
    db.commit()
    outcome = ImportOutcome(dry_run=True)
    persist_components(db, "plan-1", [_component("NEW")], "replace", outcome, dry_run=True)
    db.rollback()
    assert outcome.components_deleted == 1
    assert db.query(db_models.Component).count() == 1


# --- capacity --------------------------------------------------------------

def _machine(code, group, hours=21.0, eff=1.0, status="available"):
    return db_models.Machine(code=code, name=code, group=group, tonnage=500,
                             hours_per_day=hours, efficiency=eff, status=status)


def test_missing_machine_group_is_flagged(db):
    db.add(_machine("S1", "small"))
    db.commit()
    report = ImportReport()
    check_capacity(db, [_component(qty=10_000)], [_mold("3K201AN", group="large")], 30, report)
    assert any("no available machine is in that group" in w for w in report.warnings)


def test_over_capacity_is_flagged(db):
    db.add(_machine("S1", "small", hours=1.0))
    db.commit()
    report = ImportReport()
    check_capacity(db, [_component(qty=100_000)], [_mold("3K201AN", group="small")], 30, report)
    assert any("over capacity" in w for w in report.warnings)


def test_sufficient_capacity_is_silent(db):
    for i in range(10):
        db.add(_machine(f"S{i}", "small"))
    db.commit()
    report = ImportReport()
    check_capacity(db, [_component(qty=100)], [_mold("3K201AN", group="small")], 30, report)
    assert not [w for w in report.warnings if "Capacity" in w]


def test_unavailable_machines_do_not_count_toward_capacity(db):
    db.add(_machine("S1", "small", status="unavailable"))
    db.commit()
    report = ImportReport()
    check_capacity(db, [_component(qty=10_000)], [_mold("3K201AN", group="small")], 30, report)
    assert any("no available machine" in w for w in report.warnings)


# --- readable db errors ------------------------------------------------------

class _FakeOrig:
    def __init__(self, pgerror):
        self.pgerror = pgerror


class _FakeIntegrityError(Exception):
    def __init__(self, orig):
        self.orig = orig


def test_readable_db_error_strips_the_sql_and_parameter_dump():
    """SQLAlchemy appends the full statement and every bound parameter to the
    exception text; only psycopg2's own ERROR/DETAIL lines are useful to a
    user deciding what to fix."""
    orig = _FakeOrig(
        "ERROR:  duplicate key value violates unique constraint \"molds_code_key\"\n"
        "DETAIL:  Key (code)=(2T201AN-350T) already exists.\n"
    )
    exc = _FakeIntegrityError(orig)
    message = _readable_db_error(exc)
    assert "duplicate key value violates unique constraint" in message
    assert "Key (code)=(2T201AN-350T) already exists" in message
    assert "[SQL:" not in message
    assert "[parameters:" not in message


def test_readable_db_error_falls_back_for_non_db_exceptions():
    assert _readable_db_error(ValueError("plain failure")) == "plain failure"
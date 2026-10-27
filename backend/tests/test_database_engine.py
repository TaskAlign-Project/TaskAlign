import threading
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app import database
from app.database import Base, create_db_engine
from app.models import db_models


@pytest.fixture
def engine(tmp_path):
    """A real on-disk SQLite file, the way the portable build uses it."""
    engine = create_db_engine(f"sqlite:///{tmp_path / 'test.db'}")
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def db(engine):
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


def _plan(**over):
    return db_models.Plan(id="p1", name="Nov", current_date="2025-11-01", start_time="04:00", **over)


# --- engine configuration ------------------------------------------------------

def test_sqlite_enforces_foreign_keys_like_postgres_does(db):
    """PostgreSQL rejects a component for a plan that does not exist; SQLite only
    does so if foreign keys are switched on for the connection."""
    db.add(db_models.Component(plan_id="no-such-plan", component_id="C1"))
    with pytest.raises(IntegrityError):
        db.commit()


def test_sqlite_connection_can_be_used_from_another_thread(engine):
    """FastAPI serves requests from a thread pool."""
    errors = []

    def query():
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
        except Exception as exc:  # noqa: BLE001 - reported below
            errors.append(exc)

    worker = threading.Thread(target=query)
    worker.start()
    worker.join()

    assert errors == []


def test_non_sqlite_urls_get_no_special_arguments(monkeypatch):
    """The Docker/PostgreSQL path must stay exactly as it was."""
    calls = []
    monkeypatch.setattr(database, "create_engine", lambda *a, **kw: calls.append((a, kw)) or object())

    database.create_db_engine("postgresql://u:p@localhost/db")

    assert calls == [(("postgresql://u:p@localhost/db",), {})]


# --- timestamps ----------------------------------------------------------------

def test_default_timestamps_come_back_utc_aware(db):
    db.add(_plan())
    db.add(db_models.Run(id="r1", plan_id="p1"))
    db.commit()
    db.expire_all()

    run = db.get(db_models.Run, "r1")

    assert run.run_at.tzinfo is not None
    assert run.run_at.utcoffset() == timedelta(0)
    assert abs(datetime.now(timezone.utc) - run.run_at) < timedelta(minutes=1)


def test_a_timestamp_with_an_offset_is_stored_as_the_same_instant(db):
    local = datetime(2025, 11, 1, 12, 0, tzinfo=timezone(timedelta(hours=7)))   # 05:00 UTC
    db.add(_plan())
    db.add(db_models.Run(id="r1", plan_id="p1", run_at=local))
    db.commit()
    db.expire_all()

    stored = db.get(db_models.Run, "r1").run_at

    assert stored == local
    assert stored.utcoffset() == timedelta(0)


def test_api_output_for_a_sqlite_timestamp_ends_with_a_utc_marker(db):
    """Without one, a browser reads the time as local and shifts it."""
    db.add(_plan())
    db.add(db_models.Run(id="r1", plan_id="p1"))
    db.commit()
    db.expire_all()

    from app import schemas

    run = schemas.Run.model_validate(db.get(db_models.Run, "r1"))

    assert run.model_dump_json().count("+00:00") + run.model_dump_json().count("Z") >= 1


# --- data round trips ----------------------------------------------------------

def test_json_columns_round_trip_nested_data(db):
    assignments = [
        {"day": 1, "date": "2025-11-01", "machine_id": "M01", "produced_qty": 300, "tags": ["a", "b"]},
        {"day": 2, "date": "2025-11-02", "machine_id": "M02", "produced_qty": None},
    ]
    db.add(_plan())
    db.add(db_models.Run(id="r1", plan_id="p1", assignments=assignments, unmet={"C1": 5}))
    db.commit()
    db.expire_all()

    run = db.get(db_models.Run, "r1")

    assert run.assignments == assignments
    assert run.unmet == {"C1": 5}


def test_deleting_a_plan_removes_its_components_and_runs(db):
    db.add(_plan())
    db.add(db_models.Component(plan_id="p1", component_id="C1"))
    db.add(db_models.Run(id="r1", plan_id="p1"))
    db.commit()

    db.delete(db.get(db_models.Plan, "p1"))
    db.commit()

    assert db.query(db_models.Component).count() == 0
    assert db.query(db_models.Run).count() == 0

import random
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import schemas
from app.api_v1 import run_plan, update_component
from app.database import Base
from app.models import db_models


class RerunCompletedComponentTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.session = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.session.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_updated_completed_component_is_excluded_from_rerun(self):
        plan = db_models.Plan(
            name="Completed component rerun",
            current_date="2026-04-01",
            start_time="08:00:00",
            month_days=2,
            mold_change_time_minutes=0,
            color_change_time_minutes=0,
            pop_size=2,
            n_generations=1,
            mutation_rate=0,
        )
        machine = db_models.Machine(
            code="M1",
            name="Machine 1",
            group="small",
            tonnage=120,
            hours_per_day=8,
            efficiency=1,
            status="available",
        )
        mold = db_models.Mold(
            code="MO1",
            name="Mold Small A",
            group="small",
            tonnage=100,
        )
        self.session.add_all([plan, machine, mold])
        self.session.flush()

        component = db_models.Component(
            plan_id=plan.id,
            component_id="C1",
            name="Base Part",
            quantity=10,
            finished=0,
            cycle_time_sec=1,
            mold_id="Mold Small A",
            color="black",
            start_date="2026-04-01",
            due_date="2026-04-02",
            lead_time_days=0,
            dependency_mode="wait_all",
            dependency_transfer_time_minutes=0,
            prerequisites=[],
        )
        self.session.add(component)
        self.session.commit()

        random.seed(1)
        first_run = run_plan(plan.id, self.session)
        first_production = [
            task
            for task in first_run.assignments
            if task["task_type"] == "PRODUCE"
            and task.get("component_id") == "C1"
        ]
        self.assertEqual(sum(task["produced_qty"] for task in first_production), 10)

        update_component(
            component.id,
            schemas.ComponentCreate(
                component_id="C1",
                name="Base Part",
                quantity=10,
                finished=10,
                cycle_time_sec=1,
                mold_id="Mold Small A",
                color="black",
                start_date="2026-04-01",
                due_date="2026-04-02",
                lead_time_days=0,
                dependency_mode="wait_all",
                dependency_transfer_time_minutes=0,
                prerequisites=[],
            ),
            self.session,
        )

        random.seed(1)
        second_run = run_plan(plan.id, self.session)
        second_production = [
            task
            for task in second_run.assignments
            if task["task_type"] == "PRODUCE"
            and task.get("component_id") == "C1"
        ]

        self.assertEqual(second_production, [])
        self.assertNotIn("C1", second_run.unmet or {})
        self.assertEqual(
            self.session.query(db_models.Run)
            .filter(db_models.Run.plan_id == plan.id)
            .count(),
            2,
        )


if __name__ == "__main__":
    unittest.main()

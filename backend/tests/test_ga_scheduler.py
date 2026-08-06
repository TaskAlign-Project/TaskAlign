import unittest
from datetime import date, time

from app.models.models import Machine, Mold, ProductComponent
from app.services.ga_scheduler import _decode_v2


class CompletedPrerequisiteTests(unittest.TestCase):
    def test_completed_prerequisite_unlocks_dependent_production(self):
        planning_date = date(2026, 1, 1)
        components = [
            ProductComponent(
                id="C1",
                name="Completed prerequisite",
                quantity=100,
                finished=100,
                cycle_time_sec=1,
                mold_id="M1",
                color="white",
                due_date=planning_date,
            ),
            ProductComponent(
                id="C2",
                name="Dependent component",
                quantity=10,
                finished=0,
                cycle_time_sec=1,
                mold_id="M2",
                color="white",
                due_date=planning_date,
                prerequisites=["C1"],
                dependency_mode="wait_all",
            ),
        ]
        machines = [
            Machine(
                id="MC1",
                name="Machine 1",
                group="small",
                tonnage=100,
                hours_per_day=8,
                efficiency=1,
            )
        ]
        molds = [
            Mold(id="M1", name="Mold 1", group="small", tonnage=50),
            Mold(id="M2", name="Mold 2", group="small", tonnage=50),
        ]

        tasks, unmet, _, _ = _decode_v2(
            genome=["C1", "C2"],
            components=components,
            machines=machines,
            molds=molds,
            month_days=1,
            mold_change_time_minutes=0,
            color_change_time_minutes=0,
            current_date=planning_date,
            shift_start_time=time(8),
        )

        produced = {
            task["component_id"]: task["produced_qty"]
            for task in tasks
            if task["task_type"] == "PRODUCE"
        }
        self.assertEqual(produced, {"C2": 10})
        self.assertEqual(unmet, {})


if __name__ == "__main__":
    unittest.main()

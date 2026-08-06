import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import schemas
from app.api_v1 import update_mold
from app.database import Base
from app.models import db_models
from app.services.mold_names import (
    build_mold_aliases,
    mold_identifier,
    normalize_mold_payload,
)


class MoldNameTests(unittest.TestCase):
    def test_uses_mold_name_as_identifier(self):
        result = normalize_mold_payload(
            {"code": "M02", "name": "Mold Small A", "group": "small"}
        )

        self.assertEqual(result["code"], "M02")
        self.assertEqual(result["name"], "Mold Small A")
        self.assertEqual(mold_identifier(result), "Mold Small A")

    def test_trims_name_before_using_it_as_identifier(self):
        result = normalize_mold_payload(
            {"code": "  M05  ", "name": "  Mold Medium A  "}
        )

        self.assertEqual(result["code"], "M05")
        self.assertEqual(result["name"], "Mold Medium A")

    def test_rejects_an_empty_name(self):
        with self.assertRaisesRegex(ValueError, "Mold name is required"):
            normalize_mold_payload({"code": "M02", "name": "   "})

    def test_legacy_code_resolves_to_the_mold_name(self):
        mold = db_models.Mold(code="M02", name="Mold Small A")

        aliases = build_mold_aliases([mold])

        self.assertEqual(aliases["M02"], "Mold Small A")
        self.assertEqual(aliases["Mold Small A"], "Mold Small A")

    def test_renaming_mold_updates_component_reference(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        session = sessionmaker(bind=engine)()
        try:
            plan = db_models.Plan(
                name="Test Plan",
                current_date="2026-04-01",
                start_time="08:00:00",
            )
            session.add(plan)
            session.flush()

            mold = db_models.Mold(
                code="M02",
                name="Legacy Name",
                group="small",
                tonnage=100,
            )
            component = db_models.Component(
                plan_id=plan.id,
                component_id="C1",
                name="Part",
                quantity=10,
                finished=0,
                cycle_time_sec=30,
                mold_id="M02",
                color="black",
            )
            session.add_all([mold, component])
            session.commit()

            update_mold(
                mold.id,
                schemas.MoldCreate(
                    code="M02",
                    name="Mold Small A",
                    group="small",
                    tonnage=100,
                ),
                session,
            )

            session.refresh(mold)
            session.refresh(component)
            self.assertEqual(mold.code, "M02")
            self.assertEqual(mold.name, "Mold Small A")
            self.assertEqual(component.mold_id, "Mold Small A")
        finally:
            session.close()
            Base.metadata.drop_all(engine)
            engine.dispose()


if __name__ == "__main__":
    unittest.main()

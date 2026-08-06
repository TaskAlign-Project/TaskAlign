"""use mold name as identifier

Revision ID: 4c92d8f33a10
Revises: ffed9e9e75f7
"""

from typing import Sequence, Union

from alembic import op


revision: str = "4c92d8f33a10"
down_revision: Union[str, None] = "ffed9e9e75f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Keep component references valid when the public identifier changes from
    # the source code (M02) to the human name (Maysa).
    op.execute(
        """
        UPDATE components
        SET mold_id = molds.name
        FROM molds
        WHERE components.mold_id = molds.code
          AND molds.name IS NOT NULL
          AND TRIM(molds.name) <> ''
        """
    )
    op.execute("UPDATE molds SET name = TRIM(name) WHERE name IS NOT NULL")


def downgrade() -> None:
    # Component references cannot be mapped back safely when names are shared.
    pass

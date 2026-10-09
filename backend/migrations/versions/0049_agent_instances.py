"""Persistent agent bindings for Spaces (DEC-049, T215).

One binding per Space, filed under the definition for the Space's own type, and a run link that can only name the agent
of the run's own Space. Existing Spaces receive the identifier their agent already uses in chat (DEC-046); existing runs
are linked to it. Nothing here grants a permission or changes what the agent may do.
"""

from uuid import UUID, uuid5

import sqlalchemy as sa
from alembic import op

revision = "0049"
down_revision = "0048"
branch_labels = None
depends_on = None

# The namespace of the Space agent's chat identity (DEC-046), written out so this migration stays what it was.
NAMESPACE = UUID("2f8e4c1a-6b3d-4f5e-9a7c-1d2e3f4a5b6c")


def upgrade():
    op.create_unique_constraint("uq_space_id_type", "spaces", ["id", "space_type"])
    op.create_table(
        "agent_instances",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("space_id", sa.String(36), nullable=False),
        sa.Column("definition_key", sa.String(16), nullable=False),
        sa.Column("definition_version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("space_id", name="uq_agent_instance_space"),
        sa.UniqueConstraint("space_id", "id", name="uq_agent_instance_space_id"),
        sa.ForeignKeyConstraint(["space_id", "definition_key"], ["spaces.id", "spaces.space_type"], name="fk_agent_instance_space_type"),
        sa.CheckConstraint("definition_key IN ('family', 'couple', 'solo', 'group')", name="ck_agent_instance_definition"),
        sa.CheckConstraint("definition_version > 0", name="ck_agent_instance_version"),
    )
    connection = op.get_bind()
    spaces = connection.execute(sa.text("SELECT id, space_type, created_at FROM spaces")).all()
    if spaces:
        connection.execute(
            sa.text(
                "INSERT INTO agent_instances (id, space_id, definition_key, definition_version, created_at) "
                "VALUES (:id, :space_id, :definition_key, 1, :created_at)"
            ),
            [
                {
                    "id": str(uuid5(NAMESPACE, f"space-agent:{space.id}")), "space_id": space.id,
                    "definition_key": space.space_type, "created_at": space.created_at,
                }
                for space in spaces
            ],
        )
    op.add_column("agent_runs", sa.Column("agent_instance_id", sa.String(36), nullable=True))
    op.execute(
        "UPDATE agent_runs SET agent_instance_id = agent_instances.id "
        "FROM agent_instances WHERE agent_instances.space_id = agent_runs.space_id"
    )
    op.create_foreign_key(
        "fk_agent_run_instance", "agent_runs", "agent_instances", ["space_id", "agent_instance_id"], ["space_id", "id"],
    )


def downgrade():
    op.drop_constraint("fk_agent_run_instance", "agent_runs", type_="foreignkey")
    op.drop_column("agent_runs", "agent_instance_id")
    op.drop_table("agent_instances")
    op.drop_constraint("uq_space_id_type", "spaces", type_="unique")

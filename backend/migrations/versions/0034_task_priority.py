"""Task priority: high, normal or low, with normal for existing tasks (DEC-029)."""

from alembic import op
import sqlalchemy as sa

revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("tasks", sa.Column("priority", sa.String(8), nullable=False, server_default=sa.text("'normal'")))
    op.create_check_constraint("ck_task_priority", "tasks", "priority IN ('high', 'normal', 'low')")


def downgrade():
    connection = op.get_bind()
    chosen = connection.scalar(sa.text("SELECT count(*) FROM tasks WHERE priority <> 'normal'"))
    if chosen:
        raise RuntimeError("Downgrading below 0034 would lose the priority people chose for their tasks.")
    op.drop_constraint("ck_task_priority", "tasks", type_="check")
    op.drop_column("tasks", "priority")

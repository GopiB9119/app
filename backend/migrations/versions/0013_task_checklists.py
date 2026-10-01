from alembic import op
import sqlalchemy as sa

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint("ck_task_command_operation", "task_commands", type_="check")
    op.create_check_constraint("ck_task_command_operation", "task_commands", "operation IN ('edit', 'status', 'checklist')")
    op.create_table("task_checklist_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("task_id", sa.String(36), sa.ForeignKey("tasks.id"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("checked", sa.Boolean(), nullable=False),
        sa.Column("checked_at", sa.DateTime(timezone=True)),
        sa.Column("checked_by_id", sa.String(36), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("removed_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("length(btrim(title)) BETWEEN 1 AND 200", name="ck_checklist_title"),
        sa.CheckConstraint("(checked AND checked_at IS NOT NULL AND checked_by_id IS NOT NULL) OR (NOT checked AND checked_at IS NULL AND checked_by_id IS NULL)", name="ck_checklist_completion"),
    )
    op.create_index("ix_checklist_task", "task_checklist_items", ["task_id", "removed_at", "created_at", "id"])


def downgrade():
    op.drop_constraint("ck_task_command_operation", "task_commands", type_="check")
    op.create_check_constraint("ck_task_command_operation", "task_commands", "operation IN ('edit', 'status')")
    op.drop_table("task_checklist_items")
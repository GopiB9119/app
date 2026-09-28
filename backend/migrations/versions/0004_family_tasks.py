"""Add private, admission-scoped family tasks and durable mutation receipts."""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "tasks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("space_id", sa.String(36), sa.ForeignKey("spaces.id"), nullable=False),
        sa.Column("created_by_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("creator_admission_id", sa.String(36), nullable=False),
        sa.Column("creation_key", sa.String(36), nullable=False),
        sa.Column("creation_digest", sa.String(64), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("due_date", sa.Date()),
        sa.Column("assignee_account_id", sa.String(36)),
        sa.Column("assignee_admission_id", sa.String(36)),
        sa.Column("completed_by_account_id", sa.String(36), sa.ForeignKey("users.id")),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("id", "space_id", name="uq_task_scope"),
        sa.UniqueConstraint("space_id", "created_by_id", "creation_key", name="uq_task_creation"),
        sa.ForeignKeyConstraint(
            ["space_id", "assignee_account_id"], ["space_memberships.space_id", "space_memberships.account_id"],
            name="fk_task_assignee_scope",
        ),
        sa.CheckConstraint("length(btrim(title)) BETWEEN 1 AND 200", name="ck_task_title"),
        sa.CheckConstraint("length(description) <= 5000", name="ck_task_description"),
        sa.CheckConstraint("status IN ('open', 'in_progress', 'completed', 'cancelled')", name="ck_task_status"),
        sa.CheckConstraint("version > 0", name="ck_task_version"),
        sa.CheckConstraint(
            "(assignee_account_id IS NULL AND assignee_admission_id IS NULL) OR "
            "(assignee_account_id IS NOT NULL AND assignee_admission_id IS NOT NULL)",
            name="ck_task_assignee_binding",
        ),
        sa.CheckConstraint(
            "(status = 'completed' AND completed_at IS NOT NULL AND completed_by_account_id IS NOT NULL) OR "
            "(status <> 'completed' AND completed_at IS NULL AND completed_by_account_id IS NULL)",
            name="ck_task_completion",
        ),
    )
    op.create_index("ix_tasks_space_status", "tasks", ["space_id", "status", "id"])
    op.create_table(
        "task_access",
        sa.Column("task_id", sa.String(36), primary_key=True),
        sa.Column("space_id", sa.String(36), nullable=False),
        sa.Column("account_id", sa.String(36), primary_key=True),
        sa.Column("admission_id", sa.String(36), primary_key=True),
        sa.ForeignKeyConstraint(["task_id", "space_id"], ["tasks.id", "tasks.space_id"], name="fk_task_access_scope"),
        sa.ForeignKeyConstraint(
            ["space_id", "account_id"], ["space_memberships.space_id", "space_memberships.account_id"],
            name="fk_task_access_membership",
        ),
    )
    op.create_index("ix_task_access_admission", "task_access", ["space_id", "account_id", "admission_id", "task_id"])
    op.create_table(
        "task_audit_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("task_id", sa.String(36), sa.ForeignKey("tasks.id"), nullable=False),
        sa.Column("actor_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("actor_admission_id", sa.String(36), nullable=False),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("task_version", sa.Integer(), nullable=False),
        sa.Column("status_before", sa.String(16)),
        sa.Column("status_after", sa.String(16), nullable=False),
        sa.Column("changed_fields", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_task_audit_events_task_id", "task_audit_events", ["task_id"])
    op.create_table(
        "task_commands",
        sa.Column("task_id", sa.String(36), sa.ForeignKey("tasks.id"), primary_key=True),
        sa.Column("actor_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("operation", sa.String(16), primary_key=True),
        sa.Column("request_key", sa.String(36), primary_key=True),
        sa.Column("actor_admission_id", sa.String(36), nullable=False),
        sa.Column("input_digest", sa.String(64), nullable=False),
        sa.Column("audit_id", sa.String(36), sa.ForeignKey("task_audit_events.id"), nullable=False),
        sa.CheckConstraint("operation IN ('edit', 'status')", name="ck_task_command_operation"),
    )


def downgrade():
    op.drop_table("task_commands")
    op.drop_table("task_audit_events")
    op.drop_table("task_access")
    op.drop_table("tasks")
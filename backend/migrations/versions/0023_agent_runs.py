"""Agent first release (DEC-012): requests, their events and tool calls, exact approvals, and personal memories."""

from alembic import op
import sqlalchemy as sa

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None

RUN_STATUSES = "'queued', 'running', 'waiting_for_approval', 'waiting_for_user', 'verifying', 'completed', 'failed', 'cancelled', 'timed_out', 'expired'"
TERMINAL_STATUSES = "'completed', 'failed', 'cancelled', 'timed_out', 'expired'"
APPROVAL_STATUSES = "'pending', 'approved', 'rejected', 'expired', 'cancelled', 'superseded'"


def moment(name, nullable=False):
    return sa.Column(name, sa.DateTime(timezone=True), nullable=nullable)


def upgrade():
    op.create_table(
        "agent_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("space_id", sa.String(36), sa.ForeignKey("spaces.id"), nullable=False),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("admission_id", sa.String(36), nullable=False),
        sa.Column("session_id", sa.String(36), sa.ForeignKey("account_sessions.id"), nullable=False),
        sa.Column("request_key", sa.String(36), nullable=False),
        sa.Column("request_digest", sa.String(64), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("stop_reason", sa.String(40), nullable=True),
        sa.Column("intent", sa.String(32), nullable=True),
        sa.Column("outcome", sa.String(24), nullable=True),
        sa.Column("plan", sa.JSON(), nullable=False),
        sa.Column("state", sa.JSON(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("question_id", sa.String(36), nullable=True),
        sa.Column("question", sa.Text(), nullable=True),
        moment("question_expires_at", nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("lease_owner", sa.String(36), nullable=True),
        moment("lease_expires_at", nullable=True),
        moment("available_at"),
        sa.Column("steps_used", sa.Integer(), nullable=False),
        sa.Column("tool_calls_used", sa.Integer(), nullable=False),
        sa.Column("event_sequence", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        moment("created_at"),
        moment("updated_at"),
        moment("deadline_at"),
        moment("finished_at", nullable=True),
        sa.UniqueConstraint("account_id", "request_key", name="uq_agent_run_request"),
        sa.CheckConstraint(f"status IN ({RUN_STATUSES})", name="ck_agent_run_status"),
        sa.CheckConstraint("length(message) BETWEEN 1 AND 500", name="ck_agent_run_message"),
        sa.CheckConstraint(
            "version > 0 AND attempts >= 0 AND steps_used >= 0 AND tool_calls_used >= 0 AND event_sequence >= 0",
            name="ck_agent_run_counters",
        ),
        sa.CheckConstraint(f"(status IN ({TERMINAL_STATUSES})) = (finished_at IS NOT NULL)", name="ck_agent_run_finished"),
        sa.CheckConstraint("(status = 'waiting_for_user') = (question_id IS NOT NULL)", name="ck_agent_run_question"),
    )
    op.create_index("ix_agent_runs_claim", "agent_runs", ["status", "available_at"])
    op.create_index("ix_agent_runs_history", "agent_runs", ["account_id", "space_id", "created_at", "id"])

    op.create_table(
        "agent_run_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("run_id", sa.String(36), sa.ForeignKey("agent_runs.id"), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(48), nullable=False),
        sa.Column("summary", sa.String(300), nullable=False),
        moment("created_at"),
        sa.UniqueConstraint("run_id", "sequence", name="uq_agent_run_event_sequence"),
    )

    op.create_table(
        "agent_approvals",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("run_id", sa.String(36), sa.ForeignKey("agent_runs.id"), nullable=False),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("admission_id", sa.String(36), nullable=False),
        sa.Column("space_id", sa.String(36), sa.ForeignKey("spaces.id"), nullable=False),
        sa.Column("tool_name", sa.String(64), nullable=False),
        sa.Column("tool_version", sa.String(8), nullable=False),
        sa.Column("risk", sa.String(8), nullable=False),
        sa.Column("summary", sa.String(300), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("payload_digest", sa.String(64), nullable=False),
        sa.Column("effect_key", sa.String(36), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("reason", sa.String(48), nullable=True),
        sa.Column("decision_key", sa.String(36), nullable=True),
        sa.Column("result_ref", sa.String(36), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        moment("created_at"),
        moment("expires_at"),
        moment("decided_at", nullable=True),
        sa.UniqueConstraint("run_id", name="uq_agent_approval_run"),
        sa.UniqueConstraint("effect_key", name="uq_agent_approval_effect"),
        sa.CheckConstraint(f"status IN ({APPROVAL_STATUSES})", name="ck_agent_approval_status"),
        sa.CheckConstraint("(status = 'pending') = (decided_at IS NULL)", name="ck_agent_approval_decision"),
        sa.CheckConstraint("(status = 'approved') = (result_ref IS NOT NULL)", name="ck_agent_approval_result"),
        sa.CheckConstraint("expires_at > created_at AND version > 0", name="ck_agent_approval_bounds"),
    )
    op.create_index("ix_agent_approvals_pending", "agent_approvals", ["account_id", "status", "expires_at"])

    op.create_table(
        "agent_tool_calls",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("run_id", sa.String(36), sa.ForeignKey("agent_runs.id"), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("tool_name", sa.String(64), nullable=False),
        sa.Column("tool_version", sa.String(8), nullable=False),
        sa.Column("effect", sa.String(8), nullable=False),
        sa.Column("risk", sa.String(8), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("input_digest", sa.String(64), nullable=False),
        sa.Column("summary", sa.String(300), nullable=False),
        sa.Column("result_ref", sa.String(36), nullable=True),
        sa.Column("error_code", sa.String(48), nullable=True),
        sa.Column("approval_id", sa.String(36), sa.ForeignKey("agent_approvals.id"), nullable=True),
        moment("created_at"),
        sa.UniqueConstraint("run_id", "sequence", name="uq_agent_tool_call_sequence"),
        sa.CheckConstraint("effect IN ('read', 'write')", name="ck_agent_tool_call_effect"),
        sa.CheckConstraint("risk IN ('low', 'medium')", name="ck_agent_tool_call_risk"),
        sa.CheckConstraint("status IN ('succeeded', 'failed')", name="ck_agent_tool_call_status"),
    )

    op.create_table(
        "agent_memories",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("key", sa.String(32), nullable=True),
        sa.Column("content", sa.String(200), nullable=False),
        sa.Column("source_run_id", sa.String(36), sa.ForeignKey("agent_runs.id"), nullable=True),
        sa.Column("source", sa.String(32), nullable=False),
        moment("created_at"),
        sa.CheckConstraint("kind IN ('preference', 'note')", name="ck_agent_memory_kind"),
        sa.CheckConstraint("(kind = 'preference') = (key IS NOT NULL)", name="ck_agent_memory_key"),
        sa.CheckConstraint("length(content) BETWEEN 1 AND 200", name="ck_agent_memory_content"),
    )
    op.create_index(
        "uq_agent_memory_preference", "agent_memories", ["account_id", "key"], unique=True,
        postgresql_where=sa.text("key IS NOT NULL"),
    )
    op.create_index("ix_agent_memory_account", "agent_memories", ["account_id", "created_at"])


def downgrade():
    op.drop_index("ix_agent_memory_account", table_name="agent_memories")
    op.drop_index("uq_agent_memory_preference", table_name="agent_memories")
    op.drop_table("agent_memories")
    op.drop_table("agent_tool_calls")
    op.drop_index("ix_agent_approvals_pending", table_name="agent_approvals")
    op.drop_table("agent_approvals")
    op.drop_table("agent_run_events")
    op.drop_index("ix_agent_runs_history", table_name="agent_runs")
    op.drop_index("ix_agent_runs_claim", table_name="agent_runs")
    op.drop_table("agent_runs")

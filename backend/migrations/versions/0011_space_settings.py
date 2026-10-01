from alembic import op
import sqlalchemy as sa

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade():
	op.create_table(
		"space_settings_commands",
		sa.Column("id", sa.String(36), sa.ForeignKey("space_audit_events.id"), primary_key=True),
		sa.Column("space_id", sa.String(36), sa.ForeignKey("spaces.id"), nullable=False),
		sa.Column("actor_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
		sa.Column("actor_admission_id", sa.String(36), nullable=False),
		sa.Column("request_key", sa.String(36), nullable=False),
		sa.Column("request_digest", sa.String(64), nullable=False),
		sa.UniqueConstraint("space_id", "actor_id", "request_key", name="uq_space_settings_command"),
	)


def downgrade():
	op.drop_table("space_settings_commands")

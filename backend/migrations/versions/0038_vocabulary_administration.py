"""Vocabulary administration (T128): a stricter parent rule, short topic codes and a record of every operator change."""

from alembic import op
import sqlalchemy as sa

revision = "0038"
down_revision = "0037"
branch_labels = None
depends_on = None

PARENT_RULE = (
    "(dimension = 'interest' AND parent_dimension IS NOT NULL AND parent_dimension = 'topic' AND parent_code IS NOT NULL) OR "
    "(dimension = 'place' AND ((parent_dimension IS NULL AND parent_code IS NULL) OR "
    "(parent_dimension IS NOT NULL AND parent_dimension = 'place' AND parent_code IS NOT NULL))) OR "
    "(dimension NOT IN ('interest', 'place') AND parent_dimension IS NULL AND parent_code IS NULL)"
)
OLD_PARENT_RULE = (
    "(dimension = 'interest' AND parent_dimension = 'topic' AND parent_code IS NOT NULL) OR "
    "(dimension = 'place' AND (parent_dimension IS NULL OR parent_dimension = 'place') "
    "AND (parent_dimension IS NULL) = (parent_code IS NULL)) OR "
    "(dimension NOT IN ('interest', 'place') AND parent_dimension IS NULL AND parent_code IS NULL)"
)


def upgrade():
    # The old rule let an interest with no parent kind through: a comparison with NULL is neither true nor false.
    op.drop_constraint("ck_taxonomy_term_parent", "taxonomy_terms", type_="check")
    op.create_check_constraint("ck_taxonomy_term_parent", "taxonomy_terms", PARENT_RULE)
    # A page keeps its main topic in a 20-character column.
    op.create_check_constraint("ck_taxonomy_term_topic_code", "taxonomy_terms", "dimension <> 'topic' OR char_length(code) <= 20")
    op.create_table(
        "taxonomy_term_changes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("dimension", sa.String(20), nullable=False),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("action", sa.String(10), nullable=False),
        sa.Column("details", sa.Text(), nullable=False),
        sa.Column("changed_by", sa.String(20), nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["dimension", "code"], ["taxonomy_terms.dimension", "taxonomy_terms.code"], name="fk_taxonomy_change_term"),
        sa.CheckConstraint("action IN ('added', 'named', 'retired', 'restored')", name="ck_taxonomy_change_action"),
    )
    op.create_index("ix_taxonomy_change_term", "taxonomy_term_changes", ["dimension", "code", "changed_at"])


def downgrade():
    connection = op.get_bind()
    if connection.execute(sa.text("SELECT count(*) FROM taxonomy_term_changes")).scalar():
        raise RuntimeError("Downgrading below 0038 would lose the record of vocabulary changes; keep it or remove it first.")
    op.drop_index("ix_taxonomy_change_term", table_name="taxonomy_term_changes")
    op.drop_table("taxonomy_term_changes")
    op.drop_constraint("ck_taxonomy_term_topic_code", "taxonomy_terms", type_="check")
    op.drop_constraint("ck_taxonomy_term_parent", "taxonomy_terms", type_="check")
    op.create_check_constraint("ck_taxonomy_term_parent", "taxonomy_terms", OLD_PARENT_RULE)

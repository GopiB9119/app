"""Help posts from new accounts on busy pages wait for the page's review (D3, plan section 10.3).

A post in 'pending' is seen only by its author and the page's owner and moderators until one of them approves it.
A downgrade refuses while any post waits, so held posts are never published by a schema change."""

import sqlalchemy as sa
from alembic import op

revision = "0057"
down_revision = "0056"
branch_labels = None
depends_on = None

ENDED = (
    "(status IN ('helped', 'closed') AND ended_at IS NOT NULL AND title IS NOT NULL AND details IS NOT NULL) OR "
    "(status = 'removed' AND ended_at IS NOT NULL AND title IS NOT NULL AND details IS NULL) OR "
    "(status = 'deleted' AND ended_at IS NOT NULL AND title IS NULL AND details IS NULL AND place IS NULL AND need_by IS NULL)"
)
WITH_REVIEW = "(status IN ('open', 'pending') AND ended_at IS NULL AND title IS NOT NULL AND details IS NOT NULL) OR " + ENDED
WITHOUT_REVIEW = "(status = 'open' AND ended_at IS NULL AND title IS NOT NULL AND details IS NOT NULL) OR " + ENDED


def upgrade():
    op.drop_constraint("ck_help_post_state", "help_posts", type_="check")
    op.create_check_constraint("ck_help_post_state", "help_posts", WITH_REVIEW)


def downgrade():
    connection = op.get_bind()
    if connection.execute(sa.text("SELECT count(*) FROM help_posts WHERE status = 'pending'")).scalar():
        raise RuntimeError("Downgrading below 0057 would publish or lose posts waiting for review; approve or remove them first.")
    op.drop_constraint("ck_help_post_state", "help_posts", type_="check")
    op.create_check_constraint("ck_help_post_state", "help_posts", WITHOUT_REVIEW)

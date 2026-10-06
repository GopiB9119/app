"""Space agent definitions version 2 (DEC-058, T236): the web.search and web.read tools join every Space agent.

A binding names its definition and version, and the code serves only the version it knows, so every binding moves to
version 2 with the code. Runs keep the version they recorded. No table or column changes.
"""

from alembic import op

revision = "0050"
down_revision = "0049"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("UPDATE agent_instances SET definition_version = 2 WHERE definition_version = 1")


def downgrade():
    op.execute("UPDATE agent_instances SET definition_version = 1 WHERE definition_version = 2")

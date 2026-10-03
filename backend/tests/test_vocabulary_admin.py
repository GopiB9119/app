"""T128: operators change the shared vocabulary with a recorded change, and the database refuses a malformed term."""

import json

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from app.cli import main
from app.modules.community.models import TaxonomyTerm, TaxonomyTermChange
from tests.test_community import create_page
from tests.test_community_classification import choose, interests, terms
from tests.test_identity import account, auth

NEW = ("interest", "rainwater-harvesting")


def run(app, *argv):
    main(["vocabulary", *argv], settings=app.state.settings)


def forget(app, dimension, code):
    """Terms are reference data that tests never empty, so a test removes the ones it added."""
    with app.state.engine.begin() as connection:
        for statement in (
            "DELETE FROM page_terms WHERE dimension = :d AND code = :c",
            "DELETE FROM account_interests WHERE dimension = :d AND code = :c",
            "DELETE FROM taxonomy_term_changes WHERE dimension = :d AND code = :c",
            "DELETE FROM taxonomy_terms WHERE dimension = :d AND code = :c",
        ):
            connection.execute(text(statement), {"d": dimension, "c": code})


def changes(app, code):
    with app.state.sessions() as database:
        rows = database.scalars(select(TaxonomyTermChange).where(TaxonomyTermChange.code == code)
                                .order_by(TaxonomyTermChange.changed_at, TaxonomyTermChange.action)).all()
        return [(row.action, json.loads(row.details), row.changed_by) for row in rows]


def test_an_operator_adds_names_retires_and_restores_a_term(client, app, capsys):
    try:
        run(app, "add", *NEW, "--en", "Rainwater harvesting", "--te", "వర్షపు నీటి సంరక్షణ", "--parent", "environment")
        assert capsys.readouterr().out.strip() == "dimension=interest code=rainwater-harvesting changed=1"
        added = {term["code"]: term for term in terms(client) if term["dimension"] == "interest"}["rainwater-harvesting"]
        assert added == {
            "dimension": "interest", "code": "rainwater-harvesting", "parent": "environment", "sensitive": False,
            "status": "active", "names": {"en": "Rainwater harvesting", "te": "వర్షపు నీటి సంరక్షణ", "hi": None},
        }
        # Running the same command again changes nothing; other details for the same code are refused.
        run(app, "add", *NEW, "--en", "Rainwater harvesting", "--te", "వర్షపు నీటి సంరక్షణ", "--parent", "environment")
        assert capsys.readouterr().out.strip().endswith("changed=0")
        with pytest.raises(SystemExit, match="already exists"):
            run(app, "add", *NEW, "--en", "Rain gardens", "--parent", "environment")

        # The new term works at once, with no release.
        owner = account(client, app)
        created = create_page(client, owner, handle="rain-savers", name="Rain Savers", topic="environment",
                              classification={"interests": ["rainwater-harvesting"]})
        assert created.status_code == 201, created.text
        assert choose(client, owner, interests(client, owner)["etag"], interests=["rainwater-harvesting"]).status_code == 200
        found = client.get("/v1/discover/pages?interest=rainwater-harvesting").json()["data"]
        assert [page["handle"] for page in found] == ["rain-savers"]

        run(app, "name", *NEW, "--hi", "वर्षा जल संचयन")
        assert capsys.readouterr().out.strip().endswith("changed=1")
        run(app, "retire", *NEW)
        assert capsys.readouterr().out.strip().endswith("changed=1")
        retired = {term["code"]: term for term in terms(client)}["rainwater-harvesting"]
        assert (retired["status"], retired["names"]["hi"]) == ("retired", "वर्षा जल संचयन")
        # Retired: the page keeps it, but nobody chooses it again.
        other = account(client, app, "sam@example.test")
        refused = choose(client, other, interests(client, other)["etag"], interests=["rainwater-harvesting"])
        assert refused.status_code == 422 and refused.json()["error"]["code"] == "TERM_UNAVAILABLE"
        assert client.get("/v1/pages/rain-savers").json()["data"]["classification"]["interests"] == ["rainwater-harvesting"]
        run(app, "restore", *NEW)
        assert capsys.readouterr().out.strip().endswith("changed=1")
        run(app, "restore", *NEW)
        assert capsys.readouterr().out.strip().endswith("changed=0")
        assert choose(client, other, interests(client, other)["etag"], interests=["rainwater-harvesting"]).status_code == 200

        assert changes(app, "rainwater-harvesting") == [
            ("added", {"en": "Rainwater harvesting", "hi": None, "parent": "environment", "sensitive": False,
                       "te": "వర్షపు నీటి సంరక్షణ"}, "operator"),
            ("named", {"hi": "वर्षा जल संचयन"}, "operator"),
            ("retired", {"status": "retired"}, "operator"),
            ("restored", {"status": "active"}, "operator"),
        ]
        run(app, "list", "--dimension", "interest")
        listed = capsys.readouterr().out.splitlines()
        assert "interest rainwater-harvesting status=active parent=environment sensitive=0 en=Rainwater harvesting" in listed
        assert listed[-1] == "count=80"
    finally:
        forget(app, *NEW)


def test_malformed_terms_are_refused_before_anything_is_saved(app):
    with app.state.sessions() as database:
        before = database.scalar(select(func.count()).select_from(TaxonomyTerm))
    for argv, message in (
        (["add", "interest", "Rain Water", "--en", "Rain", "--parent", "environment"], "lowercase"),
        (["add", "topic", "a-very-long-topic-code-x", "--en", "Long"], "20 characters"),
        (["add", "interest", "orphan-interest", "--en", "Orphan"], "give --parent"),
        (["add", "interest", "wrong-parent", "--en", "Wrong", "--parent", "in-telangana"], "No topic"),
        (["add", "place", "in-telangana-nowhere", "--en", "Nowhere", "--parent", "atlantis"], "No place"),
        (["add", "audience", "grandparents", "--en", "Grandparents", "--parent", "everyone"], "stands alone"),
        (["add", "language", "xx", "--en", "x" * 81], "en name"),
        (["add", "language", "xy", "--en", "Bad\u202ename"], "control"),
        (["name", "interest", "moon-farming", "--en", "Moon"], "No interest"),
        (["name", "interest", "composting"], "at least one"),
        (["retire", "topic", "gossip"], "No topic"),
    ):
        with pytest.raises(SystemExit, match=message):
            run(app, *argv)
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(TaxonomyTerm)) == before
        assert database.scalar(select(func.count()).select_from(TaxonomyTermChange)) == 0


@pytest.mark.parametrize("values", [
    # Before 0038 the parent rule let an interest with no parent kind through, since a comparison with NULL is unknown.
    {"dimension": "interest", "code": "orphan", "parent_dimension": None, "parent_code": "environment", "path": "orphan"},
    {"dimension": "place", "code": "half-parent", "parent_dimension": None, "parent_code": "in", "path": "half-parent"},
    {"dimension": "topic", "code": "a-topic-code-of-21-ch", "parent_dimension": None, "parent_code": None, "path": "a-topic-code-of-21-ch"},
])
def test_the_database_refuses_a_term_the_rules_do_not_allow(app, values):
    with pytest.raises(IntegrityError), app.state.engine.begin() as connection:
        connection.execute(text(
            "INSERT INTO taxonomy_terms (dimension, code, parent_dimension, parent_code, path, sort_order, sensitive, status, label_en)"
            " VALUES (:dimension, :code, :parent_dimension, :parent_code, :path, 999, false, 'active', 'Test')"
        ), values)


def test_the_migration_refuses_a_downgrade_that_would_lose_the_record_of_changes(client, app):
    config = Config("alembic.ini")
    try:
        command.downgrade(config, "0037")
        with app.state.engine.connect() as connection:
            assert connection.scalar(text("SELECT to_regclass('taxonomy_term_changes')")) is None
    finally:
        command.upgrade(config, "head")
    try:
        run(app, "add", *NEW, "--en", "Rainwater harvesting", "--parent", "environment")
        with pytest.raises(RuntimeError, match="0038"):
            command.downgrade(config, "0037")
    finally:
        forget(app, *NEW)
    from tests.test_migrations import test_migrated_schema_matches_models

    test_migrated_schema_matches_models(app)

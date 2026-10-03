"""Pages limited by a platform moderator, and hidden pages that take nothing new (DEC-040, T135)."""

from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import func, select, text

from app.modules.community.models import ContentReport, PublicPage
from app.modules.safety.models import PlatformModerator
from tests.test_community import comment, draft, publish
from tests.test_community_classification import chosen, page, suggestions
from tests.test_identity import account, auth
from tests.test_interest_posts import change, listed, post
from tests.test_moderation import appeal, decide, moderator, report, resolve

DISCOVER, LATEST, FOLLOWING = "/v1/discover/pages", "/v1/discover/posts", "/v1/feed"


def shown(client, path, person=None, **params):
    response = client.get(path, headers=auth(person) if person else {}, params=params)
    assert response.status_code == 200, (path, response.text)
    return [item["id"] for item in response.json()["data"]]


def view(client, path, person=None):
    response = client.get(path, headers=auth(person) if person else {})
    assert response.status_code == 200, (path, response.text)
    return response.json()["data"]


def refused(response, code):
    assert response.status_code == 409 and response.json()["error"]["code"] == code, response.text


@pytest.fixture
def community(client, app):
    owner = account(client, app, "owner@example.test")
    reader = account(client, app, "reader@example.test")
    visitor = account(client, app, "visitor@example.test")
    reviewer = moderator(client, app)
    second = moderator(client, app, "second-moderator@example.test")
    compost = page(client, owner, "compost-club", "environment", interests=["composting"])
    scraps = post(client, owner, compost["id"], "Kitchen scraps make compost.", interests=["composting"])
    assert client.post(f"/v1/pages/{compost['id']}/follow", headers=auth(reader), json={}).status_code == 200
    chosen(client, visitor, interests=["composting"])
    return owner, reader, visitor, reviewer, second, compost, scraps


def test_a_limited_page_leaves_discover_and_pauses_new_posts_and_comments(client, app, community):
    owner, reader, visitor, reviewer, _second, compost, scraps = community
    before = comment(client, reader, scraps["id"], key=(kept := str(uuid4())))
    assert before.status_code == 201, before.text
    assert compost["id"] in shown(client, DISCOVER, q="compost") and scraps["id"] in shown(client, LATEST)
    assert [item["page"]["id"] for item in suggestions(client, visitor)["items"]] == [compost["id"]]
    assert [item["post"]["id"] for item in listed(client, visitor)["data"]] == [scraps["id"]]
    report(client, reader, "page", compost["id"])

    decision = decide(client, reviewer, "page", compost["id"], action="limit", reason="spam")
    assert decision.status_code == 201, decision.text
    assert decision.json()["data"]["action"] == "limit"

    # Discover leaves it out for everyone but its owner; following and the page's address still reach it.
    for person in (None, reader, visitor, reviewer):
        assert compost["id"] not in shown(client, DISCOVER, person) + shown(client, DISCOVER, person, q="compost")
        assert scraps["id"] not in shown(client, LATEST, person) + shown(client, LATEST, person, q="scraps")
    assert suggestions(client, visitor)["items"] == [] and listed(client, visitor)["data"] == []
    assert shown(client, FOLLOWING, reader) == [scraps["id"]] and shown(client, "/v1/me/following", reader) == [compost["id"]]
    assert compost["id"] in shown(client, DISCOVER, owner)
    public = view(client, f"/v1/pages/{compost['handle']}")
    assert public["limited"] is True and "limit" not in public and "moderation" not in public
    assert view(client, f"/v1/pages/{compost['id']}", owner)["limit"] == {"reason": "spam"}
    assert "limit" not in view(client, f"/v1/pages/{compost['id']}", reader)
    assert view(client, f"/v1/posts/{scraps['id']}")["page_limited"] is True
    assert [item["id"] for item in view(client, f"/v1/pages/{compost['id']}/posts")] == [scraps["id"]]

    # Nothing new is published or commented; drafts, edits and exact retries of earlier work still go through.
    written = draft(client, owner, compost["id"])
    assert written.status_code == 201, written.text
    refused(client.post(f"/v1/posts/{written.json()['data']['id']}/publish", headers={
        **auth(owner), "If-Match": written.json()["data"]["etag"]}, json={}), "PAGE_LIMITED")
    assert publish(client, owner, scraps)["id"] == scraps["id"]
    assert change(client, owner, scraps, body="Kitchen scraps make good compost.").status_code == 200
    for person in (reader, owner):
        refused(comment(client, person, scraps["id"]), "PAGE_LIMITED")
    again = comment(client, reader, scraps["id"], key=kept)
    assert again.status_code == 201 and again.json()["data"]["id"] == before.json()["data"]["id"]

    # The owner is told, and the person who reported sees that action was taken.
    [notice] = view(client, "/v1/me/moderation-notices", owner)
    assert notice["action"] == "limit" and notice["reason"] == "spam" and notice["target_id"] == compost["id"]
    [mine] = view(client, "/v1/me/reports", reader)
    assert mine["outcome"] == "action_taken" and mine["action"] == "limit"
    with app.state.sessions() as database:
        assert {report.status for report in database.scalars(select(ContentReport))} == {"closed"}


def test_limiting_and_hiding_are_separate_and_each_appeal_lifts_only_its_own(client, app, community):
    owner, _reader, _visitor, reviewer, second, compost, scraps = community
    for target_type, identifier in (("post", scraps["id"]), ("comment", str(uuid4()))):
        response = decide(client, reviewer, target_type, identifier, action="limit")
        assert response.status_code == 422, response.text
    with app.state.sessions.begin() as database:
        database.add(PlatformModerator(account_id=owner["user"]["id"], added_at=app.state.clock(), added_by="operator"))
    refused(decide(client, owner, "page", compost["id"], action="limit"), "CONFLICT_OF_INTEREST")

    limited = decide(client, reviewer, "page", compost["id"], action="limit", reason="spam").json()["data"]
    refused(decide(client, reviewer, "page", compost["id"], action="limit"), "PAGE_ALREADY_LIMITED")
    hidden = decide(client, reviewer, "page", compost["id"], reason="harassment")
    assert hidden.status_code == 201, hidden.text

    # Lifting the limit leaves the page hidden, and a hidden page cannot be limited again.
    lifting = appeal(client, owner, limited["id"])
    assert lifting.status_code == 201, lifting.text
    refused(resolve(client, reviewer, lifting.json()["data"]["id"]), "CONFLICT_OF_INTEREST")
    assert resolve(client, second, lifting.json()["data"]["id"]).status_code == 200
    assert client.get(f"/v1/pages/{compost['id']}").status_code == 404
    mine = view(client, f"/v1/pages/{compost['id']}", owner)
    assert mine["limited"] is False and "limit" not in mine and mine["moderation"] == {"hidden": True, "reason": "harassment"}
    refused(decide(client, reviewer, "page", compost["id"], action="limit"), "CONTENT_ALREADY_HIDDEN")
    refused(appeal(client, owner, limited["id"]), "APPEAL_ALREADY_EXISTS")

    unhiding = appeal(client, owner, hidden.json()["data"]["id"])
    assert resolve(client, second, unhiding.json()["data"]["id"]).status_code == 200
    restored = view(client, f"/v1/pages/{compost['id']}")
    assert restored["limited"] is False and compost["id"] in shown(client, DISCOVER, q="compost")
    assert sorted(notice["action"] for notice in view(client, "/v1/me/moderation-notices", owner)) == ["hide", "limit", "restore", "restore"]
    with app.state.sessions() as database:
        stored = database.get(PublicPage, compost["id"])
        assert (stored.moderation_limited_at, stored.moderation_limit_decision_id, stored.moderation_hidden_at) == (None, None, None)


def test_a_hidden_page_takes_no_new_posts_or_comments_until_it_is_restored(client, app, community):
    owner, _reader, _visitor, reviewer, second, compost, scraps = community
    written = draft(client, owner, compost["id"]).json()["data"]
    hidden = decide(client, reviewer, "page", compost["id"]).json()["data"]
    refused(client.post(f"/v1/posts/{written['id']}/publish", headers={**auth(owner), "If-Match": written["etag"]}, json={}), "PAGE_SUSPENDED")
    refused(comment(client, owner, scraps["id"]), "PAGE_SUSPENDED")
    assert draft(client, owner, compost["id"], body="Another idea.").status_code == 201
    assert change(client, owner, scraps, body="Kitchen scraps make good compost.").status_code == 200

    restoring = appeal(client, owner, hidden["id"])
    assert resolve(client, second, restoring.json()["data"]["id"]).status_code == 200
    assert publish(client, owner, written)["status"] == "published"
    assert comment(client, owner, scraps["id"]).status_code == 201


def test_the_contract_and_the_migration_keep_page_limits(client, app, community):
    _owner, _reader, _visitor, reviewer, _second, compost, _scraps = community
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    assert "limit" in schemas["CreateDecision"]["properties"]["action"]["enum"]
    assert {"limited", "limit"} <= set(schemas["PageView"]["properties"]) and "page_limited" in schemas["PostView"]["properties"]
    assert decide(client, reviewer, "page", compost["id"], action="limit").status_code == 201
    with app.state.engine.connect() as connection, pytest.raises(Exception, match="ck_public_page_moderation_limit"):
        connection.execute(text("UPDATE public_pages SET moderation_limit_decision_id = NULL WHERE id = :id"), {"id": compost["id"]})
    config = Config("alembic.ini")
    with pytest.raises(RuntimeError, match="0042"):
        command.downgrade(config, "0041")
    with app.state.engine.connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == ScriptDirectory.from_config(config).get_current_head()
        assert connection.scalar(select(func.count()).select_from(PublicPage).where(PublicPage.moderation_limited_at.is_not(None))) == 1

import json
from concurrent.futures import ThreadPoolExecutor

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import func, select, text

from app.modules.community.models import CommunityAuditEvent
from tests.test_community import advance, create_page, draft, published
from tests.test_identity import account, auth
from tests.test_migrations import test_migrated_schema_matches_models as schema_matches_models
from tests.test_moderation import decide, moderator, report


def edit_page(client, owner, page, **changes):
    return client.patch(f"/v1/pages/{page['id']}", headers={**auth(owner), "If-Match": page["etag"]}, json=changes)


def pin(client, person, post_id, pinned=True):
    return client.post(f"/v1/posts/{post_id}/{'pin' if pinned else 'unpin'}", headers=auth(person), json={})


def pinned_ids(client, page_id, headers=None):
    response = client.get(f"/v1/pages/{page_id}/pinned-posts", headers=headers or {})
    assert response.status_code == 200, response.text
    return [item["id"] for item in response.json()["data"]]


def audited(app, action):
    with app.state.sessions() as database:
        return database.scalar(select(func.count()).select_from(CommunityAuditEvent).where(CommunityAuditEvent.action == action))


def test_page_rules_are_public_and_saved_against_the_reviewed_version(client, app):
    owner = account(client, app)
    other = account(client, app, "other@example.test")
    page = create_page(client, owner).json()["data"]
    assert page["rules"] == ""
    assert client.patch(f"/v1/pages/{page['id']}", headers=auth(owner), json={"rules": "Be kind."}).status_code == 428
    assert edit_page(client, other, page, rules="Mine now.").status_code == 403
    saved = edit_page(client, owner, page, rules="  Be kind.\r\nNo selling.  ")
    assert saved.status_code == 200, saved.text
    ruled = saved.json()["data"]
    assert ruled["rules"] == "Be kind.\nNo selling." and ruled["etag"] != page["etag"]
    for headers in ({}, auth(other)):
        assert client.get(f"/v1/pages/{page['id']}", headers=headers).json()["data"]["rules"] == "Be kind.\nNo selling."
    stale = edit_page(client, owner, page, rules="Old review")
    assert stale.status_code == 412 and stale.json()["error"]["code"] == "CONTENT_CHANGED"
    for bad in ("x" * 2001, "No \u202e tricks", None):
        assert edit_page(client, owner, ruled, rules=bad).status_code == 422, bad
    cleared = edit_page(client, owner, ruled, rules="")
    assert cleared.status_code == 200 and cleared.json()["data"]["rules"] == ""
    # 2,000 four-byte characters, each escaped by the client: 24 KB, more than the usual 16 KiB request limit.
    escaped = json.dumps({"rules": "\U0001F33F" * 2000}).encode()
    assert len(escaped) > 16384
    longest = client.patch(
        f"/v1/pages/{page['id']}", content=escaped,
        headers={**auth(owner), "If-Match": cleared.json()["data"]["etag"], "Content-Type": "application/json"},
    )
    assert longest.status_code == 200, longest.text
    assert len(longest.json()["data"]["rules"]) == 2000
    assert audited(app, "public.page_updated") == 3


def test_the_owner_pins_up_to_three_published_posts_latest_pin_first(client, app):
    owner = account(client, app)
    reader = account(client, app, "reader@example.test")
    page = create_page(client, owner).json()["data"]
    posts = []
    for index in range(5):
        posts.append(published(client, owner, page["id"], body=f"Walk number {index}"))
        advance(app, minutes=1)
    unpublished = draft(client, owner, page["id"]).json()["data"]
    assert pinned_ids(client, page["id"]) == []
    first = pin(client, owner, posts[0]["id"])
    assert first.status_code == 200, first.text
    assert first.json()["data"]["pinned"] is True and first.json()["data"]["etag"] == posts[0]["etag"]
    assert pin(client, owner, posts[0]["id"]).json()["data"]["pinned"] is True
    for post in posts[1:3]:
        advance(app, minutes=1)
        assert pin(client, owner, post["id"]).status_code == 200
    expected = [posts[2]["id"], posts[1]["id"], posts[0]["id"]]
    for headers in ({}, auth(reader), auth(owner)):
        assert pinned_ids(client, page["id"], headers) == expected
    full = pin(client, owner, posts[3]["id"])
    assert full.status_code == 409 and full.json()["error"]["code"] == "PIN_LIMIT_REACHED"
    early = pin(client, owner, unpublished["id"])
    assert early.status_code == 409 and early.json()["error"]["code"] == "NOT_PUBLISHED"
    assert pin(client, reader, posts[3]["id"]).status_code == 403
    assert client.post(f"/v1/posts/{posts[3]['id']}/pin", json={}).status_code == 401
    assert client.post(f"/v1/posts/{posts[3]['id']}/pin", headers=auth(owner), json={"pinned_at": "2026-01-01T00:00:00Z"}).status_code == 422
    # Pinned posts stay in the page's list in date order, so clients that do not know about pins still show them.
    listed = client.get(f"/v1/pages/{page['id']}/posts").json()["data"]
    assert [item["id"] for item in listed] == [post["id"] for post in reversed(posts)]
    assert [item["pinned"] for item in listed] == [False, False, True, True, True]
    assert client.get(f"/v1/posts/{posts[0]['id']}").json()["data"]["pinned"] is True
    unpinned = pin(client, owner, posts[1]["id"], pinned=False)
    assert unpinned.status_code == 200 and unpinned.json()["data"]["pinned"] is False
    assert pin(client, owner, posts[1]["id"], pinned=False).json()["data"]["pinned"] is False
    assert pinned_ids(client, page["id"]) == [posts[2]["id"], posts[0]["id"]]
    current = client.get(f"/v1/posts/{posts[2]['id']}", headers=auth(owner)).json()["data"]
    assert client.post(f"/v1/posts/{posts[2]['id']}/delete", headers={**auth(owner), "If-Match": current["etag"]}, json={}).status_code == 200
    assert pinned_ids(client, page["id"]) == [posts[0]["id"]]
    for post in posts[3:]:
        advance(app, minutes=1)
        assert pin(client, owner, post["id"]).status_code == 200
    assert pinned_ids(client, page["id"]) == [posts[4]["id"], posts[3]["id"], posts[0]["id"]]
    assert client.post("/v1/blocks", headers=auth(reader), json={"target_type": "page", "target_id": page["id"]}).status_code == 201
    assert pinned_ids(client, page["id"], auth(reader)) == []
    assert client.get("/v1/pages/missing-page/pinned-posts").status_code == 404
    assert (audited(app, "public.post_pinned"), audited(app, "public.post_unpinned")) == (5, 1)


def test_a_hidden_post_leaves_the_pinned_list_and_cannot_be_pinned(client, app):
    owner = account(client, app)
    reader = account(client, app, "reader@example.test")
    reviewer = moderator(client, app)
    page = create_page(client, owner).json()["data"]
    kept = published(client, owner, page["id"], "Pinned walk")
    other = published(client, owner, page["id"], "Other walk")
    assert pin(client, owner, kept["id"]).status_code == 200
    for post in (kept, other):
        report(client, reader, "post", post["id"])
        assert decide(client, reviewer, "post", post["id"]).status_code == 201
    for headers in ({}, auth(reader)):
        assert pinned_ids(client, page["id"], headers) == []
    [marked] = client.get(f"/v1/pages/{page['id']}/pinned-posts", headers=auth(owner)).json()["data"]
    assert marked["id"] == kept["id"] and marked["moderation"]["hidden"] is True
    refused = pin(client, owner, other["id"])
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "POST_HIDDEN"
    assert pin(client, owner, kept["id"], pinned=False).json()["data"]["pinned"] is False


def test_parallel_pins_never_pass_three(client, app):
    owner = account(client, app)
    page = create_page(client, owner).json()["data"]
    posts = [published(client, owner, page["id"], f"Walk {index}") for index in range(6)]
    with ThreadPoolExecutor(max_workers=6) as pool:
        responses = list(pool.map(lambda post: pin(client, owner, post["id"]), posts))
    assert sorted(response.status_code for response in responses) == [200, 200, 200, 409, 409, 409]
    assert len(pinned_ids(client, page["id"])) == 3


def test_openapi_declares_pins_and_rules(client):
    schema = client.get("/openapi.json").json()
    for path in ("/v1/posts/{post_id}/pin", "/v1/posts/{post_id}/unpin"):
        assert schema["paths"][path]["post"]["security"] == [{"AccountSession": []}], path
    assert schema["paths"]["/v1/pages/{page_ref}/pinned-posts"]["get"]["security"] == [{}, {"AccountSession": []}]
    assert "rules" in schema["components"]["schemas"]["PageView"]["required"]
    assert "pinned" in schema["components"]["schemas"]["PostView"]["required"]
    assert "pinned_at" not in schema["components"]["schemas"]["PostView"]["properties"]


def test_migration_keeps_pages_and_posts_and_refuses_to_lose_rules_or_pins(client, app):
    owner = account(client, app)
    page = create_page(client, owner).json()["data"]
    post = published(client, owner, page["id"])
    config = Config("alembic.ini")
    try:
        command.downgrade(config, "0028")
        with app.state.engine.connect() as connection:
            assert connection.scalar(text("SELECT count(*) FROM public_posts")) == 1
    finally:
        command.upgrade(config, "head")
    assert client.get(f"/v1/pages/{page['id']}").json()["data"]["rules"] == ""
    assert client.get(f"/v1/posts/{post['id']}").json()["data"]["pinned"] is False
    assert edit_page(client, owner, page, rules="Be kind.").status_code == 200
    assert pin(client, owner, post["id"]).status_code == 200
    with pytest.raises(RuntimeError, match="rules or pinned posts"):
        command.downgrade(config, "0028")
    with app.state.engine.connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == ScriptDirectory.from_config(config).get_current_head()
    assert pinned_ids(client, page["id"]) == [post["id"]]
    schema_matches_models(app)

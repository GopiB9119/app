import json
import re
from datetime import timedelta
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.modules.community.models import CommunityAuditEvent, ContentReport, PublicPage
from app.modules.identity.models import OutboxEvent
from tests.test_identity import account, auth


def advance(app, **delta):
    app.state.clock.now += timedelta(**delta)


def create_page(client, owner, handle="river-walkers", name="River Walkers", key=None, **extra):
    body = {"handle": handle, "name": name, "description": "Weekend walks by the river.", "topic": "hobbies", **extra}
    return client.post("/v1/pages", headers={**auth(owner), "Idempotency-Key": key or str(uuid4())}, json=body)


def draft(client, owner, page_id, body="First walk on Saturday at 7.", title="Saturday walk", key=None):
    return client.post(
        f"/v1/pages/{page_id}/posts", headers={**auth(owner), "Idempotency-Key": key or str(uuid4())},
        json={"title": title, "body": body},
    )


def publish(client, owner, post):
    response = client.post(f"/v1/posts/{post['id']}/publish", headers={**auth(owner), "If-Match": post["etag"]}, json={})
    assert response.status_code == 200, response.text
    return response.json()["data"]


def published(client, owner, page_id, body="First walk on Saturday at 7."):
    response = draft(client, owner, page_id, body)
    assert response.status_code == 201, response.text
    return publish(client, owner, response.json()["data"])


def comment(client, person, post_id, body="See you there", parent_id=None, key=None):
    payload = {"body": body} if parent_id is None else {"body": body, "parent_id": parent_id}
    return client.post(f"/v1/posts/{post_id}/comments", headers={**auth(person), "Idempotency-Key": key or str(uuid4())}, json=payload)


def test_page_creation_validates_handles_and_replays_exactly(client, app):
    owner = account(client, app)
    key = str(uuid4())
    created = create_page(client, owner, handle="  River-Walkers ", name="  River   Walkers ", key=key)
    assert created.status_code == 201, created.text
    page = created.json()["data"]
    assert page["handle"] == "river-walkers" and page["name"] == "River Walkers" and page["can_manage"] is True
    assert page["follower_count"] == 0 and page["etag"].startswith('"')
    assert create_page(client, owner, key=key).json()["data"]["id"] == page["id"]
    changed = create_page(client, owner, name="Other", key=key)
    assert changed.status_code == 409 and changed.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    other = account(client, app, "other@example.test")
    taken = create_page(client, other)
    assert taken.status_code == 409 and taken.json()["error"]["code"] == "HANDLE_TAKEN"
    for handle in ["ab", "admin", "a--b", "-abc", "abc-", "has space", "x" * 31, "emoji\u263a"]:
        assert create_page(client, other, handle=handle).status_code == 422, handle
    for name in ["", "   ", "bad\u202ename", "x" * 81]:
        assert create_page(client, other, handle="valid-handle", name=name).status_code == 422, name
    assert create_page(client, other, handle="valid-handle", topic="gossip").status_code == 422
    assert create_page(client, other, handle="valid-handle", owner_id=owner["user"]["id"]).status_code == 422
    for index in range(4):
        assert create_page(client, other, handle=f"page-{index}").status_code == 201
    assert create_page(client, other, handle="page-4").status_code == 201
    limited = create_page(client, other, handle="page-5")
    assert limited.status_code == 409 and limited.json()["error"]["code"] == "PAGE_LIMIT_REACHED"
    anonymous = client.get("/v1/pages/river-walkers").json()["data"]
    assert anonymous["id"] == page["id"] and anonymous["can_manage"] is False and anonymous["etag"] is None
    assert client.get(f"/v1/pages/{page['id']}", headers=auth(other)).json()["data"]["handle"] == "river-walkers"
    assert client.get("/v1/pages/missing-page").status_code == 404
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(CommunityAuditEvent).where(CommunityAuditEvent.action == "public.page_created")) == 6


def test_only_the_owner_edits_the_page_with_the_reviewed_version(client, app):
    owner = account(client, app)
    other = account(client, app, "other@example.test")
    page = create_page(client, owner).json()["data"]
    path = f"/v1/pages/{page['id']}"
    assert client.patch(path, headers=auth(owner), json={"name": "Walkers"}).status_code == 428
    assert client.patch(path, headers={**auth(other), "If-Match": page["etag"]}, json={"name": "Mine"}).status_code == 403
    updated = client.patch(path, headers={**auth(owner), "If-Match": page["etag"]}, json={"name": "River Walkers Club", "topic": "local"})
    assert updated.status_code == 200, updated.text
    assert updated.json()["data"]["name"] == "River Walkers Club" and updated.json()["data"]["topic"] == "local"
    stale = client.patch(path, headers={**auth(owner), "If-Match": page["etag"]}, json={"name": "Old review"})
    assert stale.status_code == 412 and stale.json()["error"]["code"] == "CONTENT_CHANGED"
    assert client.patch(path, headers={**auth(owner), "If-Match": updated.json()["data"]["etag"]}, json={}).status_code == 422
    assert client.patch(path, headers={**auth(owner), "If-Match": updated.json()["data"]["etag"]}, json={"name": None}).status_code == 422
    assert client.patch(path, headers={**auth(owner), "If-Match": updated.json()["data"]["etag"]}, json={"handle": "new-handle"}).status_code == 422
    assert [page["id"]] == [item["id"] for item in client.get("/v1/me/pages", headers=auth(owner)).json()["data"]]
    assert client.get("/v1/me/pages", headers=auth(other)).json()["data"] == []


def test_page_edit_saves_nothing_when_the_session_expires_while_waiting_for_a_lock(client, app):
    from tests.test_messaging import expire_while_waiting

    owner = account(client, app)
    page = create_page(client, owner).json()["data"]
    late = expire_while_waiting(app, "public_pages", page["id"], lambda: client.patch(
        f"/v1/pages/{page['id']}", headers={**auth(owner), "If-Match": page["etag"]}, json={"name": "Renamed late"},
    ))
    assert late.status_code == 401, late.text
    with app.state.sessions() as database:
        assert database.get(PublicPage, page["id"]).name == "River Walkers"


def test_drafts_stay_private_until_published_and_deletion_removes_the_post(client, app):
    owner = account(client, app)
    reader = account(client, app, "reader@example.test")
    page = create_page(client, owner).json()["data"]
    key = str(uuid4())
    created = draft(client, owner, page["id"], key=key)
    assert created.status_code == 201, created.text
    post = created.json()["data"]
    assert post["status"] == "draft" and post["published_at"] is None and post["can_manage"] is True
    assert draft(client, owner, page["id"], key=key).json()["data"]["id"] == post["id"]
    assert draft(client, owner, page["id"], body="Changed", key=key).status_code == 409
    assert draft(client, reader, page["id"]).status_code == 403
    for headers in ({}, auth(reader)):
        assert client.get(f"/v1/posts/{post['id']}", headers=headers).status_code == 404
        assert client.get(f"/v1/pages/{page['id']}/posts", headers=headers).json()["data"] == []
    assert client.get(f"/v1/pages/{page['id']}/drafts", headers=auth(reader)).status_code == 403
    assert [item["id"] for item in client.get(f"/v1/pages/{page['id']}/drafts", headers=auth(owner)).json()["data"]] == [post["id"]]
    assert client.post(f"/v1/posts/{post['id']}/like", headers=auth(reader), json={}).status_code == 404
    assert comment(client, reader, post["id"]).status_code == 404

    edited = client.patch(f"/v1/posts/{post['id']}", headers={**auth(owner), "If-Match": post["etag"]}, json={"title": None, "body": "Walk moved to 8."})
    assert edited.status_code == 200, edited.text
    assert edited.json()["data"]["title"] is None and edited.json()["data"]["edited_at"] is None
    stale = client.post(f"/v1/posts/{post['id']}/publish", headers={**auth(owner), "If-Match": post["etag"]}, json={})
    assert stale.status_code == 412
    assert client.post(f"/v1/posts/{post['id']}/publish", headers=auth(owner), json={}).status_code == 428
    public = publish(client, owner, edited.json()["data"])
    assert public["status"] == "published" and public["published_at"] is not None
    assert publish(client, owner, edited.json()["data"])["id"] == public["id"]
    seen = client.get(f"/v1/posts/{post['id']}").json()["data"]
    assert seen["body"] == "Walk moved to 8." and seen["can_manage"] is False and seen["etag"] is None
    advance(app, minutes=5)
    after = client.patch(f"/v1/posts/{post['id']}", headers={**auth(owner), "If-Match": public["etag"]}, json={"body": "Walk moved to 9."})
    assert after.json()["data"]["edited_at"] is not None
    assert client.post(f"/v1/posts/{post['id']}/delete", headers={**auth(reader), "If-Match": after.json()["data"]["etag"]}, json={}).status_code == 403
    deleted = client.post(f"/v1/posts/{post['id']}/delete", headers={**auth(owner), "If-Match": after.json()["data"]["etag"]}, json={})
    assert deleted.status_code == 200 and deleted.json()["data"] == {"id": post["id"], "status": "deleted"}
    assert client.post(f"/v1/posts/{post['id']}/delete", headers=auth(owner), json={}).json()["data"]["status"] == "deleted"
    assert client.get(f"/v1/posts/{post['id']}", headers=auth(owner)).status_code == 404
    assert client.get(f"/v1/pages/{page['id']}/posts").json()["data"] == []
    for body in ({"body": ""}, {"body": "x" * 5001}, {"body": "ok", "title": "x" * 121}, {"body": "ok", "status": "published"}):
        assert client.post(f"/v1/pages/{page['id']}/posts", headers={**auth(owner), "Idempotency-Key": str(uuid4())}, json=body).status_code == 422


def test_follows_likes_and_saves_are_idempotent_and_drive_the_home_feed(client, app):
    owner = account(client, app)
    reader = account(client, app, "reader@example.test")
    walkers = create_page(client, owner).json()["data"]
    cooks = create_page(client, owner, handle="city-cooks", name="City Cooks").json()["data"]
    first = published(client, owner, walkers["id"], "Walk one")
    advance(app, minutes=1)
    second = published(client, owner, cooks["id"], "Recipe one")
    advance(app, minutes=1)
    third = published(client, owner, walkers["id"], "Walk two")
    assert client.get("/v1/feed", headers=auth(reader)).json()["data"] == []
    assert client.get("/v1/feed").status_code == 401
    for _ in range(2):
        followed = client.post(f"/v1/pages/{walkers['id']}/follow", headers=auth(reader), json={})
        assert followed.status_code == 200 and followed.json()["data"]["following"] is True
    assert client.get(f"/v1/pages/{walkers['id']}").json()["data"]["follower_count"] == 1
    feed = client.get("/v1/feed?limit=1", headers=auth(reader)).json()
    assert [item["id"] for item in feed["data"]] == [third["id"]] and feed["pagination"]["has_more"] is True
    rest = client.get("/v1/feed", params={"limit": 1, "cursor": feed["pagination"]["next_cursor"]}, headers=auth(reader)).json()
    assert [item["id"] for item in rest["data"]] == [first["id"]] and rest["pagination"]["has_more"] is False
    assert client.get("/v1/feed", params={"cursor": feed["pagination"]["next_cursor"]}, headers=auth(owner)).status_code == 400
    latest = client.get("/v1/discover/posts").json()["data"]
    assert [item["id"] for item in latest] == [third["id"], second["id"], first["id"]]
    for _ in range(2):
        liked = client.post(f"/v1/posts/{third['id']}/like", headers=auth(reader), json={}).json()["data"]
    assert liked["liked"] is True and liked["like_count"] == 1
    assert client.get(f"/v1/posts/{third['id']}").json()["data"]["like_count"] == 1
    saved = client.post(f"/v1/posts/{first['id']}/save", headers=auth(reader), json={}).json()["data"]
    assert saved["saved"] is True
    assert [item["id"] for item in client.get("/v1/me/saved-posts", headers=auth(reader)).json()["data"]] == [first["id"]]
    assert client.get("/v1/me/saved-posts", headers=auth(owner)).json()["data"] == []
    assert client.get(f"/v1/posts/{first['id']}", headers=auth(owner)).json()["data"]["saved"] is False
    assert client.post(f"/v1/posts/{third['id']}/unlike", headers=auth(reader), json={}).json()["data"]["like_count"] == 0
    assert client.post(f"/v1/posts/{third['id']}/unlike", headers=auth(reader), json={}).json()["data"]["like_count"] == 0
    assert client.post(f"/v1/posts/{first['id']}/unsave", headers=auth(reader), json={}).json()["data"]["saved"] is False
    assert [item["id"] for item in client.get("/v1/me/following", headers=auth(reader)).json()["data"]] == [walkers["id"]]
    for _ in range(2):
        unfollowed = client.post(f"/v1/pages/{walkers['id']}/unfollow", headers=auth(reader), json={}).json()["data"]
    assert unfollowed["following"] is False and unfollowed["follower_count"] == 0
    assert client.get("/v1/feed", headers=auth(reader)).json()["data"] == []
    assert client.post(f"/v1/pages/{walkers['id']}/follow", headers=auth(reader), json={"extra": True}).status_code == 422


def test_comments_thread_one_level_and_authors_or_page_owner_remove_them(client, app):
    owner = account(client, app)
    reader = account(client, app, "reader@example.test")
    other = account(client, app, "other@example.test")
    page = create_page(client, owner).json()["data"]
    post = published(client, owner, page["id"])
    other_post = published(client, owner, page["id"], "Another walk")
    key = str(uuid4())
    top = comment(client, reader, post["id"], "  Count me in  ", key=key)
    assert top.status_code == 201, top.text
    top = top.json()["data"]
    assert top["body"] == "Count me in" and top["mine"] is True and top["can_remove"] is True and top["parent_id"] is None
    assert comment(client, reader, post["id"], "Count me in", key=key).json()["data"]["id"] == top["id"]
    assert comment(client, reader, post["id"], "Changed", key=key).status_code == 409
    advance(app, seconds=1)
    reply = comment(client, other, post["id"], "Me too", parent_id=top["id"])
    assert reply.status_code == 201 and reply.json()["data"]["parent_id"] == top["id"]
    deep = comment(client, reader, post["id"], "Deeper", parent_id=reply.json()["data"]["id"])
    assert deep.status_code == 409 and deep.json()["error"]["code"] == "REPLY_DEPTH"
    assert comment(client, reader, other_post["id"], "Wrong post", parent_id=top["id"]).status_code == 404
    listed = client.get(f"/v1/posts/{post['id']}/comments").json()["data"]
    assert [item["body"] for item in listed] == ["Count me in", "Me too"]
    assert all(item["mine"] is False and item["can_remove"] is False for item in listed)
    assert "author_account_id" not in listed[0] and listed[0]["author_name"] == "Alex Morgan"
    owner_view = client.get(f"/v1/posts/{post['id']}/comments", headers=auth(owner)).json()["data"]
    assert all(item["can_remove"] is True for item in owner_view)
    assert client.get(f"/v1/posts/{post['id']}").json()["data"]["comment_count"] == 2
    denied = client.post(f"/v1/comments/{top['id']}/delete", headers=auth(other), json={})
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "COMMENT_NOT_YOURS"
    removed = client.post(f"/v1/comments/{reply.json()['data']['id']}/delete", headers=auth(owner), json={}).json()["data"]
    assert removed["status"] == "removed" and removed["body"] is None
    deleted = client.post(f"/v1/comments/{top['id']}/delete", headers=auth(reader), json={}).json()["data"]
    assert deleted["status"] == "deleted" and deleted["body"] is None and deleted["can_remove"] is False
    assert client.post(f"/v1/comments/{top['id']}/delete", headers=auth(reader), json={}).json()["data"]["status"] == "deleted"
    assert client.get(f"/v1/posts/{post['id']}").json()["data"]["comment_count"] == 0
    assert comment(client, other, post["id"], "Reply to deleted", parent_id=top["id"]).status_code == 409
    for body in ("", "   ", "x" * 2001, "bell\u0007"):
        assert comment(client, reader, post["id"], body).status_code == 422
    # 'Me too' already counts toward the author's per-minute limit of 20.
    for index in range(19):
        assert comment(client, other, other_post["id"], f"Burst {index}").status_code == 201
    limited = comment(client, other, other_post["id"], "Too fast")
    assert limited.status_code == 429 and limited.json()["error"]["code"] == "COMMENT_RATE_LIMITED"
    # T148: the limit lasts a minute, so the apps are told to wait a minute, not 15.
    assert limited.headers["Retry-After"] == "60"
    page_one = client.get(f"/v1/posts/{other_post['id']}/comments?limit=10").json()
    page_two = client.get(f"/v1/posts/{other_post['id']}/comments", params={"limit": 10, "cursor": page_one["pagination"]["next_cursor"]}).json()
    assert len(page_one["data"]) == 10 and len(page_two["data"]) == 9
    assert {item["id"] for item in page_one["data"]}.isdisjoint({item["id"] for item in page_two["data"]})


def test_blocks_hide_pages_and_people_and_stop_unwanted_comments(client, app):
    owner = account(client, app)
    reader = account(client, app, "reader@example.test")
    troll = account(client, app, "troll@example.test")
    page = create_page(client, owner).json()["data"]
    post = published(client, owner, page["id"])
    client.post(f"/v1/pages/{page['id']}/follow", headers=auth(reader), json={})
    rude = comment(client, troll, post["id"], "Rude remark").json()["data"]
    comment(client, reader, post["id"], "Kind remark")
    assert client.post("/v1/blocks", headers=auth(owner), json={"target_type": "page", "target_id": page["id"]}).status_code == 409
    person = client.post("/v1/blocks", headers=auth(reader), json={"target_type": "comment_author", "target_id": rude["id"]})
    assert person.status_code == 201, person.text
    assert person.json()["data"]["target_type"] == "account" and person.json()["data"]["page_id"] is None
    assert "target_id" not in person.json()["data"]
    assert [item["body"] for item in client.get(f"/v1/posts/{post['id']}/comments", headers=auth(reader)).json()["data"]] == ["Kind remark"]
    assert len(client.get(f"/v1/posts/{post['id']}/comments").json()["data"]) == 2
    owner_block = client.post("/v1/blocks", headers=auth(owner), json={"target_type": "comment_author", "target_id": rude["id"]})
    assert owner_block.status_code == 201
    stopped = comment(client, troll, post["id"], "Again")
    assert stopped.status_code == 403 and stopped.json()["error"]["code"] == "COMMENTING_UNAVAILABLE"
    advance(app, seconds=1)
    blocked = client.post("/v1/blocks", headers=auth(reader), json={"target_type": "page", "target_id": page["id"]})
    assert blocked.status_code == 201 and blocked.json()["data"]["label"] == "River Walkers"
    view = client.get(f"/v1/pages/{page['id']}", headers=auth(reader)).json()["data"]
    assert view["blocked"] is True and view["following"] is False and view["follower_count"] == 0
    assert client.get(f"/v1/pages/{page['id']}/posts", headers=auth(reader)).json()["data"] == []
    assert client.get(f"/v1/posts/{post['id']}", headers=auth(reader)).status_code == 404
    assert client.get("/v1/feed", headers=auth(reader)).json()["data"] == []
    assert client.get("/v1/discover/posts", headers=auth(reader)).json()["data"] == []
    assert client.get("/v1/discover/pages", headers=auth(reader)).json()["data"] == []
    refused = client.post(f"/v1/pages/{page['id']}/follow", headers=auth(reader), json={})
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "PAGE_BLOCKED"
    assert len(client.get("/v1/discover/posts").json()["data"]) == 1
    listed = client.get("/v1/me/blocks", headers=auth(reader)).json()["data"]
    assert [item["target_type"] for item in listed] == ["page", "account"]
    assert client.post(f"/v1/blocks/{listed[0]['id']}/remove", headers=auth(troll), json={}).status_code == 404
    assert client.post(f"/v1/blocks/{listed[0]['id']}/remove", headers=auth(reader), json={}).json()["data"]["status"] == "removed"
    assert client.get(f"/v1/posts/{post['id']}", headers=auth(reader)).status_code == 200
    assert client.get(f"/v1/pages/{page['id']}", headers=auth(reader)).json()["data"]["following"] is False
    assert client.post("/v1/blocks", headers=auth(reader), json={"target_type": "account", "target_id": str(uuid4())}).status_code == 422


def test_reports_are_received_once_per_target_and_bounded(client, app):
    owner = account(client, app)
    reader = account(client, app, "reader@example.test")
    page = create_page(client, owner).json()["data"]
    post = published(client, owner, page["id"])
    remark = comment(client, owner, post["id"], "Owner remark").json()["data"]
    body = {"target_type": "post", "target_id": post["id"], "reason": "spam", "details": "  Repeated links  "}
    first = client.post("/v1/reports", headers=auth(reader), json=body)
    assert first.status_code == 201, first.text
    assert first.json()["data"]["status"] == "received" and first.json()["data"]["reason"] == "spam"
    assert client.post("/v1/reports", headers=auth(reader), json=body).json()["data"]["id"] == first.json()["data"]["id"]
    own = client.post("/v1/reports", headers=auth(owner), json=body)
    assert own.status_code == 409 and own.json()["error"]["code"] == "OWN_CONTENT"
    assert client.post("/v1/reports", headers=auth(reader), json={**body, "target_type": "comment", "target_id": remark["id"]}).status_code == 201
    assert client.post("/v1/reports", headers=auth(reader), json={**body, "target_type": "page", "target_id": page["id"]}).status_code == 201
    assert client.post("/v1/reports", headers=auth(reader), json={**body, "target_id": str(uuid4())}).status_code == 404
    assert client.post("/v1/reports", headers=auth(reader), json={**body, "reason": "dislike"}).status_code == 422
    assert client.post("/v1/reports", json=body).status_code == 401
    with app.state.sessions() as database:
        stored = database.scalar(select(ContentReport).where(ContentReport.id == first.json()["data"]["id"]))
        assert stored.details == "Repeated links" and stored.reporter_id == reader["user"]["id"]
        assert database.scalar(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.event_type == "safety.report_received")) == 3
    posts = [published(client, owner, page["id"], f"Post {index}") for index in range(28)]
    for index, item in enumerate(posts[:27]):
        assert client.post("/v1/reports", headers=auth(reader), json={**body, "target_id": item["id"]}).status_code == 201, index
    limited = client.post("/v1/reports", headers=auth(reader), json={**body, "target_id": posts[27]["id"]})
    assert limited.status_code == 429 and limited.json()["error"]["code"] == "REPORT_RATE_LIMITED"


def test_discovery_searches_public_pages_only_with_bound_cursors(client, app):
    owner = account(client, app)
    reader = account(client, app, "reader@example.test")
    walkers = create_page(client, owner).json()["data"]
    create_page(client, owner, handle="city-cooks", name="City Cooks", description="Recipes 100% home made", topic="family")
    create_page(client, owner, handle="park-runners", name="Park Runners", description="Morning runs")
    client.post(f"/v1/pages/{walkers['id']}/follow", headers=auth(reader), json={})
    ranked = client.get("/v1/discover/pages").json()["data"]
    assert ranked[0]["id"] == walkers["id"] and len(ranked) == 3
    assert [item["handle"] for item in client.get("/v1/discover/pages?q=COOK").json()["data"]] == ["city-cooks"]
    assert [item["handle"] for item in client.get("/v1/discover/pages", params={"q": "100%"}).json()["data"]] == ["city-cooks"]
    # Wildcards are literal: only one description contains a percent sign and none contains an underscore.
    assert [item["handle"] for item in client.get("/v1/discover/pages", params={"q": "%"}).json()["data"]] == ["city-cooks"]
    assert client.get("/v1/discover/pages", params={"q": "_"}).json()["data"] == []
    assert [item["handle"] for item in client.get("/v1/discover/pages?topic=family").json()["data"]] == ["city-cooks"]
    assert client.get("/v1/discover/pages?topic=gossip").status_code == 422
    assert client.get("/v1/discover/pages", params={"q": "x" * 81}).status_code == 422
    first = client.get("/v1/discover/pages?limit=2").json()
    cursor = first["pagination"]["next_cursor"]
    rest = client.get("/v1/discover/pages", params={"limit": 2, "cursor": cursor}).json()
    assert len(rest["data"]) == 1 and {item["id"] for item in first["data"]}.isdisjoint({rest["data"][0]["id"]})
    assert client.get("/v1/discover/pages", params={"q": "run", "cursor": cursor}).status_code == 400
    assert client.get("/v1/discover/pages", params={"cursor": cursor}, headers=auth(reader)).status_code == 400
    advance(app, minutes=16)
    assert client.get("/v1/discover/pages", params={"cursor": cursor}).status_code == 410
    assert client.get("/v1/pages/river-walkers", headers={"Authorization": "Bearer not-a-session"}).status_code == 401


def test_post_search_matches_published_public_text_literally_with_bound_cursors(client, app):
    owner = account(client, app)
    reader = account(client, app, "reader@example.test")
    walkers = create_page(client, owner).json()["data"]
    cooks = create_page(client, owner, handle="city-cooks", name="City Cooks").json()["data"]
    walk = published(client, owner, walkers["id"], "Morning walk by the river")
    advance(app, minutes=1)
    soup = published(client, owner, cooks["id"], "Soup recipe: 100% vegetables")
    advance(app, minutes=1)
    later = published(client, owner, cooks["id"], "Another river soup")
    assert draft(client, owner, walkers["id"], body="River draft stays private").status_code == 201

    def found(query, headers=None):
        response = client.get("/v1/discover/posts", params={"q": query}, headers=headers or {})
        assert response.status_code == 200, response.text
        return [item["id"] for item in response.json()["data"]]

    assert found("RIVER") == [later["id"], walk["id"]]
    assert found("city cooks") == []
    assert found("saturday") == [later["id"], soup["id"], walk["id"]]
    assert found("  river   soup ") == [later["id"]]
    assert found("100%") == [soup["id"]]
    # Wildcards are literal: only one post contains a percent sign and none contains an underscore.
    assert found("%") == [soup["id"]]
    assert found("_") == []
    client.post("/v1/blocks", headers=auth(reader), json={"target_type": "page", "target_id": cooks["id"]})
    assert found("river", auth(reader)) == [walk["id"]]
    first = client.get("/v1/discover/posts", params={"q": "saturday", "limit": 2}).json()
    assert [item["id"] for item in first["data"]] == [later["id"], soup["id"]] and first["pagination"]["has_more"] is True
    cursor = first["pagination"]["next_cursor"]
    rest = client.get("/v1/discover/posts", params={"q": "saturday", "limit": 2, "cursor": cursor}).json()
    assert [item["id"] for item in rest["data"]] == [walk["id"]] and rest["pagination"]["has_more"] is False
    assert client.get("/v1/discover/posts", params={"q": "river", "cursor": cursor}).status_code == 400
    assert client.get("/v1/discover/posts", params={"cursor": cursor}).status_code == 400
    latest = client.get("/v1/discover/posts", params={"limit": 1}).json()["pagination"]["next_cursor"]
    assert client.get("/v1/discover/posts", params={"q": "saturday", "cursor": latest}).status_code == 400
    assert client.get("/v1/discover/posts", params={"q": "x" * 81}).status_code == 422


def test_parallel_likes_and_follows_keep_exact_counts(client, app):
    from concurrent.futures import ThreadPoolExecutor

    owner = account(client, app)
    readers = [account(client, app, f"reader{index}@example.test") for index in range(4)]
    page = create_page(client, owner).json()["data"]
    post = published(client, owner, page["id"])
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda person: client.post(f"/v1/posts/{post['id']}/like", headers=auth(person), json={}), readers * 2))
        list(pool.map(lambda person: client.post(f"/v1/pages/{page['id']}/follow", headers=auth(person), json={}), readers * 2))
    assert client.get(f"/v1/posts/{post['id']}").json()["data"]["like_count"] == 4
    with app.state.sessions() as database:
        assert database.get(PublicPage, page["id"]).follower_count == 4


@pytest.mark.parametrize("path", ["/v1/feed", "/v1/me/pages", "/v1/me/following", "/v1/me/saved-posts", "/v1/me/blocks"])
def test_private_community_lists_require_a_session(client, path):
    assert client.get(path).status_code == 401


def test_openapi_declares_public_reads_and_authenticated_writes(client):
    schema = client.get("/openapi.json").json()
    for method, path in [
        ("post", "/v1/pages"), ("patch", "/v1/pages/{page_ref}"), ("post", "/v1/pages/{page_ref}/posts"),
        ("post", "/v1/posts/{post_id}/publish"), ("post", "/v1/posts/{post_id}/comments"), ("get", "/v1/feed"),
        ("post", "/v1/reports"), ("post", "/v1/blocks"),
    ]:
        assert schema["paths"][path][method]["security"] == [{"AccountSession": []}], path
    for path in ["/v1/pages/{page_ref}", "/v1/posts/{post_id}", "/v1/posts/{post_id}/comments", "/v1/discover/pages", "/v1/discover/posts"]:
        assert schema["paths"][path]["get"]["security"] == [{}, {"AccountSession": []}], path
    for name in ("PageView", "PostView", "CommentView"):
        properties = schema["components"]["schemas"][name]["properties"]
        assert not {"owner_id", "author_id", "creation_key", "creation_digest"} & set(properties), name
    templates = {}
    for path in schema["paths"]:
        templates.setdefault(re.sub(r"\{[^}]+\}", "{}", path), set()).add(path)
    assert [paths for paths in templates.values() if len(paths) > 1] == []


def test_posts_up_to_the_character_limit_fit_whatever_the_characters_and_encoding(client, app):
    owner = account(client, app)
    page = create_page(client, owner).json()["data"]
    headers = {**auth(owner), "Content-Type": "application/json"}
    # 5,000 four-byte characters: 20 KB of JSON as browsers send it, and 60 KB when every character is escaped.
    payload = {"title": "\U0001F33F" * 120, "body": "\U0001F33F" * 5000}
    for encoded in (json.dumps(payload, ensure_ascii=False).encode(), json.dumps(payload).encode()):
        assert len(encoded) > 16384
        created = client.post(f"/v1/pages/{page['id']}/posts", headers={**headers, "Idempotency-Key": str(uuid4())}, content=encoded)
        assert created.status_code == 201, created.text
        post = created.json()["data"]
        assert len(post["body"]) == 5000 and len(post["title"]) == 120
    edited = client.patch(f"/v1/posts/{post['id']}", headers={**headers, "If-Match": post["etag"]},
                          content=json.dumps({"body": "<" * 5000}).replace("<", "\\u003c").encode())
    assert edited.status_code == 200, edited.text
    assert edited.json()["data"]["body"] == "<" * 5000
    longer = client.post(f"/v1/pages/{page['id']}/posts", headers={**headers, "Idempotency-Key": str(uuid4())},
                         content=json.dumps({"body": "\U0001F33F" * 5001}, ensure_ascii=False).encode())
    assert longer.status_code == 422
    oversized = client.post(f"/v1/pages/{page['id']}/posts", headers={**headers, "Idempotency-Key": str(uuid4())},
                            content=b'{"body":"' + b"x" * 70000 + b'"}')
    assert oversized.status_code == 413
    other = client.post("/v1/pages", headers={**headers, "Idempotency-Key": str(uuid4())}, content=b'{"handle":"' + b"x" * 20000 + b'"}')
    assert other.status_code == 413
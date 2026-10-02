from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from sqlalchemy import func, select, text

from app.modules.community.models import CommunityAuditEvent, ContentReport, PublicPost
from app.modules.identity.models import OutboxEvent
from app.modules.safety.models import ModerationAppeal, ModerationDecision, PlatformModerator
from tests.test_community import advance, comment, create_page, published
from tests.test_identity import account, auth


def moderator(client, app, email="moderator@example.test"):
    person = account(client, app, email)
    with app.state.sessions.begin() as database:
        database.add(PlatformModerator(account_id=person["user"]["id"], added_at=app.state.clock(), added_by="operator"))
    return person


@pytest.fixture
def content(client, app):
    owner = account(client, app)
    reader = account(client, app, "reader@example.test")
    reviewer = moderator(client, app)
    page = create_page(client, owner).json()["data"]
    post = published(client, owner, page["id"])
    remark = comment(client, owner, post["id"]).json()["data"]
    return owner, reader, reviewer, page, post, remark


def report(client, person, target_type, target_id, reason="spam"):
    response = client.post("/v1/reports", headers=auth(person), json={
        "target_type": target_type, "target_id": target_id, "reason": reason, "details": "Synthetic report detail",
    })
    assert response.status_code == 201, response.text
    return response.json()["data"]


def decide(client, reviewer, target_type, target_id, action="hide", reason="spam", note="Private moderator note", key=None):
    return client.post("/v1/moderation/decisions", headers={**auth(reviewer), "Idempotency-Key": key or str(uuid4())}, json={
        "target_type": target_type, "target_id": target_id, "action": action, "reason": reason, "note": note,
    })


def test_moderator_routes_authenticate_before_checking_the_role(client, app, content):
    _owner, reader, reviewer, _page, post, _remark = content
    for response in (
        client.get("/v1/moderation/queue", headers=auth(reader)),
        decide(client, reader, "post", post["id"]),
    ):
        assert response.status_code == 403 and response.json()["error"]["code"] == "MODERATOR_REQUIRED"
    assert client.get("/v1/me/moderator", headers=auth(reader)).json()["data"] == {"moderator": False}
    assert client.get("/v1/me/moderator", headers=auth(reviewer)).json()["data"] == {"moderator": True}
    assert client.get("/v1/moderation/queue").status_code == 401
    assert client.post("/v1/moderation/decisions", json={}).status_code == 401
    advance(app, days=30)
    assert client.get("/v1/moderation/queue", headers=auth(reviewer)).status_code == 401
    assert decide(client, reviewer, "post", post["id"]).status_code == 401


def test_queue_groups_open_reports_oldest_first_without_reporter_identity(client, app, content):
    _owner, reader, reviewer, page, post, remark = content
    other = account(client, app, "other@example.test")
    first = report(client, reader, "post", post["id"])
    report(client, other, "post", post["id"], "harassment")
    with app.state.sessions.begin() as database:
        database.get(ContentReport, first["id"]).status = "reviewing"
    advance(app, seconds=1)
    report(client, reader, "page", page["id"], "privacy")
    advance(app, seconds=1)
    report(client, reader, "comment", remark["id"])
    response = client.get("/v1/moderation/queue?limit=2", headers=auth(reviewer))
    assert response.status_code == 200, response.text
    data = response.json()
    assert [item["target_id"] for item in data["data"]] == [post["id"], page["id"]]
    assert data["data"][0]["report_count"] == 2
    assert data["data"][0]["reasons"] == [{"reason": "harassment", "count": 1}, {"reason": "spam", "count": 1}]
    assert data["data"][0]["preview"]["body"] == post["body"]
    assert data["data"][1]["preview"]["handle"] == page["handle"]
    assert data["data"][0]["page_name"] == page["name"]
    for forbidden in (reader["user"]["id"], other["user"]["id"], "Alex Morgan", "reporter", "Synthetic report detail"):
        assert forbidden not in response.text
    rest = client.get("/v1/moderation/queue", params={"cursor": data["pagination"]["next_cursor"]}, headers=auth(reviewer))
    assert [item["target_id"] for item in rest.json()["data"]] == [remark["id"]]
    assert rest.json()["pagination"]["has_more"] is False
    assert decide(client, reviewer, "post", post["id"], action="no_action").status_code == 201
    assert [item["target_id"] for item in client.get("/v1/moderation/queue", headers=auth(reviewer)).json()["data"]] == [page["id"], remark["id"]]


def test_no_action_closes_all_open_reports_without_changing_content(client, app, content):
    _owner, reader, reviewer, _page, post, _remark = content
    other = account(client, app, "other@example.test")
    first = report(client, reader, "post", post["id"])
    second = report(client, other, "post", post["id"])
    with app.state.sessions.begin() as database:
        database.get(ContentReport, second["id"]).status = "reviewing"
    before = client.get(f"/v1/posts/{post['id']}").json()["data"]
    response = decide(client, reviewer, "post", post["id"], action="no_action")
    assert response.status_code == 201, response.text
    assert client.get(f"/v1/posts/{post['id']}").json()["data"] == before
    with app.state.sessions() as database:
        for identifier in (first["id"], second["id"]):
            stored = database.get(ContentReport, identifier)
            assert stored.status == "closed" and stored.decision_id == response.json()["data"]["id"]
        assert database.get(PublicPost, post["id"]).moderation_hidden_at is None


@pytest.mark.parametrize("target_type,index", [("page", 3), ("post", 4), ("comment", 5)])
def test_moderator_cannot_decide_on_authored_content_or_their_own_page(client, app, content, target_type, index):
    owner, _reader, _reviewer, _page, _post, _remark = content
    with app.state.sessions.begin() as database:
        database.add(PlatformModerator(account_id=owner["user"]["id"], added_at=app.state.clock(), added_by="operator"))
    response = decide(client, owner, target_type, content[index]["id"])
    assert response.status_code == 409 and response.json()["error"]["code"] == "CONFLICT_OF_INTEREST"
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(ModerationDecision)) == 0


def test_decision_replays_once_and_conflicts_on_a_changed_body(client, app, content):
    _owner, reader, reviewer, _page, post, _remark = content
    report(client, reader, "post", post["id"])
    key = str(uuid4())
    first = decide(client, reviewer, "post", post["id"], key=key)
    assert first.status_code == 201, first.text
    repeated = decide(client, reviewer, "post", post["id"], key=key)
    assert repeated.status_code == 201 and repeated.json()["data"] == first.json()["data"]
    changed = decide(client, reviewer, "post", post["id"], reason="privacy", key=key)
    assert changed.status_code == 409 and changed.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    assert decide(client, reviewer, "post", post["id"]).json()["error"]["code"] == "CONTENT_ALREADY_HIDDEN"
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(ModerationDecision)) == 1
        [audit] = database.scalars(select(CommunityAuditEvent).where(CommunityAuditEvent.action == "moderation.hide")).all()
        event = database.get(OutboxEvent, audit.id)
        assert audit.actor_id == reviewer["user"]["id"] and audit.target_id == post["id"]
        assert event.event_type == audit.action and event.actor_id == audit.actor_id


def test_hiding_a_post_filters_every_public_list_but_marks_the_author_view(client, content):
    owner, reader, reviewer, page, post, _remark = content
    for person in (owner, reader):
        assert client.post(f"/v1/pages/{page['id']}/follow", headers=auth(person), json={}).status_code == 200
        assert client.post(f"/v1/posts/{post['id']}/save", headers=auth(person), json={}).status_code == 200
    report(client, reader, "post", post["id"])
    response = decide(client, reviewer, "post", post["id"], reason="privacy")
    assert response.status_code == 201, response.text
    public_lists = ("/v1/discover/posts", "/v1/discover/posts?q=walk", f"/v1/pages/{page['id']}/posts")
    for headers in ({}, auth(reader), auth(reviewer)):
        for path in public_lists:
            listed = client.get(path, headers=headers)
            assert listed.status_code == 200 and listed.json()["data"] == [], (path, listed.text)
        assert client.get(f"/v1/posts/{post['id']}", headers=headers).status_code == 404
        assert client.get(f"/v1/posts/{post['id']}/comments", headers=headers).status_code == 404
    for path in ("/v1/feed", "/v1/me/saved-posts"):
        assert client.get(path, headers=auth(reader)).json()["data"] == []
    for path in (*public_lists, "/v1/feed", "/v1/me/saved-posts"):
        [visible] = client.get(path, headers=auth(owner)).json()["data"]
        assert visible["id"] == post["id"] and visible["moderation"] == {"hidden": True, "reason": "privacy"}
        assert "Private moderator note" not in str(visible) and reviewer["user"]["id"] not in str(visible)
    assert client.get(f"/v1/posts/{post['id']}", headers=auth(owner)).json()["data"]["moderation"]["reason"] == "privacy"
    assert "moderation" not in client.get(f"/v1/pages/{page['id']}").json()["data"]


def test_hiding_a_page_filters_profiles_children_follow_lists_and_search(client, content):
    owner, reader, reviewer, page, post, _remark = content
    for person in (owner, reader):
        assert client.post(f"/v1/pages/{page['id']}/follow", headers=auth(person), json={}).status_code == 200
        assert client.post(f"/v1/posts/{post['id']}/save", headers=auth(person), json={}).status_code == 200
    response = decide(client, reviewer, "page", page["id"], reason="harassment")
    assert response.status_code == 201, response.text
    for headers in ({}, auth(reader), auth(reviewer)):
        for path in ("/v1/discover/pages", "/v1/discover/pages?q=river", "/v1/discover/posts", "/v1/discover/posts?q=walk"):
            assert client.get(path, headers=headers).json()["data"] == []
        for path in (f"/v1/pages/{page['id']}", f"/v1/pages/{page['handle']}", f"/v1/pages/{page['id']}/posts",
                     f"/v1/posts/{post['id']}", f"/v1/posts/{post['id']}/comments"):
            assert client.get(path, headers=headers).status_code == 404, path
    for path in ("/v1/feed", "/v1/me/following", "/v1/me/saved-posts"):
        assert client.get(path, headers=auth(reader)).json()["data"] == []
    for path in ("/v1/discover/pages", "/v1/discover/pages?q=river", "/v1/me/pages", "/v1/me/following"):
        [visible] = client.get(path, headers=auth(owner)).json()["data"]
        assert visible["moderation"] == {"hidden": True, "reason": "harassment"}
    assert client.get(f"/v1/pages/{page['id']}", headers=auth(owner)).json()["data"]["moderation"]["hidden"] is True
    assert client.get(f"/v1/posts/{post['id']}", headers=auth(owner)).status_code == 200
    assert client.post(f"/v1/pages/{page['id']}/follow", headers=auth(reader), json={}).status_code == 404


def test_hiding_a_comment_hides_counts_and_parent_references_except_for_its_author(client, content):
    owner, reader, reviewer, page, post, _remark = content
    hidden = comment(client, reader, post["id"], "Reader's own text").json()["data"]
    reply = comment(client, owner, post["id"], "Visible reply", parent_id=hidden["id"]).json()["data"]
    response = decide(client, reviewer, "comment", hidden["id"], reason="spam")
    assert response.status_code == 201, response.text
    for headers in ({}, auth(owner), auth(reviewer)):
        listed = client.get(f"/v1/posts/{post['id']}/comments", headers=headers).json()["data"]
        assert hidden["id"] not in str(listed)
        assert next(item for item in listed if item["id"] == reply["id"])["parent_id"] is None
        for path in (f"/v1/posts/{post['id']}", "/v1/discover/posts", f"/v1/pages/{page['id']}/posts"):
            data = client.get(path, headers=headers).json()["data"]
            assert (data[0] if isinstance(data, list) else data)["comment_count"] == 2
    mine = client.get(f"/v1/posts/{post['id']}/comments", headers=auth(reader)).json()["data"]
    assert next(item for item in mine if item["id"] == hidden["id"])["moderation"] == {"hidden": True, "reason": "spam"}
    assert next(item for item in mine if item["id"] == reply["id"])["parent_id"] == hidden["id"]
    assert client.get(f"/v1/posts/{post['id']}", headers=auth(reader)).json()["data"]["comment_count"] == 3
    assert comment(client, owner, post["id"], parent_id=hidden["id"]).status_code == 404


def appeal(client, author, decision_id, note="Please review my content", key=None):
    return client.post(f"/v1/moderation/decisions/{decision_id}/appeal", headers={
        **auth(author), "Idempotency-Key": key or str(uuid4()),
    }, json={"note": note})


def resolve(client, reviewer, appeal_id, outcome="overturned", note="Private resolution note"):
    return client.post(f"/v1/moderation/appeals/{appeal_id}/resolve", headers=auth(reviewer), json={
        "outcome": outcome, "note": note,
    })


def test_appeals_are_author_only_once_per_hide_with_idempotent_replay(client, app, content):
    owner, reader, reviewer, _page, post, _remark = content
    no_action = decide(client, reviewer, "post", post["id"], action="no_action").json()["data"]
    assert appeal(client, owner, no_action["id"]).json()["error"]["code"] == "APPEAL_UNAVAILABLE"
    decision = decide(client, reviewer, "post", post["id"]).json()["data"]
    denied = appeal(client, reader, decision["id"])
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "CONTENT_AUTHOR_REQUIRED"
    key = str(uuid4())
    created = appeal(client, owner, decision["id"], key=key)
    assert created.status_code == 201, created.text
    assert appeal(client, owner, decision["id"], key=key).json()["data"] == created.json()["data"]
    assert appeal(client, owner, decision["id"], note="Changed appeal", key=key).json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    duplicate = appeal(client, owner, decision["id"])
    assert duplicate.status_code == 409 and duplicate.json()["error"]["code"] == "APPEAL_ALREADY_EXISTS"
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(ModerationAppeal)) == 1
        [audit] = database.scalars(select(CommunityAuditEvent).where(CommunityAuditEvent.action == "moderation.appeal_created")).all()
        assert audit.actor_id == owner["user"]["id"]
        assert database.get(OutboxEvent, audit.id).event_type == audit.action


@pytest.mark.parametrize("target_type,index", [("page", 3), ("post", 4), ("comment", 5)])
def test_an_independent_appeal_overturn_restores_every_read_path(client, app, content, target_type, index):
    owner, reader, reviewer, page, post, remark = content
    other = moderator(client, app, "second-moderator@example.test")
    assert client.post(f"/v1/pages/{page['id']}/follow", headers=auth(reader), json={}).status_code == 200
    assert client.post(f"/v1/posts/{post['id']}/save", headers=auth(reader), json={}).status_code == 200
    decision = decide(client, reviewer, target_type, content[index]["id"]).json()["data"]
    created = appeal(client, owner, decision["id"]).json()["data"]
    for response in (client.get("/v1/moderation/appeals", headers=auth(reader)), resolve(client, reader, created["id"])):
        assert response.status_code == 403 and response.json()["error"]["code"] == "MODERATOR_REQUIRED"
    conflicted = resolve(client, reviewer, created["id"])
    assert conflicted.status_code == 409 and conflicted.json()["error"]["code"] == "CONFLICT_OF_INTEREST"
    [queued] = client.get("/v1/moderation/appeals?status=open", headers=auth(other)).json()["data"]
    assert queued["decision"]["id"] == decision["id"] and queued["decision"]["note"] == "Private moderator note"
    assert queued["page_name"] == page["name"]
    restored = resolve(client, other, created["id"])
    assert restored.status_code == 200, restored.text
    assert restored.json()["data"]["status"] == "overturned"
    assert resolve(client, other, created["id"]).json()["data"] == restored.json()["data"]
    assert client.get("/v1/moderation/appeals", headers=auth(other)).json()["data"] == []
    for headers in ({}, auth(reader)):
        assert client.get(f"/v1/pages/{page['id']}", headers=headers).status_code == 200
        assert client.get(f"/v1/posts/{post['id']}", headers=headers).status_code == 200
        for path, identifier in (("/v1/discover/pages", page["id"]), ("/v1/discover/pages?q=river", page["id"]),
                                 ("/v1/discover/posts", post["id"]), ("/v1/discover/posts?q=walk", post["id"]),
                                 (f"/v1/pages/{page['id']}/posts", post["id"]), (f"/v1/posts/{post['id']}/comments", remark["id"])):
            assert identifier in [item["id"] for item in client.get(path, headers=headers).json()["data"]], path
    for path, identifier in (("/v1/feed", post["id"]), ("/v1/me/following", page["id"]), ("/v1/me/saved-posts", post["id"])):
        assert identifier in [item["id"] for item in client.get(path, headers=auth(reader)).json()["data"]]
    assert "moderation" not in client.get(f"/v1/posts/{post['id']}", headers=auth(owner)).json()["data"]
    notices = client.get("/v1/me/moderation-notices", headers=auth(owner)).json()["data"]
    assert {item["action"] for item in notices} == {"hide", "restore"}
    assert next(item for item in notices if item["id"] == decision["id"])["appeal_status"] == "overturned"
    for forbidden in (reviewer["user"]["id"], other["user"]["id"], "Private moderator note", "Private resolution note", "decided_by", "resolved_by"):
        assert forbidden not in str(notices)
    with app.state.sessions() as database:
        [restoration] = database.scalars(select(ModerationDecision).where(ModerationDecision.action == "restore")).all()
        assert restoration.appeal_of == decision["id"] and restoration.decided_by == other["user"]["id"]
        [audit] = database.scalars(select(CommunityAuditEvent).where(CommunityAuditEvent.action == "moderation.restore")).all()
        assert audit.actor_id == other["user"]["id"] and database.get(OutboxEvent, audit.id).event_type == audit.action


def test_upholding_keeps_content_hidden_and_resolution_notes_moderator_only(client, app, content):
    owner, _reader, reviewer, _page, post, _remark = content
    other = moderator(client, app, "second-moderator@example.test")
    decision = decide(client, reviewer, "post", post["id"]).json()["data"]
    created = appeal(client, owner, decision["id"]).json()["data"]
    response = resolve(client, other, created["id"], outcome="upheld")
    assert response.status_code == 200 and response.json()["data"]["status"] == "upheld"
    assert client.get(f"/v1/posts/{post['id']}").status_code == 404
    assert resolve(client, other, created["id"]).json()["error"]["code"] == "APPEAL_ALREADY_RESOLVED"
    [notice] = client.get("/v1/me/moderation-notices", headers=auth(owner)).json()["data"]
    assert notice["appeal_status"] == "upheld" and "Private resolution note" not in str(notice)
    [review] = client.get("/v1/moderation/appeals?status=upheld", headers=auth(other)).json()["data"]
    assert review["resolution_note"] == "Private resolution note"
    with app.state.sessions() as database:
        [audit] = database.scalars(select(CommunityAuditEvent).where(CommunityAuditEvent.action == "moderation.appeal_upheld")).all()
        assert database.get(OutboxEvent, audit.id).actor_id == other["user"]["id"]


def test_reporters_see_only_their_reports_and_reviewed_outcomes(client, content):
    owner, reader, reviewer, page, post, _remark = content
    first = report(client, reader, "post", post["id"])
    second = report(client, reader, "page", page["id"])
    received = client.get("/v1/me/reports", headers=auth(reader)).json()["data"]
    assert {item["status"] for item in received} == {"open"}
    assert all(item["action"] is None and item["outcome"] is None for item in received)
    assert client.get("/v1/me/reports", headers=auth(owner)).json()["data"] == []
    assert decide(client, reviewer, "post", post["id"]).status_code == 201
    assert decide(client, reviewer, "page", page["id"], action="no_action").status_code == 201
    reviewed = client.get("/v1/me/reports", headers=auth(reader)).json()["data"]
    assert {item["status"] for item in reviewed} == {"reviewed"}
    outcomes = {item["id"]: item["outcome"] for item in reviewed}
    assert outcomes == {first["id"]: "action_taken", second["id"]: "no_action"}
    for forbidden in (reviewer["user"]["id"], "Private moderator note", "decided_by", "reporter_id"):
        assert forbidden not in str(reviewed)
    assert client.get("/v1/me/moderation-notices", headers=auth(reader)).json()["data"] == []


def test_cli_adds_removes_and_lists_moderators_by_digest(client, app, capsys):
    from app.cli import main, moderators

    owner = account(client, app)
    capsys.readouterr()
    main(["moderators", "add", "  alex@EXAMPLE.TEST  "], settings=app.state.settings)
    added = capsys.readouterr().out
    assert owner["user"]["id"] in added and "changed=1" in added and "alex" not in added
    assert client.get("/v1/me/moderator", headers=auth(owner)).json()["data"] == {"moderator": True}
    moderators("add", "alex@example.test", settings=app.state.settings)
    assert "changed=0" in capsys.readouterr().out
    main(["moderators", "list"], settings=app.state.settings)
    listed = capsys.readouterr().out
    assert listed.splitlines() == [f"account_id={owner['user']['id']}", "count=1"]
    with app.state.sessions() as session:
        stored = session.get(PlatformModerator, owner["user"]["id"])
        assert stored.added_by == "operator" and stored.added_at is not None
    main(["moderators", "remove", "alex@example.test"], settings=app.state.settings)
    assert "changed=1" in capsys.readouterr().out
    assert client.get("/v1/me/moderator", headers=auth(owner)).json()["data"] == {"moderator": False}
    capsys.readouterr()
    moderators("remove", "alex@example.test", settings=app.state.settings)
    assert "changed=0" in capsys.readouterr().out
    main(["moderators", "list"], settings=app.state.settings)
    assert capsys.readouterr().out == "count=0\n"
    with pytest.raises(SystemExit, match="Account not found"):
        moderators("add", "missing@example.test", settings=app.state.settings)
    with pytest.raises(SystemExit, match="synthetic"):
        moderators("add", "not-an-address", settings=app.state.settings)


def test_moderation_never_reads_or_changes_private_spaces(client, app, content):
    from tests.test_spaces import create_space
    from tests.test_tasks import create_task

    owner, reader, reviewer, page, post, _remark = content
    space = create_space(client, owner, name="Sentinel private family").json()["data"]
    task = create_task(client, owner, space["id"]).json()["data"]
    for target_type in ("page", "post", "comment"):
        assert decide(client, reviewer, target_type, space["id"]).status_code == 404
    refused = client.post("/v1/reports", headers=auth(reader), json={
        "target_type": "page", "target_id": space["id"], "reason": "spam",
    })
    assert refused.status_code == 404
    report(client, reader, "post", post["id"])
    assert "Sentinel private family" not in client.get("/v1/moderation/queue", headers=auth(reviewer)).text
    assert decide(client, reviewer, "page", page["id"]).status_code == 201
    assert client.get(f"/v1/spaces/{space['id']}", headers=auth(owner)).json()["data"] == space
    assert client.get(f"/v1/tasks/{task['id']}", headers=auth(owner)).json()["data"] == task
    for person in (reader, reviewer):
        assert client.get(f"/v1/spaces/{space['id']}", headers=auth(person)).status_code == 404
        assert client.get(f"/v1/tasks/{task['id']}", headers=auth(person)).status_code == 404
    assert client.get("/v1/discover/pages?q=Sentinel").json()["data"] == []


def test_moderation_inputs_are_strict_and_notes_are_bounded(client, content):
    owner, _reader, reviewer, _page, post, _remark = content
    body = {"target_type": "post", "target_id": post["id"], "action": "hide", "reason": "spam"}
    for changed in ({"target_type": "space"}, {"action": "restore"}, {"reason": "dislike"},
                    {"note": "x" * 1001}, {"note": "bad\u0007"}, {"decided_by": owner["user"]["id"]}, {"appeal_of": str(uuid4())}):
        response = client.post("/v1/moderation/decisions", headers={**auth(reviewer), "Idempotency-Key": str(uuid4())}, json={**body, **changed})
        assert response.status_code == 422, (changed, response.text)
    assert client.post("/v1/moderation/decisions", headers=auth(reviewer), json=body).status_code == 422
    assert client.post("/v1/moderation/decisions", headers={**auth(reviewer), "Idempotency-Key": "not-a-uuid"}, json=body).status_code == 422
    decision = decide(client, reviewer, "post", post["id"], note="x" * 1000)
    assert decision.status_code == 201 and len(decision.json()["data"]["note"]) == 1000
    identifier = decision.json()["data"]["id"]
    for payload in ({}, {"note": "x" * 1001}, {"note": "valid", "account_id": owner["user"]["id"]}):
        response = client.post(f"/v1/moderation/decisions/{identifier}/appeal", headers={**auth(owner), "Idempotency-Key": str(uuid4())}, json=payload)
        assert response.status_code == 422
    created = appeal(client, owner, identifier, note="x" * 1000)
    assert created.status_code == 201 and len(created.json()["data"]["note"]) == 1000
    for payload in ({"outcome": "approved"}, {"outcome": "upheld", "note": "x" * 1001}, {"outcome": "upheld", "resolved_by": reviewer["user"]["id"]}):
        response = client.post(f"/v1/moderation/appeals/{created.json()['data']['id']}/resolve", headers=auth(reviewer), json=payload)
        assert response.status_code == 422


def test_all_moderation_operations_declare_and_require_a_session(client):
    schema = client.get("/openapi.json").json()
    for method, path in (("get", "/v1/me/moderator"), ("get", "/v1/moderation/queue"),
                         ("get", "/v1/moderation/appeals"), ("post", "/v1/moderation/decisions"),
                         ("post", "/v1/moderation/decisions/{decision_id}/appeal"),
                         ("post", "/v1/moderation/appeals/{appeal_id}/resolve"),
                         ("get", "/v1/me/moderation-notices"), ("get", "/v1/me/reports")):
        assert schema["paths"][path][method]["security"] == [{"AccountSession": []}]
        concrete = path.replace("{decision_id}", str(uuid4())).replace("{appeal_id}", str(uuid4()))
        response = client.request(method, concrete, json={} if method == "post" else None)
        assert response.status_code == 401, (path, response.text)
    for name in ("CreateDecision", "CreateAppeal", "ResolveAppeal"):
        assert schema["components"]["schemas"][name]["additionalProperties"] is False


def test_queue_cursors_are_moderator_bound_tamper_checked_and_expire(client, app, content):
    _owner, reader, reviewer, page, post, _remark = content
    other = moderator(client, app, "second-moderator@example.test")
    report(client, reader, "page", page["id"])
    report(client, reader, "post", post["id"])
    cursor = client.get("/v1/moderation/queue?limit=1", headers=auth(reviewer)).json()["pagination"]["next_cursor"]
    assert cursor
    assert client.get("/v1/moderation/queue", params={"cursor": cursor}, headers=auth(other)).status_code == 400
    assert client.get("/v1/moderation/queue?cursor=not-a-cursor", headers=auth(reviewer)).status_code == 400
    assert client.get("/v1/moderation/queue?limit=0", headers=auth(reviewer)).status_code == 422
    assert client.get("/v1/moderation/queue?limit=51", headers=auth(reviewer)).status_code == 422
    advance(app, minutes=16)
    assert client.get("/v1/moderation/queue", params={"cursor": cursor}, headers=auth(reviewer)).status_code == 410


def test_concurrent_retries_make_one_decision_and_one_appeal(client, app, content):
    owner, _reader, reviewer, _page, post, _remark = content
    key = str(uuid4())
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _index: decide(client, reviewer, "post", post["id"], key=key), range(2)))
    assert [response.status_code for response in responses] == [201, 201]
    identifier = responses[0].json()["data"]["id"]
    assert responses[1].json()["data"]["id"] == identifier
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _index: appeal(client, owner, identifier), range(2)))
    assert sorted(response.status_code for response in responses) == [201, 409]
    assert next(response for response in responses if response.status_code == 409).json()["error"]["code"] == "APPEAL_ALREADY_EXISTS"
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(ModerationDecision)) == 1
        assert database.scalar(select(func.count()).select_from(ModerationAppeal)) == 1
        assert database.scalar(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.event_type == "moderation.hide")) == 1


def test_page_owner_conflict_covers_other_authors_and_only_the_author_can_appeal(client, app, content):
    owner, reader, reviewer, _page, post, _remark = content
    other_comment = comment(client, reader, post["id"]).json()["data"]
    with app.state.sessions.begin() as database:
        database.add(PlatformModerator(account_id=owner["user"]["id"], added_at=app.state.clock(), added_by="operator"))
        database.get(PublicPost, post["id"]).author_id = reader["user"]["id"]
    for target_type, identifier in (("post", post["id"]), ("comment", other_comment["id"])):
        response = decide(client, owner, target_type, identifier)
        assert response.status_code == 409 and response.json()["error"]["code"] == "CONFLICT_OF_INTEREST"
    decision = decide(client, reviewer, "post", post["id"]).json()["data"]
    # T109: DEC-024 shows hidden content only to its author, so the page owner who did not write it no longer reads it.
    assert client.get(f"/v1/posts/{post['id']}", headers=auth(owner)).status_code == 404
    assert client.get(f"/v1/posts/{post['id']}", headers=auth(reader)).json()["data"]["moderation"]["hidden"] is True
    for person in (owner, reader):
        assert client.get("/v1/me/moderation-notices", headers=auth(person)).json()["data"][0]["id"] == decision["id"]
    assert appeal(client, owner, decision["id"]).status_code == 403
    assert appeal(client, reader, decision["id"]).status_code == 201


def test_overturn_does_not_revive_content_deleted_by_its_author(client, app, content):
    owner, _reader, reviewer, page, post, _remark = content
    other = moderator(client, app, "second-moderator@example.test")
    decision = decide(client, reviewer, "post", post["id"]).json()["data"]
    created = appeal(client, owner, decision["id"]).json()["data"]
    deleted = client.post(f"/v1/posts/{post['id']}/delete", headers={**auth(owner), "If-Match": post["etag"]}, json={})
    assert deleted.status_code == 200, deleted.text
    assert resolve(client, other, created["id"]).status_code == 200
    assert client.get(f"/v1/posts/{post['id']}", headers=auth(owner)).status_code == 404
    assert client.get("/v1/discover/posts").json()["data"] == []
    assert client.get(f"/v1/pages/{page['id']}/posts").json()["data"] == []
    with app.state.sessions() as database:
        stored = database.get(PublicPost, post["id"])
        assert stored.status == "deleted" and stored.body is None and stored.moderation_hidden_at is None


def test_overturn_does_not_clear_an_independent_parent_hiding(client, app, content):
    owner, _reader, reviewer, page, post, _remark = content
    other = moderator(client, app, "second-moderator@example.test")
    decision = decide(client, reviewer, "post", post["id"]).json()["data"]
    created = appeal(client, owner, decision["id"]).json()["data"]
    assert decide(client, reviewer, "page", page["id"], reason="privacy").status_code == 201
    assert resolve(client, other, created["id"]).status_code == 200
    assert client.get(f"/v1/posts/{post['id']}").status_code == 404
    assert client.get("/v1/discover/posts").json()["data"] == []
    assert client.get(f"/v1/pages/{page['id']}", headers=auth(owner)).json()["data"]["moderation"]["reason"] == "privacy"


def moderation_counts(app):
    with app.state.sessions() as database:
        return {model.__tablename__: database.scalar(select(func.count()).select_from(model))
                for model in (ModerationDecision, ModerationAppeal, CommunityAuditEvent, OutboxEvent)}


@pytest.mark.parametrize("operation", ["decision", "appeal", "resolution"])
def test_required_outbox_failure_rolls_back_the_entire_moderation_write(client, app, content, operation):
    owner, reader, reviewer, _page, post, _remark = content
    other = moderator(client, app, "second-moderator@example.test") if operation == "resolution" else None
    reported = report(client, reader, "post", post["id"])
    decision = decide(client, reviewer, "post", post["id"]).json()["data"] if operation != "decision" else None
    created = appeal(client, owner, decision["id"]).json()["data"] if operation == "resolution" else None
    before = moderation_counts(app)
    with app.state.engine.begin() as connection:
        connection.execute(text("CREATE FUNCTION reject_moderation_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type LIKE 'moderation.%' THEN RAISE EXCEPTION 'synthetic moderation failure'; END IF; RETURN NEW; END $$"))
        connection.execute(text("CREATE TRIGGER moderation_outbox_failure BEFORE INSERT ON domain_outbox FOR EACH ROW EXECUTE FUNCTION reject_moderation_outbox()"))
    try:
        if operation == "decision":
            response = decide(client, reviewer, "post", post["id"])
        elif operation == "appeal":
            response = appeal(client, owner, decision["id"])
        else:
            response = resolve(client, other, created["id"])
        assert response.status_code == 503, response.text
    finally:
        with app.state.engine.begin() as connection:
            connection.execute(text("DROP TRIGGER moderation_outbox_failure ON domain_outbox"))
            connection.execute(text("DROP FUNCTION reject_moderation_outbox()"))
    assert moderation_counts(app) == before
    with app.state.sessions() as database:
        stored = database.get(PublicPost, post["id"])
        assert (stored.moderation_hidden_at is not None) == (operation != "decision")
        saved_report = database.get(ContentReport, reported["id"])
        assert saved_report.status == ("received" if operation == "decision" else "closed")
        if operation == "resolution":
            assert database.get(ModerationAppeal, created["id"]).status == "open"


@pytest.mark.parametrize("operation", ["decision", "appeal", "resolution"])
def test_expiry_while_waiting_for_a_row_lock_commits_nothing(client, app, content, operation):
    from tests.test_messaging import expire_while_waiting

    owner, _reader, reviewer, _page, post, _remark = content
    other = moderator(client, app, "second-moderator@example.test") if operation == "resolution" else None
    decision = decide(client, reviewer, "post", post["id"]).json()["data"] if operation != "decision" else None
    created = appeal(client, owner, decision["id"]).json()["data"] if operation == "resolution" else None
    before = moderation_counts(app)
    if operation == "decision":
        response = expire_while_waiting(app, "public_posts", post["id"], lambda: decide(client, reviewer, "post", post["id"]))
    elif operation == "appeal":
        response = expire_while_waiting(app, "moderation_decisions", decision["id"], lambda: appeal(client, owner, decision["id"]))
    else:
        response = expire_while_waiting(app, "moderation_appeals", created["id"], lambda: resolve(client, other, created["id"]))
    assert response.status_code == 401, response.text
    assert moderation_counts(app) == before


def test_queue_counts_and_reasons_share_one_snapshot_while_reports_close(client, app, content):
    from sqlalchemy import event

    from app.modules.safety.schemas import CreateDecision
    from app.modules.safety.service import SafetyService

    _owner, reader, reviewer, _page, post, _remark = content
    second_reader = account(client, app, "second-reader@example.test")
    report(client, reader, "post", post["id"], "spam")
    report(client, second_reader, "post", post["id"], "privacy")
    decisions = []

    def close_reports_after_grouping(_connection, _cursor, statement, _parameters, _context, _many):
        if not decisions and "AS first_reported_at" in statement and "LIMIT" in statement:
            decisions.append(None)
            decisions[0] = SafetyService(app.state.identity).decide(
                reviewer["session_token"], CreateDecision(
                    target_type="post", target_id=post["id"], action="no_action", reason="spam",
                ), str(uuid4()),
            )

    event.listen(app.state.engine, "after_cursor_execute", close_reports_after_grouping)
    try:
        response = client.get("/v1/moderation/queue", headers=auth(reviewer))
    finally:
        event.remove(app.state.engine, "after_cursor_execute", close_reports_after_grouping)
    assert len(decisions) == 1 and decisions[0] is not None
    assert response.status_code == 200, response.text
    [queued] = response.json()["data"]
    assert queued["report_count"] == 2
    assert queued["reasons"] == [{"reason": "privacy", "count": 1}, {"reason": "spam", "count": 1}]
    assert client.get("/v1/moderation/queue", headers=auth(reviewer)).json()["data"] == []

def test_an_appeal_needs_a_note(client, content):
    # T103: DEC-024 has the author appeal "with a short note", and both apps show an appeal only with one.
    owner, _reader, reviewer, _page, post, _remark = content
    decision = decide(client, reviewer, "post", post["id"]).json()["data"]
    for note in ("", "   ", "\n"):
        response = appeal(client, owner, decision["id"], note=note)
        assert response.status_code == 422, (note, response.text)
    assert appeal(client, owner, decision["id"]).status_code == 201


def test_the_queue_and_appeals_show_nothing_of_a_deleted_page(client, app, content):
    # T115 (1): DEC-025 hides a deleted page and everything on it from everyone but its owner at once, moderators too.
    from tests.test_page_lifecycle import delete

    owner, reader, reviewer, page, post, remark = content
    other = moderator(client, app, "second-moderator@example.test")
    for target_type, target_id in (("page", page["id"]), ("comment", remark["id"])):
        report(client, reader, target_type, target_id)
    decision = decide(client, reviewer, "post", post["id"]).json()["data"]
    assert appeal(client, owner, decision["id"]).status_code == 201
    current = client.get(f"/v1/pages/{page['id']}", headers=auth(owner)).json()["data"]
    assert delete(client, owner, page, etag=current["etag"]).status_code == 200

    queue = client.get("/v1/moderation/queue", headers=auth(other))
    appeals = client.get("/v1/moderation/appeals?status=open", headers=auth(other))
    listed = queue.json()["data"] + appeals.json()["data"]
    assert len(listed) == 3
    assert [(item["preview"]["status"], item["page_name"]) for item in listed] == [("unavailable", None)] * 3
    for response in (queue, appeals):
        for shown in (page["name"], page["handle"], page["description"], post["body"], remark["body"]):
            assert shown not in response.text, shown

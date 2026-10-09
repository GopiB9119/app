from datetime import timedelta
from uuid import uuid4

from sqlalchemy import func, select, update

from app.modules.community.models import HelpPost, HelpReply, HelpReport, PublicPage
from app.modules.identity.models import OutboxEvent, User
from tests.test_community import comment, create_page, published
from tests.test_identity import account, auth


def open_help(client, owner, page, opened=True):
    reviewed = client.get(f"/v1/pages/{page['id']}", headers=auth(owner)).json()["data"]
    response = client.patch(f"/v1/pages/{page['id']}", headers={**auth(owner), "If-Match": reviewed["etag"]}, json={"help_open": opened})
    assert response.status_code == 200, response.text
    return response.json()["data"]


def follow(client, person, page):
    response = client.post(f"/v1/pages/{page['id']}/follow", headers=auth(person), json={})
    assert response.status_code == 200, response.text


def post_help(client, person, page_id, key=None, **fields):
    body = {"kind": "request", "title": "Need a ride to the clinic", "details": "Saturday morning, two people.", **fields}
    return client.post(f"/v1/pages/{page_id}/help-posts", headers={**auth(person), "Idempotency-Key": key or str(uuid4())}, json=body)


def reply(client, person, post_id, body="I can drive you at 9.", key=None):
    return client.post(f"/v1/help-posts/{post_id}/replies", headers={**auth(person), "Idempotency-Key": key or str(uuid4())}, json={"body": body})


def resolve(client, person, post, outcome="helped", reply_id=None, etag=None):
    body = {"outcome": outcome} if reply_id is None else {"outcome": outcome, "reply_id": reply_id}
    return client.post(f"/v1/help-posts/{post['id']}/resolve", headers={**auth(person), "If-Match": etag or post["etag"]}, json=body)


def page_list(client, page, person=None, **query):
    response = client.get(f"/v1/pages/{page['id']}/help-posts", headers=auth(person) if person else {}, params=query)
    assert response.status_code == 200, response.text
    return response.json()["data"]


def report_help(client, person, post_id, reason="scam", details=""):
    return client.post(f"/v1/help-posts/{post_id}/report", headers=auth(person), json={"reason": reason, "details": details})


def community(client, app):
    owner = account(client, app)
    asker = account(client, app, "asker@example.test")
    helper = account(client, app, "helper@example.test")
    page = create_page(client, owner, handle="street-helpers", name="Street Helpers").json()["data"]
    return owner, asker, helper, page


def test_a_page_takes_help_posts_only_when_its_owner_opens_it_and_only_from_followers(client, app):
    owner, asker, _helper, page = community(client, app)
    assert page["help_open"] is False
    closed = post_help(client, asker, page["id"])
    assert closed.status_code == 409 and closed.json()["error"]["code"] == "HELP_CLOSED"
    assert open_help(client, owner, page)["help_open"] is True
    assert client.get(f"/v1/pages/{page['id']}").json()["data"]["help_open"] is True
    stranger = post_help(client, asker, page["id"])
    assert stranger.status_code == 403 and stranger.json()["error"]["code"] == "FOLLOW_REQUIRED"
    follow(client, asker, page)
    key = str(uuid4())
    created = post_help(client, asker, page["id"], key=key, place="in-telangana-hyderabad")
    assert created.status_code == 201, created.text
    post = created.json()["data"]
    assert (post["kind"], post["status"], post["place"], post["reply_count"]) == ("request", "open", "in-telangana-hyderabad", 0)
    assert post["mine"] is True and post["can_manage"] is False and post["etag"].startswith('"')
    assert post_help(client, asker, page["id"], key=key, place="in-telangana-hyderabad").json()["data"]["id"] == post["id"]
    changed = post_help(client, asker, page["id"], key=key, title="Something else")
    assert changed.status_code == 409 and changed.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    offer = post_help(client, owner, page["id"], kind="offer", title="Spare chairs for events")
    assert offer.status_code == 201, offer.text
    listed = page_list(client, page)
    assert {item["id"] for item in listed} == {offer.json()["data"]["id"], post["id"]}
    assert all(item["mine"] is False and item["etag"] is None and item["helped_reply_id"] is None for item in listed)
    assert [item["id"] for item in page_list(client, page, kind="offer")] == [offer.json()["data"]["id"]]
    assert [item["id"] for item in client.get("/v1/me/help-posts", headers=auth(asker)).json()["data"]] == [post["id"]]
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.event_type == "public.help_posted")) == 2
    open_help(client, owner, page, opened=False)
    again = post_help(client, asker, page["id"], title="Another ride")
    assert again.status_code == 409 and again.json()["error"]["code"] == "HELP_CLOSED"
    assert len(page_list(client, page)) == 2


def test_public_help_posts_leave_out_contact_details_and_need_sensible_dates(client, app):
    owner, asker, _helper, page = community(client, app)
    open_help(client, owner, page)
    follow(client, asker, page)
    for text in ("See https://example.test/form", "Call 98480 12345", "Call +91-9848012345", "Mail asha@example.test",
                 "Order on shop.example.com", "WhatsApp +44 7700900123", "visit www.example.test"):
        refused = post_help(client, asker, page["id"], details=text)
        assert refused.status_code == 422, text
    assert post_help(client, asker, page["id"], title="Call 9848012345 now").status_code == 422
    today = app.state.clock.now.date()
    assert post_help(client, asker, page["id"], kind="offer", need_by=str(today + timedelta(days=3))).status_code == 422
    for day in (today - timedelta(days=2), today + timedelta(days=182)):
        late = post_help(client, asker, page["id"], need_by=str(day))
        assert late.status_code == 422 and late.json()["error"]["code"] == "NEED_BY_OUT_OF_RANGE", day
    unknown = post_help(client, asker, page["id"], place="atlantis")
    assert unknown.status_code == 422 and unknown.json()["error"]["code"] == "TERM_UNAVAILABLE"
    fine = post_help(client, asker, page["id"], details="Flat 302, block 5. Needed by 2026-10-08 at 10:30.",
                     need_by=str(today + timedelta(days=3)))
    assert fine.status_code == 201, fine.text
    assert fine.json()["data"]["need_by"] == str(today + timedelta(days=3))


def test_replies_stay_private_to_the_replier_the_author_and_the_page_managers(client, app):
    owner, asker, helper, page = community(client, app)
    stranger = account(client, app, "stranger@example.test")
    open_help(client, owner, page)
    follow(client, asker, page)
    post = post_help(client, asker, page["id"]).json()["data"]
    key = str(uuid4())
    sent = reply(client, helper, post["id"], "I can drive. Call me on 98480 12345.", key=key)
    assert sent.status_code == 201, sent.text
    answer = sent.json()["data"]
    assert (answer["status"], answer["mine"], answer["helped"]) == ("active", True, False)
    assert reply(client, helper, post["id"], "I can drive. Call me on 98480 12345.", key=key).json()["data"]["id"] == answer["id"]
    twice = reply(client, helper, post["id"], "Another offer")
    assert twice.status_code == 409 and twice.json()["error"]["code"] == "HELP_REPLY_EXISTS"
    own = reply(client, asker, post["id"])
    assert own.status_code == 409 and own.json()["error"]["code"] == "OWN_HELP_POST"
    path = f"/v1/help-posts/{post['id']}/replies"
    assert client.get(path).status_code == 401
    assert client.get(path, headers=auth(stranger)).json()["data"] == []
    for person in (helper, asker, owner):
        assert [item["body"] for item in client.get(path, headers=auth(person)).json()["data"]] == ["I can drive. Call me on 98480 12345."]
    assert client.get(f"/v1/help-posts/{post['id']}").json()["data"]["reply_count"] == 1
    assert client.get(f"/v1/help-posts/{post['id']}", headers=auth(helper)).json()["data"]["replied"] is True
    assert client.post(f"/v1/help-replies/{answer['id']}/end", headers=auth(stranger), json={}).status_code == 404
    withdrawn = client.post(f"/v1/help-replies/{answer['id']}/end", headers=auth(helper), json={})
    assert withdrawn.status_code == 200, withdrawn.text
    assert (withdrawn.json()["data"]["status"], withdrawn.json()["data"]["body"]) == ("withdrawn", None)
    assert client.get(path, headers=auth(asker)).json()["data"] == []
    assert client.get(f"/v1/help-posts/{post['id']}").json()["data"]["reply_count"] == 0
    second = reply(client, helper, post["id"], "Still free on Saturday")
    assert second.status_code == 201, second.text
    cleared = client.post(f"/v1/help-replies/{second.json()['data']['id']}/end", headers=auth(asker), json={})
    assert cleared.json()["data"]["status"] == "removed"
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(HelpReply).where(HelpReply.body.is_not(None))) == 0


def test_the_author_marks_a_post_helped_or_closed_from_the_reviewed_version(client, app):
    owner, asker, helper, page = community(client, app)
    open_help(client, owner, page)
    follow(client, asker, page)
    post = post_help(client, asker, page["id"]).json()["data"]
    answer = reply(client, helper, post["id"]).json()["data"]
    no_review = client.post(f"/v1/help-posts/{post['id']}/resolve", headers=auth(asker), json={"outcome": "helped"})
    assert no_review.status_code == 428
    assert resolve(client, helper, post, reply_id=answer["id"]).status_code == 403
    assert resolve(client, asker, post, outcome="closed", reply_id=answer["id"]).status_code == 422
    helped = resolve(client, asker, post, reply_id=answer["id"])
    assert helped.status_code == 200, helped.text
    data = helped.json()["data"]
    assert (data["status"], data["helped_reply_id"]) == ("helped", answer["id"]) and data["ended_at"] is not None
    stale = resolve(client, asker, post, outcome="closed")
    assert stale.status_code == 412
    ended = resolve(client, asker, post, outcome="closed", etag=data["etag"])
    assert ended.status_code == 409 and ended.json()["error"]["code"] == "HELP_POST_ENDED"
    late = reply(client, owner, post["id"])
    assert late.status_code == 409 and late.json()["error"]["code"] == "HELP_POST_ENDED"
    assert client.get(f"/v1/help-posts/{post['id']}").json()["data"]["helped_reply_id"] is None
    assert page_list(client, page) == []
    assert [item["status"] for item in page_list(client, page, state="all")] == ["helped"]
    assert [item["helped"] for item in client.get(f"/v1/help-posts/{post['id']}/replies", headers=auth(helper)).json()["data"]] == [True]
    other = post_help(client, asker, page["id"], title="Need a ladder").json()["data"]
    closed = resolve(client, asker, other, outcome="closed")
    assert closed.status_code == 200 and closed.json()["data"]["status"] == "closed"


def test_managers_remove_posts_and_authors_delete_them_and_the_replies_end(client, app):
    owner, asker, helper, page = community(client, app)
    open_help(client, owner, page)
    follow(client, asker, page)
    post = post_help(client, asker, page["id"]).json()["data"]
    reply(client, helper, post["id"])
    managed = client.get(f"/v1/help-posts/{post['id']}", headers=auth(owner)).json()["data"]
    assert managed["can_manage"] is True and managed["etag"] == post["etag"]
    path = f"/v1/help-posts/{post['id']}/remove"
    assert client.post(path, headers={**auth(helper), "If-Match": post["etag"]}, json={}).status_code == 403
    removed = client.post(path, headers={**auth(owner), "If-Match": managed["etag"]}, json={})
    assert removed.status_code == 200, removed.text
    assert (removed.json()["data"]["status"], removed.json()["data"]["details"], removed.json()["data"]["reply_count"]) == ("removed", None, 0)
    assert client.get(f"/v1/help-posts/{post['id']}").status_code == 404
    assert client.get(f"/v1/help-posts/{post['id']}", headers=auth(asker)).json()["data"]["status"] == "removed"
    assert page_list(client, page, state="all") == []
    assert client.get(f"/v1/help-posts/{post['id']}/replies", headers=auth(helper)).status_code == 404
    with app.state.sessions() as database:
        ended = database.scalars(select(HelpReply).where(HelpReply.post_id == post["id"])).all()
        assert [(item.status, item.body) for item in ended] == [("removed", None)]
    second = post_help(client, asker, page["id"], title="Need a ladder").json()["data"]
    assert client.post(f"/v1/help-posts/{second['id']}/delete", headers={**auth(owner), "If-Match": second["etag"]}, json={}).status_code == 403
    deleted = client.post(f"/v1/help-posts/{second['id']}/delete", headers={**auth(asker), "If-Match": second["etag"]}, json={})
    assert deleted.status_code == 200 and deleted.json()["data"] == {"id": second["id"], "status": "deleted"}
    assert client.get(f"/v1/help-posts/{second['id']}", headers=auth(asker)).status_code == 404
    assert [item["status"] for item in client.get("/v1/me/help-posts", headers=auth(asker)).json()["data"]] == ["removed"]
    with app.state.sessions() as database:
        erased = database.get(HelpPost, second["id"])
        assert (erased.title, erased.details, erased.status) == (None, None, "deleted")


def test_reports_reach_the_page_managers_who_keep_or_remove_the_post(client, app):
    owner, asker, helper, page = community(client, app)
    stranger = account(client, app, "stranger@example.test")
    open_help(client, owner, page)
    follow(client, asker, page)
    post = post_help(client, asker, page["id"]).json()["data"]
    assert client.post(f"/v1/help-posts/{post['id']}/report", json={"reason": "scam"}).status_code == 401
    assert report_help(client, helper, post["id"], reason="fake").status_code == 422
    own = report_help(client, asker, post["id"])
    assert own.status_code == 409 and own.json()["error"]["code"] == "OWN_CONTENT"
    first = report_help(client, helper, post["id"], details="Asks for money before helping.")
    assert first.status_code == 201, first.text
    assert (first.json()["data"]["reason"], first.json()["data"]["status"]) == ("scam", "received")
    assert report_help(client, helper, post["id"], reason="spam").json()["data"]["id"] == first.json()["data"]["id"]
    assert report_help(client, stranger, post["id"], reason="spam").status_code == 201
    # Only the page's owner and moderators see the reports; the reporter only sees that theirs is waiting.
    seen = client.get(f"/v1/help-posts/{post['id']}", headers=auth(helper)).json()["data"]
    assert (seen["reported"], seen["reports"]) == (True, None)
    authored = client.get(f"/v1/help-posts/{post['id']}", headers=auth(asker)).json()["data"]
    assert (authored["reported"], authored["reports"]) == (False, None)
    assert client.get(f"/v1/help-posts/{post['id']}").json()["data"]["reports"] is None
    managed = page_list(client, page, owner)[0]
    assert managed["reports"] == [{"reason": "scam", "count": 1}, {"reason": "spam", "count": 1}]
    notes = client.get(f"/v1/help-posts/{post['id']}/reports", headers=auth(owner))
    assert notes.status_code == 200, notes.text
    assert sorted((item["reason"], item["details"]) for item in notes.json()["data"]) == [("scam", "Asks for money before helping."), ("spam", None)]
    assert "reporter" not in str(notes.json()["data"])
    assert client.get(f"/v1/help-posts/{post['id']}/reports", headers=auth(helper)).status_code == 403
    keep = f"/v1/help-posts/{post['id']}/keep"
    assert client.post(keep, headers={**auth(helper), "If-Match": managed["etag"]}, json={"reports": 2}).status_code == 403
    assert client.post(keep, headers=auth(owner), json={"reports": 2}).status_code == 428
    stale = client.post(keep, headers={**auth(owner), "If-Match": managed["etag"]}, json={"reports": 1})
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "REPORTS_CHANGED"
    kept = client.post(keep, headers={**auth(owner), "If-Match": managed["etag"]}, json={"reports": 2})
    assert kept.status_code == 200, kept.text
    assert (kept.json()["data"]["status"], kept.json()["data"]["reports"]) == ("open", [])
    assert client.get(f"/v1/help-posts/{post['id']}", headers=auth(helper)).json()["data"]["reported"] is False
    again = report_help(client, helper, post["id"], reason="harassment")
    assert again.status_code == 201 and again.json()["data"]["id"] != first.json()["data"]["id"]
    removed = client.post(f"/v1/help-posts/{post['id']}/remove", headers={**auth(owner), "If-Match": managed["etag"]}, json={})
    assert removed.status_code == 200, removed.text
    assert report_help(client, stranger, post["id"]).status_code == 404
    with app.state.sessions() as database:
        outcomes = database.execute(select(HelpReport.reason, HelpReport.status, HelpReport.outcome).where(
            HelpReport.post_id == post["id"],
        )).all()
        assert sorted(outcomes) == [("harassment", "closed", "removed"), ("scam", "closed", "kept"), ("spam", "closed", "kept")]
        assert database.scalar(select(func.count()).select_from(OutboxEvent).where(
            OutboxEvent.event_type == "safety.help_report_received",
        )) == 3
    # The author deleting a post closes the reports on it too.
    second = post_help(client, asker, page["id"], title="Need a ladder").json()["data"]
    assert report_help(client, helper, second["id"]).status_code == 201
    assert client.post(f"/v1/help-posts/{second['id']}/delete", headers={**auth(asker), "If-Match": second["etag"]}, json={}).status_code == 200
    with app.state.sessions() as database:
        assert database.scalar(select(HelpReport.outcome).where(HelpReport.post_id == second["id"])) == "deleted"


def test_metrics_count_posts_answers_quick_help_and_waiting_reports(client, app):
    owner, asker, helper, page = community(client, app)
    open_help(client, owner, page)
    follow(client, asker, page)
    post = post_help(client, asker, page["id"]).json()["data"]
    answer = reply(client, helper, post["id"]).json()["data"]
    assert resolve(client, asker, post, reply_id=answer["id"]).status_code == 200
    assert post_help(client, owner, page["id"], kind="offer", title="Spare chairs").status_code == 201
    assert report_help(client, helper, post["id"]).status_code == 201
    app.state.settings.metrics_key = "synthetic-metrics-key"
    scraped = client.get("/metrics", headers={"Authorization": "Bearer synthetic-metrics-key"})
    assert scraped.status_code == 200, scraped.text
    lines = set(scraped.text.splitlines())
    for expected in (
        'community_help_posts{kind="request",status="helped"} 1', 'community_help_posts{kind="offer",status="open"} 1',
        'community_help_posts{kind="request",status="open"} 0', 'community_help_posts_answered{kind="request"} 1',
        'community_help_posts_answered{kind="offer"} 0', 'community_help_posts_helped_within_48h{kind="request"} 1',
        "community_help_reports_open 1", "community_help_query_success 1",
    ):
        assert expected in lines, expected


def test_new_accounts_wait_for_review_on_busy_pages(client, app):
    owner, asker, helper, page = community(client, app)
    open_help(client, owner, page)
    follow(client, asker, page)
    with app.state.sessions.begin() as database:
        database.execute(update(PublicPage).where(PublicPage.id == page["id"]).values(follower_count=50))
    held = post_help(client, asker, page["id"]).json()["data"]
    assert held["status"] == "pending"
    assert page_list(client, page) == [] and page_list(client, page, helper) == []
    assert [item["id"] for item in page_list(client, page, asker)] == [held["id"]]
    assert [item["status"] for item in page_list(client, page, owner)] == ["pending"]
    assert [item["id"] for item in client.get("/v1/me/help-review", headers=auth(owner)).json()["data"]] == [held["id"]]
    assert client.get(f"/v1/help-posts/{held['id']}").status_code == 404
    assert reply(client, helper, held["id"]).status_code == 404
    waiting = resolve(client, asker, held)
    assert waiting.status_code == 409 and waiting.json()["error"]["code"] == "HELP_POST_PENDING"
    approve = f"/v1/help-posts/{held['id']}/approve"
    assert client.post(approve, headers={**auth(asker), "If-Match": held["etag"]}, json={}).status_code == 403
    approved = client.post(approve, headers={**auth(owner), "If-Match": held["etag"]}, json={})
    assert approved.status_code == 200 and approved.json()["data"]["status"] == "open"
    assert [item["id"] for item in page_list(client, page)] == [held["id"]]
    assert reply(client, helper, held["id"]).status_code == 201
    again = client.post(approve, headers={**auth(owner), "If-Match": approved.json()["data"]["etag"]}, json={})
    assert again.status_code == 409 and again.json()["error"]["code"] == "HELP_POST_NOT_PENDING"
    # Older accounts and the page's own managers are not held.
    queue = client.get("/v1/me/help-review", headers=auth(owner))
    assert queue.status_code == 200 and queue.json()["data"] == []
    assert report_help(client, helper, held["id"]).status_code == 201
    assert [item["id"] for item in client.get("/v1/me/help-review", headers=auth(owner)).json()["data"]] == [held["id"]]
    assert client.get("/v1/me/help-review", headers=auth(helper)).json()["data"] == []
    with app.state.sessions.begin() as database:
        database.execute(update(User).where(User.id == asker["user"]["id"]).values(created_at=app.state.clock.now - timedelta(days=31)))
    assert post_help(client, asker, page["id"], title="Need a ladder").json()["data"]["status"] == "open"
    assert post_help(client, owner, page["id"], kind="offer", title="Spare chairs").json()["data"]["status"] == "open"


def test_new_accounts_are_marked_as_new_on_posts_and_replies(client, app):
    owner, asker, helper, page = community(client, app)
    open_help(client, owner, page)
    follow(client, asker, page)
    post = post_help(client, asker, page["id"]).json()["data"]
    assert post["author_new"] is True
    assert reply(client, helper, post["id"]).json()["data"]["author_new"] is True
    with app.state.sessions.begin() as database:
        database.execute(update(User).where(User.id == asker["user"]["id"]).values(created_at=app.state.clock.now - timedelta(days=31)))
    assert page_list(client, page)[0]["author_new"] is False
    assert [item["author_new"] for item in client.get(f"/v1/help-posts/{post['id']}/replies", headers=auth(asker)).json()["data"]] == [True]


def test_blocks_and_limits_keep_help_posts_bounded(client, app):
    owner, asker, helper, page = community(client, app)
    troll = account(client, app, "troll@example.test")
    open_help(client, owner, page)
    for person in (asker, troll):
        follow(client, person, page)
    trolled = post_help(client, troll, page["id"], title="Troll asks").json()["data"]
    reader_view = [item["id"] for item in page_list(client, page, asker)]
    assert trolled["id"] in reader_view
    rude = comment(client, troll, published(client, owner, page["id"])["id"], "Rude remark").json()["data"]
    for blocker in (owner, asker):
        blocked = client.post("/v1/blocks", headers=auth(blocker), json={"target_type": "comment_author", "target_id": rude["id"]})
        assert blocked.status_code == 201, blocked.text
    assert trolled["id"] not in [item["id"] for item in page_list(client, page, asker)]
    assert client.get(f"/v1/help-posts/{trolled['id']}", headers=auth(asker)).status_code == 404
    # A post hidden by the reader's own block stays hidden when answered from an old link.
    hidden = reply(client, asker, trolled["id"])
    assert hidden.status_code == 404, hidden.text
    stopped = post_help(client, troll, page["id"], title="Again")
    assert stopped.status_code == 403 and stopped.json()["error"]["code"] == "POSTING_UNAVAILABLE"
    post = post_help(client, asker, page["id"]).json()["data"]
    refused = reply(client, troll, post["id"])
    assert refused.status_code == 403 and refused.json()["error"]["code"] == "REPLYING_UNAVAILABLE"
    posts = [post] + [post_help(client, asker, page["id"], title=f"Need help {index}").json()["data"] for index in range(4)]
    limit = post_help(client, asker, page["id"], title="One more")
    assert limit.status_code == 409 and limit.json()["error"]["code"] == "HELP_OPEN_LIMIT"
    assert resolve(client, asker, posts[0], outcome="closed").status_code == 200
    busy = post_help(client, asker, page["id"], title="One more")
    assert busy.status_code == 429 and busy.json()["error"]["code"] == "HELP_RATE_LIMITED"
    with app.state.sessions.begin() as database:
        database.execute(update(HelpPost).values(created_at=app.state.clock.now - timedelta(days=1, seconds=1)))
    assert post_help(client, asker, page["id"], title="One more").status_code == 201

"""Topics on single posts and posts from a person's interests (DEC-036, T129)."""

from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import func, select, text

from app.modules.community.models import PostTerm
from tests.test_account_deletion import request_deletion
from tests.test_community import advance, publish
from tests.test_community_classification import chosen, page, set_status
from tests.test_identity import account, auth
from tests.test_moderation import decide, moderator
from tests.test_page_lifecycle import delete


def draft(client, owner, page_id, body="A note.", key=None, **terms):
    return client.post(
        f"/v1/pages/{page_id}/posts", headers={**auth(owner), "Idempotency-Key": key or str(uuid4())},
        json={"title": None, "body": body, **terms},
    )


def post(client, owner, page_id, body, **terms):
    response = draft(client, owner, page_id, body, **terms)
    assert response.status_code == 201, response.text
    return publish(client, owner, response.json()["data"])


def change(client, owner, current, **body):
    return client.patch(f"/v1/posts/{current['id']}", headers={**auth(owner), "If-Match": current["etag"]}, json=body)


def listed(client, person, **params):
    response = client.get("/v1/me/interest-posts", headers=auth(person), params=params)
    assert response.status_code == 200, response.text
    return response.json()


def reason(dimension, code):
    return {"dimension": dimension, "code": code}


def tagged_rows(app):
    with app.state.sessions() as database:
        return database.scalar(select(func.count()).select_from(PostTerm))


def test_the_owner_gives_a_post_topics_and_interests_and_everyone_sees_them(client, app):
    owner, reader = account(client, app), account(client, app, "reader@example.test")
    club = page(client, owner, "compost-club", "environment")
    key = str(uuid4())
    made = draft(client, owner, club["id"], "Leaves make good compost.", key=key, topics=["food"], interests=["composting", "gardening"])
    assert made.status_code == 201, made.text
    created = made.json()["data"]
    assert (created["topics"], created["interests"]) == (["food"], ["composting", "gardening"])
    # The same request again is the same post; other topics under the same key are a different request.
    again = draft(client, owner, club["id"], "Leaves make good compost.", key=key, topics=["food"], interests=["composting", "gardening"])
    assert again.json()["data"]["id"] == created["id"]
    other = draft(client, owner, club["id"], "Leaves make good compost.", key=key, topics=["sports"])
    assert other.status_code == 409 and other.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    for wrong in ({"interests": ["no-such-thing"]}, {"topics": ["composting"]}, {"topics": ["a", "b", "c", "d"]}, {"interests": ["cricket", "cricket"]}):
        refused = draft(client, owner, club["id"], **wrong)
        assert refused.status_code == 422, (wrong, refused.text)
    assert draft(client, owner, club["id"], interests=["no-such-thing"]).json()["error"]["details"] == {"field": "interests", "codes": "no-such-thing"}
    # A post written before DEC-036, or without topics, has none of its own.
    plain = draft(client, owner, club["id"], "No topics here.").json()["data"]
    assert (plain["topics"], plain["interests"]) == ([], [])

    published = publish(client, owner, created)
    seen = client.get(f"/v1/posts/{created['id']}", headers=auth(reader)).json()["data"]
    assert (seen["topics"], seen["interests"]) == (["food"], ["composting", "gardening"])
    assert client.get("/v1/discover/posts").json()["data"][0]["interests"] == ["composting", "gardening"]

    # Editing replaces only the lists sent; [] empties one; null is refused; it is a reviewed edit like the text.
    assert change(client, owner, published, topics=None).status_code == 422
    assert change(client, owner, {**published, "etag": '"stale"'}, topics=[]).status_code == 412
    edited = change(client, owner, published, topics=[], interests=["gardening"])
    assert edited.status_code == 200, edited.text
    edited = edited.json()["data"]
    assert (edited["topics"], edited["interests"], edited["title"]) == ([], ["gardening"], None)
    assert edited["etag"] != published["etag"] and edited["edited_at"] is not None
    same = change(client, owner, edited, interests=["gardening"]).json()["data"]
    assert same["etag"] == edited["etag"]

    # A retired interest stays on the post that has it, but no post can be given it again.
    set_status(app, "interest", "gardening", "retired")
    try:
        kept = change(client, owner, same, body="Leaves and peel make good compost.").json()["data"]
        assert kept["interests"] == ["gardening"]
        assert change(client, owner, kept, interests=["gardening", "composting"]).status_code == 200
        refused = draft(client, owner, club["id"], interests=["gardening"])
        assert refused.status_code == 422 and refused.json()["error"]["code"] == "TERM_UNAVAILABLE"
    finally:
        set_status(app, "interest", "gardening", "active")


def test_posts_from_your_interests_come_newest_first_and_say_why(client, app):
    owner = account(client, app, "owner@example.test")
    alex, sam = account(client, app, "alex@example.test"), account(client, app, "sam@example.test")
    compost = page(client, owner, "compost-club", "environment", interests=["composting"])
    cooks = page(client, owner, "cook-club", "food")
    cricket = page(client, owner, "cricket-fans", "sports", interests=["cricket"])
    alex_own = page(client, alex, "alex-greens", "environment")

    def later():
        advance(app, minutes=1)

    tagged = post(client, owner, cooks["id"], "Kitchen scraps into compost.", interests=["composting"])
    later()
    untagged = post(client, owner, compost["id"], "Turn the heap weekly.")
    later()
    elsewhere = post(client, owner, compost["id"], "Our cricket match.", topics=["sports"])
    later()
    post(client, owner, cricket["id"], "Nets on Sunday.")
    later()
    under_topic = post(client, owner, cooks["id"], "Herbs for the kitchen.", interests=["gardening"])
    later()
    above_interest = post(client, owner, cooks["id"], "Greener cooking.", topics=["environment"])
    later()
    post(client, alex, alex_own["id"], "Alex's own post.")
    assert draft(client, owner, compost["id"], "A draft about composting.").status_code == 201

    chosen(client, alex, topics=["environment"], interests=["composting"], places=["in-telangana"])
    found = listed(client, alex)
    # A post's own topics and interests decide; a post with none is about its page's. An interest under a chosen topic
    # counts. Alex's own page, drafts, other subjects and a post whose own topic is sports are left out.
    assert [(item["post"]["id"], item["reasons"]) for item in found["data"]] == [
        (above_interest["id"], [reason("topic", "environment")]),
        (under_topic["id"], [reason("topic", "environment")]),
        (untagged["id"], [reason("interest", "composting"), reason("topic", "environment")]),
        (tagged["id"], [reason("interest", "composting")]),
    ]
    assert elsewhere["id"] not in {item["post"]["id"] for item in found["data"]}
    assert found["pagination"] == {"next_cursor": None, "has_more": False}
    assert found["data"][0]["post"]["topics"] == ["environment"] and found["data"][0]["post"]["can_manage"] is False

    # Choosing only composting does not bring every environment post: the topic above an interest does not count.
    chosen(client, sam, interests=["composting"])
    assert [item["post"]["id"] for item in listed(client, sam)["data"]] == [untagged["id"], tagged["id"]]

    # Pages follow the list's own rules: two at a time, and a list changed by new choices starts again.
    first = listed(client, alex, limit=2)
    assert [item["post"]["id"] for item in first["data"]] == [above_interest["id"], under_topic["id"]]
    assert first["pagination"]["has_more"] is True
    rest = listed(client, alex, limit=2, cursor=first["pagination"]["next_cursor"])
    assert [item["post"]["id"] for item in rest["data"]] == [untagged["id"], tagged["id"]]
    assert client.get("/v1/me/interest-posts", headers=auth(sam), params={"cursor": first["pagination"]["next_cursor"]}).status_code == 400
    chosen(client, alex, topics=["environment"], interests=[])
    stale = client.get("/v1/me/interest-posts", headers=auth(alex), params={"cursor": first["pagination"]["next_cursor"]})
    assert stale.status_code == 400 and stale.json()["error"]["code"] == "CURSOR_INVALID"

    # A blocked page and a hidden post leave the list; places and languages alone choose nothing.
    assert client.post("/v1/blocks", headers=auth(alex), json={"target_type": "page", "target_id": compost["id"]}).status_code == 201
    reviewer = moderator(client, app)
    assert decide(client, reviewer, "post", above_interest["id"]).status_code == 201
    assert [item["post"]["id"] for item in listed(client, alex)["data"]] == [under_topic["id"], tagged["id"]]
    chosen(client, alex, places=["in-telangana"], languages=["te"])
    nothing = listed(client, alex)
    assert (nothing["data"], nothing["pagination"]) == ([], {"next_cursor": None, "has_more": False})

    assert client.get("/v1/me/interest-posts").status_code == 401
    assert client.get("/v1/me/interest-posts?limit=51", headers=auth(alex)).status_code == 422


def test_post_topics_leave_with_the_post_the_page_and_the_account(client, app):
    owner = account(client, app)
    club = page(client, owner, "compost-club", "environment")
    gone = post(client, owner, club["id"], "Going soon.", topics=["food"])
    response = client.post(f"/v1/posts/{gone['id']}/delete", headers={**auth(owner), "If-Match": gone["etag"]}, json={})
    assert response.status_code == 200 and tagged_rows(app) == 0

    post(client, owner, club["id"], "On a deleted page.", interests=["composting"])
    club = client.get(f"/v1/pages/{club['id']}", headers=auth(owner)).json()["data"]
    assert delete(client, owner, club, etag=club["etag"]).status_code == 200
    advance(app, days=7, minutes=1)
    assert app.state.page_lifecycle.purge_due() == {"purged": 1}
    assert tagged_rows(app) == 0

    # Seven days later the first owner's session has ended; another owner deletes their account.
    leaving = account(client, app, "leaving@example.test")
    garden = page(client, leaving, "garden-club", "environment")
    post(client, leaving, garden["id"], "By a deleted account.", topics=["food"], interests=["gardening"])
    assert request_deletion(client, leaving).status_code == 202
    advance(app, days=7, minutes=1)
    assert app.state.account_deletion.purge_due() == {"purged": 1, "blocked": 0}
    assert tagged_rows(app) == 0


def test_openapi_and_the_migration_keep_post_topics_safe(client, app):
    schema = client.get("/openapi.json").json()
    assert schema["paths"]["/v1/me/interest-posts"]["get"]["security"] == [{"AccountSession": []}]
    assert {"topics", "interests"} <= set(schema["components"]["schemas"]["PostView"]["required"])
    owner = account(client, app)
    club = page(client, owner, "compost-club", "environment")
    post(client, owner, club["id"], "Tagged.", topics=["food"])
    config = Config("alembic.ini")
    with pytest.raises(RuntimeError, match="0039"):
        command.downgrade(config, "0038")
    with app.state.engine.connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == ScriptDirectory.from_config(config).get_current_head()

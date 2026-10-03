"""Private feed controls: muting pages and topics, and Not interested (DEC-037, T136)."""

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import func, select, text

from app.modules.community import service as community_service
from app.modules.community.models import FeedControl
from tests.test_account_deletion import request_deletion
from tests.test_community import advance
from tests.test_community_classification import chosen, page
from tests.test_exports import download, ready_export
from tests.test_identity import account, auth
from tests.test_interest_posts import post

FOLLOWING, LATEST, INTERESTS, SAVED = "/v1/feed", "/v1/discover/posts", "/v1/me/interest-posts", "/v1/me/saved-posts"


def add(client, person, **body):
    return client.post("/v1/me/feed-controls", headers=auth(person), json=body)


def control(client, person, **body):
    response = add(client, person, **body)
    assert response.status_code == 201, response.text
    return response.json()["data"]


def undo(client, person, made):
    return client.post(f"/v1/me/feed-controls/{made['id']}/remove", headers=auth(person), json={})


def shown(client, person, path, **params):
    response = client.get(path, headers=auth(person), params=params)
    assert response.status_code == 200, response.text
    return [item["post"]["id"] if "post" in item else item["id"] for item in response.json()["data"]]


def controls(client, person):
    response = client.get("/v1/me/feed-controls", headers=auth(person))
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_mutes_and_not_interested_shape_the_lists_but_not_search_or_saved(client, app):
    owner, alex = account(client, app, "owner@example.test"), account(client, app, "alex@example.test")
    compost = page(client, owner, "compost-club", "environment", interests=["composting"])
    cooks = page(client, owner, "cook-club", "food")
    cricket = page(client, owner, "cricket-fans", "sports")
    for followed in (compost, cricket):
        assert client.post(f"/v1/pages/{followed['id']}/follow", headers=auth(alex), json={}).status_code == 200
    heap = post(client, owner, compost["id"], "Turn the compost heap.")
    advance(app, minutes=1)
    scraps = post(client, owner, cooks["id"], "Kitchen scraps make compost.", interests=["composting"])
    advance(app, minutes=1)
    soup = post(client, owner, cooks["id"], "Lentil soup tonight.")
    advance(app, minutes=1)
    nets = post(client, owner, cricket["id"], "Nets on Sunday.")
    assert client.post(f"/v1/posts/{heap['id']}/save", headers=auth(alex), json={}).status_code == 200
    chosen(client, alex, topics=["environment", "food"])
    assert shown(client, alex, FOLLOWING) == [nets["id"], heap["id"]]
    assert shown(client, alex, LATEST) == [nets["id"], soup["id"], scraps["id"], heap["id"]]
    assert shown(client, alex, INTERESTS) == [soup["id"], scraps["id"], heap["id"]]

    # A muted page leaves the lists but stays followed and can still be opened.
    muted_page = control(client, alex, kind="mute_page", page_id=cricket["id"])
    assert (muted_page["page_name"], muted_page["post_id"], muted_page["dimension"]) == ("Cricket Fans", None, None)
    assert control(client, alex, kind="mute_page", page_id=cricket["id"])["id"] == muted_page["id"]
    assert shown(client, alex, FOLLOWING) == [heap["id"]]
    assert nets["id"] not in shown(client, alex, LATEST)
    assert client.get(f"/v1/pages/{cricket['id']}", headers=auth(alex)).json()["data"]["following"] is True
    assert shown(client, alex, f"/v1/pages/{cricket['id']}/posts") == [nets["id"]]
    advance(app, minutes=1)

    # A muted topic takes out the posts about it, through their own interests (composting is under environment) or,
    # for a post with none of its own, its page's. Search and Saved still show them.
    environment = control(client, alex, kind="mute_term", dimension="topic", code="environment")
    assert shown(client, alex, FOLLOWING) == []
    assert shown(client, alex, LATEST) == [soup["id"]]
    assert shown(client, alex, INTERESTS) == [soup["id"]]
    assert shown(client, alex, LATEST, q="compost") == [scraps["id"], heap["id"]]
    assert shown(client, alex, SAVED) == [heap["id"]]
    advance(app, minutes=1)

    # Not interested takes one post out; everyone else's lists stay as they were.
    tired = control(client, alex, kind="hide_post", post_id=soup["id"])
    assert (tired["post_title"], tired["post_available"], tired["page_name"]) == (None, True, "Cook Club")
    assert shown(client, alex, LATEST) == [] and shown(client, alex, INTERESTS) == []
    assert shown(client, owner, LATEST) == [nets["id"], soup["id"], scraps["id"], heap["id"]]

    assert [item["kind"] for item in controls(client, alex)] == ["hide_post", "mute_term", "mute_page"]
    assert undo(client, alex, environment).json()["data"] == {"id": environment["id"], "status": "removed"}
    assert undo(client, alex, environment).status_code == 404
    assert shown(client, alex, LATEST) == [scraps["id"], heap["id"]]

    # What cannot be controlled is refused plainly.
    alex_page = page(client, alex, "alex-greens", "environment")
    assert add(client, alex, kind="mute_page", page_id=alex_page["id"]).json()["error"]["code"] == "OWN_CONTENT"
    draft = client.post(f"/v1/pages/{cooks['id']}/posts", headers={**auth(owner), "Idempotency-Key": "8f0d6d0e-5b1c-4d4a-9b9e-2d6f6f0e5a11"},
                        json={"body": "Not yet."}).json()["data"]
    assert add(client, alex, kind="hide_post", post_id=draft["id"]).status_code == 404
    assert add(client, alex, kind="mute_term", dimension="interest", code="no-such-thing").json()["error"]["code"] == "TERM_UNAVAILABLE"
    for wrong in ({"kind": "mute_page", "post_id": soup["id"]}, {"kind": "mute_term", "dimension": "topic"},
                  {"kind": "hide_post", "post_id": soup["id"], "page_id": cooks["id"]}, {"kind": "mute_term", "dimension": "place", "code": "in"}):
        assert add(client, alex, **wrong).status_code == 422, wrong
    assert undo(client, owner, muted_page).status_code == 404
    assert client.get("/v1/me/feed-controls").status_code == 401


def test_suggestions_leave_out_dismissed_and_muted_pages(client, app):
    owner, alex = account(client, app, "owner@example.test"), account(client, app, "alex@example.test")
    compost = page(client, owner, "compost-club", "environment", interests=["composting"])
    garden = page(client, owner, "garden-friends", "food", other_topics=["environment"], interests=["gardening"])
    trees = page(client, owner, "tree-planters", "environment")
    chosen(client, alex, topics=["environment"])

    def suggested():
        response = client.get("/v1/me/suggested-pages", headers=auth(alex))
        assert response.status_code == 200, response.text
        return sorted(item["page"]["handle"] for item in response.json()["data"]["items"])

    assert suggested() == ["compost-club", "garden-friends", "tree-planters"]
    dismissed = control(client, alex, kind="hide_suggestion", page_id=trees["id"])
    assert suggested() == ["compost-club", "garden-friends"]
    # Dismissing a suggestion does not mute the page.
    post(client, owner, trees["id"], "Planting on Saturday.")
    assert len(shown(client, alex, LATEST)) == 1
    control(client, alex, kind="mute_term", dimension="interest", code="composting")
    assert suggested() == ["garden-friends"]
    control(client, alex, kind="mute_page", page_id=garden["id"])
    assert suggested() == []
    assert undo(client, alex, dismissed).status_code == 200
    assert suggested() == ["tree-planters"]
    assert compost["id"] not in {item["page_id"] for item in controls(client, alex)}


def test_controls_have_limits_stay_private_come_with_the_data_and_leave_with_the_account(client, app, monkeypatch):
    owner, alex = account(client, app, "owner@example.test"), account(client, app, "alex@example.test")
    compost = page(client, owner, "compost-club", "environment")
    cooks = page(client, owner, "cook-club", "food")
    control(client, alex, kind="mute_term", dimension="interest", code="composting")
    advance(app, minutes=1)
    control(client, alex, kind="mute_page", page_id=compost["id"])
    monkeypatch.setitem(community_service.MAX_FEED_CONTROLS, "mute_page", 1)
    limited = add(client, alex, kind="mute_page", page_id=cooks["id"])
    assert limited.status_code == 409 and limited.json()["error"]["code"] == "FEED_CONTROL_LIMIT_REACHED"
    assert controls(client, owner) == []

    archived = download(client, alex, ready_export(client, app, alex, ["profile"])).json()["data"]
    assert [(item["kind"], item["name"], item["dimension"], item["code"]) for item in archived["profile"]["feed_controls"]] == [
        ("mute_term", "Composting", "interest", "composting"), ("mute_page", "Compost Club", None, None),
    ]
    assert request_deletion(client, alex).status_code == 202
    advance(app, days=7, minutes=1)
    assert app.state.account_deletion.purge_due() == {"purged": 1, "blocked": 0}
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(FeedControl)) == 0


def test_openapi_and_the_migration_keep_feed_controls_safe(client, app):
    schema = client.get("/openapi.json").json()
    for method, path in (("get", "/v1/me/feed-controls"), ("post", "/v1/me/feed-controls"), ("post", "/v1/me/feed-controls/{control_id}/remove")):
        assert schema["paths"][path][method]["security"] == [{"AccountSession": []}], path
    owner, alex = account(client, app, "owner@example.test"), account(client, app, "alex@example.test")
    control(client, alex, kind="mute_page", page_id=page(client, owner, "compost-club", "environment")["id"])
    config = Config("alembic.ini")
    with pytest.raises(RuntimeError, match="0040"):
        command.downgrade(config, "0039")
    with app.state.engine.connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == ScriptDirectory.from_config(config).get_current_head()

from tests.test_community import comment, create_page, published
from tests.test_identity import account, auth
from tests.test_moderation import decide, moderator, report
from tests.test_page_lifecycle import archive
from tests.test_page_moderators import moderating, offer_handover
from tests.test_page_rules_and_pins import pin, pinned_ids


def test_a_hidden_post_stays_visible_only_to_its_author_after_the_page_is_handed_over(client, app):
    owner = account(client, app)
    helper = account(client, app, "helper@example.test")
    reviewer = moderator(client, app)
    page = create_page(client, owner).json()["data"]
    post = published(client, owner, page["id"])
    hidden = decide(client, reviewer, "post", post["id"])
    assert hidden.status_code == 201, hidden.text
    moderating(client, owner, page, helper)
    current = client.get(f"/v1/pages/{page['id']}", headers=auth(owner)).json()["data"]
    offered = offer_handover(client, owner, page, helper["user"]["id"], etag=current["etag"])
    assert offered.status_code == 201, offered.text
    offer = offered.json()["data"]
    accepted = client.post(
        f"/v1/pages/{page['id']}/handover/{offer['id']}/accept", headers={**auth(helper), "If-Match": offer["etag"]}, json={},
    )
    assert accepted.status_code == 200, accepted.text

    # Hidden content is visible only to its author (DEC-024): the new owner did not write the post.
    assert client.get(f"/v1/posts/{post['id']}", headers=auth(helper)).status_code == 404
    assert client.get(f"/v1/pages/{page['handle']}/posts", headers=auth(helper)).json()["data"] == []
    assert client.get(f"/v1/pages/{page['handle']}/pinned-posts", headers=auth(helper)).json()["data"] == []
    seen = client.get(f"/v1/posts/{post['id']}", headers=auth(owner))
    assert seen.status_code == 200 and seen.json()["data"]["moderation"] == {"hidden": True, "reason": "spam"}
    assert [row["id"] for row in client.get(f"/v1/pages/{page['handle']}/posts", headers=auth(owner)).json()["data"]] == [post["id"]]


def test_handing_a_page_over_unpins_a_hidden_post_the_new_owner_did_not_write(client, app):
    owner = account(client, app)
    helper = account(client, app, "helper@example.test")
    reviewer = moderator(client, app)
    page = create_page(client, owner).json()["data"]
    posts = [published(client, owner, page["id"], f"Walk {index}") for index in range(4)]
    for post in posts[:3]:
        assert pin(client, owner, post["id"]).status_code == 200
    assert decide(client, reviewer, "post", posts[0]["id"]).status_code == 201
    moderating(client, owner, page, helper)
    current = client.get(f"/v1/pages/{page['id']}", headers=auth(owner)).json()["data"]
    offer = offer_handover(client, owner, page, helper["user"]["id"], etag=current["etag"]).json()["data"]
    accepted = client.post(
        f"/v1/pages/{page['id']}/handover/{offer['id']}/accept", headers={**auth(helper), "If-Match": offer["etag"]}, json={},
    )
    assert accepted.status_code == 200, accepted.text

    # The new owner cannot see the hidden post, so it must not keep one of the 3 places they can pin.
    assert sorted(pinned_ids(client, page["id"], auth(helper))) == sorted(post["id"] for post in posts[1:3])
    assert pin(client, helper, posts[3]["id"]).status_code == 200
    assert sorted(pinned_ids(client, page["id"], auth(helper))) == sorted(post["id"] for post in posts[1:])
    # Its author still reads it, hidden and no longer pinned.
    seen = client.get(f"/v1/posts/{posts[0]['id']}", headers=auth(owner)).json()["data"]
    assert seen["moderation"]["hidden"] is True and seen["pinned"] is False


def test_an_archived_page_can_still_be_reported_and_hidden_by_platform_moderators(client, app):
    owner = account(client, app)
    reader = account(client, app, "reader@example.test")
    reviewer = moderator(client, app)
    page = create_page(client, owner).json()["data"]
    post = published(client, owner, page["id"])
    remark = comment(client, owner, post["id"]).json()["data"]
    current = client.get(f"/v1/pages/{page['id']}", headers=auth(owner)).json()["data"]
    archived = archive(client, owner, page, current["etag"])
    assert archived.status_code == 200, archived.text

    # An archived page stays readable by everyone, so what is on it can still be reported and hidden.
    for target_type, target_id in (("post", post["id"]), ("comment", remark["id"]), ("page", page["id"])):
        report(client, reader, target_type, target_id)
    for target_type, target_id in (("comment", remark["id"]), ("post", post["id"]), ("page", page["id"])):
        decided = decide(client, reviewer, target_type, target_id)
        assert decided.status_code == 201, decided.text
    assert client.get(f"/v1/pages/{page['handle']}").status_code == 404
    assert client.get(f"/v1/pages/{page['handle']}", headers=auth(owner)).json()["data"]["moderation"] == {"hidden": True, "reason": "spam"}

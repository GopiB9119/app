"""Weekly insights for a page's owner, worked out from what is still there (DEC-038, T132)."""

from sqlalchemy import text

from tests.test_community import comment, create_page, published
from tests.test_identity import account, auth
from tests.test_moderation import decide, moderator


def insights(client, person, page_id):
    return client.get(f"/v1/pages/{page_id}/insights", headers=auth(person))


def back(app, table, column, where, days, **values):
    with app.state.engine.begin() as connection:
        connection.execute(text(f"UPDATE {table} SET {column} = {column} - make_interval(days => :days) WHERE {where}"), {"days": days, **values})


def counts(period):
    return {name: period[name] for name in ("new_followers", "posts", "comments", "likes")}


def test_the_owner_sees_eight_weeks_of_totals_that_name_nobody(client, app):
    owner = account(client, app, "owner@example.test")
    ann, ben, cat = (account(client, app, f"{name}@example.test") for name in ("ann", "ben", "cat"))
    page = create_page(client, owner).json()["data"]
    first = published(client, owner, page["id"], body="First walk.")
    second = published(client, owner, page["id"], body="Second walk.")
    for person in (ann, ben, cat):
        assert client.post(f"/v1/pages/{page['id']}/follow", headers=auth(person), json={}).status_code == 200
    for person, post in ((ann, first), (ben, first), (ben, second), (owner, first)):
        assert client.post(f"/v1/posts/{post['id']}/like", headers=auth(person), json={}).status_code == 200
    ann_says = comment(client, ann, first["id"], body="Lovely").json()["data"]
    ben_says = comment(client, ben, second["id"], body="Count me in").json()["data"]
    assert comment(client, owner, first["id"], body="Thanks all").status_code == 201

    # Ann's activity and the first post move ten days back, into the second period; Cat's follow two months back.
    ann_id, cat_id = ann["user"]["id"], cat["user"]["id"]
    back(app, "public_posts", "published_at", "id = :post", 10, post=first["id"])
    for table, column, owner_column in (("public_page_follows", "created_at", "account_id"), ("public_post_reactions", "created_at", "account_id"),
                                        ("public_post_comments", "created_at", "author_id")):
        back(app, table, column, f"{owner_column} = :person", 10, person=ann_id)
    back(app, "public_page_follows", "created_at", "account_id = :person", 60, person=cat_id)

    response = insights(client, owner, page["id"])
    assert response.status_code == 200, response.text
    found = response.json()["data"]
    assert found["follower_count"] == 3 and len(found["periods"]) == 8
    assert found["periods"][0]["end"] == found["as_of"]
    assert all(newer["start"] == older["end"] for newer, older in zip(found["periods"], found["periods"][1:]))
    # The owner's own like and comment are not counted; Cat's follow is older than eight weeks.
    assert counts(found["periods"][0]) == {"new_followers": 1, "posts": 1, "comments": 1, "likes": 2}
    assert counts(found["periods"][1]) == {"new_followers": 1, "posts": 1, "comments": 1, "likes": 1}
    assert all(counts(period) == {"new_followers": 0, "posts": 0, "comments": 0, "likes": 0} for period in found["periods"][2:])
    for person in (ann, ben, cat):
        assert person["user"]["id"] not in response.text

    # Nothing is stored: what is taken back, deleted or hidden no longer counts.
    assert client.post(f"/v1/pages/{page['id']}/unfollow", headers=auth(ben), json={}).status_code == 200
    assert client.post(f"/v1/posts/{second['id']}/unlike", headers=auth(ben), json={}).status_code == 200
    assert client.post(f"/v1/comments/{ben_says['id']}/delete", headers=auth(ben), json={}).status_code == 200
    assert decide(client, moderator(client, app), "comment", ann_says["id"]).status_code == 201
    again = insights(client, owner, page["id"]).json()["data"]
    assert again["follower_count"] == 2
    assert counts(again["periods"][0]) == {"new_followers": 0, "posts": 1, "comments": 0, "likes": 1}
    assert counts(again["periods"][1]) == {"new_followers": 1, "posts": 1, "comments": 0, "likes": 1}

    refused = insights(client, ann, page["id"])
    assert refused.status_code == 403 and refused.json()["error"]["code"] == "PAGE_MANAGER_REQUIRED"
    assert client.get(f"/v1/pages/{page['id']}/insights").status_code == 401
    assert insights(client, owner, "00000000-0000-4000-8000-000000000000").status_code == 404


def test_openapi_declares_insights_private(client):
    schema = client.get("/openapi.json").json()
    assert schema["paths"]["/v1/pages/{page_id}/insights"]["get"]["security"] == [{"AccountSession": []}]

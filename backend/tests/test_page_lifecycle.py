from datetime import timedelta
from uuid import uuid4

from sqlalchemy import func, select

from app.modules.community.models import CommunityAuditEvent, PageFollow, PublicPage, PublicPost
from tests.test_community import advance, comment, create_page, published
from tests.test_identity import PASSWORD, account, auth


def sign_in(client, email="alex@example.test"):
    response = client.post("/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return response.json()["data"]


def archive(client, owner, page, etag=None):
    headers = {**auth(owner), **({"If-Match": etag} if etag is not None else {})}
    return client.post(f"/v1/pages/{page['id']}/archive", headers=headers, json={})


def restore(client, owner, page, etag=None):
    headers = {**auth(owner), **({"If-Match": etag} if etag is not None else {})}
    return client.post(f"/v1/pages/{page['id']}/restore", headers=headers, json={})


def delete(client, owner, page, confirm=None, etag=None):
    headers = {**auth(owner), **({"If-Match": etag} if etag is not None else {})}
    return client.post(f"/v1/pages/{page['id']}/delete", headers=headers, json={"confirm": page["name"] if confirm is None else confirm})


def test_archiving_keeps_a_page_readable_and_restoring_opens_it_again(client, app):
    owner = account(client, app)
    reader = account(client, app, "reader@example.test")
    page = create_page(client, owner).json()["data"]
    post = published(client, owner, page["id"])
    assert client.post(f"/v1/posts/{post['id']}/pin", headers=auth(owner), json={}).status_code == 200
    made = comment(client, reader, post["id"])
    assert made.status_code == 201, made.text
    assert client.post(f"/v1/pages/{page['id']}/follow", headers=auth(reader), json={}).status_code == 200
    assert client.post(f"/v1/posts/{post['id']}/like", headers=auth(reader), json={}).status_code == 200
    assert client.post(f"/v1/posts/{post['id']}/save", headers=auth(reader), json={}).status_code == 200

    assert archive(client, owner, page).status_code == 428
    assert archive(client, reader, page, page["etag"]).status_code == 403
    first = archive(client, owner, page, page["etag"])
    assert first.status_code == 200, first.text
    archived = first.json()["data"]
    assert archived["status"] == "read_only" and archived["can_manage"] is True
    again = archive(client, owner, page, archived["etag"])
    assert again.status_code == 200 and again.json()["data"]["etag"] == archived["etag"]

    # Still readable, and the people connected to it keep seeing it.
    public = client.get(f"/v1/pages/{page['handle']}")
    assert public.status_code == 200 and public.json()["data"]["status"] == "read_only"
    assert client.get(f"/v1/pages/{page['handle']}/posts").json()["data"][0]["id"] == post["id"]
    assert client.get(f"/v1/pages/{page['handle']}/pinned-posts").json()["data"][0]["id"] == post["id"]
    assert client.get(f"/v1/posts/{post['id']}").status_code == 200
    assert [row["id"] for row in client.get("/v1/me/following", headers=auth(reader)).json()["data"]] == [page["id"]]
    assert [row["id"] for row in client.get("/v1/feed", headers=auth(reader)).json()["data"]] == [post["id"]]
    assert [row["id"] for row in client.get("/v1/me/saved-posts", headers=auth(reader)).json()["data"]] == [post["id"]]

    # Nothing can be posted, commented, liked or followed; the page and its rules cannot change either.
    for response in (
        client.post(f"/v1/pages/{page['id']}/posts", headers={**auth(owner), "Idempotency-Key": str(uuid4())}, json={"title": "No", "body": "No"}),
        client.patch(f"/v1/pages/{page['id']}", headers={**auth(owner), "If-Match": archived["etag"]}, json={"name": "No"}),
        client.patch(f"/v1/pages/{page['id']}", headers={**auth(owner), "If-Match": archived["etag"]}, json={"rules": "New rules"}),
        client.post(f"/v1/posts/{post['id']}/comments", headers={**auth(reader), "Idempotency-Key": str(uuid4())}, json={"body": "No"}),
        client.post(f"/v1/posts/{post['id']}/like", headers=auth(reader), json={}),
        client.post(f"/v1/pages/{page['id']}/follow", headers=auth(reader), json={}),
        client.post(f"/v1/posts/{post['id']}/save", headers=auth(reader), json={}),
        client.post(f"/v1/posts/{post['id']}/pin", headers=auth(owner), json={}),
        client.post(f"/v1/comments/{made.json()['data']['id']}/delete", headers=auth(owner), json={}),
    ):
        assert response.status_code == 409, response.text
        assert response.json()["error"]["code"] == "PAGE_READ_ONLY", response.text

    # Leaving is not a change to the page, so a like, save or follow can still be taken back.
    assert client.post(f"/v1/posts/{post['id']}/unlike", headers=auth(reader), json={}).status_code == 200
    assert client.post(f"/v1/posts/{post['id']}/unsave", headers=auth(reader), json={}).status_code == 200
    assert client.post(f"/v1/pages/{page['id']}/unfollow", headers=auth(reader), json={}).status_code == 200

    reopened = restore(client, owner, page, archived["etag"])
    assert reopened.status_code == 200, reopened.text
    assert reopened.json()["data"]["status"] == "active"
    assert restore(client, owner, page, reopened.json()["data"]["etag"]).status_code == 200
    assert comment(client, reader, post["id"]).status_code == 201
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(CommunityAuditEvent).where(
            CommunityAuditEvent.action.in_(("public.page_archived", "public.page_restored")))) == 2


def test_deleting_needs_the_name_and_hides_everything_until_the_owner_restores_it(client, app):
    owner = account(client, app)
    reader = account(client, app, "reader@example.test")
    page = create_page(client, owner).json()["data"]
    post = published(client, owner, page["id"])
    made = comment(client, reader, post["id"])
    assert client.post(f"/v1/pages/{page['id']}/follow", headers=auth(reader), json={}).status_code == 200
    assert client.post(f"/v1/posts/{post['id']}/like", headers=auth(reader), json={}).status_code == 200

    assert delete(client, owner, page).status_code == 428
    wrong = delete(client, owner, page, confirm="River Walker", etag=page["etag"])
    assert wrong.status_code == 409 and wrong.json()["error"]["code"] == "PAGE_NAME_MISMATCH"
    assert client.get(f"/v1/pages/{page['handle']}").status_code == 200

    deleted = delete(client, owner, page, etag=page["etag"])
    assert deleted.status_code == 200, deleted.text
    view = deleted.json()["data"]
    assert view["status"] == "deleted" and view["can_manage"] is True
    assert view["purge_after"].startswith("2026-09-26T10:00")

    # Everyone else loses the page and everything on it at once.
    assert client.get(f"/v1/pages/{page['handle']}").status_code == 404
    assert client.get(f"/v1/pages/{page['id']}", headers=auth(reader)).status_code == 404
    assert client.get(f"/v1/posts/{post['id']}").status_code == 404
    assert client.get(f"/v1/posts/{post['id']}/comments", headers=auth(reader)).status_code == 404
    assert client.get(f"/v1/pages/{page['handle']}/posts").status_code == 404
    assert client.get("/v1/feed", headers=auth(reader)).json()["data"] == []
    assert client.get("/v1/me/following", headers=auth(reader)).json()["data"] == []
    assert client.get("/v1/discover/pages").json()["data"] == []
    assert client.get("/v1/discover/posts").json()["data"] == []
    assert client.post(f"/v1/pages/{page['id']}/follow", headers=auth(reader), json={}).status_code == 404

    # The owner keeps it in view, and restoring brings it back as it was.
    assert [item["id"] for item in client.get("/v1/me/pages", headers=auth(owner)).json()["data"]] == [page["id"]]
    mine = client.get(f"/v1/pages/{page['id']}", headers=auth(owner))
    assert mine.status_code == 200 and mine.json()["data"]["status"] == "deleted"
    reopened = restore(client, owner, page, view["etag"])
    assert reopened.status_code == 200, reopened.text
    assert reopened.json()["data"]["status"] == "active" and reopened.json()["data"]["purge_after"] is None
    assert client.get(f"/v1/pages/{page['handle']}", headers=auth(reader)).json()["data"]["follower_count"] == 1
    kept = client.get(f"/v1/posts/{post['id']}", headers=auth(reader)).json()["data"]
    assert kept["like_count"] == 1 and kept["liked"] is True
    assert [item["id"] for item in client.get(f"/v1/posts/{post['id']}/comments", headers=auth(reader)).json()["data"]] == [
        made.json()["data"]["id"],
    ]
    assert client.get("/v1/feed", headers=auth(reader)).json()["data"][0]["id"] == post["id"]


def test_a_deleted_page_that_was_archived_comes_back_archived_and_a_retry_changes_nothing(client, app):
    owner = account(client, app)
    page = create_page(client, owner).json()["data"]
    archived = archive(client, owner, page, page["etag"]).json()["data"]
    deleted = delete(client, owner, page, etag=archived["etag"])
    assert deleted.status_code == 200 and deleted.json()["data"]["status"] == "deleted"
    reopened = restore(client, owner, page, deleted.json()["data"]["etag"])
    assert reopened.status_code == 200, reopened.text
    assert reopened.json()["data"]["status"] == "read_only"
    active = restore(client, owner, page, reopened.json()["data"]["etag"])
    assert active.json()["data"]["status"] == "active"

    first = delete(client, owner, page, etag=active.json()["data"]["etag"])
    assert first.status_code == 200 and first.json()["data"]["status"] == "deleted"
    retry = delete(client, owner, page, etag=first.json()["data"]["etag"])
    assert retry.status_code == 200 and retry.json()["data"]["etag"] == first.json()["data"]["etag"]


def test_after_seven_days_the_page_is_erased_and_its_handle_stays_taken(client, app):
    owner = account(client, app)
    reader = account(client, app, "reader@example.test")
    page = create_page(client, owner).json()["data"]
    post = published(client, owner, page["id"])
    assert comment(client, reader, post["id"]).status_code == 201
    assert client.post(f"/v1/pages/{page['id']}/follow", headers=auth(reader), json={}).status_code == 200
    deleted = delete(client, owner, page, etag=page["etag"]).json()["data"]

    advance(app, days=7, minutes=1)
    owner = sign_in(client)
    overdue = restore(client, owner, page, deleted["etag"])
    assert overdue.status_code == 410 and overdue.json()["error"]["code"] == "PAGE_RESTORE_EXPIRED"

    assert app.state.page_lifecycle.purge_due() == {"purged": 1}
    assert app.state.page_lifecycle.purge_due() == {"purged": 0}

    with app.state.sessions() as database:
        shell = database.get(PublicPage, page["id"])
        assert (shell.status, shell.name, shell.description, shell.rules, shell.follower_count) == (
            "deleted", "Deleted page", "", "", 0,
        )
        assert shell.handle == page["handle"] and shell.purge_after is None
        erased = database.scalars(select(PublicPost).where(PublicPost.page_id == page["id"])).all()
        assert [(row.status, row.title, row.body, row.pinned_at) for row in erased] == [("deleted", None, None, None)]
        assert database.scalar(select(func.count()).select_from(PageFollow).where(PageFollow.page_id == page["id"])) == 0
        assert database.scalar(select(func.count()).select_from(CommunityAuditEvent).where(
            CommunityAuditEvent.action == "public.page_purged")) == 1

    # The handle is kept so nobody else can take it, and the shell is gone from every view.
    other = account(client, app, "other@example.test")
    taken = create_page(client, other, handle=page["handle"], name="Someone Else")
    assert taken.status_code == 409 and taken.json()["error"]["code"] == "HANDLE_TAKEN"
    assert client.get(f"/v1/pages/{page['handle']}").status_code == 404
    assert client.get(f"/v1/pages/{page['handle']}", headers=auth(owner)).status_code == 404
    assert client.get("/v1/me/pages", headers=auth(owner)).json()["data"] == []
    assert restore(client, owner, page, deleted["etag"]).status_code == 404


def test_a_page_the_account_deletion_marks_archived_stays_hidden(client, app):
    owner = account(client, app)
    page = create_page(client, owner).json()["data"]
    with app.state.sessions.begin() as database:
        database.get(PublicPage, page["id"]).status = "archived"
    # 'archived' remains the account-deletion state (T68): its erased pages stay invisible and unreachable,
    # and the archive, delete and restore actions of DEC-025 part 5 do not adopt it.
    assert client.get(f"/v1/pages/{page['handle']}").status_code == 404
    assert client.get(f"/v1/pages/{page['id']}", headers=auth(owner)).status_code == 404
    headers = {**auth(owner), "If-Match": page["etag"]}
    assert client.post(f"/v1/pages/{page['id']}/restore", headers=headers, json={}).status_code == 404
    assert client.post(f"/v1/pages/{page['id']}/archive", headers=headers, json={}).status_code == 404



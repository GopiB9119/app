from datetime import timedelta
from uuid import uuid4

import pytest
from cryptography.fernet import InvalidToken
from sqlalchemy import func, select, text

from app.db import Base
from app.modules.identity import deletion
from app.modules.identity.models import AccountSession, User
from app.modules.scheduling.models import Reminder, ReminderSeries
from app.modules.safety.models import ModerationAppeal
from app.modules.spaces.models import Space
from tests.test_agents import approve, ask, rename
from tests.test_care import create_instruction
from tests.test_community import comment, create_page, published
from tests.test_documents import add as add_document
from tests.test_events import create as create_event, respond
from tests.test_exports import request_export
from tests.test_identity import PASSWORD, account, auth
from tests.test_live_updates import Hints, change
from tests.test_messaging import admit, open_chat, send
from tests.test_moderation import appeal, content, decide, moderator, resolve
from tests.test_reminder_delivery_guards import preview_reminder
from tests.test_reminder_series import create_series, source_for
from tests.test_space_directory import ask as ask_to_join, group
from tests.test_spaces import create_space
from tests.test_tasks import create_task

NAME = "Alexandria Quill"
GONE = (
    "alex@example.test", NAME, "Alex chat 4471", "Alex direct 4471", "Alex comment 4471", "Alex post 4471",
    "Alex Walks 4471", "Alex report 4471", "Synthetic Medicine A", "plumber comes on Fridays", "Alex solo 4471",
    "Alex private task 4471", "Alex diary 4471", "Alex group 4471", "Alex group story 4471",
)


def request_deletion(client, person, password=PASSWORD):
    return client.post("/v1/me/deletion", headers=auth(person), json={"password": password})


def login(client, email="alex@example.test", password=PASSWORD):
    return client.post("/v1/auth/login", json={"email": email, "password": password})


def stored_text(app):
    """Every stored value as text, with encrypted values opened where the application's keys open them."""
    values = []
    with app.state.sessions() as database:
        for table in Base.metadata.sorted_tables:
            for row in database.execute(select(table)).mappings().all():
                for column, value in row.items():
                    if value is None:
                        continue
                    values.append(str(value))
                    if column.endswith("_cipher"):
                        try:
                            values.append(app.state.security.open(value))
                        except (InvalidToken, ValueError, TypeError):
                            if table.name == "conversation_messages":
                                values.append(str(app.state.messaging.cipher.open(row["conversation_id"], row["id"], value)))
    return "\n".join(values)


def lived_in_account(client, app):
    """Alex has data in every area; Sam owns the shared family Space and keeps theirs."""
    alex = account(client, app)
    rename(client, alex, NAME)
    sam = account(client, app, "sam@example.test")
    shared = create_space(client, sam, name="Shared family").json()["data"]["id"]
    admit(client, sam, shared, alex)
    assert request_export(client, alex).status_code == 202
    chat = open_chat(client, alex, shared).json()["data"]
    assert send(client, alex, chat["id"], "Alex chat 4471").status_code == 201
    assert send(client, sam, chat["id"], "Sam stays 5582").status_code == 201
    direct = open_chat(client, alex, shared, sam["user"]["id"]).json()["data"]
    assert send(client, alex, direct["id"], "Alex direct 4471").status_code == 201
    kept = create_task(client, alex, shared, alex["user"]["id"], title="Kept chore 5582")
    assert kept.status_code == 201, kept.text
    event = create_event(client, sam, shared, title="Sam picnic 5582")
    assert event.status_code == 201, event.text
    assert respond(client, alex, event.json()["data"]["id"], "going").status_code == 200
    solo = create_space(client, alex, name="Alex solo 4471").json()["data"]["id"]
    private = create_task(client, alex, solo, title="Alex private task 4471")
    assert private.status_code == 201, private.text
    assert add_document(client, alex, solo, name="diary.md", content="Alex diary 4471\n").status_code == 201
    preview = preview_reminder(client, alex, private.json()["data"]["id"])
    assert preview.status_code == 200, preview.text
    created = client.post("/v1/reminders", headers={**auth(alex), "Idempotency-Key": str(uuid4())},
                          json={"preview_token": preview.json()["data"]["options"][0]["preview_token"]})
    assert created.status_code == 201, created.text
    assert create_instruction(client, alex).status_code == 201
    memory = ask(client, alex, solo, "remember that the plumber comes on Fridays")
    assert approve(client, alex, memory).status_code == 200
    page = create_page(client, alex, handle="alex-walks", name="Alex Walks 4471").json()["data"]
    published(client, alex, page["id"], body="Alex post 4471")
    sam_page = create_page(client, sam, handle="sam-walks", name="Sam Walks 5582").json()["data"]
    sam_post = published(client, sam, sam_page["id"], body="Sam post 5582")
    assert comment(client, alex, sam_post["id"], body="Alex comment 4471").status_code == 201
    for action in ("like", "save"):
        assert client.post(f"/v1/posts/{sam_post['id']}/{action}", headers=auth(alex), json={}).status_code == 200
    assert client.post(f"/v1/pages/{sam_page['id']}/follow", headers=auth(alex), json={}).status_code == 200
    reported = client.post("/v1/reports", headers=auth(alex),
                           json={"target_type": "post", "target_id": sam_post["id"], "reason": "spam", "details": "Alex report 4471"})
    assert reported.status_code == 201, reported.text
    # A public group only Alex is in, which Sam asked to join: the request keeps a copy of the group's name.
    alone_group = group(client, alex, name="Alex group 4471", description="Alex group story 4471")
    assert alone_group.status_code == 201, alone_group.text
    asked = ask_to_join(client, sam, alone_group.json()["data"]["id"], note="Sam asks 5582")
    assert asked.status_code == 201, asked.text
    app.state.clock.now += timedelta(minutes=2)
    app.state.reminders.dispatch_due(limit=20)
    return alex, sam, {"shared": shared, "solo": solo, "chat": chat, "direct": direct, "kept": kept.json()["data"],
                       "event": event.json()["data"], "sam_post": sam_post, "sam_page": sam_page}


def test_deletion_waits_for_owned_spaces_with_members_and_checks_the_password(client, app):
    alex = account(client, app)
    sam = account(client, app, "sam@example.test")
    space_id = create_space(client, alex, name="Alex hosts").json()["data"]["id"]
    admit(client, alex, space_id, sam)
    wrong = request_deletion(client, alex, "Not-the-password-1!")
    assert wrong.status_code == 403 and wrong.json()["error"]["code"] == "PASSWORD_INCORRECT"
    refused = request_deletion(client, alex)
    assert refused.status_code == 409, refused.text
    error = refused.json()["error"]
    assert error["code"] == "OWNED_SPACES_WITH_MEMBERS"
    assert error["details"] == {"spaces": "Alex hosts", "space_ids": space_id}
    assert client.get("/v1/me", headers=auth(alex)).status_code == 200
    with app.state.sessions() as database:
        assert database.get(User, alex["user"]["id"]).status == "active"


def test_a_request_ends_every_session_and_the_grace_period_allows_cancelling(client, app):
    alex = account(client, app)
    second = login(client).json()["data"]
    assert request_export(client, alex).status_code == 202
    requested = request_deletion(client, alex)
    assert requested.status_code == 202, requested.text
    data = requested.json()["data"]
    assert data["status"] == "deletion_requested"
    assert data["purge_after"].startswith("2026-09-26T10:00")
    for session in (alex, second):
        assert client.get("/v1/me", headers=auth(session)).status_code == 401
    waiting = login(client)
    assert waiting.status_code == 409 and waiting.json()["error"]["code"] == "ACCOUNT_DELETION_PENDING"
    assert waiting.json()["error"]["details"]["purge_after"].startswith("2026-09-26T10:00")
    assert login(client, password="Not-the-password-1!").status_code == 401
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(AccountSession).where(AccountSession.revoked_at.is_(None))) == 0
    assert app.state.account_deletion.purge_due() == {"purged": 0, "blocked": 0}
    assert client.post("/v1/auth/cancel-deletion", json={"email": "alex@example.test", "password": "Not-the-password-1!"}).status_code == 401
    cancelled = client.post("/v1/auth/cancel-deletion", json={"email": "alex@example.test", "password": PASSWORD})
    assert cancelled.status_code == 200, cancelled.text
    assert client.get("/v1/me", headers=auth(cancelled.json()["data"])).json()["data"]["id"] == alex["user"]["id"]
    # The export that was being prepared ended with the sessions, and the list still reads after cancelling.
    exports = client.get("/v1/me/exports", headers=auth(cancelled.json()["data"]))
    assert exports.status_code == 200, exports.text
    assert [(item["status"], item["reason"]) for item in exports.json()["data"]] == [("cancelled", "session_ended")]
    assert login(client).status_code == 200


def test_cancelling_after_the_grace_period_is_refused(client, app):
    alex = account(client, app)
    assert request_deletion(client, alex).status_code == 202
    app.state.clock.now += timedelta(days=7)
    assert client.post("/v1/auth/cancel-deletion", json={"email": "alex@example.test", "password": PASSWORD}).status_code == 401


def test_cancelling_brings_back_repeating_reminders_that_stopped_while_waiting(client, app):
    alex, task_id = source_for(client, app, "alex@example.test")
    _preview, created = create_series(client, alex, task_id)
    assert created.status_code == 201, created.text
    series_id = created.json()["data"]["id"]
    assert request_deletion(client, alex).status_code == 202
    # The first occurrence, 16:00 in Kolkata (10:30 UTC), falls due while the account waits to be deleted.
    app.state.clock.now += timedelta(hours=1)
    app.state.reminders.dispatch_due(limit=20)
    with app.state.sessions() as database:
        stopped = database.get(ReminderSeries, series_id)
        assert (stopped.status, stopped.reason) == ("suppressed", "account_inactive")
    cancelled = client.post("/v1/auth/cancel-deletion", json={"email": "alex@example.test", "password": PASSWORD})
    assert cancelled.status_code == 200, cancelled.text
    with app.state.sessions() as database:
        series = database.get(ReminderSeries, series_id)
        assert (series.status, series.reason) == ("active", None)
        upcoming = database.scalars(select(Reminder).where(Reminder.series_id == series_id, Reminder.status == "scheduled")).all()
        assert [(item.occurrence_date.isoformat(), item.scheduled_at > app.state.clock.now) for item in upcoming] == [("2026-09-20", True)]


def test_purge_erases_the_account_and_keeps_what_others_share(client, app):
    alex, sam, ids = lived_in_account(client, app)
    with app.state.sessions() as database:
        password_hash = database.get(User, alex["user"]["id"]).password_hash
    before = stored_text(app)
    assert all(value in before for value in GONE)
    assert request_deletion(client, alex).status_code == 202
    app.state.clock.now += timedelta(days=7, minutes=1)
    hints = Hints(app, sam)
    hints.since_last()
    assert app.state.account_deletion.purge_due() == {"purged": 1, "blocked": 0}
    assert app.state.account_deletion.purge_due() == {"purged": 0, "blocked": 0}
    # Sam's open chats read again at once: the Space chat shows the erased message, the direct chat takes no more.
    by_id = lambda items: sorted(items, key=lambda item: item["conversation_id"])
    assert by_id(hints.since_last()) == by_id([change(ids["chat"], "member_left"), change(ids["direct"], "member_left")])

    after = stored_text(app)
    assert [value for value in GONE if value in after] == []
    assert password_hash not in after
    for kept in ("Sam stays 5582", "Kept chore 5582", "Sam picnic 5582", "Sam post 5582", "Shared family", "Sam asks 5582"):
        assert kept in after, kept
    with app.state.sessions() as database:
        user = database.get(User, alex["user"]["id"])
        assert (user.status, user.display_name, user.email_cipher, user.password_hash) == ("deleted", "Deleted account", None, None)
        solo = database.get(Space, ids["solo"])
        assert (solo.status, solo.name) == ("archived", "Deleted Space")

    # A week has passed, so Sam signs in again.
    sam = login(client, "sam@example.test").json()["data"]
    history = client.get(f"/v1/conversations/{ids['chat']['id']}/messages", headers=auth(sam)).json()["data"]
    assert [(item["sender_name"], item["status"], item["body"]) for item in history] == [
        ("Deleted account", "deleted", None), ("Alex Morgan", "sent", "Sam stays 5582"),
    ]
    assert client.get(f"/v1/conversations/{ids['direct']['id']}", headers=auth(sam)).json()["data"]["can_send"] is False
    task = client.get(f"/v1/tasks/{ids['kept']['id']}", headers=auth(sam)).json()["data"]
    assert task["title"] == "Kept chore 5582" and task["assignee"] is None
    roster = client.get(f"/v1/spaces/{ids['shared']}/members", headers=auth(sam)).json()["data"]
    assert [member["account_id"] for member in roster] == [sam["user"]["id"]]
    post = client.get(f"/v1/posts/{ids['sam_post']['id']}", headers=auth(sam)).json()["data"]
    assert post["like_count"] == 0 and post["comment_count"] == 0
    assert client.get(f"/v1/pages/{ids['sam_page']['id']}", headers=auth(sam)).json()["data"]["follower_count"] == 0
    assert login(client).status_code == 401
    again = account(client, app)
    assert again["user"]["id"] != alex["user"]["id"]


def test_a_failure_part_way_leaves_nothing_erased_and_the_next_pass_finishes(client, app, monkeypatch):
    alex, sam, ids = lived_in_account(client, app)
    assert request_deletion(client, alex).status_code == 202
    app.state.clock.now += timedelta(days=8)
    monkeypatch.setattr(deletion, "ERASE", deletion.ERASE + (("broken", "SELECT 1 / 0"),))
    with pytest.raises(Exception):
        app.state.account_deletion.purge_due()
    with app.state.sessions() as database:
        assert database.get(User, alex["user"]["id"]).status == "deletion_requested"
    assert "Alex chat 4471" in stored_text(app)
    monkeypatch.undo()
    assert app.state.account_deletion.purge_due() == {"purged": 1, "blocked": 0}
    assert "Alex chat 4471" not in stored_text(app)


def test_an_account_that_owns_a_shared_space_at_purge_time_is_not_erased(client, app):
    alex = account(client, app)
    sam = account(client, app, "sam@example.test")
    space_id = create_space(client, sam).json()["data"]["id"]
    admit(client, sam, space_id, alex)
    assert request_deletion(client, alex).status_code == 202
    # Not reachable through the API while the account cannot sign in; the purge must still refuse it.
    with app.state.engine.begin() as connection:
        connection.execute(text("UPDATE space_memberships SET role = 'member' WHERE space_id = :s AND account_id = :a"), {"s": space_id, "a": sam["user"]["id"]})
        connection.execute(text("UPDATE space_memberships SET role = 'owner' WHERE space_id = :s AND account_id = :a"), {"s": space_id, "a": alex["user"]["id"]})
    app.state.clock.now += timedelta(days=8)
    assert app.state.account_deletion.purge_due() == {"purged": 0, "blocked": 1}
    with app.state.sessions() as database:
        assert database.get(User, alex["user"]["id"]).status == "deletion_requested"


def test_deletion_routes_need_a_session_and_strict_input(client, app):
    alex = account(client, app)
    assert client.post("/v1/me/deletion", json={"password": PASSWORD}).status_code == 401
    assert client.post("/v1/me/deletion", headers=auth(alex), json={"password": PASSWORD, "extra": 1}).status_code == 422
    operations = app.openapi()["paths"]
    assert operations["/v1/me/deletion"]["post"]["security"]
    assert "security" not in operations["/v1/auth/cancel-deletion"]["post"]

def test_purge_ends_open_appeals_and_keeps_resolved_ones_readable(client, app, content):
    # T103: the purge blanked an appeal's note and left it open, and the apps refuse an appeal without a note,
    # so one deleted account made every moderator's Appeals list fail to load.
    owner, _reader, reviewer, _page, post, remark = content
    second = moderator(client, app, "second-moderator@example.test")
    hidden_post = decide(client, reviewer, "post", post["id"]).json()["data"]
    hidden_comment = decide(client, reviewer, "comment", remark["id"]).json()["data"]
    open_appeal = appeal(client, owner, hidden_post["id"]).json()["data"]
    resolved = appeal(client, owner, hidden_comment["id"]).json()["data"]
    assert resolve(client, second, resolved["id"], outcome="upheld").status_code == 200
    assert request_deletion(client, owner).status_code == 202
    app.state.clock.now += timedelta(days=7, minutes=1)
    assert app.state.account_deletion.purge_due() == {"purged": 1, "blocked": 0}
    # A week has passed, so the moderator signs in again.
    reviewer = login(client, "moderator@example.test").json()["data"]
    waiting = client.get("/v1/moderation/appeals", params={"status": "open"}, headers=auth(reviewer))
    assert waiting.status_code == 200 and waiting.json()["data"] == []
    upheld = client.get("/v1/moderation/appeals", params={"status": "upheld"}, headers=auth(reviewer)).json()["data"]
    assert [(item["appeal"]["id"], item["appeal"]["note"]) for item in upheld] == [(resolved["id"], "Removed when the account was deleted.")]
    with app.state.sessions() as database:
        assert database.get(ModerationAppeal, open_appeal["id"]) is None

"""Live hints that a search may have changed (DEC-051): who hears about a document, task, event or Space change."""

import asyncio
import json
from uuid import uuid4

from tests.test_documents import add, delete
from tests.test_events import create as create_event
from tests.test_events import event_body, respond
from tests.test_identity import account, auth
from tests.test_live_updates import Hints, leave_or_remove
from tests.test_messaging import admit, advance, family
from tests.test_search_quality import checklist
from tests.test_tasks import change_task, create_task


def hint(space_id, reason):
    return {"kind": "search", "space_id": space_id, "reason": reason}


def listeners(app, **people):
    heard = {name: Hints(app, person) for name, person in people.items()}
    for collected in heard.values():
        collected.since_last()
    return heard


def silent(heard, *names):
    for name in names:
        assert heard[name].since_last() == [], name


def test_a_document_tells_only_the_members_who_may_open_it(client, app):
    owner, member, space_id = family(client, app)
    earlier = add(client, owner, space_id, name="before.txt", content="Plans made before you joined.").json()["data"]
    advance(app, minutes=1)
    newcomer = account(client, app, "newcomer@example.test")
    admit(client, owner, space_id, newcomer)
    outsider = account(client, app, "outsider@example.test")
    heard = listeners(app, owner=owner, member=member, newcomer=newcomer, outsider=outsider)

    # The newcomer could never open the earlier document, so its deletion tells the newcomer nothing.
    assert delete(client, owner, earlier["id"]).status_code == 200
    assert heard["owner"].since_last() == [hint(space_id, "document")]
    assert heard["member"].since_last() == [hint(space_id, "document")]
    silent(heard, "newcomer", "outsider")
    assert delete(client, owner, earlier["id"]).status_code == 200
    silent(heard, "owner", "member")

    key = str(uuid4())
    later = add(client, member, space_id, name="later.txt", content="Shared after everyone joined.", key=key)
    assert later.status_code == 201, later.text
    for name in ("owner", "member", "newcomer"):
        assert heard[name].since_last() == [hint(space_id, "document")], name
    silent(heard, "outsider")
    # A retry, a changed retry, a refused deletion and a refused file change nothing and tell nobody.
    assert add(client, member, space_id, name="later.txt", content="Shared after everyone joined.", key=key).status_code == 201
    assert add(client, member, space_id, name="later.txt", content="Different.", key=key).status_code == 409
    assert delete(client, newcomer, later.json()["data"]["id"]).status_code == 403
    assert add(client, member, space_id, name="scan.pdf", content="x").status_code == 422
    silent(heard, "owner", "member", "newcomer", "outsider")


def test_a_task_tells_only_the_people_it_was_shared_with_and_only_when_a_search_could_change(client, app):
    owner, member, space_id = family(client, app)
    task = create_task(client, owner, space_id).json()["data"]
    advance(app, minutes=1)
    newcomer = account(client, app, "newcomer@example.test")
    admit(client, owner, space_id, newcomer)
    heard = listeners(app, owner=owner, member=member, newcomer=newcomer)
    told = [hint(space_id, "task")]

    def both():
        assert heard["owner"].since_last() == told and heard["member"].since_last() == told
        silent(heard, "newcomer")

    edited = change_task(client, owner, task["id"], {"title": "Buy more groceries"}, etag=client.get(f"/v1/tasks/{task['id']}", headers=auth(owner)).headers["etag"])
    assert edited.status_code == 200, edited.text
    both()
    started = change_task(client, owner, task["id"], {"status": "in_progress"}, etag=edited.headers["etag"], operation="status")
    assert started.status_code == 200, started.text
    both()

    item = checklist(client, owner, task["id"], {"action": "add", "title": "Bread"})["items"][0]
    both()
    checklist(client, owner, task["id"], {"action": "rename", "item_id": item["id"], "title": "Brown bread"})
    both()
    # Ticking an item changes nothing a search shows.
    checklist(client, owner, task["id"], {"action": "check", "item_id": item["id"], "checked": True})
    silent(heard, "owner", "member", "newcomer")
    checklist(client, owner, task["id"], {"action": "remove", "item_id": item["id"]})
    both()

    # A stale edit, a refused status change and a retry change nothing and tell nobody.
    assert change_task(client, owner, task["id"], {"title": "Late edit"}, etag='"stale"').status_code == 412
    assert change_task(client, member, task["id"], {"status": "completed"}, etag=started.headers["etag"], operation="status").status_code in (403, 412)
    silent(heard, "owner", "member", "newcomer")

    # A task made after the newcomer joined is shared with the newcomer too.
    assert create_task(client, member, space_id, title="Pack bags").status_code == 201
    for name in ("owner", "member", "newcomer"):
        assert heard[name].since_last() == told, name


def test_an_event_tells_the_members_who_may_open_it_but_an_answer_tells_nobody(client, app):
    owner, member, space_id = family(client, app)
    event = create_event(client, owner, space_id).json()["data"]
    advance(app, minutes=1)
    newcomer = account(client, app, "newcomer@example.test")
    admit(client, owner, space_id, newcomer)
    heard = listeners(app, owner=owner, member=member, newcomer=newcomer)
    told = [hint(space_id, "event")]

    moved = client.patch(f"/v1/events/{event['id']}", headers={**auth(owner), "If-Match": event["etag"]}, json=event_body(title="Dinner at Rao's"))
    assert moved.status_code == 200, moved.text
    assert heard["owner"].since_last() == told and heard["member"].since_last() == told
    silent(heard, "newcomer")
    # Saying Going, asking again and a refused edit are not changes to anything a search shows.
    assert respond(client, member, event["id"], "going").status_code == 200
    assert client.patch(f"/v1/events/{event['id']}", headers={**auth(member), "If-Match": event["etag"]}, json=event_body(title="Mine")).status_code == 403
    silent(heard, "owner", "member", "newcomer")

    cancelled = client.post(f"/v1/events/{event['id']}/cancel", headers={**auth(owner), "If-Match": moved.json()["data"]["etag"]}, json={})
    assert cancelled.status_code == 200, cancelled.text
    assert heard["owner"].since_last() == told and heard["member"].since_last() == told
    silent(heard, "newcomer")
    assert client.post(f"/v1/events/{event['id']}/cancel", headers={**auth(owner), "If-Match": moved.json()["data"]["etag"]}, json={}).status_code == 200
    silent(heard, "owner", "member")

    assert create_event(client, member, space_id, title="Picnic", local_start="2026-09-26T11:00", local_end=None).status_code == 201
    for name in ("owner", "member", "newcomer"):
        assert heard[name].since_last() == told, name


def test_renaming_a_space_tells_its_members_and_losing_a_place_tells_the_person(client, app):
    owner, member, space_id = family(client, app)
    third = account(client, app, "third@example.test")
    admit(client, owner, space_id, third)
    outsider = account(client, app, "outsider@example.test")
    heard = listeners(app, owner=owner, member=member, third=third, outsider=outsider)

    settings = client.get(f"/v1/spaces/{space_id}/settings", headers=auth(owner))
    assert settings.status_code == 200, settings.text
    renamed = client.patch(
        f"/v1/spaces/{space_id}/settings", headers={**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": settings.json()["data"]["etag"]},
        json={"name": "Morgan household"},
    )
    assert renamed.status_code == 200, renamed.text
    for name in ("owner", "member", "third"):
        assert heard[name].since_last() == [hint(space_id, "space")], name
    silent(heard, "outsider")

    # Only the person who loses the place hears of it for searches; the others' results stay as they are.
    removed = leave_or_remove(client, owner, space_id, member, "remove")
    assert removed.status_code == 200, removed.text
    assert hint(space_id, "access") in heard["member"].since_last()
    assert all(item.get("kind") != "search" for item in heard["owner"].since_last())
    assert all(item.get("kind") != "search" for item in heard["third"].since_last())
    left = leave_or_remove(client, third, space_id, third, "leave")
    assert left.status_code == 200, left.text
    assert hint(space_id, "access") in heard["third"].since_last()
    assert all(item.get("kind") != "search" for item in heard["owner"].since_last())
    # A refused command tells nobody.
    assert leave_or_remove(client, owner, space_id, owner, "leave").status_code == 409
    silent(heard, "owner", "outsider")


def test_a_hint_never_carries_what_changed_and_arrives_on_the_stream(client, app):
    owner, member, space_id = family(client, app)
    service = app.state.live
    service.heartbeat_seconds, service.recheck_seconds = 0.2, 3600

    async def next_frame(stream, prefix):
        deadline = asyncio.get_running_loop().time() + 15
        while True:
            assert asyncio.get_running_loop().time() < deadline, f"No {prefix!r} frame arrived."
            frame = await asyncio.wait_for(anext(stream), timeout=10)
            if frame.startswith(prefix):
                return frame

    async def scenario():
        assert service.open(member["session_token"]) == member["user"]["id"]
        stream = service.stream(member["session_token"], member["user"]["id"])
        assert await anext(stream) == "retry: 5000\n\n"
        assert (await anext(stream)).startswith("event: ready\n")
        created = await asyncio.to_thread(lambda: create_task(client, owner, space_id, title="Passport renewal secret", description="Private words"))
        assert created.status_code == 201, created.text
        frame = await next_frame(stream, "event: change")
        assert frame.endswith("\n\n") and frame.count("data: ") == 1
        payload = json.loads(frame.split("data: ", 1)[1])
        assert payload == hint(space_id, "task")
        assert "Passport" not in frame and "Private" not in frame
        await stream.aclose()

    asyncio.run(scenario())

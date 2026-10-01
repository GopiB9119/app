import hashlib
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.errors import DomainError
from app.modules.files import service as document_service
from app.modules.files.models import SpaceDocument, SpaceDocumentChunk
from app.modules.files.text import PASSAGE_LIMIT, lines_of, passages, prepare
from app.modules.identity.models import OutboxEvent
from app.modules.spaces.models import SpaceAuditEvent
from tests.test_events import create as create_event
from tests.test_identity import account, auth
from tests.test_messaging import admit, advance, expire_while_waiting, family, open_chat, roster_entry, send
from tests.test_spaces import create_space
from tests.test_tasks import create_task

NOTES = (
    "Family insurance\r\n"
    "\r\n"
    "Policy number 4471-B covers the whole family.\r\n"
    "Renewal is due in March; the agent is Priya.\r\n"
)


def add(client, actor, space_id, name="insurance.md", content=NOTES, key=None):
    return client.post(
        f"/v1/spaces/{space_id}/documents", headers={**auth(actor), "Idempotency-Key": key or str(uuid4())},
        json={"name": name, "content": content},
    )


def read(client, actor, document_id):
    return client.get(f"/v1/documents/{document_id}", headers=auth(actor))


def listed(client, actor, space_id, query=""):
    return client.get(f"/v1/spaces/{space_id}/documents{query}", headers=auth(actor))


def delete(client, actor, document_id):
    return client.post(f"/v1/documents/{document_id}/delete", headers=auth(actor), json={})


def search(client, actor, words, space_id=None):
    params = {"q": words, **({"space_id": space_id} if space_id else {})}
    return client.get("/v1/search", headers=auth(actor), params=params)


def found(response, kind):
    assert response.status_code == 200, response.text
    return response.json()["data"][kind]


def rows(app, model, **filters):
    with app.state.sessions() as database:
        statement = select(func.count()).select_from(model)
        for name, value in filters.items():
            statement = statement.where(getattr(model, name) == value)
        return database.scalar(statement)


def test_text_is_normalized_and_every_line_lands_in_exactly_one_passage():
    prepared = prepare("Notes.MD", "\ufeffFirst\r\nsecond\rthird\n")
    assert prepared.text == "First\nsecond\nthird\n" and prepared.media_type == "text/markdown"
    assert prepared.line_count == 3 and prepared.size_bytes == 19
    assert prepared.sha256 == hashlib.sha256(b"First\nsecond\nthird\n").hexdigest()
    assert prepare("a.csv", "x,y\n1,2").media_type == "text/csv" and prepare("b.txt", "x").media_type == "text/plain"
    for name, content, code in (
        ("report.pdf", "text", "UNSUPPORTED_DOCUMENT_TYPE"), (".txt", "text", "UNSUPPORTED_DOCUMENT_TYPE"),
        ("a.txt", "bell\x07", "DOCUMENT_TEXT_INVALID"), ("a.txt", "nul\x00", "DOCUMENT_TEXT_INVALID"),
        ("a.txt", "abc\u202edcba", "DOCUMENT_TEXT_INVALID"), ("a.txt", "lone \ud800", "DOCUMENT_TEXT_INVALID"),
        ("a.txt", " \n\t\n", "DOCUMENT_EMPTY"), ("a.txt", "é" * 262145, "DOCUMENT_TOO_LARGE"),
    ):
        with pytest.raises(DomainError) as error:
            prepare(name, content)
        assert error.value.code == code, (name, content[:10])

    paragraph = " ".join(["word"] * 60)
    text = "\n".join(["", "Title", "", paragraph, paragraph, "", "x" * (PASSAGE_LIMIT * 2 + 10), "", "", paragraph, "end"]) + "\n"
    result = passages(text)
    lines = lines_of(text)
    covered = []
    for passage in result:
        assert text[passage.start_offset:passage.end_offset] == passage.text
        assert len(passage.text) <= PASSAGE_LIMIT
        assert passage.text.strip() == passage.text.strip("\n").strip() and passage.text[0] != "\n" and passage.text[-1] != "\n"
        covered.extend(range(passage.start_line, passage.end_line + 1))
    nonblank = [number for number, line in enumerate(lines, start=1) if line.strip()]
    assert all(number in covered for number in nonblank)
    # Only the cut long line (line 7) appears in more than one passage.
    assert [number for number in set(covered) if covered.count(number) > 1] == [7]
    long_pieces = [passage for passage in result if passage.start_line == passage.end_line == 7]
    assert len(long_pieces) == 3 and "".join(piece.text for piece in long_pieces) == lines[6]


def test_document_is_added_once_read_listed_and_then_deleted_with_everything_derived(client, app):
    owner, member, space_id = family(client, app)
    key = str(uuid4())
    created = add(client, member, space_id, key=key)
    assert created.status_code == 201, created.text
    document = created.json()["data"]
    assert document["name"] == "insurance.md" and document["media_type"] == "text/markdown" and document["status"] == "active"
    assert document["line_count"] == 4 and document["size_bytes"] == len(NOTES.replace("\r\n", "\n").encode())
    assert document["added_by_name"] == "Alex Morgan" and document["can_delete"] is True and "content" not in document
    retry = add(client, member, space_id, key=key)
    assert retry.status_code == 201 and retry.json()["data"]["id"] == document["id"]
    changed = add(client, member, space_id, key=key, content=NOTES + "More.")
    assert changed.status_code == 409 and changed.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    assert rows(app, SpaceDocument) == 1 and rows(app, OutboxEvent, event_type="document.added") == 1

    detail = read(client, owner, document["id"]).json()["data"]
    assert detail["content"] == NOTES.replace("\r\n", "\n") and detail["can_delete"] is True
    assert [item["id"] for item in listed(client, owner, space_id).json()["data"]] == [document["id"]]
    assert rows(app, SpaceDocumentChunk, document_id=document["id"]) >= 1

    removed = delete(client, owner, document["id"])
    assert removed.status_code == 200, removed.text
    assert removed.json()["data"]["status"] == "deleted"
    assert delete(client, owner, document["id"]).json()["data"] == removed.json()["data"]
    assert delete(client, member, document["id"]).status_code == 404
    assert read(client, owner, document["id"]).status_code == 404 and read(client, member, document["id"]).status_code == 404
    assert listed(client, owner, space_id).json()["data"] == []
    assert found(search(client, owner, "insurance"), "documents") == []
    assert rows(app, SpaceDocumentChunk, document_id=document["id"]) == 0
    with app.state.sessions() as database:
        stored = database.get(SpaceDocument, document["id"])
        assert stored.status == "deleted" and stored.content is None and stored.name is None and stored.sha256 is None
        actions = database.scalars(select(SpaceAuditEvent.action).where(SpaceAuditEvent.target_id == document["id"])).all()
    assert sorted(actions) == ["document.added", "document.deleted"]
    # The original request retried after the deletion reports the deletion, never the old text.
    late = add(client, member, space_id, key=key)
    assert late.status_code == 201 and late.json()["data"]["status"] == "deleted" and late.json()["data"]["name"] is None
    # No fingerprint of the deleted text remains to compare a retry against.
    other = add(client, member, space_id, key=key, content="Something else entirely.")
    assert other.status_code == 201 and other.json()["data"] == late.json()["data"]
    with app.state.sessions() as database:
        kept = database.scalar(select(SpaceDocument.creation_digest).where(SpaceDocument.id == document["id"]))
    original = app.state.security.digest(
        "space.document.add", space_id, "insurance.md", hashlib.sha256(NOTES.replace("\r\n", "\n").encode()).hexdigest(),
    )
    assert kept != original


def test_documents_follow_the_admission_history_and_deletion_rules(client, app):
    owner, member, space_id = family(client, app)
    earlier = add(client, owner, space_id, name="before.txt", content="Plans made before you joined.").json()["data"]
    advance(app, minutes=1)
    newcomer = account(client, app, "newcomer@example.test")
    admit(client, owner, space_id, newcomer)
    outsider = account(client, app, "outsider@example.test")
    for actor in (newcomer, outsider):
        assert read(client, actor, earlier["id"]).status_code == 404
        assert delete(client, actor, earlier["id"]).status_code == 404
        assert found(search(client, actor, "plans"), "documents") == []
    assert [item["id"] for item in listed(client, newcomer, space_id).json()["data"]] == []
    assert listed(client, outsider, space_id).status_code == 404 and add(client, outsider, space_id).status_code == 404

    later = add(client, member, space_id, name="later.txt", content="Shared after everyone joined.").json()["data"]
    assert {item["id"] for item in listed(client, newcomer, space_id).json()["data"]} == {later["id"]}
    view = read(client, newcomer, later["id"]).json()["data"]
    assert view["can_delete"] is False
    denied = delete(client, newcomer, later["id"])
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "DOCUMENT_DELETE_DENIED"

    reviewed = roster_entry(client, owner, space_id, member["user"]["id"])
    removal = client.post(
        f"/v1/spaces/{space_id}/members/{member['user']['id']}/remove",
        headers={**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}, json={},
    )
    assert removal.status_code == 200, removal.text
    assert read(client, member, later["id"]).status_code == 404 and delete(client, member, later["id"]).status_code == 404
    assert found(search(client, member, "shared"), "documents") == []
    # The owner may delete what a former member added.
    assert delete(client, owner, later["id"]).status_code == 200
    assert client.get(f"/v1/documents/{later['id']}").status_code == 401


def test_document_input_types_sizes_and_limits(client, app, monkeypatch):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    for name, content, status, code in (
        ("scan.pdf", "text", 422, "UNSUPPORTED_DOCUMENT_TYPE"),
        ("folder/notes.txt", "text", 422, "VALIDATION_ERROR"),
        ("notes.txt", "tab\tand line\nare fine but escape \x1b is not", 422, "DOCUMENT_TEXT_INVALID"),
        ("notes.txt", "a" * (512 * 1024 + 1), 422, "VALIDATION_ERROR"),
        ("notes.txt", "é" * (256 * 1024 + 1), 422, "DOCUMENT_TOO_LARGE"),
    ):
        response = add(client, owner, space_id, name=name, content=content)
        assert response.status_code == status and response.json()["error"]["code"] == code, (name, response.text[:200])
    assert add(client, owner, space_id, name="exact.txt", content="a" * (512 * 1024)).status_code == 201
    # Words too long for the index (PostgreSQL ignores lexemes of 2 KB or more) are still accepted.
    assert add(client, owner, space_id, name="wide.txt", content="漢" * 1200 + "\nshort words").status_code == 201
    oversized = client.post(
        f"/v1/spaces/{space_id}/documents", headers={**auth(owner), "Idempotency-Key": str(uuid4()), "Content-Type": "application/json"},
        content=b'{"name": "big.txt", "content": "' + b"a" * 2_300_000 + b'"}',
    )
    assert oversized.status_code == 413 and oversized.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"
    # The larger allowance belongs to this one route; everything else keeps the 16 KB limit.
    events = create_event(client, owner, space_id, description="x" * 20000)
    assert events.status_code == 413

    monkeypatch.setattr(document_service, "MAX_DOCUMENTS_PER_SPACE", 3)
    assert add(client, owner, space_id, name="two.txt", content="second").status_code == 201
    full = add(client, owner, space_id, name="three.txt", content="third")
    assert full.status_code == 409 and full.json()["error"]["code"] == "DOCUMENT_LIMIT_REACHED"
    monkeypatch.setattr(document_service, "MAX_DOCUMENTS_PER_SPACE", 200)
    monkeypatch.setattr(document_service, "MAX_BYTES_PER_SPACE", 512 * 1024 + 10)
    tight = add(client, owner, space_id, name="four.txt", content="more than ten bytes")
    assert tight.status_code == 409 and tight.json()["error"]["code"] == "DOCUMENT_LIMIT_REACHED"


def test_document_add_saves_nothing_when_the_session_expires_while_waiting(client, app):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    late = expire_while_waiting(app, "spaces", space_id, lambda: add(client, owner, space_id))
    assert late.status_code == 401, late.text
    assert rows(app, SpaceDocument) == 0 and rows(app, SpaceDocumentChunk) == 0


def test_parallel_retries_add_one_document(client, app):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    key = str(uuid4())
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: add(client, owner, space_id, key=key), range(4)))
    assert all(result.status_code == 201 for result in results), [result.text for result in results]
    assert len({result.json()["data"]["id"] for result in results}) == 1 and rows(app, SpaceDocument) == 1


def test_search_returns_only_what_the_person_can_open_now(client, app):
    owner, member, space_id = family(client, app)
    other_space = create_space(client, owner, name="Owner only").json()["data"]["id"]
    task = create_task(client, owner, space_id, title="Renew passports", description="Book the passport office slot").json()["data"]
    event = create_event(client, owner, space_id, title="Passport office visit", location="Begumpet").json()["data"]
    document = add(client, owner, space_id).json()["data"]
    telugu = add(client, owner, space_id, name="trip.txt", content="హైదరాబాద్ ప్రయాణం\nరైలు టికెట్లు").json()["data"]
    private = add(client, owner, other_space, name="private.txt", content="Passport copies for the owner only.").json()["data"]
    chat = open_chat(client, owner, space_id).json()["data"]
    assert send(client, owner, chat["id"], "zebrafinch passport secret").status_code == 201

    results = search(client, member, "passport").json()["data"]
    assert [item["task_id"] for item in results["tasks"]] == [task["id"]]
    assert [item["event_id"] for item in results["events"]] == [event["id"]]
    assert results["documents"] == [] and results["more_tasks"] is False
    mine = search(client, owner, "passport").json()["data"]
    assert [item["document_id"] for item in mine["documents"]] == [private["id"]]
    assert mine["documents"][0]["space_name"] == "Owner only"
    assert found(search(client, owner, "passport", space_id), "documents") == []
    assert search(client, member, "passport", other_space).status_code == 404
    assert found(search(client, owner, "zebrafinch"), "documents") == [] and found(search(client, owner, "zebrafinch"), "tasks") == []

    # Word beginnings, any order, every word required; operators typed by the person are plain text.
    for words in ("insur", "polic numb", "number policy", "4471", "priya renewal", "insur & | ! :*"):
        hits = found(search(client, member, words), "documents")
        assert [hit["document_id"] for hit in hits] == [document["id"]], words
    hit = found(search(client, member, "renewal"), "documents")[0]
    assert (hit["start_line"], hit["end_line"]) == (1, 4) and "Renewal" in hit["excerpt"] and hit["name"] == "insurance.md"
    assert found(search(client, member, "insurance banana"), "documents") == []
    assert found(search(client, member, "హైదరాబాద్"), "documents")[0]["document_id"] == telugu["id"]
    assert found(search(client, member, "begumpet"), "events")[0]["event_id"] == event["id"]
    assert found(search(client, member, "slot"), "tasks")[0]["excerpt"] == "Book the passport office slot"
    for words, code in (("!!!", "SEARCH_WORDS_REQUIRED"), ("x" * 201, "VALIDATION_ERROR")):
        rejected = search(client, member, words)
        assert rejected.status_code == 422 and rejected.json()["error"]["code"] == code
    # Characters that count as words here but not for PostgreSQL find nothing instead of failing.
    for words in ("\u0301", "½", "\u0301½"):
        nothing = search(client, member, words)
        assert nothing.status_code == 200, nothing.text
        assert nothing.json()["data"]["documents"] == [] and nothing.json()["data"]["tasks"] == []
    assert client.get("/v1/search", params={"q": "passport"}).status_code == 401
    # Someone admitted afterwards finds none of it: tasks keep their creation-time audience, the rest the admission boundary.
    advance(app, minutes=1)
    newcomer = account(client, app, "newcomer@example.test")
    admit(client, owner, space_id, newcomer)
    late = search(client, newcomer, "passport insur").json()["data"]
    assert late["documents"] == [] and late["tasks"] == [] and late["events"] == []
    for words in ("passport", "insurance", "హైదరాబాద్"):
        assert search(client, newcomer, words).json()["data"] == {**late, "query": words}
    # A former member who returns has a new admission and finds nothing from before it.
    reviewed = roster_entry(client, owner, space_id, member["user"]["id"])
    removal = client.post(
        f"/v1/spaces/{space_id}/members/{member['user']['id']}/remove",
        headers={**auth(owner), "Idempotency-Key": str(uuid4()), "If-Match": reviewed["etag"]}, json={},
    )
    assert removal.status_code == 200, removal.text
    gone = search(client, member, "passport insur").json()["data"]
    assert gone["tasks"] == [] and gone["events"] == [] and gone["documents"] == []
    advance(app, minutes=1)
    admit(client, owner, space_id, member)
    back = search(client, member, "passport").json()["data"]
    assert back["tasks"] == [] and back["events"] == [] and back["documents"] == []


def test_search_ranks_documents_and_bounds_passages(client, app):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    long_text = "\n\n".join(f"Section {number}: garden watering notes, part {number}." + " filler" * 120 for number in range(8))
    many = add(client, owner, space_id, name="notes.txt", content=long_text).json()["data"]
    titled = add(client, owner, space_id, name="garden plan.md", content="Seeds and soil.").json()["data"]
    hits = found(search(client, owner, "garden"), "documents")
    # A name match counts more than a passage that mentions the word once.
    assert hits[0]["document_id"] == titled["id"] and hits[0]["start_line"] == 1
    assert [hit["document_id"] for hit in hits].count(many["id"]) == 3


def test_documents_and_search_openapi_require_sessions(client):
    schema = client.get("/openapi.json").json()
    paths = {
        "/v1/spaces/{space_id}/documents": {"get", "post"}, "/v1/documents/{document_id}": {"get"},
        "/v1/documents/{document_id}/delete": {"post"}, "/v1/search": {"get"},
    }
    for path, methods in paths.items():
        assert set(schema["paths"][path]) == methods
        for method in methods:
            assert schema["paths"][path][method]["security"] == [{"AccountSession": []}]
    document = schema["components"]["schemas"]["DocumentView"]["properties"]
    assert "content" not in document and "creation_key" not in document and "added_by_id" not in document

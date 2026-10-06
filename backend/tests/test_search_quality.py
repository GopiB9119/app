"""Search inside your Spaces: what it matches, how it ranks, how far it reaches (DEC-015, DEC-051)."""

from uuid import uuid4

from alembic import command
from alembic.config import Config
from sqlalchemy import text

from tests.test_documents import add
from tests.test_events import create as create_event
from tests.test_identity import account, auth
from tests.test_messaging import admit, advance, family
from tests.test_spaces import create_space
from tests.test_tasks import change_task, create_task

PREVIOUS_HEAD = "0045"

LETTER = (
    "Insurance policy 4471-B\n"
    "Mail the form to alex@example.test or call +91 98765-43210.\n"
    "Renewal due 2026-10-04, pay 1,250.50 at https://pay.example.com/policy/renew.\n"
    "Keep the scan as insurance_policy_2026.pdf and the report v1.2.3.\n"
)


def query(client, actor, words, **params):
    return client.get("/v1/search", headers=auth(actor), params={"q": words, **params})


def hits(client, actor, words, kind, **params):
    response = query(client, actor, words, **params)
    assert response.status_code == 200, response.text
    return response.json()["data"][kind]


def checklist(client, actor, task_id, body):
    path = f"/v1/tasks/{task_id}/checklist"
    current = client.get(path, headers=auth(actor)).json()["data"]
    response = client.post(path, headers={**auth(actor), "If-Match": current["etag"], "Idempotency-Key": str(uuid4())}, json=body)
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_numbers_dates_addresses_and_file_names_are_found_by_their_parts(client, app):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    letter = add(client, owner, space_id, name="letter.md", content=LETTER).json()["data"]
    for words in (
        "10", "04", "alex", "example", "pay.example.com", "alex@example.test", "98765", "43210", "+91 98765-43210",
        "250", "2026-10-04", "insurance_policy_2026.pdf", "pdf", "v1", "report v1.2.3", "https://pay.example.com/policy/renew",
        "4471-b", "4471",
    ):
        assert [hit["document_id"] for hit in hits(client, owner, words, "documents")] == [letter["id"]], words
    for words in ("4472", "alex@other.test", "example.org", "9876543210", "2026-11-04"):
        assert hits(client, owner, words, "documents") == [], words

    # A name counts even when no passage has the word, and parts of a file name are words too.
    named = add(client, owner, space_id, name="zebrafinch_ledger.md", content="Plain words only.").json()["data"]
    assert [hit["document_id"] for hit in hits(client, owner, "ledger", "documents")] == [named["id"]]
    assert [hit["document_id"] for hit in hits(client, owner, "zebrafinch ledger md", "documents")] == [named["id"]]

    task = create_task(client, owner, space_id, title="Call alex@example.test", description="Pay by 04/10/2026 or 2026-10-04.").json()["data"]
    event = create_event(client, owner, space_id, title="Meet at www.example.org/hall", location="Block C/Room 4.2").json()["data"]
    for words in ("example", "10", "2026", "04/10", "alex@example.test"):
        assert [hit["task_id"] for hit in hits(client, owner, words, "tasks")] == [task["id"]], words
    for words in ("hall", "example.org", "room 4.2", "4 2", "block"):
        assert [hit["event_id"] for hit in hits(client, owner, words, "events")] == [event["id"]], words


def test_telugu_and_hindi_words_stay_whole_beside_separators(client, app):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    telugu = add(client, owner, space_id, name="trip.txt", content="హైదరాబాద్ ప్రయాణం\nఫోన్: 98765-43210, రైలు టికెట్లు").json()["data"]
    hindi = add(client, owner, space_id, name="meeting.txt", content="परिवार की बैठक: शनिवार–रविवार 10:30 बजे।").json()["data"]
    for words in ("హైదరాబాద్", "ప్రయాణం", "ఫోన్", "43210", "98765-43210", "రైలు టికెట్లు"):
        assert [hit["document_id"] for hit in hits(client, owner, words, "documents")] == [telugu["id"]], words
    for words in ("बैठक", "शनिवार", "रविवार", "10", "10:30", "बजे"):
        assert [hit["document_id"] for hit in hits(client, owner, words, "documents")] == [hindi["id"]], words
    # Every word is required, in whatever script it is written.
    assert hits(client, owner, "ప్రయాణం बैठक", "documents") == []


def test_tasks_are_found_by_their_checklist_and_show_the_checklist_text(client, app):
    owner, member, space_id = family(client, app)
    task = create_task(client, owner, space_id, title="Weekend shopping", description="Before Saturday.").json()["data"]
    rice = checklist(client, owner, task["id"], {"action": "add", "title": "Basmati rice 5 kg"})["items"][0]
    checklist(client, owner, task["id"], {"action": "add", "title": "Fresh coriander"})
    advance(app, minutes=1)
    newcomer = account(client, app, "newcomer@example.test")
    admit(client, owner, space_id, newcomer)

    by_checklist = hits(client, owner, "coriander", "tasks")
    assert [hit["task_id"] for hit in by_checklist] == [task["id"]]
    assert by_checklist[0]["excerpt"] == "Fresh coriander" and by_checklist[0]["excerpt_in"] == "checklist"
    by_notes = hits(client, owner, "saturday", "tasks")
    assert by_notes[0]["excerpt"] == "Before Saturday." and by_notes[0]["excerpt_in"] == "notes"
    # Only the title matches: the notes are shown, as before.
    assert hits(client, owner, "weekend", "tasks")[0]["excerpt_in"] == "notes"
    # Every word must match somewhere in the task, whichever part has it.
    assert [hit["task_id"] for hit in hits(client, owner, "weekend rice", "tasks")] == [task["id"]]
    assert [hit["task_id"] for hit in hits(client, member, "coriander", "tasks")] == [task["id"]]
    assert hits(client, owner, "weekend lentils", "tasks") == []
    # The checklist is part of the task: whoever has no grant to the task finds nothing in it.
    assert hits(client, newcomer, "coriander", "tasks") == []

    # Checking an item changes nothing found; renaming and removing do.
    checklist(client, owner, task["id"], {"action": "check", "item_id": rice["id"], "checked": True})
    assert [hit["task_id"] for hit in hits(client, owner, "basmati", "tasks")] == [task["id"]]
    checklist(client, owner, task["id"], {"action": "rename", "item_id": rice["id"], "title": "Brown rice"})
    assert hits(client, owner, "basmati", "tasks") == []
    assert hits(client, owner, "brown", "tasks")[0]["excerpt"] == "Brown rice"
    current = checklist(client, owner, task["id"], {"action": "remove", "item_id": rice["id"]})
    assert [item["title"] for item in current["items"]] == ["Fresh coriander"]
    assert hits(client, owner, "brown", "tasks") == []
    # Closed tasks keep their words.
    assert change_task(client, owner, task["id"], {"status": "cancelled"}, etag=client.get(f"/v1/tasks/{task['id']}", headers=auth(owner)).headers["etag"], operation="status").status_code == 200
    assert hits(client, owner, "coriander", "tasks")[0]["status"] == "cancelled"


def test_a_title_match_outranks_a_match_in_the_notes_or_the_checklist(client, app):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    titled = create_task(client, owner, space_id, title="Garden plan", description="Pots and soil.").json()["data"]
    in_notes = create_task(client, owner, space_id, title="Buy pots", description="For the garden, near the gate.").json()["data"]
    in_list = create_task(client, owner, space_id, title="Buy soil", description="").json()["data"]
    checklist(client, owner, in_list["id"], {"action": "add", "title": "Garden gloves"})
    # The newest task would come first among equals, so the order below comes from where the word is.
    assert [hit["task_id"] for hit in hits(client, owner, "garden", "tasks")] == [titled["id"], in_notes["id"], in_list["id"]]

    day = dict(local_end=None, description="", location="")
    in_title = create_event(client, owner, space_id, title="Garden party", **{**day, "local_start": "2026-09-25T18:30"}).json()["data"]
    in_place = create_event(client, owner, space_id, title="Family lunch", **{**day, "location": "Garden cafe", "local_start": "2026-09-26T13:00"}).json()["data"]
    in_details = create_event(client, owner, space_id, title="Birthday", **{**day, "description": "Cake in the garden.", "local_start": "2026-09-27T13:00"}).json()["data"]
    assert [hit["event_id"] for hit in hits(client, owner, "garden", "events")] == [in_title["id"], in_place["id"], in_details["id"]]


def test_the_limit_widens_the_results_up_to_one_hundred(client, app):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    for number in range(25):
        assert create_task(client, owner, space_id, title=f"Quarterly report {number}", description="").status_code == 201
    default = query(client, owner, "quarterly").json()["data"]
    assert default["limit"] == 20 and len(default["tasks"]) == 20 and default["more_tasks"] is True
    for limit, count, more in ((1, 1, True), (24, 24, True), (25, 25, False), (100, 25, False)):
        data = query(client, owner, "quarterly", limit=limit).json()["data"]
        assert data["limit"] == limit and len(data["tasks"]) == count and data["more_tasks"] is more, limit
        assert len({hit["task_id"] for hit in data["tasks"]}) == count
    wide = query(client, owner, "quarterly", limit=40).json()["data"]["tasks"]
    narrow = query(client, owner, "quarterly", limit=20).json()["data"]["tasks"]
    assert [hit["task_id"] for hit in wide[:20]] == [hit["task_id"] for hit in narrow]
    for bad in ("0", "101", "-1", "many", ""):
        refused = query(client, owner, "quarterly", limit=bad)
        assert refused.status_code == 422 and refused.json()["error"]["code"] == "VALIDATION_ERROR", bad


def test_search_openapi_describes_the_limit_and_where_a_task_matched(client):
    schema = client.get("/openapi.json").json()
    parameters = {item["name"]: item for item in schema["paths"]["/v1/search"]["get"]["parameters"]}
    assert set(parameters) == {"q", "space_id", "limit"}
    assert parameters["limit"]["schema"]["minimum"] == 1 and parameters["limit"]["schema"]["maximum"] == 100
    assert parameters["limit"]["schema"]["default"] == 20
    results = schema["components"]["schemas"]["SearchResults"]["properties"]
    assert results["limit"]["type"] == "integer"
    assert schema["components"]["schemas"]["TaskHit"]["properties"]["excerpt_in"]["enum"] == ["notes", "checklist"]


def test_the_search_index_migration_keeps_documents_and_finds_more_after_it(client, app):
    owner = account(client, app)
    space_id = create_space(client, owner).json()["data"]["id"]
    letter = add(client, owner, space_id, name="letter.md", content="Scan saved as insurance_policy_2026.pdf today.").json()["data"]
    assert [hit["document_id"] for hit in hits(client, owner, "2026", "documents")] == [letter["id"]]
    settings = Config("alembic.ini")
    try:
        command.downgrade(settings, PREVIOUS_HEAD)
        with app.state.engine.connect() as connection:
            assert connection.scalar(text("SELECT count(*) FROM space_document_chunks")) == 1
        # Before the migration a file name was one word.
        assert hits(client, owner, "2026", "documents") == []
        assert [hit["document_id"] for hit in hits(client, owner, "insurance", "documents")] == [letter["id"]]
    finally:
        command.upgrade(settings, "head")
    assert [hit["document_id"] for hit in hits(client, owner, "2026", "documents")] == [letter["id"]]
    assert [hit["document_id"] for hit in hits(client, owner, "pdf", "documents")] == [letter["id"]]

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from alembic import command
from alembic.config import Config
from sqlalchemy import func, select, text

from app.modules.care.models import CareAudit, CareCommand, CareDoseReport, CareInstruction
from app.modules.identity.models import OutboxEvent

from .test_identity import PASSWORD, account, auth
from .test_spaces import membership_fixture

INSTRUCTION = {
    "medicine_name": "Synthetic Medicine A",
    "strength": "250 mg / 5 mL",
    "form": "oral liquid",
    "dose": "½ spoon (as written on label)",
    "instructions": "After breakfast.\r\nDo not take with grapefruit juice.",
    "source": "package_label",
    "timezone": "Asia/Kolkata",
    "times": ["20:00", "08:00"],
    "start_date": "2026-09-19",
    "end_date": None,
    "confirmed": True,
}


def sign_in(client, email="alex@example.test"):
    response = client.post("/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return response.json()["data"]


def create_instruction(client, actor, key=None, **changes):
    return client.post(
        "/v1/care/instructions",
        headers={**auth(actor), "Idempotency-Key": key or str(uuid4())},
        json={**INSTRUCTION, **changes},
    )


def care_day(client, actor, day="2026-09-19"):
    response = client.get(f"/v1/care/day?date={day}", headers=auth(actor))
    assert response.status_code == 200, response.text
    return response.json()["data"]


def report(client, actor, occurrence, outcome, key=None, etag=None):
    return client.post(
        f"/v1/care/instructions/{occurrence['instruction_id']}/reports",
        headers={**auth(actor), "Idempotency-Key": key or str(uuid4()), "If-Match": etag or occurrence["etag"]},
        json={"local_date": occurrence["local_date"], "local_time": occurrence["local_time"], "outcome": outcome},
    )


def stop(client, actor, instruction, key=None, etag=None):
    return client.post(
        f"/v1/care/instructions/{instruction['id']}/stop",
        headers={**auth(actor), "Idempotency-Key": key or str(uuid4()), "If-Match": etag or instruction["etag"]},
        json={},
    )


def test_subject_records_confirmed_instruction_exactly_and_privately(client, app):
    subject = account(client, app)
    key = str(uuid4())
    created = create_instruction(client, subject, key)
    assert created.status_code == 201, created.text
    view = created.json()["data"]
    assert created.headers["etag"] == view["etag"]
    assert created.headers["location"] == f"/v1/care/instructions/{view['id']}"
    assert created.headers["cache-control"] == "no-store"
    assert {name: view[name] for name in ("medicine_name", "strength", "form", "dose", "source", "timezone")} == {
        name: INSTRUCTION[name] for name in ("medicine_name", "strength", "form", "dose", "source", "timezone")
    }
    assert view["instructions"] == "After breakfast.\nDo not take with grapefruit juice."
    assert view["times"] == ["08:00", "20:00"]
    assert view["status"] == "active" and view["version"] == 1 and view["stopped_at"] is None
    assert view["confirmed_by_account_id"] == subject["user"]["id"]
    replay = create_instruction(client, subject, key)
    assert replay.status_code == 201 and replay.json()["data"] == view
    assert create_instruction(client, subject, key, dose="1 spoon").json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    read = client.get(f"/v1/care/instructions/{view['id']}", headers=auth(subject))
    assert read.status_code == 200 and read.json()["data"] == view and read.headers["etag"] == view["etag"]
    listed = client.get("/v1/care/instructions", headers=auth(subject)).json()["data"]
    assert listed == [view]
    assert client.get("/v1/care/instructions?status=stopped", headers=auth(subject)).json()["data"] == []
    with app.state.sessions() as database:
        stored = database.get(CareInstruction, view["id"])
        assert "Synthetic Medicine" not in stored.payload_cipher and "spoon" not in stored.payload_cipher
        assert database.scalar(select(func.count()).select_from(CareInstruction)) == 1
        assert database.scalar(select(func.count()).select_from(CareCommand)) == 1
        audit = database.scalars(select(CareAudit)).one()
        assert audit.action == "care.instruction_created" and audit.instruction_id == view["id"]
        event = database.get(OutboxEvent, audit.id)
        assert event.event_type == "care.instruction_created" and event.aggregate_id == view["id"]


def test_confirmation_and_strict_structural_inputs_are_required(client, app):
    subject = account(client, app)
    for changes in (
        {"confirmed": False}, {"confirmed": "true"}, {"times": ["8:00"]}, {"times": ["24:00"]}, {"times": ["08:00:00"]},
        {"times": ["08:00", "08:00"]}, {"times": []}, {"times": ["01:00", "02:00", "03:00", "04:00", "05:00", "06:00", "07:00"]},
        {"timezone": "IST"}, {"timezone": "Mars/Base"}, {"medicine_name": "  "}, {"medicine_name": "A\u0000B"},
        {"dose": ""}, {"dose": "x" * 121}, {"instructions": "x" * 501}, {"start_date": "2026-9-19"},
        {"start_date": "20260919"}, {"end_date": "2026-09-18"}, {"source": "doctor_app"}, {"dose_mg": 5},
    ):
        response = create_instruction(client, subject, **changes)
        assert response.status_code == 422, (changes, response.text)
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    missing = {name: value for name, value in INSTRUCTION.items() if name != "confirmed"}
    response = client.post("/v1/care/instructions", headers={**auth(subject), "Idempotency-Key": str(uuid4())}, json=missing)
    assert response.status_code == 422
    assert create_instruction(client, subject, start_date="2026-08-19").json()["error"]["code"] == "START_DATE_OUT_OF_RANGE"
    assert create_instruction(client, subject, start_date="2027-09-21").json()["error"]["code"] == "START_DATE_OUT_OF_RANGE"
    assert create_instruction(client, subject, end_date="2036-10-01").json()["error"]["code"] == "END_DATE_OUT_OF_RANGE"
    assert create_instruction(client, subject, end_date="2036-09-19").status_code == 201
    assert client.post("/v1/care/instructions", headers=auth(subject), json=INSTRUCTION).status_code == 422
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(CareInstruction)) == 1


def test_family_owner_other_accounts_and_signed_out_callers_get_no_care_data(client, app):
    owner, member, _space_id, _invitation_id, _reviewed = membership_fixture(client, app)
    stranger = account(client, app, "care-stranger@example.test")
    instruction = create_instruction(client, member).json()["data"]
    occurrence = care_day(client, member)["occurrences"][0]
    for outsider in (owner, stranger):
        assert client.get(f"/v1/care/instructions/{instruction['id']}", headers=auth(outsider)).status_code == 404
        assert client.get("/v1/care/instructions", headers=auth(outsider)).json()["data"] == []
        assert care_day(client, outsider) == {"local_date": "2026-09-19", "instructions": [], "occurrences": [], "omitted": []}
        assert stop(client, outsider, instruction).status_code == 404
        assert report(client, outsider, occurrence, "taken").status_code == 404
    assert client.get("/v1/care/instructions").status_code == 401
    assert client.get("/v1/care/day?date=2026-09-19").status_code == 401
    assert client.get(f"/v1/care/instructions/{instruction['id']}", headers=auth(member)).status_code == 200
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(CareDoseReport)) == 0
        assert database.get(CareInstruction, instruction["id"]).status == "active"
    assert client.post("/v1/auth/logout", headers=auth(member)).status_code == 200
    assert client.get(f"/v1/care/instructions/{instruction['id']}", headers=auth(member)).status_code == 401


def test_day_view_derives_single_occurrences_and_records_self_reports(client, app):
    subject = account(client, app)
    instruction = create_instruction(client, subject).json()["data"]
    day = care_day(client, subject)
    assert day["instructions"] == [{
        "id": instruction["id"], "medicine_name": "Synthetic Medicine A", "strength": "250 mg / 5 mL",
        "form": "oral liquid", "dose": "½ spoon (as written on label)", "status": "active",
    }]
    morning, evening = day["occurrences"]
    assert (morning["local_time"], morning["display_time"], morning["scheduled_at"]) == ("08:00", "08:00", "2026-09-19T02:30:00Z")
    assert (evening["local_time"], evening["scheduled_at"]) == ("20:00", "2026-09-19T14:30:00Z")
    assert morning["can_report"] is True and evening["can_report"] is False
    assert morning["report"] is None and morning["clock_change"] == "none" and day["omitted"] == []
    assert care_day(client, subject, "2026-09-18")["occurrences"] == []
    missing = client.post(
        f"/v1/care/instructions/{instruction['id']}/reports",
        headers={**auth(subject), "Idempotency-Key": str(uuid4())},
        json={"local_date": "2026-09-19", "local_time": "08:00", "outcome": "taken"},
    )
    assert missing.status_code == 428
    key = str(uuid4())
    taken = report(client, subject, morning, "taken", key)
    assert taken.status_code == 200, taken.text
    recorded = taken.json()["data"]
    assert recorded["report"]["outcome"] == "taken" and recorded["report"]["revision"] == 1
    assert recorded["etag"] != morning["etag"]
    replay = report(client, subject, morning, "taken", key)
    assert replay.status_code == 200 and replay.json()["data"] == recorded
    assert report(client, subject, morning, "skipped", key).json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    assert report(client, subject, morning, "skipped").json()["error"]["code"] == "PRECONDITION_FAILED"
    assert report(client, subject, recorded, "taken").json()["error"]["code"] == "NO_CHANGES"
    corrected = report(client, subject, recorded, "skipped")
    assert corrected.status_code == 200
    assert corrected.json()["data"]["report"]["outcome"] == "skipped" and corrected.json()["data"]["report"]["revision"] == 2
    assert report(client, subject, evening, "taken").json()["error"]["code"] == "REPORT_TOO_EARLY"
    unscheduled = {**morning, "local_time": "09:00"}
    assert report(client, subject, unscheduled, "taken").status_code == 404
    before_start = {**morning, "local_date": "2026-09-18"}
    assert report(client, subject, before_start, "taken").status_code == 404
    app.state.clock.now += timedelta(days=8)
    subject = sign_in(client)
    late = care_day(client, subject)["occurrences"][1]
    assert late["can_report"] is False
    assert report(client, subject, late, "taken").json()["error"]["code"] == "REPORT_WINDOW_CLOSED"
    with app.state.sessions() as database:
        stored = database.scalars(select(CareDoseReport)).one()
        assert (stored.outcome, stored.revision, stored.local_time) == ("skipped", 2, "08:00")
        actions = sorted(database.scalars(select(CareAudit.action)).all())
        assert actions == ["care.dose_report_corrected", "care.dose_reported", "care.instruction_created"]
        assert database.scalar(select(func.count()).select_from(CareCommand)) == 3


def test_stop_preserves_past_reports_and_removes_later_occurrences(client, app):
    subject = account(client, app)
    instruction = create_instruction(client, subject).json()["data"]
    morning = care_day(client, subject)["occurrences"][0]
    assert report(client, subject, morning, "taken").status_code == 200
    key = str(uuid4())
    stopped = stop(client, subject, instruction, key)
    assert stopped.status_code == 200, stopped.text
    view = stopped.json()["data"]
    assert view["status"] == "stopped" and view["version"] == 2 and view["stopped_at"] == "2026-09-19T10:00:00Z"
    assert stopped.headers["etag"] == view["etag"] != instruction["etag"]
    assert stop(client, subject, instruction, key).json()["data"] == view
    assert stop(client, subject, instruction).json()["error"]["code"] == "PRECONDITION_FAILED"
    assert stop(client, subject, view).json()["error"]["code"] == "ALREADY_STOPPED"
    missing = client.post(f"/v1/care/instructions/{instruction['id']}/stop", headers={**auth(subject), "Idempotency-Key": str(uuid4())}, json={})
    assert missing.status_code == 428
    day = care_day(client, subject)
    assert [item["local_time"] for item in day["occurrences"]] == ["08:00"]
    assert day["occurrences"][0]["report"]["outcome"] == "taken"
    assert day["instructions"][0]["status"] == "stopped"
    assert care_day(client, subject, "2026-09-20")["occurrences"] == []
    assert client.get("/v1/care/instructions", headers=auth(subject)).json()["data"] == []
    assert client.get("/v1/care/instructions?status=stopped", headers=auth(subject)).json()["data"] == [view]
    assert client.get("/v1/care/instructions?status=paused", headers=auth(subject)).status_code == 422


def test_clock_changes_never_create_duplicate_or_missing_prompts(client, app):
    app.state.clock.now = datetime(2026, 10, 31, 12, 0, tzinfo=timezone.utc)
    subject = account(client, app)
    fold = create_instruction(client, subject, timezone="America/New_York", times=["01:30", "02:30"], start_date="2026-10-31").json()["data"]
    occurrences = care_day(client, subject, "2026-11-01")["occurrences"]
    assert [(item["local_time"], item["display_time"], item["scheduled_at"], item["clock_change"]) for item in occurrences] == [
        ("01:30", "01:30", "2026-11-01T05:30:00Z", "repeated_time_first"),
        ("02:30", "02:30", "2026-11-01T07:30:00Z", "none"),
    ]
    assert stop(client, subject, fold).status_code == 200
    app.state.clock.now = datetime(2027, 3, 13, 12, 0, tzinfo=timezone.utc)
    subject = sign_in(client)
    create_instruction(client, subject, timezone="America/New_York", times=["02:30", "03:30", "08:00"], start_date="2027-03-13")
    create_instruction(client, subject, timezone="America/New_York", times=["02:15"], start_date="2027-03-13", medicine_name="Synthetic Medicine B")
    day = care_day(client, subject, "2027-03-14")
    shown = [(item["local_time"], item["display_time"], item["scheduled_at"], item["clock_change"]) for item in day["occurrences"]]
    assert shown == [
        ("02:15", "03:15", "2027-03-14T07:15:00Z", "shifted_forward"),
        ("03:30", "03:30", "2027-03-14T07:30:00Z", "none"),
        ("08:00", "08:00", "2027-03-14T12:00:00Z", "none"),
    ]
    assert [(item["local_time"], item["same_moment_as"]) for item in day["omitted"]] == [("02:30", "03:30")]
    gap = next(item for item in day["occurrences"] if item["local_time"] == "03:30")
    assert report(client, subject, {**gap, "local_time": "02:30"}, "taken").status_code == 404
    london = create_instruction(client, subject, timezone="Europe/London", times=["01:30"], start_date="2027-03-13").json()["data"]
    spring = [item for item in care_day(client, subject, "2027-03-28")["occurrences"] if item["instruction_id"] == london["id"]]
    assert [(item["display_time"], item["scheduled_at"], item["clock_change"]) for item in spring] == [("02:30", "2027-03-28T01:30:00Z", "shifted_forward")]


def test_day_range_limits_and_rate_limits_are_bounded(client, app):
    subject = account(client, app)
    assert client.get("/v1/care/day?date=2026-10-21", headers=auth(subject)).json()["error"]["code"] == "DATE_OUT_OF_RANGE"
    assert client.get("/v1/care/day?date=2026-9-19", headers=auth(subject)).status_code == 422
    assert client.get("/v1/care/day", headers=auth(subject)).status_code == 422
    for number in range(20):
        assert create_instruction(client, subject, medicine_name=f"Synthetic Medicine {number}").status_code == 201
    limited = create_instruction(client, subject, medicine_name="Synthetic Medicine 21")
    assert limited.status_code == 429 and limited.json()["error"]["code"] == "RATE_LIMITED"
    assert len(care_day(client, subject)["instructions"]) == 20


def test_required_audit_failure_rolls_back_care_writes(client, app):
    subject = account(client, app)
    instruction = create_instruction(client, subject).json()["data"]
    occurrence = care_day(client, subject)["occurrences"][0]
    with app.state.engine.begin() as connection:
        connection.execute(text("CREATE FUNCTION test_reject_care_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$"))
        connection.execute(text("CREATE TRIGGER test_care_audit_failure BEFORE INSERT ON domain_outbox FOR EACH ROW EXECUTE FUNCTION test_reject_care_outbox()"))
    try:
        assert create_instruction(client, subject, medicine_name="Synthetic Medicine B").status_code == 503
        assert report(client, subject, occurrence, "taken").status_code == 503
        assert stop(client, subject, instruction).status_code == 503
    finally:
        with app.state.engine.begin() as connection:
            connection.execute(text("DROP TRIGGER test_care_audit_failure ON domain_outbox"))
            connection.execute(text("DROP FUNCTION test_reject_care_outbox()"))
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(CareInstruction)) == 1
        assert database.scalar(select(func.count()).select_from(CareDoseReport)) == 0
        assert database.scalar(select(func.count()).select_from(CareCommand)) == 1
        assert database.get(CareInstruction, instruction["id"]).status == "active"
    assert report(client, subject, occurrence, "taken").status_code == 200
    assert stop(client, subject, instruction).status_code == 200


def test_care_migration_round_trip_and_openapi(client, app):
    schema = client.get("/openapi.json").json()
    for path in ("/v1/care/instructions", "/v1/care/instructions/{instruction_id}", "/v1/care/instructions/{instruction_id}/stop",
                 "/v1/care/instructions/{instruction_id}/reports", "/v1/care/day"):
        assert path in schema["paths"]
    settings = Config("alembic.ini")
    try:
        command.downgrade(settings, "0015")
        with app.state.engine.connect() as connection:
            assert connection.scalar(text("SELECT to_regclass('care_instructions')")) is None
    finally:
        command.upgrade(settings, "head")
    subject = account(client, app)
    assert create_instruction(client, subject).status_code == 201
    from tests.test_migrations import test_migrated_schema_matches_models

    test_migrated_schema_matches_models(app)

"""DEC-030 (T155): a correction keeps every earlier dose answer, and account deletion erases them."""

from datetime import timedelta

from sqlalchemy import func, select

from app.modules.care.models import CareDoseAnswer

from .test_account_deletion import request_deletion
from .test_care import care_day, create_instruction, report
from .test_identity import account


def test_a_correction_keeps_each_earlier_answer_newest_first(client, app):
    subject = account(client, app)
    assert create_instruction(client, subject).status_code == 201
    morning = care_day(client, subject)["occurrences"][0]
    taken = report(client, subject, morning, "taken").json()["data"]
    assert taken["report"]["earlier"] == []
    app.state.clock.now += timedelta(minutes=5)
    skipped = report(client, subject, taken, "skipped").json()["data"]
    assert skipped["report"]["earlier"] == [{
        "outcome": "taken", "revision": 1,
        "recorded_at": taken["report"]["updated_at"], "replaced_at": skipped["report"]["updated_at"],
    }]
    app.state.clock.now += timedelta(minutes=5)
    again = report(client, subject, skipped, "taken").json()["data"]
    assert (again["report"]["outcome"], again["report"]["revision"]) == ("taken", 3)
    assert [(answer["outcome"], answer["revision"]) for answer in again["report"]["earlier"]] == [("skipped", 2), ("taken", 1)]
    assert again["report"]["earlier"][0]["recorded_at"] == skipped["report"]["updated_at"]
    assert care_day(client, subject)["occurrences"][0]["report"] == again["report"]
    with app.state.sessions() as database:
        rows = database.scalars(select(CareDoseAnswer).order_by(CareDoseAnswer.revision)).all()
    assert [(row.outcome, row.revision, row.account_id) for row in rows] == [
        ("taken", 1, subject["user"]["id"]), ("skipped", 2, subject["user"]["id"]),
    ]


def test_only_the_ten_newest_earlier_answers_are_shown_and_all_are_kept(client, app):
    subject = account(client, app)
    assert create_instruction(client, subject).status_code == 201
    current = care_day(client, subject)["occurrences"][0]
    for index in range(13):
        app.state.clock.now += timedelta(minutes=1)
        answered = report(client, subject, current, "taken" if index % 2 == 0 else "skipped")
        assert answered.status_code == 200, answered.text
        current = answered.json()["data"]
    assert current["report"]["revision"] == 13
    assert [answer["revision"] for answer in current["report"]["earlier"]] == list(range(12, 2, -1))
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(CareDoseAnswer)) == 12


def test_account_deletion_erases_earlier_answers(client, app):
    subject = account(client, app)
    assert create_instruction(client, subject).status_code == 201
    morning = care_day(client, subject)["occurrences"][0]
    taken = report(client, subject, morning, "taken").json()["data"]
    assert report(client, subject, taken, "skipped").status_code == 200
    assert request_deletion(client, subject).status_code == 202
    app.state.clock.now += timedelta(days=8)
    assert app.state.account_deletion.purge_due() == {"purged": 1, "blocked": 0}
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(CareDoseAnswer)) == 0

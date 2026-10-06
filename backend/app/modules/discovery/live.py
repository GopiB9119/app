"""Live hints that a search may have changed (DEC-051).

A hint says only that something a search can find changed in a Space. The apps run their search again through the
normal API, which checks access again, so a hint never carries content. Each hint goes to the people who can open the
changed thing now, by the rule its search query uses, so nobody learns that something they cannot open changed.
"""

from sqlalchemy import and_, select

from app.modules.planning.models import TaskAccess
from app.modules.realtime.hub import signal
from app.modules.spaces.models import SpaceMembership

KIND = "search"


def announce_history(database, space_id, admissions_before, reason):
    """Documents and events: the current members who joined before the item was added (the history rule)."""
    accounts = database.scalars(select(SpaceMembership.account_id).where(
        SpaceMembership.space_id == space_id, SpaceMembership.status == "active",
        SpaceMembership.admission_sequence <= admissions_before,
    )).all()
    signal(database, KIND, accounts, space_id=space_id, reason=reason)


def announce_task(database, task_id, space_id):
    """Tasks: the current members the task was shared with, under the admission it was shared with."""
    accounts = database.scalars(
        select(TaskAccess.account_id).join(SpaceMembership, and_(
            SpaceMembership.space_id == TaskAccess.space_id, SpaceMembership.account_id == TaskAccess.account_id,
            SpaceMembership.admission_id == TaskAccess.admission_id,
        )).where(TaskAccess.task_id == task_id, SpaceMembership.status == "active")
    ).all()
    signal(database, KIND, accounts, space_id=space_id, reason="task")


def announce_members(database, space_id, reason):
    """Every current member, for what each result shows of the Space itself (its name)."""
    accounts = database.scalars(select(SpaceMembership.account_id).where(
        SpaceMembership.space_id == space_id, SpaceMembership.status == "active",
    )).all()
    signal(database, KIND, accounts, space_id=space_id, reason=reason)


def announce_access(database, space_id, account_ids):
    """People whose place in the Space ended: their results from it must go."""
    signal(database, KIND, account_ids, space_id=space_id, reason="access")

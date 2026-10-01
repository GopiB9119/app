from sqlalchemy import and_, case, func, or_, select, text
from sqlalchemy.exc import SQLAlchemyError

from app.modules.identity.models import AccountExport, IdentityMail
from app.modules.scheduling.models import Reminder

# Each definition mirrors the selection its worker uses, so "ready" means the worker would take the item now.


def identity_mail(now):
    ready = and_(
        IdentityMail.status.in_(("queued", "retry", "processing")), IdentityMail.available_at <= now,
        IdentityMail.expires_at > now, IdentityMail.attempts < 3,
    )
    return IdentityMail, ready, IdentityMail.available_at, IdentityMail.status.in_(("failed", "unknown"))


def reminders(now):
    ready = and_(
        Reminder.status == "scheduled", Reminder.scheduled_at <= now,
        or_(Reminder.next_attempt_at.is_(None), Reminder.next_attempt_at <= now),
    )
    # PostgreSQL's GREATEST skips NULL, so a first attempt counts from its scheduled time.
    return Reminder, ready, func.greatest(Reminder.scheduled_at, Reminder.next_attempt_at), Reminder.status == "failed"


def exports(now):
    ready = or_(
        and_(AccountExport.status == "queued", AccountExport.available_at <= now),
        and_(AccountExport.status == "building", AccountExport.lease_expires_at <= now),
    )
    since = case((AccountExport.status == "building", AccountExport.lease_expires_at), else_=AccountExport.available_at)
    return AccountExport, ready, since, AccountExport.status == "failed"


QUEUES = (("identity_mail", identity_mail), ("reminders", reminders), ("exports", exports))
HEADERS = (
    ("community_work_ready", "Items each worker could process now."),
    ("community_work_ready_oldest_seconds", "How long the oldest ready item has waited; 0 when none is waiting."),
    ("community_work_failed", "Items that ended in failure and need attention."),
)


def read(engine, now):
    rows = []
    with engine.connect() as connection:
        connection.execute(text("SET LOCAL statement_timeout = '2s'"))
        for name, definition in QUEUES:
            model, ready, since, failed = definition(now)
            count, oldest, failures = connection.execute(
                select(func.count().filter(ready), func.min(since).filter(ready), func.count().filter(failed))
                .select_from(model).where(or_(ready, failed))
            ).one()
            waited = max((now - oldest).total_seconds(), 0.0) if oldest is not None else 0.0
            rows.append((name, (count, round(waited, 3), failures)))
    return rows


def render(engine, now):
    """Gauges for background work, read from the database at scrape time, so they survive worker restarts."""
    try:
        rows = read(engine, now)
    except SQLAlchemyError:
        rows = None
    lines = []
    if rows is not None:
        for index, (metric, description) in enumerate(HEADERS):
            lines += [f"# HELP {metric} {description}", f"# TYPE {metric} gauge"]
            lines += [f'{metric}{{queue="{name}"}} {values[index]}' for name, values in rows]
    lines += [
        "# HELP community_work_query_success Whether the background work gauges could be read from the database.",
        "# TYPE community_work_query_success gauge",
        f"community_work_query_success {0 if rows is None else 1}",
    ]
    return "\n".join(lines) + "\n"

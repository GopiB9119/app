from sqlalchemy import and_, case, func, literal, or_, select, text
from sqlalchemy.exc import SQLAlchemyError

from app.modules.community.lifecycle import PageLifecycleService
from app.modules.community.models import PublicPage
from app.modules.identity.deletion import AccountDeletionService
from app.modules.identity.models import AccountExport, IdentityMail, User
from app.modules.scheduling.models import Reminder

# Definitions follow worker eligibility; due work blocked by a domain prerequisite is reported separately.


def identity_mail(now):
    ready = and_(
        IdentityMail.status.in_(("queued", "retry", "processing")), IdentityMail.available_at <= now,
        IdentityMail.expires_at > now, IdentityMail.attempts < 3,
    )
    return IdentityMail, ready, IdentityMail.available_at, IdentityMail.status.in_(("failed", "unknown")), None


def reminders(now):
    ready = and_(
        Reminder.status == "scheduled", Reminder.scheduled_at <= now,
        or_(Reminder.next_attempt_at.is_(None), Reminder.next_attempt_at <= now),
    )
    # PostgreSQL's GREATEST skips NULL, so a first attempt counts from its scheduled time.
    return Reminder, ready, func.greatest(Reminder.scheduled_at, Reminder.next_attempt_at), Reminder.status == "failed", None


def exports(now):
    ready = or_(
        and_(AccountExport.status == "queued", AccountExport.available_at <= now),
        and_(AccountExport.status == "building", AccountExport.lease_expires_at <= now),
    )
    since = case((AccountExport.status == "building", AccountExport.lease_expires_at), else_=AccountExport.available_at)
    return AccountExport, ready, since, AccountExport.status == "failed", None


def account_deletion(now):
    due = AccountDeletionService.purge_candidates(now).whereclause
    owns_shared = AccountDeletionService.owned_shared_spaces_query(User.id).order_by(None).correlate(User).exists()
    return User, and_(due, ~owns_shared), User.purge_after, None, and_(due, owns_shared)


def page_deletion(now):
    return PublicPage, PageLifecycleService.purge_candidates(now).whereclause, PublicPage.purge_after, None, None


QUEUES = (
    ("identity_mail", identity_mail), ("reminders", reminders), ("exports", exports),
    ("account_deletion", account_deletion), ("page_deletion", page_deletion),
)
HEADERS = (
    ("community_work_ready", "Items each worker could process now."),
    ("community_work_ready_oldest_seconds", "How long the oldest ready item has waited; 0 when none is waiting."),
    ("community_work_failed", "Items that ended in failure and need attention."),
    ("community_work_blocked", "Due items blocked by a domain prerequisite."),
    ("community_work_blocked_oldest_seconds", "How long the oldest blocked item has waited; 0 when none is blocked."),
)


def read(engine, now):
    rows = []
    with engine.connect() as connection:
        connection.execute(text("SET LOCAL statement_timeout = '2s'"))
        for name, definition in QUEUES:
            model, ready, since, failed, blocked = definition(now)
            included = [condition for condition in (ready, failed, blocked) if condition is not None]
            count, oldest, failures, blocked_count, oldest_blocked = connection.execute(
                select(
                    func.count().filter(ready), func.min(since).filter(ready),
                    func.count().filter(failed) if failed is not None else literal(None),
                    func.count().filter(blocked) if blocked is not None else literal(None),
                    func.min(since).filter(blocked) if blocked is not None else literal(None),
                ).select_from(model).where(or_(*included))
            ).one()
            waited = max((now - oldest).total_seconds(), 0.0) if oldest is not None else 0.0
            blocked_waited = None
            if blocked is not None:
                blocked_waited = round(max((now - oldest_blocked).total_seconds(), 0.0), 3) if oldest_blocked is not None else 0.0
            rows.append((name, (count, round(waited, 3), failures, blocked_count, blocked_waited)))
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
            lines += [f'{metric}{{queue="{name}"}} {values[index]}' for name, values in rows if values[index] is not None]
    lines += [
        "# HELP community_work_query_success Whether the background work gauges could be read from the database.",
        "# TYPE community_work_query_success gauge",
        f"community_work_query_success {0 if rows is None else 1}",
    ]
    return "\n".join(lines) + "\n"

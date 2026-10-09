"""Gauges for requests and offers (D3), read from the database at scrape time. Labels are fixed values only."""

from datetime import timedelta

from sqlalchemy import and_, exists, func, select, text
from sqlalchemy.exc import SQLAlchemyError

from app.modules.community.models import HELP_KINDS, HelpPost, HelpReply, HelpReport

STATES = ("pending", "open", "helped", "closed", "removed")
FAST = timedelta(hours=48)


def read(engine):
    with engine.connect() as connection:
        connection.execute(text("SET LOCAL statement_timeout = '2s'"))
        answered = exists().where(HelpReply.post_id == HelpPost.id)
        rows = connection.execute(select(
            HelpPost.kind, HelpPost.status, func.count(), func.count().filter(answered),
            func.count().filter(and_(HelpPost.status == "helped", HelpPost.ended_at - HelpPost.created_at <= FAST)),
        ).where(HelpPost.status.in_(STATES)).group_by(HelpPost.kind, HelpPost.status)).all()
        reports = connection.scalar(select(func.count()).select_from(HelpReport).where(HelpReport.status == "received"))
    counts = {(kind, status): (total, replied, fast) for kind, status, total, replied, fast in rows}
    return counts, reports


def render(engine):
    try:
        counts, reports = read(engine)
    except SQLAlchemyError:
        counts = None
    lines = []
    if counts is not None:
        lines += ["# HELP community_help_posts Requests and offers by kind and state.", "# TYPE community_help_posts gauge"]
        lines += [f'community_help_posts{{kind="{kind}",status="{status}"}} {counts.get((kind, status), (0, 0, 0))[0]}'
                  for kind in HELP_KINDS for status in STATES]
        lines += ["# HELP community_help_posts_answered Requests and offers that received at least one reply.",
                  "# TYPE community_help_posts_answered gauge"]
        lines += [f'community_help_posts_answered{{kind="{kind}"}} {sum(counts.get((kind, status), (0, 0, 0))[1] for status in STATES)}'
                  for kind in HELP_KINDS]
        lines += ["# HELP community_help_posts_helped_within_48h Posts marked helped within 48 hours of posting.",
                  "# TYPE community_help_posts_helped_within_48h gauge"]
        lines += [f'community_help_posts_helped_within_48h{{kind="{kind}"}} {counts.get((kind, "helped"), (0, 0, 0))[2]}' for kind in HELP_KINDS]
        lines += ["# HELP community_help_reports_open Reports of requests and offers waiting for a page manager.",
                  "# TYPE community_help_reports_open gauge", f"community_help_reports_open {reports}"]
    lines += [
        "# HELP community_help_query_success Whether the request and offer gauges could be read from the database.",
        "# TYPE community_help_query_success gauge",
        f"community_help_query_success {0 if counts is None else 1}",
    ]
    return "\n".join(lines) + "\n"

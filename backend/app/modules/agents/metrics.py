"""Agent request outcomes and model use on /metrics, read from the stored runs when scraped: counts only, never text,
accounts or Spaces."""

from sqlalchemy import Float, Integer, and_, case, cast, func, select, text
from sqlalchemy.exc import SQLAlchemyError

from app.modules.agents.models import AgentRun
from app.modules.spaces.models import Space

WAITING = ("waiting_for_approval", "waiting_for_user")


def read(engine, now):
    # A waiting request counts as the service shows it when next read: expired first, then stopped by the agent switch.
    waiting = AgentRun.status.in_(WAITING)
    expired = and_(waiting, AgentRun.deadline_at <= now)
    switched_off = and_(waiting, Space.agent_enabled.is_(False))
    outcomes = select(
        AgentRun.intent.label("intent"),
        case((expired, "expired"), (switched_off, "cancelled"), else_=AgentRun.status).label("status"),
        case((expired, "expired"), (switched_off, "agent_off"), else_=AgentRun.stop_reason).label("stop_reason"),
    ).outerjoin(Space, Space.id == AgentRun.space_id).subquery()
    with engine.connect() as connection:
        connection.execute(text("SET LOCAL statement_timeout = '2s'"))
        return connection.execute(
            select(outcomes.c.intent, outcomes.c.status, outcomes.c.stop_reason, func.count())
            .group_by(outcomes.c.intent, outcomes.c.status, outcomes.c.stop_reason)
        ).all()


def read_usage(engine):
    """Model calls, tokens and seconds recorded in the runs (DEC-059)."""
    calls = cast(func.json_extract_path_text(AgentRun.state, "usage", "calls"), Integer)
    tokens = cast(func.json_extract_path_text(AgentRun.state, "usage", "tokens"), Integer)
    seconds = cast(func.json_extract_path_text(AgentRun.state, "usage", "seconds"), Float)
    with engine.connect() as connection:
        connection.execute(text("SET LOCAL statement_timeout = '2s'"))
        return connection.execute(select(
            func.coalesce(func.sum(calls), 0), func.coalesce(func.sum(tokens), 0), func.coalesce(func.sum(seconds), 0.0),
        )).one()


def label(value):
    return "none" if value is None else value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def render(engine, now):
    try:
        rows = read(engine, now)
        usage = read_usage(engine)
    except SQLAlchemyError:
        rows = usage = None
    lines = []
    if rows is not None:
        # A gauge, not a counter: erasing an account removes its requests.
        lines += [
            "# HELP community_agent_requests Stored agent requests by intent, status and stop reason.",
            "# TYPE community_agent_requests gauge",
        ]
        series = sorted((label(intent), label(status), label(reason), count) for intent, status, reason, count in rows)
        lines += [
            f'community_agent_requests{{intent="{intent}",status="{status}",stop_reason="{reason}"}} {count}'
            for intent, status, reason, count in series
        ]
        for name, value, meaning in (
            ("calls", usage[0], "Model calls recorded in stored agent requests"),
            ("tokens", usage[1], "Model tokens recorded in stored agent requests"),
            ("seconds", round(float(usage[2]), 3), "Model seconds recorded in stored agent requests"),
        ):
            lines += [f"# HELP community_agent_model_{name} {meaning}.", f"# TYPE community_agent_model_{name} gauge",
                      f"community_agent_model_{name} {value}"]
    lines += [
        "# HELP community_agent_query_success Whether the agent request counts could be read from the database.",
        "# TYPE community_agent_query_success gauge",
        f"community_agent_query_success {0 if rows is None else 1}",
    ]
    return "\n".join(lines) + "\n"

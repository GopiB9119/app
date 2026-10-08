"""Which agent answers in a Space (DEC-049, T215).

Every Solo, Family, Couple and Group Space has one persistent agent binding, created with the Space and routed through a
fixed, versioned definition that matches the Space's type. A binding is identity and routing only: it is no account and
no member, it holds no permission, and it never replaces the requester's own admission, the Space's agent switch or an
exact approval. The identifier is the one chat readers already see on the agent's replies (DEC-046)."""

from dataclasses import dataclass
from uuid import UUID, uuid5

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.errors import DomainError
from app.modules.agents.models import AgentInstance
from app.modules.spaces.models import Space

# Also the namespace of the chat request and reply keys (DEC-046); changing it would change every stored identity.
NAMESPACE = UUID("2f8e4c1a-6b3d-4f5e-9a7c-1d2e3f4a5b6c")

# Every definition names its tools one by one, so a new tool reaches no scope until someone adds it here on purpose.
# Version 7 adds poll reads and explicitly reviewed creation inside the current Space.
# Migration 0062 moves bindings to it; existing identities and recorded runs stay unchanged.
SPACE_TOOLS = (
    "family.tasks.list", "family.members.list", "spaces.settings.read", "family.events.list", "reminders.list",
    "events.budget.read", "events.budget.split",
    "space.poll.read", "space.poll.create",
    "space.search", "documents.list", "documents.read", "agent.memory.read", "web.search", "web.read",
    "tasks.create", "tasks.update", "tasks.complete", "reminders.schedule", "events.create", "agent.memory.save",
)
VERSION = 7
# The person's own agent on the Agent page (DEC-060): the public community, the web and their own memories, and no Space.
# It cannot read inside a Space; it can only show the person buttons to the chats of their own Spaces.
MAIN_TOOLS = (
    "community.pages.list", "community.posts.list", "web.search", "web.read", "agent.memory.read", "agent.memory.save",
    "community.pages.create", "community.posts.create", "community.posts.publish", "community.comments.create",
    "community.posts.like", "community.posts.unlike", "community.pages.follow", "community.pages.unfollow",
    "agent.spaces.handoff",
)
MAIN_VERSION = 1


def agent_identity(space_id):
    """The Space's agent as chat readers see it: one stable identifier that is no account and no member."""
    return str(uuid5(NAMESPACE, f"space-agent:{space_id}"))


@dataclass(frozen=True)
class AgentDefinition:
    key: str
    version: int
    label: str
    tools: frozenset

    @property
    def space_type(self):
        return self.key


def space_definition(key, label):
    return AgentDefinition(key=key, version=VERSION, label=label, tools=frozenset(SPACE_TOOLS))


DEFINITIONS = {
    definition.key: definition for definition in (
        space_definition("family", "Family Agent"),
        space_definition("couple", "Couple Agent"),
        space_definition("solo", "Solo Agent"),
        space_definition("group", "Group Agent"),
    )
}
MAIN = AgentDefinition(key="main", version=MAIN_VERSION, label="Main Agent", tools=frozenset(MAIN_TOOLS))


@dataclass(frozen=True)
class AgentRoute:
    instance_id: str | None
    space_id: str | None
    definition: AgentDefinition

    def record(self):
        """What a run keeps, so it is clear later which agent definition read it."""
        return {"instance": self.instance_id, "definition": self.definition.key, "version": self.definition.version}

    def allows(self, tool_name):
        return tool_name in self.definition.tools


MAIN_ROUTE = AgentRoute(instance_id=None, space_id=None, definition=MAIN)


def unavailable():
    return DomainError(503, "SERVICE_UNAVAILABLE", "Service is temporarily unavailable.")


def provision(database, space_id, space_type, created_at):
    """Gives a Space its agent binding unless it has one. Safe to repeat and to race: the first writer wins."""
    definition = DEFINITIONS.get(space_type)
    if definition is None:
        raise unavailable()
    database.execute(insert(AgentInstance).values(
        id=agent_identity(space_id), space_id=space_id, definition_key=definition.key,
        definition_version=definition.version, created_at=created_at,
    ).on_conflict_do_nothing(index_elements=["space_id"]))


def route(database, space_id):
    """The binding and definition that answer in a Space the caller was already admitted to.

    This is routing, not authorization: it must only follow the caller's own session, admission and agent-switch checks.
    A Space created before bindings existed gets its derived binding here, with the same identifier as its replies."""
    space = database.execute(select(Space.space_type, Space.created_at).where(Space.id == space_id)).one_or_none()
    if space is None:
        raise DomainError(404, "NOT_FOUND", "Space not found.")
    statement = select(AgentInstance).where(AgentInstance.space_id == space_id).execution_options(populate_existing=True)
    instance = database.scalar(statement)
    if instance is None:
        provision(database, space_id, space.space_type, space.created_at)
        instance = database.scalar(statement)
    definition = DEFINITIONS.get(instance.definition_key)
    # The database already refuses a binding of another type; an unknown or newer definition is not served by this code.
    if definition is None or definition.version != instance.definition_version or definition.key != space.space_type:
        raise unavailable()
    return AgentRoute(instance_id=instance.id, space_id=space_id, definition=definition)


def route_for(database, space_id):
    """The agent of an existing run: the Main Agent when the run has no Space, otherwise that Space's agent."""
    return MAIN_ROUTE if space_id is None else route(database, space_id)


def require_tool(database, run, tool_name):
    """T223: refuse a tool the run's own agent does not list; asked at proposal, at each call and at execution."""
    if not route_for(database, run.space_id).allows(tool_name):
        raise DomainError(403, "ACCESS_DENIED", "This agent can't use that tool.")

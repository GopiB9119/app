import unicodedata

from sqlalchemy import Text, and_, case, cast, func, literal_column, or_, select

from app.errors import DomainError
from app.modules.discovery.schemas import DocumentHit, EventHit, SearchResults, TaskHit
from app.modules.events.models import SpaceEvent
from app.modules.files.models import SpaceDocument, SpaceDocumentChunk
from app.modules.planning.models import Task, TaskAccess
from app.modules.spaces.models import Space, SpaceMembership

RESULTS_PER_KIND = 20
PASSAGES_PER_DOCUMENT = 3
EXCERPT_LENGTH = 240
SIMPLE = literal_column("'simple'::regconfig")


def words_of(text):
    """Letters, marks and digits form words, so scripts with combining vowel signs stay whole."""
    words, current = [], []
    for character in text:
        if unicodedata.category(character)[0] in "LMN":
            current.append(character)
        elif current:
            words.append("".join(current))
            current = []
    if current:
        words.append("".join(current))
    return words


def prefix_query(text):
    """Every word is required and matches word beginnings. PostgreSQL splits the words the same way it indexed them,
    and the person's text never reaches to_tsquery as operators: only the quoted lexemes from plainto_tsquery do."""
    plain = cast(func.plainto_tsquery(SIMPLE, text), Text)
    return func.to_tsquery(SIMPLE, func.regexp_replace(plain, "'( |$)", "':*\\1", "g"))


def vector(*columns):
    return func.to_tsvector(SIMPLE, func.concat_ws(" ", *columns))


def excerpt(text, words):
    flat = " ".join(text.split())
    if len(flat) <= EXCERPT_LENGTH:
        return flat
    lowered = flat.lower()
    found = [index for word in words if (index := lowered.find(word.lower())) >= 0]
    start = max(0, min(found, default=0) - EXCERPT_LENGTH // 3)
    if start:
        space = flat.find(" ", start)
        start = space + 1 if 0 <= space < start + 20 else start
    end = min(len(flat), start + EXCERPT_LENGTH)
    return ("…" if start else "") + flat[start:end].strip() + ("…" if end < len(flat) else "")


class PrivateSearchService:
    """Search inside the Spaces a person belongs to (DEC-015). Each query joins the current membership and the item's
    own access rule, so a result is only ever something the person could open now."""

    def __init__(self, spaces):
        self.identity = spaces.identity
        self.sessions = spaces.sessions

    def search(self, token, query, space_id=None):
        query = " ".join(query.split())
        words = words_of(query)
        if not words:
            raise DomainError(422, "SEARCH_WORDS_REQUIRED", "Enter words to search for.")
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            if space_id is not None and database.scalar(
                select(SpaceMembership.space_id).join(Space, Space.id == SpaceMembership.space_id).where(
                    SpaceMembership.space_id == space_id, SpaceMembership.account_id == caller.id,
                    SpaceMembership.status == "active", Space.status == "active",
                )
            ) is None:
                raise DomainError(404, "NOT_FOUND", "Space not found.")
            documents, more_documents = self.documents(database, caller.id, query, words, space_id)
            tasks, more_tasks = self.tasks(database, caller.id, query, words, space_id)
            events, more_events = self.events(database, caller.id, query, words, space_id)
        return SearchResults(
            query=query, space_id=space_id, documents=documents, tasks=tasks, events=events,
            more_documents=more_documents, more_tasks=more_tasks, more_events=more_events,
        )

    @staticmethod
    def member(model_space_id, account_id):
        return and_(
            SpaceMembership.space_id == model_space_id, SpaceMembership.account_id == account_id,
            SpaceMembership.status == "active",
        )

    def documents(self, database, account_id, query, words, space_id):
        tsquery = prefix_query(query)
        named = and_(SpaceDocumentChunk.position == 0, vector(SpaceDocument.name).op("@@")(tsquery))
        rank = func.ts_rank_cd(SpaceDocumentChunk.search_vector, tsquery) + case((named, 1.0), else_=0.0)
        conditions = [
            SpaceDocument.status == "active", SpaceDocument.admissions_before >= SpaceMembership.admission_sequence,
            or_(SpaceDocumentChunk.search_vector.op("@@")(tsquery), named),
        ]
        if space_id is not None:
            conditions.append(SpaceDocument.space_id == space_id)
        ranked = (
            select(
                SpaceDocumentChunk.document_id, SpaceDocumentChunk.position, rank.label("rank"),
                func.row_number().over(
                    partition_by=SpaceDocumentChunk.document_id, order_by=(rank.desc(), SpaceDocumentChunk.position),
                ).label("place"),
            )
            .join(SpaceDocument, SpaceDocument.id == SpaceDocumentChunk.document_id)
            .join(SpaceMembership, self.member(SpaceDocument.space_id, account_id))
            .join(Space, and_(Space.id == SpaceDocument.space_id, Space.status == "active"))
            .where(*conditions)
            .subquery()
        )
        rows = database.execute(
            select(SpaceDocumentChunk, SpaceDocument, Space.name)
            .join(ranked, and_(
                ranked.c.document_id == SpaceDocumentChunk.document_id, ranked.c.position == SpaceDocumentChunk.position,
            ))
            .join(SpaceDocument, SpaceDocument.id == SpaceDocumentChunk.document_id)
            .join(Space, Space.id == SpaceDocument.space_id)
            .where(ranked.c.place <= PASSAGES_PER_DOCUMENT)
            .order_by(ranked.c.rank.desc(), SpaceDocument.created_at.desc(), SpaceDocumentChunk.document_id, SpaceDocumentChunk.position)
            .limit(RESULTS_PER_KIND + 1)
        ).all()
        hits = [
            DocumentHit(
                document_id=document.id, space_id=document.space_id, space_name=space_name, name=document.name,
                media_type=document.media_type, start_line=chunk.start_line, end_line=chunk.end_line,
                excerpt=excerpt(chunk.content, words), added_at=document.created_at,
            )
            for chunk, document, space_name in rows[:RESULTS_PER_KIND]
        ]
        return hits, len(rows) > RESULTS_PER_KIND

    def tasks(self, database, account_id, query, words, space_id):
        tsquery = prefix_query(query)
        text = vector(Task.title, Task.description)
        statement = (
            select(Task, Space.name)
            .join(TaskAccess, and_(TaskAccess.task_id == Task.id, TaskAccess.space_id == Task.space_id))
            # The task grant must belong to the current admission, exactly as the task screens require.
            .join(SpaceMembership, and_(
                SpaceMembership.space_id == Task.space_id, SpaceMembership.account_id == TaskAccess.account_id,
                SpaceMembership.admission_id == TaskAccess.admission_id,
            ))
            .join(Space, and_(Space.id == Task.space_id, Space.status == "active"))
            .where(SpaceMembership.account_id == account_id, SpaceMembership.status == "active", text.op("@@")(tsquery))
        )
        if space_id is not None:
            statement = statement.where(Task.space_id == space_id)
        rows = database.execute(
            statement.order_by(func.ts_rank_cd(text, tsquery).desc(), Task.updated_at.desc(), Task.id)
            .limit(RESULTS_PER_KIND + 1)
        ).all()
        hits = [
            TaskHit(
                task_id=task.id, space_id=task.space_id, space_name=space_name, title=task.title,
                excerpt=excerpt(task.description, words), status=task.status, due_date=task.due_date,
            )
            for task, space_name in rows[:RESULTS_PER_KIND]
        ]
        return hits, len(rows) > RESULTS_PER_KIND

    def events(self, database, account_id, query, words, space_id):
        tsquery = prefix_query(query)
        text = vector(SpaceEvent.title, SpaceEvent.description, SpaceEvent.location)
        statement = (
            select(SpaceEvent, Space.name)
            .join(SpaceMembership, self.member(SpaceEvent.space_id, account_id))
            .join(Space, and_(Space.id == SpaceEvent.space_id, Space.status == "active"))
            .where(SpaceEvent.admissions_before >= SpaceMembership.admission_sequence, text.op("@@")(tsquery))
        )
        if space_id is not None:
            statement = statement.where(SpaceEvent.space_id == space_id)
        rows = database.execute(
            statement.order_by(func.ts_rank_cd(text, tsquery).desc(), SpaceEvent.starts_at.desc(), SpaceEvent.id)
            .limit(RESULTS_PER_KIND + 1)
        ).all()
        hits = [
            EventHit(
                event_id=event.id, space_id=event.space_id, space_name=space_name, title=event.title,
                excerpt=excerpt(" · ".join(part for part in (event.location, event.description) if part), words),
                status=event.status, starts_at=event.starts_at, timezone=event.timezone, local_start=event.local_start,
            )
            for event, space_name in rows[:RESULTS_PER_KIND]
        ]
        return hits, len(rows) > RESULTS_PER_KIND

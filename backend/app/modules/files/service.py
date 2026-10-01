from datetime import timedelta
from uuid import uuid4

from cryptography.fernet import InvalidToken
from sqlalchemy import and_, delete, func, or_, select

from app.errors import DomainError
from app.modules.files.models import CONTENT_FIELDS, SpaceDocument, SpaceDocumentChunk
from app.modules.files.schemas import DocumentCursor, DocumentDetail, DocumentOutcome, DocumentView
from app.modules.files.text import passages, prepare
from app.modules.identity.models import OutboxEvent, User
from app.modules.spaces.models import Space, SpaceAuditEvent, SpaceMembership
from app.modules.spaces.schemas import Pagination

MAX_DOCUMENTS_PER_SPACE = 200
MAX_BYTES_PER_SPACE = 20 * 1024 * 1024
CURSOR_MINUTES = 15


def not_found(subject="Document"):
    return DomainError(404, "NOT_FOUND", f"{subject} not found.")


class DocumentService:
    """Text documents in a Space (DEC-015): validated, split into indexed passages, unchangeable, fully deleted."""

    def __init__(self, spaces):
        self.spaces = spaces
        self.identity = spaces.identity
        self.sessions = spaces.sessions
        self.security = spaces.security
        self.clock = spaces.clock

    @staticmethod
    def membership(database, space_id, account_id):
        return database.scalar(
            select(SpaceMembership).join(Space, Space.id == SpaceMembership.space_id).where(
                SpaceMembership.space_id == space_id, SpaceMembership.account_id == account_id,
                SpaceMembership.status == "active", Space.status == "active",
            ).execution_options(populate_existing=True)
        )

    @staticmethod
    def readable(document, membership):
        # History starts at the current admission: documents added before it stay hidden.
        return (
            document is not None and membership is not None and document.status == "active"
            and document.admissions_before >= membership.admission_sequence
        )

    @staticmethod
    def can_delete(document, membership):
        return membership.role == "owner" or (
            document.added_by_id == membership.account_id and document.added_by_admission_id == membership.admission_id
        )

    def present(self, database, documents, membership, detail=False):
        if not documents:
            return []
        names = dict(database.execute(
            select(User.id, User.display_name).where(User.id.in_({document.added_by_id for document in documents}))
        ).all())
        space = database.get(Space, membership.space_id)
        views = []
        for document in documents:
            fields = dict(
                id=document.id, space_id=document.space_id, space_name=space.name, status=document.status,
                name=document.name, media_type=document.media_type, size_bytes=document.size_bytes,
                line_count=document.line_count, sha256=document.sha256, added_by_name=names.get(document.added_by_id, ""),
                added_at=document.created_at, deleted_at=document.deleted_at,
                can_delete=document.status == "active" and self.can_delete(document, membership),
            )
            views.append(DocumentDetail(**fields, content=document.content) if detail else DocumentView(**fields))
        return views

    def record(self, database, document, actor_id, action):
        identifier = str(uuid4())
        now = self.clock()
        database.add(SpaceAuditEvent(
            id=identifier, space_id=document.space_id, actor_id=actor_id, target_id=document.id, action=action, created_at=now,
        ))
        database.add(OutboxEvent(
            id=identifier, event_type=action, actor_id=actor_id, aggregate_id=document.id, schema_version=1, created_at=now,
        ))

    def add(self, token, space_id, body, key):
        with self.identity.signed_in_write(token) as (database, caller):
            space = self.spaces.lock_space(database, space_id)
            membership = self.membership(database, space_id, caller.id)
            if membership is None:
                raise not_found("Space")
            prepared = prepare(body.name, body.content)
            digest = self.security.digest("space.document.add", space_id, body.name, prepared.sha256)
            existing = database.scalar(select(SpaceDocument).where(
                SpaceDocument.space_id == space_id, SpaceDocument.added_by_id == caller.id,
                SpaceDocument.creation_key == key,
            ))
            if existing is not None:
                if existing.added_by_admission_id != membership.admission_id:
                    raise not_found()
                if existing.creation_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "This retry does not match the original document.")
                return self.present(database, [existing], membership)[0]
            count, total = database.execute(
                select(func.count(), func.coalesce(func.sum(SpaceDocument.size_bytes), 0)).where(
                    SpaceDocument.space_id == space_id, SpaceDocument.status == "active",
                )
            ).one()
            if count >= MAX_DOCUMENTS_PER_SPACE:
                raise DomainError(409, "DOCUMENT_LIMIT_REACHED", "This Space already has 200 documents. Delete one first.")
            if total + prepared.size_bytes > MAX_BYTES_PER_SPACE:
                raise DomainError(409, "DOCUMENT_LIMIT_REACHED", "This Space has no room for this document; it holds at most 20 MB.")
            now = self.clock()
            document = SpaceDocument(
                id=str(uuid4()), space_id=space_id, added_by_id=caller.id, added_by_admission_id=membership.admission_id,
                status="active", name=body.name, media_type=prepared.media_type, size_bytes=prepared.size_bytes,
                line_count=prepared.line_count, sha256=prepared.sha256, content=prepared.text, creation_key=key,
                creation_digest=digest, admissions_before=space.admission_sequence, created_at=now,
            )
            database.add(document)
            database.flush()
            database.add_all([
                SpaceDocumentChunk(
                    document_id=document.id, position=position, space_id=space_id, start_line=passage.start_line,
                    end_line=passage.end_line, start_offset=passage.start_offset, end_offset=passage.end_offset,
                    content=passage.text,
                )
                for position, passage in enumerate(passages(prepared.text))
            ])
            self.record(database, document, caller.id, "document.added")
            database.flush()
            return self.present(database, [document], membership)[0]

    def read(self, token, document_id):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            document = database.get(SpaceDocument, document_id)
            membership = self.membership(database, document.space_id, caller.id) if document else None
            if not self.readable(document, membership):
                raise not_found()
            return self.present(database, [document], membership, detail=True)[0]

    def list_documents(self, token, space_id, limit, cursor=None):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            membership = self.membership(database, space_id, caller.id)
            if membership is None:
                raise not_found("Space")
            now = self.clock()
            statement = select(SpaceDocument).where(
                SpaceDocument.space_id == space_id, SpaceDocument.status == "active",
                SpaceDocument.admissions_before >= membership.admission_sequence,
            )
            if cursor:
                try:
                    position = DocumentCursor.model_validate_json(self.security.open(cursor))
                except (InvalidToken, ValueError, TypeError):
                    raise DomainError(400, "CURSOR_INVALID", "Reload the documents.") from None
                if str(position.account_id) != caller.id or str(position.space_id) != space_id:
                    raise DomainError(400, "CURSOR_INVALID", "Reload the documents.")
                if position.expires_at <= now:
                    raise DomainError(410, "CURSOR_EXPIRED", "Reload the documents.")
                statement = statement.where(or_(
                    SpaceDocument.created_at < position.after_created,
                    and_(SpaceDocument.created_at == position.after_created, SpaceDocument.id < str(position.after_id)),
                ))
            rows = database.scalars(
                statement.order_by(SpaceDocument.created_at.desc(), SpaceDocument.id.desc()).limit(limit + 1)
            ).all()
            page = rows[:limit]
            next_cursor = None
            if len(rows) > limit:
                next_cursor = self.security.seal(DocumentCursor(
                    kind="space_documents", account_id=caller.id, space_id=space_id, after_created=page[-1].created_at,
                    after_id=page[-1].id, expires_at=now + timedelta(minutes=CURSOR_MINUTES),
                ).model_dump_json())
            return self.present(database, page, membership), Pagination(next_cursor=next_cursor, has_more=next_cursor is not None)

    def delete(self, token, document_id):
        with self.identity.signed_in_write(token) as (database, caller):
            space_id = database.scalar(select(SpaceDocument.space_id).where(SpaceDocument.id == document_id))
            if space_id is None:
                raise not_found()
            # Same lock order as adding (account, Space, document); membership changes take the Space lock too.
            self.spaces.lock_space(database, space_id, active=False, shared=True)
            document = database.scalar(
                select(SpaceDocument).where(SpaceDocument.id == document_id).with_for_update()
                .execution_options(populate_existing=True)
            )
            if document.status == "deleted":
                # Only the person whose deletion succeeded learns that it is done; everyone else sees nothing.
                if document.deleted_by_id != caller.id:
                    raise not_found()
                return DocumentOutcome(id=document.id, space_id=document.space_id, status="deleted", deleted_at=document.deleted_at)
            membership = self.membership(database, space_id, caller.id)
            if not self.readable(document, membership):
                raise not_found()
            if not self.can_delete(document, membership):
                raise DomainError(403, "DOCUMENT_DELETE_DENIED", "Only the person who added this document or the Space owner can delete it.")
            database.execute(delete(SpaceDocumentChunk).where(SpaceDocumentChunk.document_id == document.id))
            for field in CONTENT_FIELDS:
                setattr(document, field, None)
            document.status = "deleted"
            document.deleted_at = self.clock()
            document.deleted_by_id = caller.id
            self.record(database, document, caller.id, "document.deleted")
            database.flush()
            return DocumentOutcome(id=document.id, space_id=document.space_id, status="deleted", deleted_at=document.deleted_at)

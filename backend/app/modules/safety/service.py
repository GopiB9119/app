from datetime import timedelta
from uuid import uuid4

from cryptography.fernet import InvalidToken
from sqlalchemy import and_, func, or_, select

from app.errors import DomainError
from app.modules.community.models import REPORT_REASONS, ContentReport, PostComment, PublicPage, PublicPost
from app.modules.community.service import CommunityService, not_found
from app.modules.safety.models import ModerationAppeal, ModerationDecision, PlatformModerator
from app.modules.safety.schemas import (
    AppealReview, AppealView, ContentPreview, DecisionView, ModerationNotice, ModeratorView,
    MyReport, QueueCursor, QueueTarget, ReasonCount,
)
from app.modules.spaces.schemas import Pagination

OPEN_REPORTS = ("received", "reviewing")
TARGETS = {"page": PublicPage, "post": PublicPost, "comment": PostComment}


class SafetyService:
    def __init__(self, identity):
        self.identity = identity
        self.sessions = identity.sessions
        self.security = identity.security
        self.clock = identity.clock
        self.community = CommunityService(identity)

    @staticmethod
    def require_moderator(database, user, lock=False):
        statement = select(PlatformModerator).where(PlatformModerator.account_id == user.id)
        if lock:
            statement = statement.with_for_update()
        if database.scalar(statement) is None:
            raise DomainError(403, "MODERATOR_REQUIRED", "Only a platform moderator can do this.")

    def moderator(self, token):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            return ModeratorView(moderator=database.get(PlatformModerator, user.id) is not None)

    @staticmethod
    def target(database, target_type, target_id, lock=False):
        model = TARGETS.get(target_type)
        if model is None:
            raise not_found("Content")
        if target_type == "comment" and lock:
            post_id = database.scalar(select(PostComment.post_id).where(PostComment.id == target_id))
            if post_id is None:
                raise not_found("Content")
            database.scalar(select(PublicPost).where(PublicPost.id == post_id).with_for_update())
        statement = select(model).where(model.id == target_id).execution_options(populate_existing=True)
        target = database.scalar(statement.with_for_update() if lock else statement)
        if target is None:
            raise not_found("Content")
        if target_type == "page":
            page = target
        elif target_type == "post":
            page = database.get(PublicPage, target.page_id)
        else:
            post = database.get(PublicPost, target.post_id)
            page = database.get(PublicPage, post.page_id) if post else None
        if page is None:
            raise not_found("Content")
        return target, page

    @staticmethod
    def author_id(target):
        return target.owner_id if isinstance(target, PublicPage) else target.author_id

    def require_independent(self, target, page, user):
        if user.id in {self.author_id(target), page.owner_id}:
            raise DomainError(409, "CONFLICT_OF_INTEREST", "Another moderator must review this content.")

    def preview(self, database, target_type, target_id):
        try:
            target, page = self.target(database, target_type, target_id)
        except DomainError as error:
            if error.status != 404:
                raise
            return ContentPreview(status="unavailable"), None
        # A deleted page and everything on it are hidden from everyone but its owner, moderators too (DEC-025, T115).
        if page.status not in ("active", "read_only"):
            return ContentPreview(status="unavailable"), None
        if target_type == "page":
            preview = ContentPreview(name=target.name, handle=target.handle, description=target.description, status=target.status)
        elif target_type == "post":
            preview = ContentPreview(title=target.title, body=target.body, status=target.status)
        else:
            preview = ContentPreview(body=target.body, status=target.status)
        return preview, page.name

    def queue(self, token, limit, cursor):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            self.require_moderator(database, user)
            grouped = select(
                ContentReport.target_type, ContentReport.target_id,
                func.min(ContentReport.created_at).label("first_reported_at"), func.count().label("report_count"),
                *(func.count().filter(ContentReport.reason == reason).label(f"reason_{reason}") for reason in REPORT_REASONS),
            ).where(ContentReport.status.in_(OPEN_REPORTS)).group_by(ContentReport.target_type, ContentReport.target_id).subquery()
            statement = select(grouped)
            if cursor:
                try:
                    position = QueueCursor.model_validate_json(self.security.open(cursor))
                except (InvalidToken, ValueError, TypeError):
                    raise DomainError(400, "CURSOR_INVALID", "Reload the moderation queue.") from None
                if position.account_id != user.id:
                    raise DomainError(400, "CURSOR_INVALID", "Reload the moderation queue.")
                if position.expires_at <= self.clock():
                    raise DomainError(410, "CURSOR_EXPIRED", "Reload the moderation queue.")
                statement = statement.where(or_(
                    grouped.c.first_reported_at > position.after_time,
                    and_(grouped.c.first_reported_at == position.after_time, grouped.c.target_type > position.after_type),
                    and_(grouped.c.first_reported_at == position.after_time, grouped.c.target_type == position.after_type,
                         grouped.c.target_id > position.after_id),
                ))
            rows = database.execute(statement.order_by(
                grouped.c.first_reported_at, grouped.c.target_type, grouped.c.target_id,
            ).limit(limit + 1)).all()
            more = len(rows) > limit
            rows = rows[:limit]
            views = []
            for row in rows:
                preview, page_name = self.preview(database, row.target_type, row.target_id)
                views.append(QueueTarget(
                    target_type=row.target_type, target_id=row.target_id, preview=preview, page_name=page_name,
                    report_count=row.report_count,
                    reasons=[ReasonCount(reason=reason, count=row._mapping[f"reason_{reason}"])
                             for reason in sorted(REPORT_REASONS) if row._mapping[f"reason_{reason}"]],
                    first_reported_at=row.first_reported_at,
                ))
            next_cursor = None
            if more:
                last = rows[-1]
                next_cursor = self.security.seal(QueueCursor(
                    account_id=user.id, after_time=last.first_reported_at, after_type=last.target_type, after_id=last.target_id,
                    expires_at=self.clock() + timedelta(minutes=15),
                ).model_dump_json())
            return views, Pagination(next_cursor=next_cursor, has_more=more)

    @staticmethod
    def decision_view(decision):
        return DecisionView(
            id=decision.id, target_type=decision.target_type, target_id=decision.target_id, action=decision.action,
            reason=decision.reason, note=decision.moderator_note, decided_by=decision.decided_by,
            decided_at=decision.decided_at, appeal_of=decision.appeal_of,
        )

    @staticmethod
    def close_reports(database, decision):
        reports = database.scalars(select(ContentReport).where(
            ContentReport.target_type == decision.target_type, ContentReport.target_id == decision.target_id,
            ContentReport.status.in_(OPEN_REPORTS),
        ).order_by(ContentReport.id).with_for_update().execution_options(populate_existing=True)).all()
        for report in reports:
            report.status = "closed"
            report.decision_id = decision.id

    def decide(self, token, body, key):
        digest = self.security.digest("moderation.decision", body.model_dump_json())
        with self.identity.signed_in_write(token) as (database, user):
            self.require_moderator(database, user, lock=True)
            existing = database.scalar(select(ModerationDecision).where(
                ModerationDecision.decided_by == user.id, ModerationDecision.creation_key == key,
            ))
            if existing is not None:
                if existing.creation_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "This retry does not match the original decision.")
                return self.decision_view(existing)
            target, page = self.target(database, body.target_type, str(body.target_id), lock=True)
            self.identity.authenticate(database, token, lock=True)
            self.require_independent(target, page, user)
            if body.action == "hide":
                if target.status not in {"page": ("active", "read_only"), "post": ("published",), "comment": ("visible",)}[body.target_type]:
                    raise DomainError(409, "CONTENT_UNAVAILABLE", "This content is no longer public.")
                if target.moderation_hidden_at is not None:
                    raise DomainError(409, "CONTENT_ALREADY_HIDDEN", "This content already has a hiding decision.")
            decision = ModerationDecision(
                id=str(uuid4()), target_type=body.target_type, target_id=str(body.target_id), action=body.action,
                reason=body.reason, moderator_note=body.note, decided_by=user.id, decided_at=self.clock(),
                creation_key=key, creation_digest=digest,
            )
            database.add(decision)
            database.flush()
            if body.action == "hide":
                target.moderation_hidden_at = decision.decided_at
                target.moderation_decision_id = decision.id
            self.close_reports(database, decision)
            self.community.record(database, user.id, page.id, target.id, f"moderation.{body.action}")
            database.flush()
            return self.decision_view(decision)

    @staticmethod
    def appeal_view(appeal):
        return AppealView(
            id=appeal.id, decision_id=appeal.decision_id, note=appeal.note, status=appeal.status,
            created_at=appeal.created_at, resolved_at=appeal.resolved_at,
        )

    def appeal(self, token, decision_id, body, key):
        digest = self.security.digest("moderation.appeal", decision_id, body.model_dump_json())
        with self.identity.signed_in_write(token) as (database, user):
            existing = database.scalar(select(ModerationAppeal).where(
                ModerationAppeal.account_id == user.id, ModerationAppeal.creation_key == key,
            ))
            if existing is not None:
                if existing.creation_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "This retry does not match the original appeal.")
                return self.appeal_view(existing)
            decision = database.get(ModerationDecision, decision_id)
            if decision is None:
                raise not_found("Decision")
            target, page = self.target(database, decision.target_type, decision.target_id, lock=True)
            decision = database.scalar(select(ModerationDecision).where(
                ModerationDecision.id == decision_id,
            ).with_for_update().execution_options(populate_existing=True))
            self.identity.authenticate(database, token, lock=True)
            if self.author_id(target) != user.id:
                raise DomainError(403, "CONTENT_AUTHOR_REQUIRED", "Only the content author can appeal this decision.")
            if decision.action != "hide":
                raise DomainError(409, "APPEAL_UNAVAILABLE", "Only a hiding decision can be appealed.")
            if database.scalar(select(ModerationAppeal.id).where(ModerationAppeal.decision_id == decision.id)) is not None:
                raise DomainError(409, "APPEAL_ALREADY_EXISTS", "This decision already has an appeal.")
            if target.moderation_hidden_at is None or target.moderation_decision_id != decision.id:
                raise DomainError(409, "APPEAL_UNAVAILABLE", "This hiding decision is no longer active.")
            appeal = ModerationAppeal(
                id=str(uuid4()), decision_id=decision.id, account_id=user.id, note=body.note,
                status="open", created_at=self.clock(), creation_key=key, creation_digest=digest,
            )
            database.add(appeal)
            self.community.record(database, user.id, page.id, appeal.id, "moderation.appeal_created")
            database.flush()
            return self.appeal_view(appeal)

    def appeals(self, token, status):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            self.require_moderator(database, user)
            rows = database.execute(select(ModerationAppeal, ModerationDecision).join(
                ModerationDecision, ModerationDecision.id == ModerationAppeal.decision_id,
            ).where(ModerationAppeal.status == status).order_by(ModerationAppeal.created_at, ModerationAppeal.id)).all()
            views = []
            for appeal, decision in rows:
                preview, page_name = self.preview(database, decision.target_type, decision.target_id)
                views.append(AppealReview(
                    appeal=self.appeal_view(appeal), decision=self.decision_view(decision), preview=preview,
                    page_name=page_name, resolution_note=appeal.resolution_note,
                ))
            return views

    def resolve(self, token, appeal_id, body):
        with self.identity.signed_in_write(token) as (database, user):
            self.require_moderator(database, user, lock=True)
            appeal = database.get(ModerationAppeal, appeal_id)
            if appeal is None:
                raise not_found("Appeal")
            original = database.get(ModerationDecision, appeal.decision_id)
            target, page = self.target(database, original.target_type, original.target_id, lock=True)
            original = database.scalar(select(ModerationDecision).where(
                ModerationDecision.id == original.id,
            ).with_for_update().execution_options(populate_existing=True))
            appeal = database.scalar(select(ModerationAppeal).where(
                ModerationAppeal.id == appeal_id,
            ).with_for_update().execution_options(populate_existing=True))
            self.identity.authenticate(database, token, lock=True)
            self.require_independent(target, page, user)
            if original.decided_by == user.id:
                raise DomainError(409, "CONFLICT_OF_INTEREST", "Another moderator must review this appeal.")
            if appeal.status != "open":
                if appeal.status == body.outcome and appeal.resolution_note == body.note:
                    return self.appeal_view(appeal)
                raise DomainError(409, "APPEAL_ALREADY_RESOLVED", "This appeal has already been resolved.")
            if target.moderation_hidden_at is None or target.moderation_decision_id != original.id:
                raise DomainError(409, "APPEAL_UNAVAILABLE", "This appeal no longer matches the active hiding decision.")
            now = self.clock()
            appeal.status = body.outcome
            appeal.resolved_by = user.id
            appeal.resolved_at = now
            appeal.resolution_note = body.note
            if body.outcome == "overturned":
                decision = ModerationDecision(
                    id=str(uuid4()), target_type=original.target_type, target_id=original.target_id, action="restore",
                    reason=original.reason, moderator_note=body.note, decided_by=user.id, decided_at=now, appeal_of=original.id,
                )
                database.add(decision)
                database.flush()
                target.moderation_hidden_at = None
                target.moderation_decision_id = None
                self.close_reports(database, decision)
                action = "moderation.restore"
            else:
                action = "moderation.appeal_upheld"
            self.community.record(database, user.id, page.id, target.id, action)
            database.flush()
            return self.appeal_view(appeal)

    def notices(self, token):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            pages = select(PublicPage.id).where(PublicPage.owner_id == user.id)
            posts = select(PublicPost.id).join(PublicPage, PublicPage.id == PublicPost.page_id).where(or_(
                PublicPost.author_id == user.id, PublicPage.owner_id == user.id,
            ))
            comments = select(PostComment.id).where(PostComment.author_id == user.id)
            rows = database.execute(select(ModerationDecision, ModerationAppeal.status).outerjoin(
                ModerationAppeal, ModerationAppeal.decision_id == ModerationDecision.id,
            ).where(or_(
                and_(ModerationDecision.target_type == "page", ModerationDecision.target_id.in_(pages)),
                and_(ModerationDecision.target_type == "post", ModerationDecision.target_id.in_(posts)),
                and_(ModerationDecision.target_type == "comment", ModerationDecision.target_id.in_(comments)),
            )).order_by(ModerationDecision.decided_at.desc(), ModerationDecision.id.desc())).all()
            return [ModerationNotice(
                id=decision.id, target_type=decision.target_type, target_id=decision.target_id, action=decision.action,
                reason=decision.reason, decided_at=decision.decided_at, appeal_status=appeal_status, appeal_of=decision.appeal_of,
            ) for decision, appeal_status in rows]

    def reports(self, token):
        with self.sessions() as database:
            user, _session = self.identity.authenticate(database, token)
            rows = database.execute(select(ContentReport, ModerationDecision).outerjoin(
                ModerationDecision, ModerationDecision.id == ContentReport.decision_id,
            ).where(ContentReport.reporter_id == user.id).order_by(ContentReport.created_at.desc(), ContentReport.id.desc())).all()
            return [MyReport(
                id=report.id, target_type=report.target_type, target_id=report.target_id, reason=report.reason,
                status="reviewed" if report.status == "closed" else "open",
                outcome=("no_action" if decision.action == "no_action" else "action_taken") if decision else None,
                action=decision.action if decision else None, created_at=report.created_at,
                reviewed_at=decision.decided_at if decision else None,
            ) for report, decision in rows]
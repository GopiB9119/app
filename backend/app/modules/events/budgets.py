"""Event budgets (DEC-039): what a group plans to spend and what its members say they spent.

Amounts are whole numbers of the smallest unit (paise, cents). Totals are sums of entered amounts. Only a split
(DEC-042) divides, and its shares always say how they were rounded. Recording an expense or a contribution (DEC-041)
is never a payment, and a split is never a bill: nothing here collects, moves or owes money."""
from uuid import uuid4

from sqlalchemy import delete, func, select

from app.errors import DomainError
from app.modules.events.models import (
    WHOLE_PERCENT, EventBudget, EventBudgetCategory, EventBudgetSplit, EventBudgetSplitPerson, EventContribution, EventExpense,
)
from app.modules.events.schemas import (
    BudgetCategoryView, BudgetView, ContributionView, ExpenseView, SplitCandidateView, SplitShareView, SplitView,
)
from app.modules.identity.models import User
from app.modules.spaces.models import SpaceMembership

MAX_EXPENSES = 200
MAX_CONTRIBUTIONS = 200


def cancelled():
    return DomainError(409, "EVENT_CANCELLED", "This event was cancelled, so its budget can no longer change.")


def divide(method, base, values):
    """Each share and whether it carries one extra smallest unit; equal and percentage shares add up to the base."""
    count = len(values)
    if method == "amounts":
        return [(value, False) for value in values]
    if method == "equal":
        each, extra = divmod(base, count)
        return [(each + 1, True) if index < extra else (each, False) for index in range(count)]
    exact = [base * value for value in values]
    floors = [part // WHOLE_PERCENT for part in exact]
    # The units lost to rounding go to the shares that lost the most, people listed first winning ties.
    order = sorted(range(count), key=lambda index: (-(exact[index] % WHOLE_PERCENT), index))
    extra = set(order[:max(base - sum(floors), 0)])
    return [(floors[index] + 1, True) if index in extra else (floors[index], False) for index in range(count)]


def visible_members(event):
    """Current members admitted before the event was created: the people who can see it."""
    return (
        SpaceMembership.space_id == event.space_id, SpaceMembership.status == "active",
        SpaceMembership.admission_sequence <= event.admissions_before,
    )


class BudgetService:
    def __init__(self, events):
        self.events = events
        self.identity = events.identity
        self.sessions = events.sessions
        self.security = events.security
        self.clock = events.clock

    def etag(self, event_id, version):
        return f'"{self.security.digest("space.event.budget", event_id, str(version))}"'

    @staticmethod
    def manages(event, membership):
        return membership.role == "owner" or (
            event.creator_id == membership.account_id and event.creator_admission_id == membership.admission_id
        )

    @staticmethod
    def contribution(database, event, membership, contribution_id):
        contribution = database.scalar(select(EventContribution).where(
            EventContribution.event_id == event.id, EventContribution.id == contribution_id,
        ))
        if contribution is not None and not (
            contribution.contributor_id == membership.account_id
            and contribution.contributor_admission_id == membership.admission_id
        ):
            raise DomainError(
                403, "CONTRIBUTION_CHANGE_DENIED", "Only the person who recorded a contribution can change or withdraw it.",
            )
        return contribution

    def present(self, database, event, membership):
        budget = database.get(EventBudget, event.id, populate_existing=True)
        categories = database.scalars(
            select(EventBudgetCategory).where(EventBudgetCategory.event_id == event.id)
            .order_by(EventBudgetCategory.position, EventBudgetCategory.id)
        ).all()
        rows = database.execute(
            select(EventExpense, User.display_name).outerjoin(User, User.id == EventExpense.recorder_id)
            .where(EventExpense.event_id == event.id).order_by(EventExpense.created_at.desc(), EventExpense.id.desc())
        ).all()
        gifts = database.execute(
            select(EventContribution, User.display_name).outerjoin(User, User.id == EventContribution.contributor_id)
            .where(EventContribution.event_id == event.id)
            .order_by(EventContribution.created_at.desc(), EventContribution.id.desc())
        ).all()
        manager = self.manages(event, membership)
        open_event = event.status == "scheduled"
        recorded = {}
        for expense, _name in rows:
            recorded[expense.category_id] = recorded.get(expense.category_id, 0) + expense.amount_minor
        estimate = sum(category.estimate_minor for category in categories)
        total = sum(recorded.values())
        expenses = []
        for expense, name in rows:
            mine = expense.recorder_id == membership.account_id and expense.recorder_admission_id == membership.admission_id
            expenses.append(ExpenseView(
                id=expense.id, amount_minor=expense.amount_minor, category_id=expense.category_id, note=expense.note,
                recorded_by_name=name if expense.recorder_id else None, recorded_at=expense.created_at,
                mine=mine, can_delete=open_event and (mine or manager),
            ))
        contributions = []
        for contribution, name in gifts:
            mine = (
                contribution.contributor_id == membership.account_id
                and contribution.contributor_admission_id == membership.admission_id
            )
            # Who gave what is seen only by that person and by those who manage the budget.
            if mine or manager:
                contributions.append(ContributionView(
                    id=contribution.id, amount_minor=contribution.amount_minor, state=contribution.state,
                    note=contribution.note, contributor_name=name if contribution.contributor_id else None,
                    recorded_at=contribution.created_at, mine=mine, can_change=open_event and mine,
                ))
        split = self.split_view(database, event, membership, manager, estimate, total)
        candidates = [
            SplitCandidateView(account_id=account, name=name) for account, name in database.execute(
                select(SpaceMembership.account_id, User.display_name).join(User, User.id == SpaceMembership.account_id)
                .where(*visible_members(event)).order_by(User.display_name, SpaceMembership.account_id)
            ).all()
        ] if manager and open_event and budget is not None else []
        return BudgetView(
            event_id=event.id, currency=budget.currency if budget else None,
            categories=[
                BudgetCategoryView(
                    id=category.id, name=category.name, estimate_minor=category.estimate_minor,
                    recorded_minor=recorded.get(category.id, 0),
                    remaining_minor=category.estimate_minor - recorded.get(category.id, 0),
                )
                for category in categories
            ],
            expenses=expenses, estimate_minor=estimate, recorded_minor=total,
            uncategorized_minor=recorded.get(None, 0), remaining_minor=estimate - total,
            contributions=contributions, all_contributions=manager,
            given_minor=sum(item.amount_minor for item, _name in gifts if item.state == "given"),
            promised_minor=sum(item.amount_minor for item, _name in gifts if item.state == "promised"),
            contribution_count=len(gifts), split=split, split_candidates=candidates,
            can_manage=manager and open_event, can_record=open_event and budget is not None,
            etag=self.etag(event.id, budget.version if budget else 0) if manager else None,
        )

    @staticmethod
    def split_view(database, event, membership, manager, estimate, total):
        split = database.get(EventBudgetSplit, event.id, populate_existing=True)
        if split is None:
            return None
        people = database.execute(
            select(EventBudgetSplitPerson, User.display_name).outerjoin(User, User.id == EventBudgetSplitPerson.account_id)
            .where(EventBudgetSplitPerson.event_id == event.id).order_by(EventBudgetSplitPerson.position)
        ).all()
        base = estimate if split.base == "planned" else total
        divided = divide(split.method, base, [person.value for person, _name in people])
        shares = []
        for (person, name), (share, rounded) in zip(people, divided):
            mine = person.account_id == membership.account_id and person.admission_id == membership.admission_id
            # Everyone sees how the cost is divided and their own share; only managers see every share.
            if mine or manager:
                shares.append(SplitShareView(
                    account_id=person.account_id, name=name if person.account_id else None, mine=mine, value=person.value,
                    share_minor=share, rounded_up=rounded,
                ))
        allocated = sum(share for share, _rounded in divided)
        return SplitView(
            method=split.method, base=split.base, base_minor=base, people_count=len(people), shares=shares, all_shares=manager,
            allocated_minor=allocated, difference_minor=base - allocated, rounding_count=sum(1 for _share, rounded in divided if rounded),
        )

    def read(self, token, event_id):
        with self.sessions() as database:
            caller, _session = self.identity.authenticate(database, token)
            event, membership = self.events.visible(database, event_id, caller.id)
            return self.present(database, event, membership)

    def changing_plan(self, database, caller, event_id, etag):
        """The checks before the plan or its split changes: a manager, an open event, and the version they reviewed."""
        event, membership = self.events.visible(database, event_id, caller.id, lock=True)
        if not self.manages(event, membership):
            raise DomainError(403, "EVENT_MANAGEMENT_DENIED", "Only the organizer or the Space owner can change this budget.")
        if event.status != "scheduled":
            raise cancelled()
        budget = database.get(EventBudget, event.id, populate_existing=True)
        if not etag:
            raise DomainError(428, "PRECONDITION_REQUIRED", "Review the current budget first.")
        if etag != self.etag(event.id, budget.version if budget else 0):
            raise DomainError(412, "BUDGET_CHANGED", "This budget changed since you reviewed it. Reload to continue.")
        return event, membership, budget

    def save_split(self, token, event_id, body, etag):
        with self.identity.signed_in_write(token) as (database, caller):
            event, membership, budget = self.changing_plan(database, caller, event_id, etag)
            if budget is None:
                raise DomainError(409, "BUDGET_NOT_SET", "This event has no budget yet. Set one up first.")
            chosen = [str(item.account_id) for item in body.people]
            admissions = dict(database.execute(
                select(SpaceMembership.account_id, SpaceMembership.admission_id)
                .where(*visible_members(event), SpaceMembership.account_id.in_(chosen))
            ).all())
            if len(admissions) != len(chosen):
                raise DomainError(409, "PERSON_UNAVAILABLE", "Someone you chose can no longer see this event. Reload and choose again.")
            wanted = [(account, admissions[account], item.value) for account, item in zip(chosen, body.people)]
            split = database.get(EventBudgetSplit, event.id, populate_existing=True)
            if split is not None:
                current = [(person.account_id, person.admission_id, person.value) for person in database.scalars(
                    select(EventBudgetSplitPerson).where(EventBudgetSplitPerson.event_id == event.id)
                    .order_by(EventBudgetSplitPerson.position)
                ).all()]
                # Saving the same split again changes nothing, not even the version.
                if (split.method, split.base, current) == (body.method, body.base, wanted):
                    return self.present(database, event, membership)
            now = self.clock()
            if split is None:
                database.add(EventBudgetSplit(event_id=event.id, method=body.method, base=body.base, created_at=now, updated_at=now))
            else:
                split.method, split.base, split.updated_at = body.method, body.base, now
                database.execute(delete(EventBudgetSplitPerson).where(EventBudgetSplitPerson.event_id == event.id))
            database.flush()
            for position, (account, admission, value) in enumerate(wanted):
                database.add(EventBudgetSplitPerson(
                    id=str(uuid4()), event_id=event.id, position=position, account_id=account, admission_id=admission, value=value,
                ))
            budget.version += 1
            budget.updated_at = now
            self.events.record(database, event, caller.id, "event.budget.split.updated")
            database.flush()
            return self.present(database, event, membership)

    def remove_split(self, token, event_id, etag):
        with self.identity.signed_in_write(token) as (database, caller):
            event, membership, budget = self.changing_plan(database, caller, event_id, etag)
            split = database.get(EventBudgetSplit, event.id, populate_existing=True) if budget is not None else None
            if split is None:
                return self.present(database, event, membership)
            database.execute(delete(EventBudgetSplitPerson).where(EventBudgetSplitPerson.event_id == event.id))
            database.delete(split)
            budget.version += 1
            budget.updated_at = self.clock()
            self.events.record(database, event, caller.id, "event.budget.split.removed")
            database.flush()
            return self.present(database, event, membership)

    def save(self, token, event_id, body, etag):
        with self.identity.signed_in_write(token) as (database, caller):
            event, membership, budget = self.changing_plan(database, caller, event_id, etag)
            current = {
                category.id: category for category in database.scalars(
                    select(EventBudgetCategory).where(EventBudgetCategory.event_id == event.id)
                ).all()
            }
            kept = {str(item.id) for item in body.categories if item.id is not None}
            if kept - set(current):
                raise DomainError(409, "CATEGORY_UNAVAILABLE", "A category was removed meanwhile. Reload the budget.")
            used = dict(database.execute(
                select(EventExpense.category_id, func.count()).where(EventExpense.event_id == event.id)
                .group_by(EventExpense.category_id)
            ).all())
            in_use = sorted(current[identifier].name for identifier in set(current) - kept if used.get(identifier))
            if in_use:
                raise DomainError(
                    409, "CATEGORY_IN_USE", f"Expenses are recorded in {', '.join(in_use)}. Delete them before removing the category.",
                )
            if budget is not None and body.currency != budget.currency and (sum(used.values()) or database.scalar(
                select(func.count()).select_from(EventContribution).where(EventContribution.event_id == event.id)
            ) or database.get(EventBudgetSplit, event.id) is not None):
                raise DomainError(
                    409, "BUDGET_CURRENCY_LOCKED",
                    "The currency can change only while no expense, contribution or split is recorded.",
                )
            wanted = [(str(item.id) if item.id else None, item.name, item.estimate_minor) for item in body.categories]
            existing = [
                (category.id, category.name, category.estimate_minor)
                for category in sorted(current.values(), key=lambda category: (category.position, category.id))
            ]
            if budget is not None and budget.currency == body.currency and wanted == existing:
                return self.present(database, event, membership)
            now = self.clock()
            if budget is None:
                budget = EventBudget(event_id=event.id, currency=body.currency, version=1, created_at=now, updated_at=now)
                database.add(budget)
                database.flush()
            else:
                budget.currency = body.currency
                budget.version += 1
                budget.updated_at = now
            for identifier in set(current) - kept:
                database.delete(current[identifier])
            database.flush()
            for position, item in enumerate(body.categories):
                if item.id is None:
                    database.add(EventBudgetCategory(
                        id=str(uuid4()), event_id=event.id, name=item.name, estimate_minor=item.estimate_minor,
                        position=position, created_at=now,
                    ))
                else:
                    category = current[str(item.id)]
                    category.name, category.estimate_minor, category.position = item.name, item.estimate_minor, position
            self.events.record(database, event, caller.id, "event.budget.updated")
            database.flush()
            return self.present(database, event, membership)

    def record_expense(self, token, event_id, body, key):
        with self.identity.signed_in_write(token) as (database, caller):
            event, membership = self.events.visible(database, event_id, caller.id, lock=True)
            digest = self.security.digest("space.event.expense", event.id, body.model_dump_json())
            existing = database.scalar(select(EventExpense).where(
                EventExpense.event_id == event.id, EventExpense.recorder_id == caller.id, EventExpense.creation_key == key,
            ))
            if existing is not None:
                if existing.recorder_admission_id != membership.admission_id:
                    raise DomainError(404, "NOT_FOUND", "Event not found.")
                if existing.creation_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "This retry does not match the original expense.")
                return self.present(database, event, membership)
            if event.status != "scheduled":
                raise cancelled()
            budget = database.get(EventBudget, event.id, populate_existing=True)
            if budget is None:
                raise DomainError(409, "BUDGET_NOT_SET", "This event has no budget yet. The organizer sets one up first.")
            category_id = str(body.category_id) if body.category_id else None
            if category_id is not None and database.scalar(select(EventBudgetCategory.id).where(
                EventBudgetCategory.event_id == event.id, EventBudgetCategory.id == category_id,
            )) is None:
                raise DomainError(409, "CATEGORY_UNAVAILABLE", "This category was removed. Reload the budget.")
            count = database.scalar(select(func.count()).select_from(EventExpense).where(EventExpense.event_id == event.id))
            if count >= MAX_EXPENSES:
                raise DomainError(409, "EXPENSE_LIMIT_REACHED", f"An event can hold up to {MAX_EXPENSES} expenses.")
            database.add(EventExpense(
                id=str(uuid4()), event_id=event.id, category_id=category_id, recorder_id=caller.id,
                recorder_admission_id=membership.admission_id, amount_minor=body.amount_minor, note=body.note,
                creation_key=key, creation_digest=digest, created_at=self.clock(),
            ))
            self.events.record(database, event, caller.id, "event.expense.recorded")
            database.flush()
            return self.present(database, event, membership)

    def delete_expense(self, token, event_id, expense_id):
        with self.identity.signed_in_write(token) as (database, caller):
            event, membership = self.events.visible(database, event_id, caller.id, lock=True)
            expense = database.scalar(select(EventExpense).where(EventExpense.event_id == event.id, EventExpense.id == expense_id))
            # Deleting again, for example after a lost response, finds nothing left to delete.
            if expense is None:
                return self.present(database, event, membership)
            mine = expense.recorder_id == caller.id and expense.recorder_admission_id == membership.admission_id
            if not (mine or self.manages(event, membership)):
                raise DomainError(403, "EXPENSE_DELETE_DENIED", "Only the person who recorded it, the organizer or the Space owner can delete it.")
            if event.status != "scheduled":
                raise cancelled()
            database.delete(expense)
            self.events.record(database, event, caller.id, "event.expense.deleted")
            database.flush()
            return self.present(database, event, membership)

    def record_contribution(self, token, event_id, body, key):
        with self.identity.signed_in_write(token) as (database, caller):
            event, membership = self.events.visible(database, event_id, caller.id, lock=True)
            digest = self.security.digest("space.event.contribution", event.id, body.model_dump_json())
            existing = database.scalar(select(EventContribution).where(
                EventContribution.event_id == event.id, EventContribution.contributor_id == caller.id,
                EventContribution.creation_key == key,
            ))
            if existing is not None:
                if existing.contributor_admission_id != membership.admission_id:
                    raise DomainError(404, "NOT_FOUND", "Event not found.")
                if existing.creation_digest != digest:
                    raise DomainError(409, "IDEMPOTENCY_CONFLICT", "This retry does not match the original contribution.")
                return self.present(database, event, membership)
            if event.status != "scheduled":
                raise cancelled()
            if database.get(EventBudget, event.id, populate_existing=True) is None:
                raise DomainError(409, "BUDGET_NOT_SET", "This event has no budget yet. The organizer sets one up first.")
            count = database.scalar(
                select(func.count()).select_from(EventContribution).where(EventContribution.event_id == event.id)
            )
            if count >= MAX_CONTRIBUTIONS:
                raise DomainError(
                    409, "CONTRIBUTION_LIMIT_REACHED", f"An event can hold up to {MAX_CONTRIBUTIONS} contributions.",
                )
            now = self.clock()
            database.add(EventContribution(
                id=str(uuid4()), event_id=event.id, contributor_id=caller.id, contributor_admission_id=membership.admission_id,
                amount_minor=body.amount_minor, state=body.state, note=body.note, creation_key=key, creation_digest=digest,
                created_at=now, updated_at=now,
            ))
            self.events.record(database, event, caller.id, "event.contribution.recorded")
            database.flush()
            return self.present(database, event, membership)

    def change_contribution(self, token, event_id, contribution_id, body):
        with self.identity.signed_in_write(token) as (database, caller):
            event, membership = self.events.visible(database, event_id, caller.id, lock=True)
            contribution = self.contribution(database, event, membership, contribution_id)
            if contribution is None:
                raise DomainError(404, "CONTRIBUTION_NOT_FOUND", "This contribution was withdrawn.")
            # Asking again for the state it already has, for example after a lost response, changes nothing.
            if contribution.state == body.state:
                return self.present(database, event, membership)
            if event.status != "scheduled":
                raise cancelled()
            contribution.state = body.state
            contribution.updated_at = self.clock()
            self.events.record(database, event, caller.id, "event.contribution.changed")
            database.flush()
            return self.present(database, event, membership)

    def withdraw_contribution(self, token, event_id, contribution_id):
        with self.identity.signed_in_write(token) as (database, caller):
            event, membership = self.events.visible(database, event_id, caller.id, lock=True)
            contribution = self.contribution(database, event, membership, contribution_id)
            # Withdrawing again, for example after a lost response, finds nothing left to withdraw.
            if contribution is None:
                return self.present(database, event, membership)
            if event.status != "scheduled":
                raise cancelled()
            database.delete(contribution)
            self.events.record(database, event, caller.id, "event.contribution.withdrawn")
            database.flush()
            return self.present(database, event, membership)

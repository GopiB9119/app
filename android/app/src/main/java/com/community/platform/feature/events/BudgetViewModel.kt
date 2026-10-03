package com.community.platform.feature.events

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.community.platform.feature.identity.IdentityFailure
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException
import java.util.UUID
import javax.inject.Inject

/** Why the last budget action did not go through; [CONNECTION] means its outcome is not known. */
enum class BudgetIssue {
    CONNECTION, LOAD, CHANGED, CURRENCY_LOCKED, CATEGORY_IN_USE, CATEGORY_GONE, NOT_SET, LIMIT, CANCELLED, DENIED, RETRY_CONFLICT, FAILED,
    CONTRIBUTION_LIMIT, CONTRIBUTION_GONE, CHANGE_DENIED, CONTRIBUTION_RETRY_CONFLICT, PERSON_GONE,
}

/** A plan being edited, started from the version [etag]; a newer version makes the save fail rather than overwrite it. */
data class PlanDraft(val etag: String, val currency: String?, val rows: List<PlanRow>)

data class BudgetState(
    val accountId: String? = null,
    val eventId: String? = null,
    val budget: BudgetDto? = null,
    val loading: Boolean = false,
    val working: Boolean = false,
    val plan: PlanDraft? = null,
    val amount: String = "",
    val categoryId: String? = null,
    val note: String = "",
    val pending: ExpenseIntent? = null,
    val planProblem: BudgetProblem? = null,
    val expenseProblem: BudgetProblem? = null,
    val issue: BudgetIssue? = null,
    val confirmDelete: String? = null,
    // A contribution of one's own (DEC-041): no state is chosen until the person says promised or given.
    val giftAmount: String = "",
    val giftState: String? = null,
    val giftNote: String = "",
    val pendingGift: ContributionIntent? = null,
    val giftProblem: BudgetProblem? = null,
    val confirmWithdraw: String? = null,
    // A split being edited (DEC-042), started from the version in its etag.
    val split: SplitDraft? = null,
    val splitProblem: BudgetProblem? = null,
    val confirmUnsplit: Boolean = false,
    val requiresSignIn: Boolean = false,
)

data class BudgetActions(
    val retry: () -> Unit = {}, val startPlan: () -> Unit = {}, val closePlan: () -> Unit = {}, val reloadPlan: () -> Unit = {}, val currency: (String) -> Unit = {},
    val row: (Int, PlanRow) -> Unit = { _, _ -> }, val addRow: () -> Unit = {}, val removeRow: (Int) -> Unit = {}, val savePlan: () -> Unit = {},
    val amount: (String) -> Unit = {}, val category: (String?) -> Unit = {}, val note: (String) -> Unit = {}, val record: () -> Unit = {},
    val askDelete: (String) -> Unit = {}, val keep: () -> Unit = {}, val delete: () -> Unit = {},
    val giftAmount: (String) -> Unit = {}, val giftState: (String) -> Unit = {}, val giftNote: (String) -> Unit = {}, val contribute: () -> Unit = {},
    val mark: (String, String) -> Unit = { _, _ -> }, val askWithdraw: (String) -> Unit = {}, val keepGift: () -> Unit = {}, val withdraw: () -> Unit = {},
    val startSplit: () -> Unit = {}, val closeSplit: () -> Unit = {}, val splitMethod: (String) -> Unit = {}, val splitBase: (String) -> Unit = {},
    val splitPerson: (String, Boolean) -> Unit = { _, _ -> }, val splitValue: (String, String) -> Unit = { _, _ -> }, val saveSplit: () -> Unit = {},
    val askUnsplit: () -> Unit = {}, val keepSplit: () -> Unit = {}, val unsplit: () -> Unit = {},
)

private val ISSUES = mapOf(
    "BUDGET_CHANGED" to BudgetIssue.CHANGED, "BUDGET_CURRENCY_LOCKED" to BudgetIssue.CURRENCY_LOCKED,
    "CATEGORY_IN_USE" to BudgetIssue.CATEGORY_IN_USE, "CATEGORY_UNAVAILABLE" to BudgetIssue.CATEGORY_GONE,
    "BUDGET_NOT_SET" to BudgetIssue.NOT_SET, "EXPENSE_LIMIT_REACHED" to BudgetIssue.LIMIT, "EVENT_CANCELLED" to BudgetIssue.CANCELLED,
    "EXPENSE_DELETE_DENIED" to BudgetIssue.DENIED, "EVENT_MANAGEMENT_DENIED" to BudgetIssue.DENIED, "IDEMPOTENCY_CONFLICT" to BudgetIssue.RETRY_CONFLICT,
    "CONTRIBUTION_LIMIT_REACHED" to BudgetIssue.CONTRIBUTION_LIMIT, "CONTRIBUTION_NOT_FOUND" to BudgetIssue.CONTRIBUTION_GONE,
    "CONTRIBUTION_CHANGE_DENIED" to BudgetIssue.CHANGE_DENIED, "PERSON_UNAVAILABLE" to BudgetIssue.PERSON_GONE,
)
private val GIFT_ISSUES = ISSUES + ("IDEMPOTENCY_CONFLICT" to BudgetIssue.CONTRIBUTION_RETRY_CONFLICT)

@HiltViewModel
class BudgetViewModel @Inject constructor(private val repository: EventBudgetsRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(BudgetState())
    val state = mutableState.asStateFlow()
    @Volatile private var generation = 0L
    @Volatile private var loads = 0L
    // A read stopped by a change, or asked for during one, runs once the change is answered (T82).
    @Volatile private var readAfterChange = false
    private var loadJob: Job? = null

    fun bind(accountId: String?, eventId: String?) {
        val current = mutableState.value
        if (current.accountId == accountId && current.eventId == eventId) return
        generation += 1
        loadJob?.cancel()
        readAfterChange = false
        mutableState.value = BudgetState(accountId = accountId, eventId = eventId)
        if (accountId != null && eventId != null) refresh()
    }

    fun refresh() {
        val current = mutableState.value
        val account = current.accountId ?: return
        val event = current.eventId ?: return
        if (current.working) { readAfterChange = true; return }
        val expected = generation
        val mine = ++loads
        loadJob?.cancel()
        mutableState.update { it.copy(loading = true) }
        loadJob = viewModelScope.launch {
            try {
                val budget = repository.read(account, event)
                mutableState.update {
                    if (generation != expected || loads != mine) it
                    else it.copy(budget = budget, categoryId = it.categoryId?.takeIf { id -> budget.categories.any { item -> item.id == id } })
                }
            } catch (error: CancellationException) { throw error }
            catch (error: Exception) { if (loads == mine) fail(error, expected, BudgetIssue.LOAD, reload = false) }
            // Checked inside the update, so a load that started later and set loading again is never undone by this one.
            finally { mutableState.update { if (generation == expected && loads == mine) it.copy(loading = false) else it } }
        }
    }

    private fun fail(error: Exception, expected: Long, fallback: BudgetIssue, reload: Boolean = true, known: Map<String, BudgetIssue> = ISSUES) {
        if (generation != expected) return
        val failure = error as? IdentityFailure
        if (failure?.status == 401 || failure?.code == "ACCOUNT_CHANGED") {
            generation += 1
            loadJob?.cancel()
            mutableState.value = BudgetState(accountId = mutableState.value.accountId, eventId = mutableState.value.eventId, requiresSignIn = true)
            return
        }
        val unknown = error is IOException || failure == null || failure.status == 0 || failure.status >= 500 || failure.status == 408
        // An unanswered command may have gone through; an unanswered read only failed to load.
        val issue = when {
            unknown -> if (reload) BudgetIssue.CONNECTION else BudgetIssue.LOAD
            else -> known[failure?.code] ?: fallback
        }
        mutableState.update { it.copy(issue = issue) }
        // A definite refusal can mean the budget changed meanwhile, so show the current one.
        if (!unknown && reload) refresh()
    }

    private fun command(known: Map<String, BudgetIssue> = ISSUES, work: suspend (String, String) -> Unit) {
        val current = mutableState.value
        val account = current.accountId ?: return
        val event = current.eventId ?: return
        if (current.working) return
        val expected = generation
        // An unanswered read began before this change, so its answer could undo it; stop it and read again afterwards.
        if (loadJob?.isActive == true) { loads += 1; loadJob?.cancel(); readAfterChange = true }
        mutableState.update { it.copy(working = true, loading = false, issue = null) }
        viewModelScope.launch {
            try { work(account, event) }
            catch (error: CancellationException) { throw error }
            catch (error: Exception) { fail(error, expected, BudgetIssue.FAILED, known = known) }
            finally {
                if (generation == expected) {
                    val again = readAfterChange
                    readAfterChange = false
                    // One update, so nothing sees the screen idle between the change and the read that follows it.
                    mutableState.update { it.copy(working = false, loading = it.loading || again) }
                    if (again) refresh()
                }
            }
        }
    }

    private fun store(budget: BudgetDto) = mutableState.update { it.copy(budget = budget, categoryId = it.categoryId?.takeIf { id -> budget.categories.any { item -> item.id == id } }) }

    fun startPlan() {
        val budget = mutableState.value.budget ?: return
        if (!budget.canManage || mutableState.value.working) return
        mutableState.update {
            it.copy(planProblem = null, issue = null, plan = PlanDraft(budget.etag ?: return, budget.currency, budget.categories.map { item ->
                PlanRow(item.id, item.name, minorText(item.estimateMinor))
            }))
        }
    }

    fun closePlan() { if (!mutableState.value.working) mutableState.update { it.copy(plan = null, planProblem = null) } }

    /** After the plan changed elsewhere: drop this draft and show the current budget. */
    fun reloadPlan() {
        if (mutableState.value.working) return
        mutableState.update { it.copy(plan = null, planProblem = null, issue = null) }
        refresh()
    }

    private fun editPlan(change: (PlanDraft) -> PlanDraft) {
        if (mutableState.value.working) return
        mutableState.update { state -> state.copy(plan = state.plan?.let(change), planProblem = null) }
    }

    fun currency(code: String) = editPlan { plan ->
        val budget = mutableState.value.budget
        if (budget?.expenses.isNullOrEmpty() && (budget?.contributionCount ?: 0) == 0 && budget?.split == null) plan.copy(currency = code) else plan
    }
    fun row(index: Int, value: PlanRow) = editPlan { plan -> plan.copy(rows = plan.rows.mapIndexed { position, row -> if (position == index) value else row }) }
    fun addRow() = editPlan { plan -> if (plan.rows.size < MAX_BUDGET_CATEGORIES) plan.copy(rows = plan.rows + PlanRow(null, "", "")) else plan }
    fun removeRow(index: Int) = editPlan { plan ->
        val used = mutableState.value.budget?.categories.orEmpty().filter { it.recordedMinor > 0 }.map { it.id }.toSet()
        if (plan.rows.getOrNull(index)?.id in used) plan else plan.copy(rows = plan.rows.filterIndexed { position, _ -> position != index })
    }

    fun savePlan() {
        val plan = mutableState.value.plan ?: return
        planProblem(plan.currency, plan.rows)?.let { problem -> mutableState.update { it.copy(planProblem = problem) }; return }
        val body = planBody(plan.currency ?: return, plan.rows)
        command { account, event ->
            val saved = repository.save(account, event, plan.etag, body)
            store(saved)
            mutableState.update { it.copy(plan = null) }
        }
    }

    fun amount(value: String) = expenseField { it.copy(amount = value.take(20)) }
    fun category(id: String?) = expenseField { it.copy(categoryId = id) }
    fun note(value: String) = expenseField { it.copy(note = value.take(400)) }

    private fun expenseField(change: (BudgetState) -> BudgetState) {
        if (mutableState.value.working) return
        mutableState.update { change(it).copy(expenseProblem = null) }
    }

    fun record() {
        val current = mutableState.value
        val account = current.accountId ?: return
        val event = current.eventId ?: return
        if (current.working) return
        expenseProblem(current.amount, current.note)?.let { problem -> mutableState.update { it.copy(expenseProblem = problem) }; return }
        val body = expenseBody(current.amount, current.note, current.categoryId)
        val intent = current.pending?.takeIf { it.body == body } ?: ExpenseIntent(account, event, UUID.randomUUID().toString(), body)
        mutableState.update { it.copy(pending = intent) }
        command { _, _ ->
            try {
                val saved = repository.record(intent)
                store(saved)
                mutableState.update { it.copy(pending = null, amount = "", note = "", categoryId = null) }
            } catch (error: IdentityFailure) {
                // A definite refusal releases the attempt; an unknown outcome keeps its key for an exact retry.
                if (error.status in 400..499 && error.status != 408) mutableState.update { it.copy(pending = null) }
                throw error
            }
        }
    }

    fun askDelete(expenseId: String) {
        if (mutableState.value.budget?.expenses?.any { it.id == expenseId && it.canDelete } == true) mutableState.update { it.copy(confirmDelete = expenseId, issue = null) }
    }

    fun keep() { if (!mutableState.value.working) mutableState.update { it.copy(confirmDelete = null) } }

    fun delete() {
        val expense = mutableState.value.confirmDelete ?: return
        command { account, event ->
            store(repository.delete(account, event, expense))
            mutableState.update { it.copy(confirmDelete = null) }
        }
    }

    fun giftAmount(value: String) = giftField { it.copy(giftAmount = value.take(20)) }
    fun giftState(value: String) = giftField { it.copy(giftState = value.takeIf { state -> state in CONTRIBUTION_STATES }) }
    fun giftNote(value: String) = giftField { it.copy(giftNote = value.take(400)) }

    private fun giftField(change: (BudgetState) -> BudgetState) {
        if (mutableState.value.working) return
        mutableState.update { change(it).copy(giftProblem = null) }
    }

    fun contribute() {
        val current = mutableState.value
        val account = current.accountId ?: return
        val event = current.eventId ?: return
        if (current.working) return
        contributionProblem(current.giftAmount, current.giftState, current.giftNote)?.let { problem -> mutableState.update { it.copy(giftProblem = problem) }; return }
        val body = contributionBody(current.giftAmount, current.giftState ?: return, current.giftNote)
        val intent = current.pendingGift?.takeIf { it.body == body } ?: ContributionIntent(account, event, UUID.randomUUID().toString(), body)
        mutableState.update { it.copy(pendingGift = intent) }
        command(GIFT_ISSUES) { _, _ ->
            try {
                store(repository.contribute(intent))
                mutableState.update { it.copy(pendingGift = null, giftAmount = "", giftState = null, giftNote = "") }
            } catch (error: IdentityFailure) {
                // A definite refusal releases the attempt; an unknown outcome keeps its key for an exact retry.
                if (error.status in 400..499 && error.status != 408) mutableState.update { it.copy(pendingGift = null) }
                throw error
            }
        }
    }

    /** Marks one's own contribution as promised or given; asking for the state it has changes nothing. */
    fun mark(contributionId: String, state: String) {
        if (state !in CONTRIBUTION_STATES) return
        if (mutableState.value.budget?.contributions?.any { it.id == contributionId && it.canChange } != true) return
        mutableState.update { it.copy(confirmWithdraw = null) }
        command { account, event -> store(repository.mark(account, event, contributionId, state)) }
    }

    fun askWithdraw(contributionId: String) {
        if (mutableState.value.working) return
        if (mutableState.value.budget?.contributions?.any { it.id == contributionId && it.canChange } == true) {
            mutableState.update { it.copy(confirmWithdraw = contributionId, issue = null) }
        }
    }

    fun keepGift() { if (!mutableState.value.working) mutableState.update { it.copy(confirmWithdraw = null) } }

    fun withdraw() {
        val contribution = mutableState.value.confirmWithdraw ?: return
        command { account, event ->
            store(repository.withdraw(account, event, contribution))
            mutableState.update { it.copy(confirmWithdraw = null) }
        }
    }

    /** Opens the split editor with the people still able to see the event, from the version shown now. */
    fun startSplit() {
        val budget = mutableState.value.budget ?: return
        if (!budget.canManage || mutableState.value.working) return
        val etag = budget.etag ?: return
        val split = budget.split
        val candidates = budget.splitCandidates.map { it.accountId }.toSet()
        val people = split?.shares.orEmpty().filter { it.accountId in candidates }.map { share ->
            (share.accountId ?: "") to when {
                share.value == null -> ""
                split?.method == "percentages" -> percentText(share.value)
                else -> minorText(share.value)
            }
        }
        mutableState.update { it.copy(split = SplitDraft(etag, split?.method ?: "equal", split?.base ?: "planned", people), splitProblem = null, issue = null, confirmUnsplit = false) }
    }

    fun closeSplit() { if (!mutableState.value.working) mutableState.update { it.copy(split = null, splitProblem = null) } }

    private fun editSplit(change: (SplitDraft) -> SplitDraft) {
        if (mutableState.value.working) return
        mutableState.update { state -> state.copy(split = state.split?.let(change), splitProblem = null) }
    }

    fun splitMethod(method: String) = editSplit { if (method in SPLIT_METHODS) it.copy(method = method) else it }
    fun splitBase(base: String) = editSplit { if (base in SPLIT_BASES) it.copy(base = base) else it }
    fun splitPerson(accountId: String, chosen: Boolean) = editSplit { draft ->
        val known = mutableState.value.budget?.splitCandidates.orEmpty().any { it.accountId == accountId }
        when {
            chosen && known && draft.people.none { it.first == accountId } -> draft.copy(people = draft.people + (accountId to ""))
            !chosen -> draft.copy(people = draft.people.filter { it.first != accountId })
            else -> draft
        }
    }
    fun splitValue(accountId: String, value: String) = editSplit { draft ->
        draft.copy(people = draft.people.map { if (it.first == accountId) accountId to value.take(20) else it })
    }

    fun saveSplit() {
        val draft = mutableState.value.split ?: return
        splitProblem(draft)?.let { problem -> mutableState.update { it.copy(splitProblem = problem) }; return }
        command { account, event ->
            store(repository.split(account, event, draft.etag, splitBody(draft)))
            mutableState.update { it.copy(split = null) }
        }
    }

    fun askUnsplit() {
        if (mutableState.value.working || mutableState.value.budget?.let { it.canManage && it.split != null } != true) return
        mutableState.update { it.copy(confirmUnsplit = true, issue = null) }
    }

    fun keepSplit() { if (!mutableState.value.working) mutableState.update { it.copy(confirmUnsplit = false) } }

    fun unsplit() {
        val etag = mutableState.value.budget?.etag ?: return
        if (!mutableState.value.confirmUnsplit) return
        command { account, event ->
            store(repository.unsplit(account, event, etag))
            mutableState.update { it.copy(confirmUnsplit = false) }
        }
    }

    fun actions() = BudgetActions(
        retry = ::refresh, startPlan = ::startPlan, closePlan = ::closePlan, reloadPlan = ::reloadPlan, currency = ::currency, row = ::row, addRow = ::addRow,
        removeRow = ::removeRow, savePlan = ::savePlan, amount = ::amount, category = ::category, note = ::note, record = ::record,
        askDelete = ::askDelete, keep = ::keep, delete = ::delete,
        giftAmount = ::giftAmount, giftState = ::giftState, giftNote = ::giftNote, contribute = ::contribute,
        mark = ::mark, askWithdraw = ::askWithdraw, keepGift = ::keepGift, withdraw = ::withdraw,
        startSplit = ::startSplit, closeSplit = ::closeSplit, splitMethod = ::splitMethod, splitBase = ::splitBase, splitPerson = ::splitPerson,
        splitValue = ::splitValue, saveSplit = ::saveSplit, askUnsplit = ::askUnsplit, keepSplit = ::keepSplit, unsplit = ::unsplit,
    )
}

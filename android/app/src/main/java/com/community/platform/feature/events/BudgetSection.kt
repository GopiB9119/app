package com.community.platform.feature.events

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import com.community.platform.DesignTokens
import com.community.platform.R
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

private val unit = DesignTokens.SpaceUnit
private val target = Modifier.heightIn(min = DesignTokens.MinimumTarget)

@Composable
private fun problemText(problem: BudgetProblem) = when (problem) {
    BudgetProblem.CURRENCY -> stringResource(R.string.budget_problem_currency)
    BudgetProblem.CATEGORY_COUNT -> stringResource(R.string.budget_problem_category_count, MAX_BUDGET_CATEGORIES)
    BudgetProblem.CATEGORY_NAME -> stringResource(R.string.budget_problem_category_name)
    BudgetProblem.CATEGORY_NAME_LONG -> stringResource(R.string.budget_problem_category_name_long, MAX_CATEGORY_NAME)
    BudgetProblem.CATEGORY_DUPLICATE -> stringResource(R.string.budget_problem_category_duplicate)
    BudgetProblem.ESTIMATE -> stringResource(R.string.budget_problem_estimate)
    BudgetProblem.AMOUNT -> stringResource(R.string.budget_problem_amount)
    BudgetProblem.NOTE -> stringResource(R.string.budget_problem_note)
    BudgetProblem.NOTE_LONG -> stringResource(R.string.budget_problem_note_long, MAX_EXPENSE_NOTE)
    BudgetProblem.CONTROL -> stringResource(R.string.events_problem_control)
    BudgetProblem.STATE -> stringResource(R.string.budget_problem_state)
    BudgetProblem.PEOPLE -> stringResource(R.string.split_problem_people)
    BudgetProblem.PERCENT -> stringResource(R.string.split_problem_percent)
    BudgetProblem.PERCENT_TOTAL -> stringResource(R.string.split_problem_percent_total)
    BudgetProblem.SPLIT_AMOUNT -> stringResource(R.string.split_problem_amount)
}

@Composable
private fun issueText(issue: BudgetIssue) = stringResource(when (issue) {
    BudgetIssue.CONNECTION -> R.string.budget_issue_connection
    BudgetIssue.LOAD -> R.string.budget_issue_load
    BudgetIssue.CHANGED -> R.string.budget_issue_changed
    BudgetIssue.CURRENCY_LOCKED -> R.string.budget_issue_currency_locked
    BudgetIssue.CATEGORY_IN_USE -> R.string.budget_issue_category_in_use
    BudgetIssue.CATEGORY_GONE -> R.string.budget_issue_category_gone
    BudgetIssue.NOT_SET -> R.string.budget_issue_not_set
    BudgetIssue.LIMIT -> R.string.budget_issue_limit
    BudgetIssue.CANCELLED -> R.string.budget_issue_cancelled
    BudgetIssue.DENIED -> R.string.budget_issue_denied
    BudgetIssue.RETRY_CONFLICT -> R.string.budget_issue_retry_conflict
    BudgetIssue.FAILED -> R.string.budget_issue_failed
    BudgetIssue.CONTRIBUTION_LIMIT -> R.string.budget_issue_contribution_limit
    BudgetIssue.CONTRIBUTION_GONE -> R.string.budget_issue_contribution_gone
    BudgetIssue.CHANGE_DENIED -> R.string.budget_issue_change_denied
    BudgetIssue.CONTRIBUTION_RETRY_CONFLICT -> R.string.budget_issue_contribution_retry_conflict
    BudgetIssue.PERSON_GONE -> R.string.split_issue_person_gone
})

/** An event's budget (DEC-039): planned and recorded amounts. Recording an expense never moves money. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BudgetSection(state: BudgetState, actions: BudgetActions) {
    val locale = LocalConfiguration.current.locales[0]
    Column(verticalArrangement = Arrangement.spacedBy(unit * 2), modifier = Modifier.fillMaxWidth().testTag("event-budget")) {
        HorizontalDivider()
        Text(stringResource(R.string.budget_title), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
        Text(stringResource(R.string.budget_not_payment), style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("budget-not-payment"))
        state.issue?.let {
            Text(issueText(it), color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("budget-issue"))
        }
        val budget = state.budget
        if (budget == null) {
            if (state.loading) Text(stringResource(R.string.budget_loading))
            else if (state.issue != null) OutlinedButton(onClick = actions.retry, modifier = target.testTag("budget-retry")) { Text(stringResource(R.string.budget_retry)) }
            return@Column
        }
        val currency = budget.currency
        val money = { value: Long -> if (currency == null) "" else formatMoney(value, currency, locale) }
        if (currency == null) {
            Text(stringResource(if (budget.canManage) R.string.budget_none_manager else R.string.budget_none), modifier = Modifier.testTag("budget-none"))
        } else {
            Text(stringResource(R.string.budget_planned, money(budget.estimateMinor)), modifier = Modifier.testTag("budget-planned"))
            Text(stringResource(R.string.budget_recorded, money(budget.recordedMinor)), modifier = Modifier.testTag("budget-recorded"))
            Text(
                if (budget.remainingMinor < 0) stringResource(R.string.budget_over, money(-budget.remainingMinor)) else stringResource(R.string.budget_left, money(budget.remainingMinor)),
                fontWeight = FontWeight.Bold, color = if (budget.remainingMinor < 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.testTag("budget-remaining"),
            )
            budget.categories.forEach { category ->
                Text(
                    stringResource(
                        if (category.remainingMinor < 0) R.string.budget_category_over else R.string.budget_category,
                        category.name, money(category.estimateMinor), money(category.recordedMinor), money(kotlin.math.abs(category.remainingMinor)),
                    ),
                    style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("budget-category"),
                )
            }
            if (budget.uncategorizedMinor > 0) Text(stringResource(R.string.budget_uncategorized, money(budget.uncategorizedMinor)), style = MaterialTheme.typography.bodySmall)
        }
        val plan = state.plan
        if (budget.canManage && plan == null) {
            OutlinedButton(onClick = actions.startPlan, enabled = !state.working, modifier = target.testTag("budget-open-plan")) {
                Text(stringResource(if (currency == null) R.string.budget_set_up else R.string.budget_edit))
            }
        }
        if (budget.canManage && plan != null) PlanEditor(state, plan, budget, actions)
        if (currency != null) SplitSection(state, budget, currency, money, actions)
        if (budget.canRecord && currency != null) ExpenseForm(state, budget, currency, actions)
        if (currency != null) {
            Text(stringResource(R.string.budget_expenses), style = MaterialTheme.typography.titleSmall, modifier = Modifier.semantics { heading() })
            if (budget.expenses.isEmpty()) Text(stringResource(R.string.budget_no_expenses), style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("budget-no-expenses"))
            val names = budget.categories.associate { it.id to it.name }
            val format = DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT).withLocale(locale)
            budget.expenses.forEach { expense ->
                Column(verticalArrangement = Arrangement.spacedBy(unit), modifier = Modifier.fillMaxWidth().testTag("budget-expense")) {
                    Text("${money(expense.amountMinor)} · ${expense.categoryId?.let(names::get) ?: stringResource(R.string.budget_no_category)}", fontWeight = FontWeight.Bold)
                    if (expense.note.isNotEmpty()) Text(expense.note)
                    val who = if (expense.mine) stringResource(R.string.events_you) else expense.recordedByName ?: stringResource(R.string.budget_deleted_account)
                    val time = runCatching { Instant.parse(expense.recordedAt).atZone(ZoneId.systemDefault()).format(format) }.getOrDefault(expense.recordedAt)
                    Text(stringResource(R.string.budget_recorded_by, who, time), style = MaterialTheme.typography.bodySmall)
                    if (expense.canDelete && state.confirmDelete == expense.id) {
                        Text(stringResource(R.string.budget_delete_text, money(expense.amountMinor)), modifier = Modifier.testTag("budget-delete-text"))
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(unit * 2), verticalArrangement = Arrangement.spacedBy(unit * 2)) {
                            Button(onClick = actions.delete, enabled = !state.working, modifier = target.testTag("budget-delete-confirm")) { Text(stringResource(R.string.budget_delete_confirm)) }
                            OutlinedButton(onClick = actions.keep, enabled = !state.working, modifier = target.testTag("budget-delete-keep")) { Text(stringResource(R.string.budget_keep)) }
                        }
                    } else if (expense.canDelete) {
                        val description = stringResource(R.string.budget_delete_named, money(expense.amountMinor), expense.note)
                        TextButton(onClick = { actions.askDelete(expense.id) }, enabled = !state.working,
                            modifier = target.semantics { contentDescription = description }.testTag("budget-delete")) { Text(stringResource(R.string.budget_delete)) }
                    }
                    HorizontalDivider()
                }
            }
            Contributions(state, budget, currency, money, format, actions)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Contributions(state: BudgetState, budget: BudgetDto, currency: String, money: (Long) -> String, format: DateTimeFormatter, actions: BudgetActions) {
    Text(stringResource(R.string.budget_contributions), style = MaterialTheme.typography.titleSmall, modifier = Modifier.semantics { heading() }.testTag("budget-contributions"))
    Text(stringResource(R.string.budget_contributions_note), style = MaterialTheme.typography.bodySmall)
    Text(stringResource(R.string.budget_given, money(budget.givenMinor)), modifier = Modifier.testTag("budget-given"))
    Text(stringResource(R.string.budget_promised, money(budget.promisedMinor)), modifier = Modifier.testTag("budget-promised"))
    Text(stringResource(R.string.budget_contribution_count, budget.contributionCount), style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("budget-contribution-count"))
    if (!budget.allContributions) {
        Text(stringResource(R.string.budget_contributions_private), style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("budget-contributions-private"))
    }
    if (budget.canRecord) ContributionForm(state, currency, actions)
    if (budget.contributions.isEmpty()) {
        Text(stringResource(if (budget.allContributions) R.string.budget_no_contributions else R.string.budget_no_own_contributions),
            style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("budget-no-contributions"))
    }
    budget.contributions.forEach { contribution ->
        val amount = money(contribution.amountMinor)
        val given = contribution.state == "given"
        Column(verticalArrangement = Arrangement.spacedBy(unit), modifier = Modifier.fillMaxWidth().testTag("budget-contribution")) {
            Text("$amount · ${stringResource(if (given) R.string.budget_state_given else R.string.budget_state_promised)}", fontWeight = FontWeight.Bold)
            contribution.note?.let { Text(it) }
            val who = if (contribution.mine) stringResource(R.string.events_you) else contribution.contributorName ?: stringResource(R.string.budget_deleted_account)
            val time = runCatching { Instant.parse(contribution.recordedAt).atZone(ZoneId.systemDefault()).format(format) }.getOrDefault(contribution.recordedAt)
            Text(stringResource(R.string.budget_contributed_by, who, time), style = MaterialTheme.typography.bodySmall)
            if (contribution.canChange && state.confirmWithdraw == contribution.id) {
                Text(stringResource(R.string.budget_withdraw_text, amount), modifier = Modifier.testTag("budget-withdraw-text"))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(unit * 2), verticalArrangement = Arrangement.spacedBy(unit * 2)) {
                    Button(onClick = actions.withdraw, enabled = !state.working, modifier = target.testTag("budget-withdraw-confirm")) { Text(stringResource(R.string.budget_withdraw_confirm)) }
                    OutlinedButton(onClick = actions.keepGift, enabled = !state.working, modifier = target.testTag("budget-withdraw-keep")) { Text(stringResource(R.string.budget_keep_contribution)) }
                }
            } else if (contribution.canChange) {
                val markDescription = stringResource(if (given) R.string.budget_mark_promised_named else R.string.budget_mark_given_named, amount)
                val withdrawDescription = stringResource(R.string.budget_withdraw_named, amount)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(unit * 2), verticalArrangement = Arrangement.spacedBy(unit * 2)) {
                    OutlinedButton(onClick = { actions.mark(contribution.id, if (given) "promised" else "given") }, enabled = !state.working,
                        modifier = target.semantics { contentDescription = markDescription }.testTag("budget-mark")) {
                        Text(stringResource(if (given) R.string.budget_mark_promised else R.string.budget_mark_given))
                    }
                    TextButton(onClick = { actions.askWithdraw(contribution.id) }, enabled = !state.working,
                        modifier = target.semantics { contentDescription = withdrawDescription }.testTag("budget-withdraw")) { Text(stringResource(R.string.budget_withdraw)) }
                }
            }
            HorizontalDivider()
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ContributionForm(state: BudgetState, currency: String, actions: BudgetActions) {
    Column(verticalArrangement = Arrangement.spacedBy(unit * 2), modifier = Modifier.fillMaxWidth().testTag("budget-contribute")) {
        Text(stringResource(R.string.budget_contribute), style = MaterialTheme.typography.titleSmall, modifier = Modifier.semantics { heading() })
        OutlinedTextField(value = state.giftAmount, onValueChange = actions.giftAmount, enabled = !state.working, singleLine = true,
            label = { Text(stringResource(R.string.budget_amount, currency)) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            modifier = Modifier.fillMaxWidth().testTag("budget-gift-amount"))
        Text(stringResource(R.string.budget_contribution_state))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(unit * 2)) {
            CONTRIBUTION_STATES.forEach { value ->
                FilterChip(selected = state.giftState == value, enabled = !state.working, onClick = { actions.giftState(value) },
                    label = { Text(stringResource(if (value == "given") R.string.budget_state_given else R.string.budget_state_promised)) },
                    modifier = Modifier.testTag("budget-gift-state-$value"))
            }
        }
        OutlinedTextField(value = state.giftNote, onValueChange = actions.giftNote, enabled = !state.working, singleLine = true,
            label = { Text(stringResource(R.string.budget_contribution_note)) }, modifier = Modifier.fillMaxWidth().testTag("budget-gift-note"))
        state.giftProblem?.let { Text(problemText(it), color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("budget-gift-problem")) }
        Button(onClick = actions.contribute, enabled = !state.working, modifier = target.testTag("budget-contribute-button")) { Text(stringResource(R.string.budget_contribute_button)) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PlanEditor(state: BudgetState, plan: PlanDraft, budget: BudgetDto, actions: BudgetActions) {
    val locked = budget.expenses.isNotEmpty() || budget.contributionCount > 0 || budget.split != null
    val used = budget.categories.filter { it.recordedMinor > 0 }.map { it.id }.toSet()
    Column(verticalArrangement = Arrangement.spacedBy(unit * 2), modifier = Modifier.fillMaxWidth().testTag("budget-plan")) {
        Text(stringResource(if (budget.currency == null) R.string.budget_set_up else R.string.budget_edit), style = MaterialTheme.typography.titleSmall, modifier = Modifier.semantics { heading() })
        Text(stringResource(R.string.budget_currency))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(unit * 2)) {
            BUDGET_CURRENCIES.forEach { code ->
                FilterChip(selected = plan.currency == code, enabled = !locked && !state.working, onClick = { actions.currency(code) },
                    label = { Text(code) }, modifier = Modifier.testTag("budget-currency-$code"))
            }
        }
        if (locked) Text(stringResource(R.string.budget_currency_locked), style = MaterialTheme.typography.bodySmall)
        Text(stringResource(R.string.budget_categories))
        plan.rows.forEachIndexed { index, row ->
            val number = index + 1
            OutlinedTextField(value = row.name, onValueChange = { actions.row(index, row.copy(name = it.take(240))) }, enabled = !state.working, singleLine = true,
                label = { Text(stringResource(R.string.budget_category_name, number)) }, modifier = Modifier.fillMaxWidth().testTag("budget-category-name-$index"))
            OutlinedTextField(value = row.estimate, onValueChange = { actions.row(index, row.copy(estimate = it.take(20))) }, enabled = !state.working, singleLine = true,
                label = { Text(stringResource(R.string.budget_estimate, number)) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth().testTag("budget-category-estimate-$index"))
            if (row.id != null && row.id in used) Text(stringResource(R.string.budget_category_used), style = MaterialTheme.typography.bodySmall)
            else TextButton(onClick = { actions.removeRow(index) }, enabled = !state.working, modifier = target.testTag("budget-category-remove-$index")) {
                Text(stringResource(R.string.budget_remove_category, number))
            }
        }
        if (plan.rows.size < MAX_BUDGET_CATEGORIES) {
            OutlinedButton(onClick = actions.addRow, enabled = !state.working, modifier = target.testTag("budget-add-category")) { Text(stringResource(R.string.budget_add_category)) }
        }
        state.planProblem?.let { Text(problemText(it), color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("budget-plan-problem")) }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(unit * 2), verticalArrangement = Arrangement.spacedBy(unit * 2)) {
            Button(onClick = actions.savePlan, enabled = !state.working, modifier = target.testTag("budget-save")) { Text(stringResource(R.string.budget_save)) }
            if (state.issue == BudgetIssue.CHANGED) {
                OutlinedButton(onClick = actions.reloadPlan, enabled = !state.working, modifier = target.testTag("budget-reload")) { Text(stringResource(R.string.budget_reload)) }
            }
            TextButton(onClick = actions.closePlan, enabled = !state.working, modifier = target.testTag("budget-close-plan")) { Text(stringResource(R.string.budget_close_plan)) }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ExpenseForm(state: BudgetState, budget: BudgetDto, currency: String, actions: BudgetActions) {
    Column(verticalArrangement = Arrangement.spacedBy(unit * 2), modifier = Modifier.fillMaxWidth().testTag("budget-record")) {
        Text(stringResource(R.string.budget_record), style = MaterialTheme.typography.titleSmall, modifier = Modifier.semantics { heading() })
        OutlinedTextField(value = state.amount, onValueChange = actions.amount, enabled = !state.working, singleLine = true,
            label = { Text(stringResource(R.string.budget_amount, currency)) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            modifier = Modifier.fillMaxWidth().testTag("budget-amount"))
        if (budget.categories.isNotEmpty()) {
            Text(stringResource(R.string.budget_category_field))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(unit * 2)) {
                FilterChip(selected = state.categoryId == null, enabled = !state.working, onClick = { actions.category(null) },
                    label = { Text(stringResource(R.string.budget_no_category)) }, modifier = Modifier.testTag("budget-category-none"))
                budget.categories.forEach { category ->
                    FilterChip(selected = state.categoryId == category.id, enabled = !state.working, onClick = { actions.category(category.id) },
                        label = { Text(category.name) }, modifier = Modifier.testTag("budget-category-${category.id}"))
                }
            }
        }
        OutlinedTextField(value = state.note, onValueChange = actions.note, enabled = !state.working, singleLine = true,
            label = { Text(stringResource(R.string.budget_note)) }, modifier = Modifier.fillMaxWidth().testTag("budget-note"))
        state.expenseProblem?.let { Text(problemText(it), color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("budget-expense-problem")) }
        Button(onClick = actions.record, enabled = !state.working, modifier = target.testTag("budget-record-button")) { Text(stringResource(R.string.budget_record_button)) }
    }
}

private fun methodTexts(method: String) = when (method) {
    "percentages" -> R.string.split_percentages to R.string.split_method_percentages
    "amounts" -> R.string.split_amounts to R.string.split_method_amounts
    else -> R.string.split_equal to R.string.split_method_equal
}

private fun baseText(base: String) = if (base == "recorded") R.string.split_base_recorded else R.string.split_base_planned

/** How the cost is divided (DEC-042): a plan, never a bill. Members see their own share; managers see every share. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SplitSection(state: BudgetState, budget: BudgetDto, currency: String, money: (Long) -> String, actions: BudgetActions) {
    val split = budget.split
    val cent = money(1)
    Text(stringResource(R.string.split_title), style = MaterialTheme.typography.titleSmall, modifier = Modifier.semantics { heading() }.testTag("budget-split"))
    Text(stringResource(R.string.split_not_bill), style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("split-not-bill"))
    if (split == null) {
        Text(stringResource(if (budget.canManage) R.string.split_none_manager else R.string.split_none), style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("split-none"))
    } else {
        Text(stringResource(methodTexts(split.method).first, stringResource(baseText(split.base)), money(split.baseMinor)), modifier = Modifier.testTag("split-method"))
        Text(stringResource(R.string.split_people, split.peopleCount), style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("split-people"))
        if (!split.allShares) {
            val mine = split.shares.firstOrNull { it.mine }
            Text(
                when {
                    mine == null -> stringResource(R.string.split_not_included)
                    mine.roundedUp -> stringResource(R.string.split_your_share_rounded, money(mine.shareMinor), cent)
                    else -> stringResource(R.string.split_your_share, money(mine.shareMinor))
                },
                fontWeight = if (mine != null) FontWeight.Bold else FontWeight.Normal, modifier = Modifier.testTag("split-mine"),
            )
        } else {
            split.shares.forEach { share ->
                val name = if (share.mine) stringResource(R.string.events_you) else share.name ?: stringResource(R.string.budget_deleted_account)
                val amount = money(share.shareMinor)
                val percent = share.value?.let(::percentText) ?: ""
                Text(
                    when {
                        split.method == "percentages" && share.roundedUp -> stringResource(R.string.split_share_percent_rounded, name, percent, amount, cent)
                        split.method == "percentages" -> stringResource(R.string.split_share_percent, name, percent, amount)
                        share.roundedUp -> stringResource(R.string.split_share_rounded, name, amount, cent)
                        else -> stringResource(R.string.split_share, name, amount)
                    },
                    style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("split-share"),
                )
            }
        }
        if (split.roundingCount > 0) Text(stringResource(R.string.split_rounding, cent, split.roundingCount), style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("split-rounding"))
        if (split.differenceMinor != 0L) {
            Text(
                stringResource(if (split.differenceMinor > 0) R.string.split_under else R.string.split_over, money(split.allocatedMinor), money(kotlin.math.abs(split.differenceMinor))),
                color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("split-difference"),
            )
        }
    }
    val draft = state.split
    if (budget.canManage && draft == null && state.confirmUnsplit) {
        Text(stringResource(R.string.split_remove_text), modifier = Modifier.testTag("split-remove-text"))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(unit * 2), verticalArrangement = Arrangement.spacedBy(unit * 2)) {
            Button(onClick = actions.unsplit, enabled = !state.working, modifier = target.testTag("split-remove-confirm")) { Text(stringResource(R.string.split_remove_confirm)) }
            OutlinedButton(onClick = actions.keepSplit, enabled = !state.working, modifier = target.testTag("split-remove-keep")) { Text(stringResource(R.string.split_keep)) }
        }
    } else if (budget.canManage && draft == null) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(unit * 2), verticalArrangement = Arrangement.spacedBy(unit * 2)) {
            OutlinedButton(onClick = actions.startSplit, enabled = !state.working, modifier = target.testTag("split-open")) {
                Text(stringResource(if (split == null) R.string.split_add else R.string.split_edit))
            }
            if (split != null) TextButton(onClick = actions.askUnsplit, enabled = !state.working, modifier = target.testTag("split-remove")) { Text(stringResource(R.string.split_remove)) }
        }
    }
    if (budget.canManage && draft != null) SplitEditor(state, draft, budget, currency, actions)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SplitEditor(state: BudgetState, draft: SplitDraft, budget: BudgetDto, currency: String, actions: BudgetActions) {
    Column(verticalArrangement = Arrangement.spacedBy(unit * 2), modifier = Modifier.fillMaxWidth().testTag("split-editor")) {
        Text(stringResource(if (budget.split == null) R.string.split_add else R.string.split_edit), style = MaterialTheme.typography.titleSmall, modifier = Modifier.semantics { heading() })
        Text(stringResource(R.string.split_method))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(unit * 2)) {
            SPLIT_METHODS.forEach { method ->
                FilterChip(selected = draft.method == method, enabled = !state.working, onClick = { actions.splitMethod(method) },
                    label = { Text(stringResource(methodTexts(method).second)) }, modifier = Modifier.testTag("split-method-$method"))
            }
        }
        Text(stringResource(R.string.split_base))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(unit * 2)) {
            SPLIT_BASES.forEach { base ->
                FilterChip(selected = draft.base == base, enabled = !state.working, onClick = { actions.splitBase(base) },
                    label = { Text(stringResource(baseText(base))) }, modifier = Modifier.testTag("split-base-$base"))
            }
        }
        Text(stringResource(R.string.split_people_legend))
        val chosen = draft.people.toMap()
        budget.splitCandidates.forEach { candidate ->
            val value = chosen[candidate.accountId]
            FlowRow(verticalArrangement = Arrangement.Center, modifier = target.fillMaxWidth().toggleable(
                value = value != null, enabled = !state.working, role = Role.Checkbox,
                onValueChange = { actions.splitPerson(candidate.accountId, it) },
            ).testTag("split-person-${candidate.accountId}")) {
                Checkbox(checked = value != null, onCheckedChange = null, enabled = !state.working)
                Text(candidate.name, modifier = Modifier.align(Alignment.CenterVertically))
            }
            if (value != null && draft.method != "equal") {
                OutlinedTextField(value = value, onValueChange = { actions.splitValue(candidate.accountId, it) }, enabled = !state.working, singleLine = true,
                    label = { Text(if (draft.method == "percentages") stringResource(R.string.split_percent_for, candidate.name) else stringResource(R.string.split_amount_for, candidate.name, currency)) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth().testTag("split-value-${candidate.accountId}"))
            }
        }
        state.splitProblem?.let { Text(problemText(it), color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("split-problem")) }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(unit * 2), verticalArrangement = Arrangement.spacedBy(unit * 2)) {
            Button(onClick = actions.saveSplit, enabled = !state.working, modifier = target.testTag("split-save")) { Text(stringResource(R.string.split_save)) }
            if (state.issue == BudgetIssue.CHANGED || state.issue == BudgetIssue.PERSON_GONE) {
                OutlinedButton(onClick = { actions.closeSplit(); actions.retry() }, enabled = !state.working, modifier = target.testTag("split-reload")) { Text(stringResource(R.string.budget_reload)) }
            }
            TextButton(onClick = actions.closeSplit, enabled = !state.working, modifier = target.testTag("split-close")) { Text(stringResource(R.string.split_close)) }
        }
    }
}

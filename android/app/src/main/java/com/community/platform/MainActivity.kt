package com.community.platform

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.community.platform.feature.identity.IdentityRoute
import com.community.platform.feature.identity.IdentityViewModel
import com.community.platform.feature.planning.TaskRoute
import com.community.platform.feature.planning.TaskViewModel
import com.community.platform.feature.planning.CalendarRoute
import com.community.platform.feature.planning.CalendarViewModel
import com.community.platform.feature.scheduling.ReminderRoute
import com.community.platform.feature.scheduling.ReminderViewModel
import com.community.platform.feature.spaces.SpaceRoute
import com.community.platform.feature.spaces.SpaceViewModel
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    private val viewModel: IdentityViewModel by viewModels()
    private val tasks: TaskViewModel by viewModels()
    private val reminders: ReminderViewModel by viewModels()
    private val spaces: SpaceViewModel by viewModels()
    private val calendar: CalendarViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { CommunityTheme { AccountWorkspace(viewModel, tasks, reminders, spaces, calendar) } }
    }
}

@Composable
private fun AccountWorkspace(identity: IdentityViewModel, tasks: TaskViewModel, reminders: ReminderViewModel, spaces: SpaceViewModel, calendar: CalendarViewModel) {
    val account by identity.state.collectAsStateWithLifecycle()
    var screen by rememberSaveable { mutableStateOf("account") }
    var reminderTaskId by rememberSaveable { mutableStateOf<String?>(null) }
    var reminderSpaceId by rememberSaveable { mutableStateOf<String?>(null) }
    var taskEntrySpaceId by rememberSaveable { mutableStateOf<String?>(null) }
    var taskReturnScreen by rememberSaveable { mutableStateOf("account") }
    var reminderReturnScreen by rememberSaveable { mutableStateOf("account") }
    val accountId = account.profile?.user?.id
    LaunchedEffect(accountId, screen, reminderTaskId, reminderSpaceId, taskEntrySpaceId) {
        tasks.bind(if (screen == "tasks" || screen == "reminders" && reminderTaskId != null) accountId else null, taskEntrySpaceId)
        reminders.bind(if (screen == "reminders") accountId else null, if (screen == "reminders") reminderTaskId else null, if (screen == "reminders") reminderSpaceId else null, account.profile?.user?.timezone ?: "UTC")
        spaces.bind(if (screen == "spaces") accountId else null)
        calendar.bind(if (screen == "calendar") accountId else null, account.profile?.user?.timezone ?: "UTC")
    }
    if (screen == "spaces" && accountId != null) {
        SpaceRoute(spaces, accountId, account.profile?.user?.timezone ?: "UTC", onBack = { screen = "account" }, onOpenTasks = { selected -> taskEntrySpaceId = selected.id; taskReturnScreen = "spaces"; screen = "tasks" }, onSessionLost = { screen = "account"; identity.refresh() })
    } else if (screen == "calendar" && accountId != null) {
        CalendarRoute(calendar, accountId, onBack = { screen = "account" }, onSessionLost = { screen = "account"; identity.refresh() }, onOpenSource = { entry ->
            if (entry.kind == "task") { taskEntrySpaceId = entry.spaceId; taskReturnScreen = "calendar"; screen = "tasks" }
            else { reminderTaskId = entry.taskId; reminderSpaceId = entry.spaceId; reminderReturnScreen = "calendar"; screen = "reminders" }
        })
    } else if (screen == "reminders" && accountId != null) {
        ReminderRoute(reminders, accountId, onBack = { screen = reminderReturnScreen }, onSessionLost = { screen = "account"; identity.refresh() })
    } else if (screen == "tasks" && accountId != null) {
        TaskRoute(tasks, accountId, onBack = { screen = taskReturnScreen }, onSessionLost = { screen = "account"; identity.refresh() }, onRemind = { record -> reminderTaskId = record.task.id; reminderSpaceId = record.task.spaceId; reminderReturnScreen = "tasks"; screen = "reminders" })
    } else {
        IdentityRoute(identity, onOpenTasks = { taskEntrySpaceId = null; taskReturnScreen = "account"; screen = "tasks" }, onOpenInbox = { reminderTaskId = null; reminderSpaceId = null; reminderReturnScreen = "account"; screen = "reminders" }, onOpenSpaces = { screen = "spaces" }, onOpenCalendar = { screen = "calendar" })
    }
}
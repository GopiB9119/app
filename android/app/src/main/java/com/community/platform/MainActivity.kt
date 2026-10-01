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
import com.community.platform.feature.agents.AgentRoute
import com.community.platform.feature.agents.AgentViewModel
import com.community.platform.feature.care.CareRoute
import com.community.platform.feature.care.CareViewModel
import com.community.platform.feature.community.CommunityRoute
import com.community.platform.feature.community.CommunityViewModel
import com.community.platform.feature.discovery.SearchRoute
import com.community.platform.feature.discovery.SearchViewModel
import com.community.platform.feature.events.EventsRoute
import com.community.platform.feature.events.EventsViewModel
import com.community.platform.feature.files.DocumentLineRange
import com.community.platform.feature.files.DocumentRoute
import com.community.platform.feature.files.DocumentViewModel
import com.community.platform.feature.identity.IdentityRoute
import com.community.platform.feature.identity.IdentityViewModel
import com.community.platform.feature.messaging.MessagingRoute
import com.community.platform.feature.messaging.MessagingViewModel
import com.community.platform.feature.planning.TaskRoute
import com.community.platform.feature.planning.TaskViewModel
import com.community.platform.feature.planning.CalendarRoute
import com.community.platform.feature.planning.CalendarViewModel
import com.community.platform.feature.planning.ChecklistRoute
import com.community.platform.feature.planning.ChecklistViewModel
import com.community.platform.feature.scheduling.ReminderRoute
import com.community.platform.feature.scheduling.ReminderViewModel
import com.community.platform.feature.spaces.SpaceRoute
import com.community.platform.feature.spaces.SpaceViewModel
import com.community.platform.feature.spaces.SpaceSettingsRoute
import com.community.platform.feature.spaces.SpaceSettingsViewModel
import com.community.platform.feature.spaces.GroupRoute
import com.community.platform.feature.spaces.GroupViewModel
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    private val viewModel: IdentityViewModel by viewModels()
    private val tasks: TaskViewModel by viewModels()
    private val reminders: ReminderViewModel by viewModels()
    private val spaces: SpaceViewModel by viewModels()
    private val calendar: CalendarViewModel by viewModels()
    private val spaceSettings: SpaceSettingsViewModel by viewModels()
    private val groups: GroupViewModel by viewModels()
    private val checklist: ChecklistViewModel by viewModels()
    private val messaging: MessagingViewModel by viewModels()
    private val community: CommunityViewModel by viewModels()
    private val events: EventsViewModel by viewModels()
    private val care: CareViewModel by viewModels()
    private val documents: DocumentViewModel by viewModels()
    private val search: SearchViewModel by viewModels()
    private val agent: AgentViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { CommunityTheme { AccountWorkspace(viewModel, tasks, reminders, spaces, calendar, spaceSettings, checklist, messaging, community, events, care, groups, documents, search, agent) } }
    }
}

@Composable
private fun AccountWorkspace(identity: IdentityViewModel, tasks: TaskViewModel, reminders: ReminderViewModel, spaces: SpaceViewModel, calendar: CalendarViewModel, spaceSettings: SpaceSettingsViewModel, checklist: ChecklistViewModel, messaging: MessagingViewModel, community: CommunityViewModel, events: EventsViewModel, care: CareViewModel, groups: GroupViewModel, documents: DocumentViewModel, search: SearchViewModel, agent: AgentViewModel) {
    val account by identity.state.collectAsStateWithLifecycle()
    var screen by rememberSaveable { mutableStateOf("account") }
    var reminderTaskId by rememberSaveable { mutableStateOf<String?>(null) }
    var reminderSpaceId by rememberSaveable { mutableStateOf<String?>(null) }
    var taskEntrySpaceId by rememberSaveable { mutableStateOf<String?>(null) }
    var taskReturnScreen by rememberSaveable { mutableStateOf("account") }
    var reminderReturnScreen by rememberSaveable { mutableStateOf("account") }
    var settingsSpaceId by rememberSaveable { mutableStateOf<String?>(null) }
    var checklistTaskId by rememberSaveable { mutableStateOf<String?>(null) }
    var checklistSpaceId by rememberSaveable { mutableStateOf<String?>(null) }
    var messagesSpaceId by rememberSaveable { mutableStateOf<String?>(null) }
    var messagesReturnScreen by rememberSaveable { mutableStateOf("account") }
    var eventsSpaceId by rememberSaveable { mutableStateOf<String?>(null) }
    var eventsSpaceName by rememberSaveable { mutableStateOf("") }
    var eventsReturnScreen by rememberSaveable { mutableStateOf("spaces") }
    var groupSpaceId by rememberSaveable { mutableStateOf<String?>(null) }
    var documentSearchAccountId by rememberSaveable { mutableStateOf<String?>(null) }
    var documentsSpaceId by rememberSaveable { mutableStateOf<String?>(null) }
    var documentsSpaceName by rememberSaveable { mutableStateOf("") }
    var documentEntryId by rememberSaveable { mutableStateOf<String?>(null) }
    var documentFirstLine by rememberSaveable { mutableStateOf<Int?>(null) }
    var documentLastLine by rememberSaveable { mutableStateOf<Int?>(null) }
    var documentsReturnScreen by rememberSaveable { mutableStateOf("spaces") }
    val accountId = account.profile?.user?.id
    LaunchedEffect(accountId, screen, reminderTaskId, reminderSpaceId, taskEntrySpaceId, settingsSpaceId, checklistTaskId, checklistSpaceId, messagesSpaceId, eventsSpaceId, groupSpaceId,
        documentSearchAccountId, documentsSpaceId, documentsSpaceName, documentEntryId, documentFirstLine, documentLastLine, documentsReturnScreen) {
        val searchContext = screen == "search" || screen == "documents" && documentsReturnScreen == "search" ||
            screen in setOf("tasks", "checklist", "reminders") && taskReturnScreen == "search" || screen == "events" && eventsReturnScreen == "search"
        if (documentSearchAccountId != accountId && (screen == "documents" || searchContext)) {
            screen = "account"; documentSearchAccountId = null; documentsSpaceId = null; documentsSpaceName = ""
            documentEntryId = null; documentFirstLine = null; documentLastLine = null
        }
        val documentContext = screen == "documents" && documentSearchAccountId == accountId
        documents.bind(if (documentContext) accountId else null, if (documentContext) documentsSpaceId else null,
            if (documentContext) documentsSpaceName else "", if (documentContext) documentEntryId else null,
            if (documentContext && documentFirstLine != null && documentLastLine != null) DocumentLineRange(documentFirstLine!!, documentLastLine!!) else null)
        search.bind(if (searchContext && documentSearchAccountId == accountId) accountId else null)
        tasks.bind(if (screen == "tasks" || screen == "checklist" || screen == "reminders" && reminderTaskId != null) accountId else null, taskEntrySpaceId)
        checklist.bind(if (screen == "checklist") accountId else null, checklistTaskId, checklistSpaceId)
        reminders.bind(if (screen == "reminders") accountId else null, if (screen == "reminders") reminderTaskId else null, if (screen == "reminders") reminderSpaceId else null, account.profile?.user?.timezone ?: "UTC")
        spaces.bind(if (screen == "spaces" || screen == "space-settings" || screen == "documents" && documentsReturnScreen == "spaces") accountId else null)
        spaceSettings.bind(if (screen == "space-settings") accountId else null, settingsSpaceId)
        groups.bind(if (screen == "groups" || screen == "group-access") accountId else null, if (screen == "group-access") groupSpaceId else null)
        calendar.bind(if (screen == "calendar") accountId else null, account.profile?.user?.timezone ?: "UTC")
        messaging.bind(if (screen == "messages") accountId else null, messagesSpaceId)
        community.bind(if (screen == "community") accountId else null)
        events.bind(if (screen == "events") accountId else null, eventsSpaceId, account.profile?.user?.timezone ?: "UTC")
        care.bind(if (screen == "care") accountId else null, account.profile?.user?.timezone ?: "UTC")
        agent.bind(if (screen == "agent") accountId else null)
    }
    if (screen == "search" && accountId != null && documentSearchAccountId == accountId) {
        SearchRoute(search, accountId, onBack = { screen = "account" }, onSessionLost = { screen = "account"; identity.refresh() }, onOpenDocument = { hit ->
            documentsSpaceId = hit.spaceId; documentsSpaceName = hit.spaceName; documentEntryId = hit.documentId
            documentFirstLine = hit.startLine; documentLastLine = hit.endLine; documentsReturnScreen = "search"; screen = "documents"
        }, onOpenTasks = { hit -> taskEntrySpaceId = hit.spaceId; taskReturnScreen = "search"; screen = "tasks" },
            onOpenEvents = { hit -> eventsSpaceId = hit.spaceId; eventsSpaceName = hit.spaceName; eventsReturnScreen = "search"; screen = "events" })
    } else if (screen == "documents" && accountId != null && documentSearchAccountId == accountId && documentsSpaceId != null) {
        DocumentRoute(documents, accountId, documentsSpaceId!!, onBack = { screen = documentsReturnScreen },
            onSessionLost = { screen = "account"; identity.refresh() },
            onCloseViewer = { if (documentsReturnScreen == "search") screen = "search" else documents.closeViewer() })
    } else if (screen == "care" && accountId != null) {
        CareRoute(care, accountId, onBack = { screen = "account" }, onSessionLost = { screen = "account"; identity.refresh() })
    } else if (screen == "agent" && accountId != null) {
        AgentRoute(agent, accountId, account.profile?.user?.timezone ?: "UTC", onBack = { screen = "account" }, onSessionLost = { screen = "account"; identity.refresh() })
    } else if (screen == "events" && accountId != null && eventsSpaceId != null) {
        EventsRoute(events, accountId, eventsSpaceName, onBack = { screen = eventsReturnScreen }, onSessionLost = { screen = "account"; identity.refresh() })
    } else if (screen == "community" && accountId != null) {
        CommunityRoute(community, accountId, account.profile?.user?.timezone ?: "UTC", onBack = { screen = "account" }, onSessionLost = { screen = "account"; identity.refresh() })
    } else if (screen == "messages" && accountId != null) {
        MessagingRoute(messaging, accountId, account.profile?.user?.timezone ?: "UTC", onBack = { screen = messagesReturnScreen }, onSessionLost = { screen = "account"; identity.refresh() })
    } else if (screen == "spaces" && accountId != null) {
        SpaceRoute(spaces, accountId, account.profile?.user?.timezone ?: "UTC", onBack = { screen = "account" }, onOpenTasks = { selected -> taskEntrySpaceId = selected.id; taskReturnScreen = "spaces"; screen = "tasks" }, onSessionLost = { screen = "account"; identity.refresh() }, onOpenSettings = { selected -> settingsSpaceId = selected.id; screen = "space-settings" }, onOpenChat = { selected -> messagesSpaceId = selected.id; messagesReturnScreen = "spaces"; screen = "messages" }, onOpenEvents = { selected -> eventsSpaceId = selected.id; eventsSpaceName = selected.name; eventsReturnScreen = "spaces"; screen = "events" },
            onFindGroups = { screen = "groups" }, onOpenGroupAccess = { selected -> groupSpaceId = selected.id; screen = "group-access" }, onOpenDocuments = { selected ->
                documentSearchAccountId = accountId; documentsSpaceId = selected.id; documentsSpaceName = selected.name
                documentEntryId = null; documentFirstLine = null; documentLastLine = null; documentsReturnScreen = "spaces"; screen = "documents"
            })
    } else if ((screen == "groups" || screen == "group-access" && groupSpaceId != null) && accountId != null) {
        GroupRoute(groups, accountId, onBack = { screen = "spaces"; spaces.refresh() }, onSessionLost = { screen = "account"; identity.refresh() })
    } else if (screen == "space-settings" && accountId != null && settingsSpaceId != null) {
        SpaceSettingsRoute(spaceSettings, accountId, settingsSpaceId!!, onBack = { screen = "spaces"; spaces.refresh() }, onSessionLost = { screen = "account"; identity.refresh() })
    } else if (screen == "calendar" && accountId != null) {
        CalendarRoute(calendar, accountId, onBack = { screen = "account" }, onSessionLost = { screen = "account"; identity.refresh() }, onOpenSource = { entry ->
            if (entry.kind == "task") { taskEntrySpaceId = entry.spaceId; taskReturnScreen = "calendar"; screen = "tasks" }
            else if (entry.kind == "event") { eventsSpaceId = entry.spaceId; eventsSpaceName = calendar.state.value.selectedSpace?.name.orEmpty(); eventsReturnScreen = "calendar"; screen = "events" }
            else { reminderTaskId = entry.taskId; reminderSpaceId = entry.spaceId; reminderReturnScreen = "calendar"; screen = "reminders" }
        })
    } else if (screen == "reminders" && accountId != null) {
        ReminderRoute(reminders, accountId, onBack = { screen = reminderReturnScreen }, onSessionLost = { screen = "account"; identity.refresh() })
    } else if (screen == "checklist" && accountId != null && checklistTaskId != null) {
        ChecklistRoute(checklist, accountId, checklistTaskId!!, onBack = { tasks.refresh(); screen = "tasks" }, onSessionLost = { screen = "account"; identity.refresh() })
    } else if (screen == "tasks" && accountId != null) {
        TaskRoute(tasks, accountId, onBack = { screen = taskReturnScreen }, onSessionLost = { screen = "account"; identity.refresh() }, onRemind = { record -> reminderTaskId = record.task.id; reminderSpaceId = record.task.spaceId; reminderReturnScreen = "tasks"; screen = "reminders" }, onChecklist = { record -> checklistTaskId = record.task.id; checklistSpaceId = record.task.spaceId; screen = "checklist" })
    } else {
        IdentityRoute(identity, onOpenTasks = { taskEntrySpaceId = null; taskReturnScreen = "account"; screen = "tasks" }, onOpenInbox = { reminderTaskId = null; reminderSpaceId = null; reminderReturnScreen = "account"; screen = "reminders" }, onOpenSpaces = { screen = "spaces" }, onOpenCalendar = { screen = "calendar" }, onOpenMessages = { messagesSpaceId = null; messagesReturnScreen = "account"; screen = "messages" }, onOpenCommunity = { screen = "community" }, onOpenCare = { screen = "care" },
            onOpenSearch = { documentSearchAccountId = accountId; screen = "search" }, onOpenAgent = { screen = "agent" })
    }
}
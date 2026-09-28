# Chapter 8 — Android Application Architecture: Kotlin, Jetpack Compose, Navigation, Offline-First Data, Realtime Chat, Community Screens, Agent Screens, and State Management

## 8.1 Purpose

This chapter defines the Android application architecture using:

* Kotlin

* Jetpack Compose

* ViewModel

* Coroutines

* StateFlow

* Room

* WorkManager

* Retrofit or Ktor Client

* OkHttp

* Kotlin Serialization

* DataStore

* WebSockets

* Android notification APIs

The Android app must support:

* Public community discovery

* Public pages and posts

* Private spaces

* Family and couple groups

* Solo spaces

* Custom groups

* Real-time chat

* Agent conversations

* Tasks and reminders

* Events and schedules

* File uploads

* Offline usage

* Push notifications

* Consent and approval screens

* Secure local storage

# 8.2 Android Architecture Decision

Use a layered architecture:

```
Jetpack Compose UI
        ↓
Screen State
        ↓
ViewModel
        ↓
Use Case
        ↓
Repository
        ↓
Local Database / Remote API
        ↓
Backend Services
```

The UI must not directly call:

* Retrofit

* Room

* WebSocket

* Firebase or push providers

* Agent services

* External messaging providers

The UI communicates with the ViewModel. The ViewModel communicates with use cases and repositories.

# 8.3 Recommended Android Project Structure

```
android/
└── app/
    └── src/
        └── main/
            ├── AndroidManifest.xml
            └── java/com/example/platform/
                ├── MainActivity.kt
                │
                ├── app/
                │   ├── App.kt
                │   ├── AppContainer.kt
                │   └── AppStartup.kt
                │
                ├── core/
                │   ├── common/
                │   ├── designsystem/
                │   ├── navigation/
                │   ├── networking/
                │   ├── database/
                │   ├── security/
                │   ├── notifications/
                │   ├── analytics/
                │   └── permissions/
                │
                ├── data/
                │   ├── local/
                │   │   ├── dao/
                │   │   ├── entities/
                │   │   └── AppDatabase.kt
                │   ├── remote/
                │   │   ├── api/
                │   │   ├── dto/
                │   │   └── websocket/
                │   └── repository/
                │
                ├── domain/
                │   ├── model/
                │   ├── repository/
                │   └── usecase/
                │
                ├── feature/
                │   ├── auth/
                │   ├── home/
                │   ├── discovery/
                │   ├── pages/
                │   ├── spaces/
                │   ├── messaging/
                │   ├── agent/
                │   ├── tasks/
                │   ├── events/
                │   ├── reminders/
                │   ├── files/
                │   ├── notifications/
                │   ├── settings/
                │   └── approvals/
                │
                └── worker/
                    ├── MessageSyncWorker.kt
                    ├── FileUploadWorker.kt
                    ├── ReminderSyncWorker.kt
                    └── DataCleanupWorker.kt
```

For a larger team, split the application into Gradle modules:

```
:app
:core:common
:core:designsystem
:core:network
:core:database
:core:security
:feature:auth
:feature:community
:feature:spaces
:feature:messaging
:feature:agent
:feature:planning
```

# 8.4 Dependency Direction

The dependency direction should be:

```
UI
 ↓
Domain
 ↓
Data
 ↓
Infrastructure
```

Recommended dependency rules:

* UI may depend on domain.

* ViewModels may depend on use cases.

* Use cases may depend on repository interfaces.

* Data repositories implement domain interfaces.

* Domain must not depend on Android UI classes.

* Network DTOs must not leak into Compose UI.

* Database entities must be mapped into domain models.

This prevents the application from becoming tightly coupled to Retrofit or Room.

# 8.5 Application Startup

The startup sequence should be lightweight.

```
Application starts
    ↓
Load local settings
    ↓
Initialize logging
    ↓
Initialize dependency container
    ↓
Restore session
    ↓
Open local database
    ↓
Start safe background synchronization
    ↓
Render initial screen
```

Do not block the main thread while:

* Migrating large data

* Loading all messages

* Processing files

* Refreshing every API resource

* Starting the agent runtime

Heavy operations belong in background coroutines or WorkManager.

# 8.6 Navigation Architecture

Use a single navigation host with nested navigation graphs.

Main navigation areas:

```
Auth
 ├── Welcome
 ├── Login
 ├── Register
 └── Verification

Main
 ├── Home
 ├── Discover
 ├── Spaces
 ├── Messages
 └── Profile

Space
 ├── Overview
 ├── Members
 ├── Posts
 ├── Chat
 ├── Tasks
 ├── Events
 ├── Reminders
 ├── Files
 ├── Agent
 └── Settings

Agent
 ├── Agent Home
 ├── Conversation
 ├── Run Details
 ├── Approvals
 └── Memory

Settings
 ├── Account
 ├── Privacy
 ├── Security
 ├── Notifications
 ├── Connected Services
 └── Data Export/Delete
```

Example route definitions:

Kotlin

```
sealed interface AppRoute {
    data object Home : AppRoute
    data object Discover : AppRoute
    data object Spaces : AppRoute
    data object Messages : AppRoute
    data object Profile : AppRoute

    data class Space(val spaceId: String) : AppRoute
    data class Conversation(val conversationId: String) : AppRoute
    data class Agent(val agentId: String) : AppRoute
}
```

Avoid placing large serialized objects inside navigation arguments. Pass stable IDs and load the data from repositories.

# 8.7 Navigation Security

Navigation arguments are not authorization.

For example:

```
spaces/space-123
```

The client may navigate to this route, but the backend must still verify membership.

The screen should handle:

```
Loading
Accessible
Not found
Access denied
Deleted
Suspended
Network unavailable
```

Do not assume that hiding a screen in the Android app protects the resource.

# 8.8 UI State Model

Each screen should expose an explicit state.

Kotlin

```
sealed interface SpaceUiState {
    data object Loading : SpaceUiState

    data class Success(
        val space: Space,
        val members: List<Member>,
    ) : SpaceUiState

    data class Error(
        val message: String,
        val retryable: Boolean,
    ) : SpaceUiState
}
```

For complex screens:

Kotlin

```
data class ConversationUiState(
    val conversation: Conversation? = null,
    val messages: List<Message> = emptyList(),
    val draft: String = "",
    val isLoading: Boolean = false,
    val isSending: Boolean = false,
    val error: UiError? = null,
    val hasMoreMessages: Boolean = true,
    val isOffline: Boolean = false,
)
```

Avoid using many independent booleans such as:

Kotlin

```
isLoading = true
isError = true
isSuccess = true
```

These can create contradictory states.

# 8.9 ViewModel Responsibilities

A ViewModel should:

* Hold screen state

* Receive UI events

* Call use cases

* Observe repository flows

* Handle loading and errors

* Trigger safe navigation events

* Avoid direct database queries

* Avoid direct network calls

* Avoid holding long-lived external resources unnecessarily

Example:

Kotlin

```
class SpaceViewModel(
    private val observeSpace: ObserveSpaceUseCase,
    private val observeMembers: ObserveMembersUseCase,
    private val refreshSpace: RefreshSpaceUseCase,
) : ViewModel() {

    fun load(spaceId: String) {
        viewModelScope.launch {
            refreshSpace(spaceId)
        }
    }

    fun observe(spaceId: String): StateFlow<SpaceUiState> {
        return combine(
            observeSpace(spaceId),
            observeMembers(spaceId),
        ) { space, members ->
            SpaceUiState.Success(space, members)
        }.stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5_000),
            SpaceUiState.Loading,
        )
    }
}
```

The actual implementation should avoid creating new flows repeatedly from Composables.

# 8.10 Compose Screen Pattern

A screen should be divided into:

1. Route-level composable

2. State collection

3. Event handling

4. Stateless UI content

Example:

Kotlin

```
@Composable
fun SpaceRoute(
    viewModel: SpaceViewModel,
    spaceId: String,
    onOpenMembers: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    SpaceScreen(
        state = state,
        onRetry = { viewModel.retry(spaceId) },
        onOpenMembers = onOpenMembers,
    )
}
```

Stateless UI:

Kotlin

```
@Composable
fun SpaceScreen(
    state: SpaceUiState,
    onRetry: () -> Unit,
    onOpenMembers: () -> Unit,
) {
    when (state) {
        SpaceUiState.Loading -> LoadingContent()
        is SpaceUiState.Success -> SpaceContent(
            space = state.space,
            members = state.members,
            onOpenMembers = onOpenMembers,
        )
        is SpaceUiState.Error -> ErrorContent(
            message = state.message,
            onRetry = onRetry,
        )
    }
}
```

This structure makes UI testing easier.

# 8.11 Design System

Create a shared design system rather than styling every screen independently.

```
PlatformTheme
    ├── Colors
    ├── Typography
    ├── Shapes
    ├── Spacing
    ├── Elevation
    ├── Buttons
    ├── Cards
    ├── Input fields
    ├── Empty states
    ├── Error states
    ├── Loading states
    └── Accessibility defaults
```

Common components:

```
PrimaryButton
SecondaryButton
AppTopBar
BottomNavigationBar
SpaceCard
PageCard
PostCard
MessageBubble
AgentMessageCard
TaskRow
EventCard
ReminderCard
ApprovalCard
FileCard
MemberAvatar
PermissionBadge
```

Avoid copying the same UI code across family, couple, solo, and custom spaces. Use reusable components with configuration.

# 8.12 Main Home Screen

The home screen should be composed of independent sections:

```
Home
 ├── Greeting / profile summary
 ├── Pending approvals
 ├── Upcoming reminders
 ├── Today’s tasks
 ├── Upcoming events
 ├── Recent conversations
 ├── Agent updates
 └── Community recommendations
```

Each section should be independently loadable.

Do not make the entire home screen fail because one section is unavailable.

Example:

```
Tasks failed       → show task error
Events loaded      → show events
Messages loaded    → show messages
Agent unavailable  → show retry state
```

# 8.13 Discovery Screen

The discovery screen should support:

* Public pages

* Public posts

* Events

* Festivals

* Interests

* Search

* Filters

* Trending or recommended content

* Report and block actions

Discovery data should be paginated.

Recommended UI states:

```
Initial loading
Content loaded
Empty results
Loading next page
Offline cached results
Search error
Content unavailable
```

Use lazy lists:

Kotlin

```
LazyColumn {
    items(
        items = posts,
        key = { it.id },
    ) { post ->
        PostCard(post)
    }
}
```

Stable keys are important for:

* Scroll preservation

* Efficient recomposition

* Correct animations

* Avoiding incorrect item reuse

# 8.14 Space Overview Screen

A space overview may contain:

```
Space header
    ├── Name
    ├── Type
    ├── Visibility
    ├── Member count
    └── Settings action

Quick actions
    ├── Chat
    ├── Add task
    ├── Create event
    ├── Add reminder
    ├── Upload file
    └── Ask agent

Content tabs
    ├── Posts
    ├── Tasks
    ├── Events
    ├── Files
    └── Members
```

The UI should hide actions that the user cannot perform, but the backend must enforce permissions independently.

# 8.15 Family and Custom Space Screens

All private spaces should share the same foundation.

Configuration can control:

JSON

```
{
  "space_type": "family",
  "show_health_reminders": true,
  "show_budget_tools": true,
  "show_event_planning": true,
  "allow_member_posts": true,
  "require_admin_approval": true
}
```

The app should not create separate, duplicated architectures for:

* Family

* Couple

* Solo

* Custom

* Event

Instead:

```
Shared Space Framework
    +
Space Type Configuration
    +
Permission Policy
    +
Feature Flags
```

# 8.16 Chat Screen Architecture

The chat screen must support:

* Message history

* Pagination

* Real-time messages

* Pending messages

* Failed messages

* Retry

* Reply

* Edit

* Delete

* Attachments

* Read receipts

* Typing indicators

* Offline state

* E2E encryption status

* Agent messages

Suggested structure:

```
ConversationScreen
 ├── TopBar
 ├── EncryptionBanner
 ├── MessageList
 ├── TypingIndicator
 ├── AttachmentPreview
 ├── MessageComposer
 └── ConnectionStatus
```

Message list should be backed by Room rather than only an in-memory list.

# 8.17 Local Message Database

Example Room entity:

Kotlin

```
@Entity(
    tableName = "messages",
    indices = [
        Index(value = ["conversationId", "createdAt"]),
        Index(value = ["clientMessageId"], unique = true),
    ],
)
data class MessageEntity(
    @PrimaryKey
    val id: String,
    val conversationId: String,
    val senderId: String?,
    val body: String?,
    val ciphertext: ByteArray?,
    val status: String,
    val clientMessageId: String?,
    val createdAt: Instant,
    val updatedAt: Instant,
)
```

DAO:

Kotlin

```
@Dao
interface MessageDao {

    @Query("""
        SELECT * FROM messages
        WHERE conversationId = :conversationId
        ORDER BY createdAt DESC
        LIMIT :limit
    """)
    fun observeMessages(
        conversationId: String,
        limit: Int,
    ): Flow<List<MessageEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(message: MessageEntity)

    @Query("""
        UPDATE messages
        SET status = :status
        WHERE clientMessageId = :clientMessageId
    """)
    suspend fun updateStatus(
        clientMessageId: String,
        status: String,
    )
}
```

For production, use pagination support and a stable server sequence.

# 8.18 Sending a Message Offline

```
User taps Send
    ↓
Create client_message_id
    ↓
Insert local pending message
    ↓
Render immediately
    ↓
Attempt network send
    ↓
If success:
    Reconcile canonical message ID
    Update status
    ↓
If failure:
    Keep message locally
    Mark retryable
    Schedule retry
```

The local message should not disappear when the network fails.

Example statuses:

```
pending
sending
accepted
failed
retrying
delivered
read
```

# 8.19 WebSocket Manager

Create one managed WebSocket service rather than opening separate uncontrolled connections for every screen.

```
Application WebSocket Manager
    ├── Authentication
    ├── Connection lifecycle
    ├── Reconnect
    ├── Event parsing
    ├── Subscription management
    ├── Sequence tracking
    └── Event dispatch
```

The manager should expose flows:

Kotlin

```
interface RealtimeClient {
    val connectionState: StateFlow<ConnectionState>
    val events: Flow<RealtimeEvent>

    suspend fun connect()
    suspend fun disconnect()
    suspend fun subscribe(scope: RealtimeScope)
    suspend fun unsubscribe(scope: RealtimeScope)
    suspend fun send(command: RealtimeCommand)
}
```

Do not let each Composable directly manage socket connections.

# 8.20 Realtime Event Handling

The event pipeline should be:

```
WebSocket receives event
    ↓
Validate event envelope
    ↓
Check event version
    ↓
Deduplicate event ID
    ↓
Update local database
    ↓
Room Flow updates UI
```

The UI should generally observe Room rather than directly mutating screen state from socket callbacks.

This creates one consistent data flow:

```
REST response
WebSocket event
Background sync
        ↓
Repository
        ↓
Room
        ↓
ViewModel
        ↓
Compose UI
```

# 8.21 Offline-First Repository

The repository should coordinate local and remote data.

Kotlin

```
class ConversationRepositoryImpl(
    private val dao: MessageDao,
    private val api: MessageApi,
    private val realtime: RealtimeClient,
) : ConversationRepository {

    override fun observeMessages(
        conversationId: String,
    ): Flow<List<Message>> {
        return dao.observeMessages(
            conversationId = conversationId,
            limit = 50,
        ).map { entities ->
            entities.map { it.toDomain() }
        }
    }

    override suspend fun sendMessage(
        conversationId: String,
        body: String,
    ) {
        val localMessage = createPendingMessage(
            conversationId = conversationId,
            body = body,
        )

        dao.insert(localMessage)

        try {
            api.sendMessage(localMessage.toRequest())
        } catch (error: IOException) {
            dao.updateStatus(
                clientMessageId = localMessage.clientMessageId,
                status = "failed",
            )
        }
    }
}
```

For reliable retry, use an outbox table and WorkManager rather than relying only on the active screen.

# 8.22 Android WorkManager

Use WorkManager for work that must survive:

* App closure

* Process death

* Device restart

* Temporary network loss

Good uses:

* Pending message retry

* File upload retry

* Document synchronization

* Reminder synchronization

* Account export

* Cleanup

* Token-independent background refresh where permitted

Example:

Kotlin

```
class MessageRetryWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        return try {
            messageSyncService.retryPendingMessages()
            Result.success()
        } catch (error: IOException) {
            Result.retry()
        } catch (error: Exception) {
            Result.failure()
        }
    }
}
```

Do not use WorkManager for exact-to-the-second medical or notification timing. Server-side scheduling and platform notification constraints must be considered.

# 8.23 Agent Screen Architecture

The agent experience should have separate surfaces.

## Agent home

```
Agent status
Pending approvals
Active tasks
Recent runs
Memory summary
Available capabilities
```

## Agent conversation

```
User messages
Agent responses
Tool progress
Approval requests
Citations
Errors
Cancel action
```

## Agent run details

```
Goal
Status
Current graph node
Steps
Tool calls
Approvals
Duration
Failure reason
Retry
```

The user should not be forced to inspect internal graph details during normal use. Provide advanced details only when useful.

# 8.24 Agent UI State

Kotlin

```
data class AgentRunUiState(
    val runId: String? = null,
    val status: AgentRunStatus = AgentRunStatus.Idle,
    val messages: List<AgentMessage> = emptyList(),
    val pendingApproval: Approval? = null,
    val currentStep: String? = null,
    val error: UiError? = null,
)
```

Possible statuses:

```
Idle
Queued
Running
WaitingForApproval
WaitingForTool
Completed
Failed
Cancelled
TimedOut
```

The agent UI must show when it is:

* Still working

* Waiting for user approval

* Waiting for an external provider

* Unable to complete

* Completed successfully

Do not display “Done” while the action is only queued.

# 8.25 Agent Approval Screen

An approval card should clearly display:

```
Requested action
Who requested it
Which space it affects
Target recipient
Exact content or action payload
Risk level
Expiration time
Approve button
Reject button
```

Example:

```
The agent wants to send this message to a group member:

"Please remember the family meeting at 8 PM."

Target:
Family Space → Member

[Reject] [Approve]
```

For sensitive actions, show more detail and require an explicit confirmation step.

Avoid ambiguous buttons such as:

```
Continue
Okay
Proceed
```

Use action-specific labels:

```
Approve message
Reject request
Approve file sharing
Cancel action
```

# 8.26 Memory Management Screen

Users should be able to:

* View saved memories

* See the source

* See whether memory is personal or shared

* Edit memory

* Delete memory

* Revoke consent

* Set expiration

* View sensitive-memory warnings

Example memory card:

```
Memory:
Prefers reminders at 8 PM

Scope:
Personal

Source:
User preference

Actions:
Edit
Delete
```

Shared-space memory should clearly identify:

```
This memory is available to authorized members of the selected space.
```

# 8.27 File Upload UI

File upload must show states:

```
Selecting
Preparing
Uploading
Scanning
Processing
Extracting
Indexing
Ready
Rejected
Failed
```

For documents:

```
Upload PDF
    ↓
Scan
    ↓
Extract pages
    ↓
Create searchable chunks
    ↓
Index
```

The user should not be told that a document is searchable before indexing is complete.

# 8.28 Permissions and Consent UI

Consent screens must be specific.

Bad:

```
Allow agent access to everything
```

Better:

```
Allow the agent to:
- Create reminders in this space
- Send in-app notifications
- Send WhatsApp messages after approval
- Read selected uploaded documents
```

Each permission should have:

* Explanation

* Scope

* Duration, where relevant

* Revocation action

* Current status

Sensitive permissions should not be bundled with unrelated permissions.

# 8.29 Notification Architecture

The Android app may receive:

* Push notifications

* In-app notifications

* Local notifications

* Realtime events

* Notification inbox updates

Notification routing:

```
Backend notification event
    ↓
Notification service
    ↓
Push provider
    ↓
Android notification channel
    ↓
User taps notification
    ↓
Deep link
    ↓
Permission re-check
    ↓
Destination screen
```

A notification deep link must not bypass authorization.

For example, tapping a private family notification should still verify that the user remains a member of that family space.

# 8.30 Android Security

Use:

* Android Keystore

* Encrypted local storage for secrets

* Secure token storage

* Certificate validation

* Screenshot protection where necessary

* Biometric re-authentication for sensitive actions

* App-level lock where appropriate

* No sensitive data in logs

* No private content in notification previews by default

* Secure backup configuration

Do not store:

* Plaintext passwords

* Private encryption keys in SharedPreferences

* Long-lived access tokens in ordinary preferences

* Provider secrets inside the APK

* Full sensitive agent traces in local logs

# 8.31 Local Database Security

Room is not automatically encrypted.

For sensitive local data, consider:

* SQLCipher-compatible storage

* Encrypted file storage

* Android Keystore-managed keys

* Database key rotation

* Secure deletion strategy

* Locking data when the user logs out

Local caching should be minimized for:

* Health information

* Private E2E message plaintext

* Identity documents

* Financial information

* Sensitive family notes

# 8.32 Compose Performance

Important rules:

* Use stable keys in lazy lists.

* Avoid collecting the same flow repeatedly.

* Avoid expensive work inside Composables.

* Use `remember` for derived UI state where appropriate.

* Use immutable UI models.

* Paginate large lists.

* Avoid rendering thousands of messages at once.

* Load images asynchronously.

* Use placeholders for slow content.

* Keep recomposition scope small.

* Avoid passing unstable mutable collections unnecessarily.

For chat:

```
Load recent messages
    ↓
Render visible window
    ↓
Load older messages on scroll
    ↓
Subscribe to new messages
```

# 8.33 Error Handling

Every screen should distinguish:

## User error

```
Invalid input
Missing required field
Unsupported file
```

## Permission error

```
You no longer have access to this space.
```

## Network error

```
Connection unavailable. Your message will retry.
```

## Server error

```
Something went wrong. Try again.
```

## External provider error

```
The message provider did not accept the request.
```

Do not display raw exceptions such as:

```
java.net.SocketTimeoutException
```

Log technical details internally and show a safe user-facing message.

# 8.34 Accessibility

The Android app must support:

* Screen readers

* Content descriptions

* Dynamic font scaling

* Sufficient contrast

* Touch target sizes

* Keyboard navigation where relevant

* Reduced motion

* Clear focus states

* Non-color-only status indicators

* Localized text

* Right-to-left support if required

Examples:

```
A message status should not be represented only by color.
A failed upload should include text or an icon with a description.
A button should describe its action.
```

# 8.35 Localization

Use resource-based strings.

Kotlin

```
Text(
    text = stringResource(R.string.send_message)
)
```

Do not hardcode user-visible text in ViewModels or repositories.

Support:

* English

* Telugu

* Hindi

* Other languages as the product expands

Dates and times must use the user’s configured timezone and locale.

# 8.36 Analytics and Privacy

Analytics events should be designed around product behavior, not private content.

Safe examples:

```
screen_viewed
space_created
message_send_failed
agent_run_started
approval_accepted
file_upload_completed
```

Avoid sending:

* Message body

* Private file content

* Health information

* Full agent prompts

* Encryption keys

* Sensitive user attributes

Use event IDs and anonymized identifiers where possible.

# 8.37 Testing Android Screens

## Unit tests

Test:

* ViewModel state transitions

* Use cases

* Retry behavior

* Permission display logic

* Message reconciliation

* Agent approval handling

## Compose UI tests

Test:

* Loading state

* Empty state

* Error state

* Offline state

* Message send

* Failed message retry

* Approval actions

* Navigation

* Accessibility labels

## Integration tests

Test:

* Room migrations

* API integration

* WebSocket events

* Offline synchronization

* WorkManager retries

* Token expiration

* File upload recovery

## Device tests

Test on:

* Small screen

* Large screen

* Slow network

* No network

* Backgrounded app

* Process death

* Rotation where supported

* Different Android versions

* Accessibility settings

# 8.38 Android Data Flow Summary

```
User interaction
    ↓
Composable event
    ↓
ViewModel
    ↓
Use Case
    ↓
Repository
    ├── Room
    ├── REST
    ├── WebSocket
    └── WorkManager
            ↓
        Backend
            ↓
        PostgreSQL / Redis / Workers
            ↓
        API response or realtime event
            ↓
        Repository
            ↓
        Room
            ↓
        StateFlow
            ↓
        Compose UI
```

This creates a predictable unidirectional data flow.

# 8.39 Final Android Architecture Decision

## UI

Use Jetpack Compose with reusable design-system components.

## State

Use ViewModel + StateFlow and lifecycle-aware state collection.

## Local persistence

Use Room for cached data, pending operations, messages, sync cursors, and offline state.

## Networking

Use Retrofit or Ktor Client for REST and OkHttp WebSocket or an equivalent managed client for realtime communication.

## Background work

Use WorkManager for durable retries and synchronization.

## Architecture

Use:

```
Composable
    → ViewModel
    → Use Case
    → Repository
    → Local/Remote Data Source
```

## Realtime

Use one application-level WebSocket manager. Persist received events through repositories and Room.

## Offline-first

Render cached data immediately, queue writes locally, retry safely, and reconcile with server state.

## Security

Use Android Keystore, encrypted local storage, secure token handling, and explicit consent for sensitive agent actions.

## Agent integration

The Android app communicates with the backend agent runtime through normal APIs and realtime events. The app does not embed unrestricted agent credentials or provider secrets.

# Chapter 8 Acceptance Criteria

The Android architecture is acceptable when:

* Screens do not directly call network or database code.

* ViewModels expose explicit UI states.

* Navigation passes stable IDs rather than large objects.

* Backend permissions are always re-checked.

* Chat works with temporary network loss.

* Pending messages survive app closure.

* WebSocket reconnection restores subscriptions.

* Missed events can be synchronized.

* Room is the local source for rendered cached data.

* WorkManager handles durable retries.

* Agent approvals display exact action details.

* Sensitive notifications do not expose private content by default.

* Files display processing status.

* Users can inspect and delete memory.

* Accessibility and localization are built into the design system.

* Security-sensitive data is not written to ordinary logs.

* Compose lists use stable keys and pagination.

* UI tests cover loading, success, empty, error, and offline states.

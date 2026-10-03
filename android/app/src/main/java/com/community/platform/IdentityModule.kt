package com.community.platform

import com.community.platform.feature.agents.AgentApi
import com.community.platform.feature.care.CareApi
import com.community.platform.feature.community.ClassificationApi
import com.community.platform.feature.community.CommunityApi
import com.community.platform.feature.community.FeedControlsApi
import com.community.platform.feature.community.ModerationApi
import com.community.platform.feature.community.PageInsightsApi
import com.community.platform.feature.discovery.SearchApi
import com.community.platform.feature.events.EventBudgetsApi
import com.community.platform.feature.events.EventsApi
import com.community.platform.feature.files.DocumentApi
import com.community.platform.feature.identity.IdentityApi
import com.community.platform.feature.identity.KeystoreSessionStore
import com.community.platform.feature.identity.SessionStore
import com.community.platform.feature.messaging.MessagingApi
import com.community.platform.feature.messaging.Outbox
import com.community.platform.feature.messaging.OutboxSessionStore
import com.community.platform.feature.scheduling.AlertSessionStore
import com.community.platform.feature.scheduling.AlertSwitch
import com.community.platform.feature.planning.TaskApi
import com.community.platform.feature.planning.CalendarApi
import com.community.platform.feature.planning.ChecklistApi
import com.community.platform.feature.realtime.LiveClient
import com.community.platform.feature.scheduling.ReminderApi
import com.community.platform.feature.spaces.SpaceApi
import com.community.platform.feature.spaces.SpaceSettingsApi
import com.community.platform.feature.spaces.GroupApi
import com.google.gson.Gson
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.ConnectionPool
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.io.IOException
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object IdentityModule {
    private val COMMUNITY_POST_LISTS = Regex("/v1/(feed|discover/posts|me/saved-posts|pages/[A-Za-z0-9-]{3,36}/(posts|pinned-posts)|posts/[a-f0-9-]{36}/comments)")
    // Twenty pages, each with up to 2,000 characters of rules (T83), can exceed the default 64 KiB.
    private val COMMUNITY_PAGE_LISTS = Regex("/v1/(discover/pages|me/following|me/suggested-pages)")
    private val COMMUNITY_DRAFTS = Regex("/v1/pages/[a-f0-9-]{36}/drafts")

    @Provides @Singleton fun gson(): Gson = Gson()
    // Signing out, an ended session and a different account delete the kept chat messages (DEC-021) and turn phone alerts off (DEC-020).
    @Provides @Singleton fun store(implementation: KeystoreSessionStore, outbox: Outbox, alerts: AlertSwitch): SessionStore =
        OutboxSessionStore(AlertSessionStore(implementation, alerts), outbox)
    // The live stream stays open for up to 30 minutes with a keep-alive every 15 seconds, so it has no
    // response-size cap and no call deadline; three missed keep-alives end it.
    @Provides @Singleton @LiveClient fun liveHttp(): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .callTimeout(0, TimeUnit.SECONDS)
        .retryOnConnectionFailure(false)
        .connectionPool(ConnectionPool(0, 1, TimeUnit.SECONDS))
        .followRedirects(false)
        .followSslRedirects(false)
        .build()
    @Provides @Singleton fun http(): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .callTimeout(20, TimeUnit.SECONDS)
        .retryOnConnectionFailure(false)
        .connectionPool(ConnectionPool(0, 1, TimeUnit.SECONDS))
        .followRedirects(false)
        .followSslRedirects(false)
        .addInterceptor { chain ->
            val request = chain.request()
            val path = request.url.encodedPath
            // Message pages can hold 30 messages of up to 2000 characters each.
            // Event pages hold 20 events with 2000-character details; one event can list up to 500 responses.
            val maximumBytes = when {
                request.method == "GET" && Regex("/v1/me/exports/[a-fA-F0-9-]{36}/archive").matches(path) -> 6291456L
                request.method == "GET" && Regex("/v1/documents/[a-fA-F0-9-]{36}").matches(path) -> 1572864L
                request.method == "GET" && path.startsWith("/v1/spaces/") && path.endsWith("/documents") -> 262144L
                request.method == "GET" && path == "/v1/search" -> 262144L
                request.method == "GET" && path == "/v1/tasks" -> 262144L
                request.method == "GET" && path.startsWith("/v1/conversations/") && path.endsWith("/messages") -> 524288L
                path.startsWith("/v1/events/") || (path.startsWith("/v1/spaces/") && path.endsWith("/events")) -> 524288L
                // A care day can list 60 medicines with up to six times each.
                path.startsWith("/v1/care/") -> 524288L
                // Community limits are code points (up to 4 UTF-8 bytes): 20 posts of 5000 or 50 comments of 2000
                // stay under 512 KiB, as do 20 pages with 2,000 characters of rules; 50 drafts under 1.5 MiB and 500 blocks under 256 KiB.
                request.method == "GET" && COMMUNITY_POST_LISTS.matches(path) -> 524288L
                request.method == "GET" && COMMUNITY_PAGE_LISTS.matches(path) -> 524288L
                // The whole vocabulary of about 270 terms in three languages is about 80 KiB.
                request.method == "GET" && path == "/v1/taxonomy" -> 524288L
                request.method == "GET" && COMMUNITY_DRAFTS.matches(path) -> 1572864L
                request.method == "GET" && path == "/v1/me/blocks" -> 262144L
                request.method == "GET" && path == "/v1/moderation/queue" -> 524288L
                request.method == "GET" && path == "/v1/moderation/appeals" -> 8388608L
                request.method == "GET" && path in setOf("/v1/me/moderation-notices", "/v1/me/reports") -> 1048576L
                // Ten agent requests with their questions, approvals, plans and history; up to 51 saved memories.
                request.method == "GET" && path == "/v1/agent-runs" -> 524288L
                request.method == "GET" && path == "/v1/agent-memories" -> 262144L
                else -> 65536L
            }
            val response = chain.proceed(request)
            val source = response.body?.source()
            source?.request(maximumBytes + 1)
            if ((source?.buffer?.size ?: 0) > maximumBytes) {
                response.close()
                throw IOException("The response is too large.")
            }
            response
        }.build()

    @Provides @Singleton fun api(client: OkHttpClient, gson: Gson): IdentityApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create(gson))
        .build()
        .create(IdentityApi::class.java)

    @Provides @Singleton fun tasks(client: OkHttpClient, gson: Gson): TaskApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create(gson.newBuilder().serializeNulls().create()))
        .build()
        .create(TaskApi::class.java)

    @Provides @Singleton fun reminders(client: OkHttpClient, gson: Gson): ReminderApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create(gson))
        .build()
        .create(ReminderApi::class.java)

    @Provides @Singleton fun checklist(client: OkHttpClient, gson: Gson): ChecklistApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create(gson))
        .build()
        .create(ChecklistApi::class.java)

    @Provides @Singleton fun calendar(client: OkHttpClient, gson: Gson): CalendarApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create(gson))
        .build()
        .create(CalendarApi::class.java)

    @Provides @Singleton fun spaceSettings(client: OkHttpClient, gson: Gson): SpaceSettingsApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create(gson))
        .build()
        .create(SpaceSettingsApi::class.java)

    @Provides @Singleton fun spaces(client: OkHttpClient, gson: Gson): SpaceApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create(gson))
        .build()
        .create(SpaceApi::class.java)

    @Provides @Singleton fun groups(client: OkHttpClient, gson: Gson): GroupApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create(gson))
        .build()
        .create(GroupApi::class.java)

    @Provides @Singleton fun messaging(client: OkHttpClient, gson: Gson): MessagingApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create(gson))
        .build()
        .create(MessagingApi::class.java)

    @Provides @Singleton fun community(client: OkHttpClient, gson: Gson): CommunityApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create(gson.newBuilder().serializeNulls().create()))
        .build()
        .create(CommunityApi::class.java)

    // Without serializeNulls: every classification and interests list is sent in full, never as null.
    @Provides @Singleton fun classification(client: OkHttpClient, gson: Gson): ClassificationApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create(gson.newBuilder().disableHtmlEscaping().create()))
        .build()
        .create(ClassificationApi::class.java)

    // Without serializeNulls: the server refuses fields a control's kind does not use, so they are left out.
    @Provides @Singleton fun feedControls(client: OkHttpClient, gson: Gson): FeedControlsApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create(gson))
        .build()
        .create(FeedControlsApi::class.java)

    @Provides @Singleton fun pageInsights(client: OkHttpClient, gson: Gson): PageInsightsApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create(gson))
        .build()
        .create(PageInsightsApi::class.java)

    @Provides @Singleton fun events(client: OkHttpClient, gson: Gson): EventsApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create(gson.newBuilder().serializeNulls().create()))
        .build()
        .create(EventsApi::class.java)

    // Without serializeNulls: a new category and an expense without a category leave out their null ids.
    @Provides @Singleton fun eventBudgets(client: OkHttpClient, gson: Gson): EventBudgetsApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create(gson))
        .build()
        .create(EventBudgetsApi::class.java)

    @Provides @Singleton fun moderation(client: OkHttpClient, gson: Gson): ModerationApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create(gson))
        .build()
        .create(ModerationApi::class.java)

    @Provides @Singleton fun documents(client: OkHttpClient, gson: Gson): DocumentApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create(gson.newBuilder().disableHtmlEscaping().create()))
        .build()
        .create(DocumentApi::class.java)

    @Provides @Singleton fun search(client: OkHttpClient, gson: Gson): SearchApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create(gson))
        .build()
        .create(SearchApi::class.java)

    @Provides @Singleton fun agents(client: OkHttpClient, gson: Gson): AgentApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create(gson))
        .build()
        .create(AgentApi::class.java)

    @Provides @Singleton fun care(client: OkHttpClient, gson: Gson): CareApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create(gson.newBuilder().serializeNulls().create()))
        .build()
        .create(CareApi::class.java)
}
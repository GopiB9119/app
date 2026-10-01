package com.community.platform

import com.community.platform.feature.agents.AgentApi
import com.community.platform.feature.care.CareApi
import com.community.platform.feature.community.CommunityApi
import com.community.platform.feature.discovery.SearchApi
import com.community.platform.feature.events.EventsApi
import com.community.platform.feature.files.DocumentApi
import com.community.platform.feature.identity.IdentityApi
import com.community.platform.feature.identity.KeystoreSessionStore
import com.community.platform.feature.identity.SessionStore
import com.community.platform.feature.messaging.MessagingApi
import com.community.platform.feature.planning.TaskApi
import com.community.platform.feature.planning.CalendarApi
import com.community.platform.feature.planning.ChecklistApi
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
    private val COMMUNITY_POST_LISTS = Regex("/v1/(feed|discover/posts|me/saved-posts|pages/[A-Za-z0-9-]{3,36}/posts|posts/[a-f0-9-]{36}/comments)")
    private val COMMUNITY_DRAFTS = Regex("/v1/pages/[a-f0-9-]{36}/drafts")

    @Provides @Singleton fun gson(): Gson = Gson()
    @Provides @Singleton fun store(implementation: KeystoreSessionStore): SessionStore = implementation
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
                request.method == "GET" && Regex("/v1/documents/[a-fA-F0-9-]{36}").matches(path) -> 1572864L
                request.method == "GET" && path.startsWith("/v1/spaces/") && path.endsWith("/documents") -> 262144L
                request.method == "GET" && path == "/v1/search" -> 262144L
                request.method == "GET" && path == "/v1/tasks" -> 262144L
                request.method == "GET" && path.startsWith("/v1/conversations/") && path.endsWith("/messages") -> 524288L
                path.startsWith("/v1/events/") || (path.startsWith("/v1/spaces/") && path.endsWith("/events")) -> 524288L
                // A care day can list 60 medicines with up to six times each.
                path.startsWith("/v1/care/") -> 524288L
                // Community limits are code points (up to 4 UTF-8 bytes): 20 posts of 5000 or 50 comments of 2000
                // stay under 512 KiB, 50 drafts under 1.5 MiB and 500 blocks under 256 KiB.
                request.method == "GET" && COMMUNITY_POST_LISTS.matches(path) -> 524288L
                request.method == "GET" && COMMUNITY_DRAFTS.matches(path) -> 1572864L
                request.method == "GET" && path == "/v1/me/blocks" -> 262144L
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

    @Provides @Singleton fun events(client: OkHttpClient, gson: Gson): EventsApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create(gson.newBuilder().serializeNulls().create()))
        .build()
        .create(EventsApi::class.java)

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
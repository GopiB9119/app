package com.community.platform

import com.community.platform.feature.identity.IdentityApi
import com.community.platform.feature.identity.KeystoreSessionStore
import com.community.platform.feature.identity.SessionStore
import com.community.platform.feature.planning.TaskApi
import com.community.platform.feature.planning.CalendarApi
import com.community.platform.feature.scheduling.ReminderApi
import com.community.platform.feature.spaces.SpaceApi
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
            val maximumBytes = if (request.method == "GET" && request.url.encodedPath == "/v1/tasks") 262144L else 65536L
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

    @Provides @Singleton fun calendar(client: OkHttpClient, gson: Gson): CalendarApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create(gson))
        .build()
        .create(CalendarApi::class.java)

    @Provides @Singleton fun spaces(client: OkHttpClient, gson: Gson): SpaceApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create(gson))
        .build()
        .create(SpaceApi::class.java)
}
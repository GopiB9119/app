package com.community.platform.feature

import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import java.util.Locale

/** Shows [content] with the app's texts in [language] (for example "te" or "hi"), keeping the device's font scale. */
@Composable
internal fun InLanguage(language: String, content: @Composable () -> Unit) {
    val base = LocalContext.current
    val configuration = Configuration(base.resources.configuration).apply { setLocale(Locale.forLanguageTag(language)) }
    CompositionLocalProvider(LocalContext provides base.createConfigurationContext(configuration), LocalConfiguration provides configuration) { content() }
}

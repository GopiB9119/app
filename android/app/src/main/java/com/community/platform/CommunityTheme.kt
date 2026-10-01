package com.community.platform

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily

private val sourceSans = FontFamily(Font(R.font.source_sans_3))
private val base = Typography()
private fun TextStyle.communityStyle() = copy(fontFamily = sourceSans, letterSpacing = DesignTokens.LetterSpacing)
private val typography = Typography(
    displayLarge = base.displayLarge.communityStyle(), displayMedium = base.displayMedium.communityStyle(), displaySmall = base.displaySmall.communityStyle(),
    headlineLarge = base.headlineLarge.communityStyle(), headlineMedium = base.headlineMedium.communityStyle(), headlineSmall = base.headlineSmall.communityStyle(),
    titleLarge = base.titleLarge.communityStyle(), titleMedium = base.titleMedium.communityStyle(), titleSmall = base.titleSmall.communityStyle(),
    bodyLarge = base.bodyLarge.communityStyle(), bodyMedium = base.bodyMedium.communityStyle(), bodySmall = base.bodySmall.communityStyle(),
    labelLarge = base.labelLarge.communityStyle(), labelMedium = base.labelMedium.communityStyle(), labelSmall = base.labelSmall.communityStyle(),
)

@Composable
fun CommunityTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = DesignTokens.Primary, onPrimary = DesignTokens.Surface,
            primaryContainer = DesignTokens.PrimarySurface, onPrimaryContainer = DesignTokens.Ink,
            secondary = DesignTokens.Accent, background = DesignTokens.Background,
            surface = DesignTokens.Background, onSurface = DesignTokens.Ink,
            onSurfaceVariant = DesignTokens.Muted, outline = DesignTokens.ControlBorder,
            error = DesignTokens.Danger,
        ),
        typography = typography,
        content = content,
    )
}
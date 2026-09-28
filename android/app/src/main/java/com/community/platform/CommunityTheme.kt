package com.community.platform

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.sp

private val sourceSans = FontFamily(Font(R.font.source_sans_3))
private val base = Typography()
private fun TextStyle.communityStyle() = copy(fontFamily = sourceSans, letterSpacing = 0.sp)
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
            primary = Color(0xFF17634F), onPrimary = Color.White,
            primaryContainer = Color(0xFFE8F2ED), onPrimaryContainer = Color(0xFF18362F),
            secondary = Color(0xFFB4553D), background = Color(0xFFF6F8F6),
            surface = Color(0xFFF6F8F6), onSurface = Color(0xFF18362F),
            onSurfaceVariant = Color(0xFF5A6E67), outline = Color(0xFFACBCB3),
            error = Color(0xFFA53032),
        ),
        typography = typography,
        content = content,
    )
}
package com.community.platform.feature.platform

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.isSpecified
import com.community.platform.DesignTokens
import com.community.platform.R
import com.community.platform.feature.community.CommunityState
import com.community.platform.feature.community.Destination
import com.community.platform.feature.messaging.MessagingState
import com.community.platform.feature.spaces.SpaceWorkspaceState

/** The five main sections (DEC-014), in the same order and with the same names as on the web. */
enum class MainSection(@StringRes val label: Int, val tag: String) {
    HOME(R.string.main_home, "main-home"),
    SPACES(R.string.main_spaces, "main-spaces"),
    MESSAGES(R.string.main_messages, "main-messages"),
    DISCOVER(R.string.main_discover, "main-discover"),
    PROFILE(R.string.main_profile, "main-profile"),
}

data class MainBar(val section: MainSection, val enabled: Boolean)

/**
 * The bar shows on the five top-level screens and hides while a nested view is open, such as one Space or one chat,
 * where the screen's own back button leads out. It is disabled while leaving would lose an unconfirmed or unsaved
 * change, so that the screen's own leave check is never skipped.
 */
fun mainBar(screen: String, signedIn: Boolean, accountBusy: Boolean, spaces: SpaceWorkspaceState, messaging: MessagingState, community: CommunityState): MainBar? = when {
    !signedIn -> null
    screen == "home" -> MainBar(MainSection.HOME, true)
    screen == "account" -> MainBar(MainSection.PROFILE, !accountBusy)
    screen == "spaces" -> if (spaces.selectedSpace == null && !spaces.creating) MainBar(MainSection.SPACES, !spaces.navigationLocked) else null
    screen == "messages" -> if (messaging.chat == null) MainBar(MainSection.MESSAGES, true) else null
    // The blocked list belongs to Profile, like account, sessions and privacy (DEC-014).
    // Your interests opened from Profile belong to Profile; opened from Discover's suggestions they stay in Discover.
    // "Muted and hidden" opens from the blocked list or your interests, and belongs where they were opened.
    screen == "community" -> MainBar(if (community.destination == Destination.Blocked || (community.destination == Destination.Interests && community.history.isEmpty()) ||
        (community.destination == Destination.FeedControls && community.history.firstOrNull().let { it == Destination.Blocked || it == Destination.Interests })) MainSection.PROFILE else MainSection.DISCOVER, !community.working)
    else -> null
}

@Composable
fun MainNavigationBar(bar: MainBar, onSelect: (MainSection) -> Unit, modifier: Modifier = Modifier) {
    Column(modifier) {
        HorizontalDivider(color = DesignTokens.Border)
        NavigationBar(Modifier.testTag("main-navigation"), containerColor = DesignTokens.Surface, tonalElevation = 0.dp) {
            MainSection.entries.forEach { section ->
                NavigationBarItem(
                    selected = section == bar.section,
                    onClick = { if (section != bar.section) onSelect(section) },
                    enabled = bar.enabled,
                    icon = { Icon(section.icon, contentDescription = null) },
                    label = { FittedLabel(stringResource(section.label)) },
                    alwaysShowLabel = true,
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = DesignTokens.Primary, selectedTextColor = DesignTokens.Primary, indicatorColor = DesignTokens.PrimarySurface,
                        unselectedIconColor = DesignTokens.Muted, unselectedTextColor = DesignTokens.Muted,
                    ),
                    modifier = Modifier.testTag(section.tag),
                )
            }
        }
    }
}

/**
 * Five labels share the width of a 320 dp phone, so at large text sizes a label is drawn just small enough to fit
 * on one line instead of being cut off. Below that size it keeps the size the person chose.
 */
@Composable
private fun FittedLabel(text: String) {
    val style = MaterialTheme.typography.labelMedium
    val measurer = rememberTextMeasurer()
    BoxWithConstraints {
        val natural = measurer.measure(text, style, maxLines = 1, softWrap = false).size.width
        val fitted = if (constraints.hasBoundedWidth && natural > constraints.maxWidth) {
            val ratio = constraints.maxWidth.toFloat() / natural * 0.98f
            style.copy(fontSize = style.fontSize * ratio, lineHeight = if (style.lineHeight.isSpecified) style.lineHeight * ratio else style.lineHeight)
        } else style
        Text(text, style = fitted, maxLines = 1, softWrap = false)
    }
}

private val MainSection.icon: ImageVector get() = when (this) {
    MainSection.HOME -> Icons.Default.Home
    MainSection.SPACES -> SpacesIcon
    MainSection.MESSAGES -> MessagesIcon
    MainSection.DISCOVER -> DiscoverIcon
    MainSection.PROFILE -> Icons.Default.Person
}

// The core icon set has no people, chat or compass icon, so these three are drawn here in the same filled style.
private val SpacesIcon: ImageVector by lazy {
    ImageVector.Builder("Spaces", 24.dp, 24.dp, 24f, 24f).apply {
        path(fill = SolidColor(Color.Black)) {
            moveTo(9f, 4.5f)
            arcToRelative(3.25f, 3.25f, 0f, true, true, 0f, 6.5f)
            arcToRelative(3.25f, 3.25f, 0f, true, true, 0f, -6.5f)
            close()
            moveTo(2.5f, 19.5f)
            verticalLineToRelative(-1.25f)
            curveToRelative(0f, -2.6f, 2.9f, -4.25f, 6.5f, -4.25f)
            reflectiveCurveToRelative(6.5f, 1.65f, 6.5f, 4.25f)
            verticalLineToRelative(1.25f)
            close()
            moveTo(16.5f, 5.5f)
            arcToRelative(2.75f, 2.75f, 0f, true, true, 0f, 5.5f)
            arcToRelative(2.75f, 2.75f, 0f, true, true, 0f, -5.5f)
            close()
            moveTo(16.4f, 13.75f)
            curveTo(19.3f, 13.9f, 21.5f, 15.4f, 21.5f, 17.75f)
            lineTo(21.5f, 19.5f)
            lineTo(17.25f, 19.5f)
            lineTo(17.25f, 18.25f)
            curveTo(17.25f, 16.4f, 17f, 14.9f, 16.4f, 13.75f)
            close()
        }
    }.build()
}

private val MessagesIcon: ImageVector by lazy {
    ImageVector.Builder("Messages", 24.dp, 24.dp, 24f, 24f).apply {
        path(fill = SolidColor(Color.Black)) {
            moveTo(5f, 3.5f)
            horizontalLineTo(19f)
            arcToRelative(2f, 2f, 0f, false, true, 2f, 2f)
            verticalLineTo(15f)
            arcToRelative(2f, 2f, 0f, false, true, -2f, 2f)
            horizontalLineTo(10f)
            lineTo(5.5f, 20.75f)
            verticalLineTo(17f)
            horizontalLineTo(5f)
            arcToRelative(2f, 2f, 0f, false, true, -2f, -2f)
            verticalLineTo(5.5f)
            arcToRelative(2f, 2f, 0f, false, true, 2f, -2f)
            close()
        }
    }.build()
}

private val DiscoverIcon: ImageVector by lazy {
    ImageVector.Builder("Discover", 24.dp, 24.dp, 24f, 24f).apply {
        path(fill = SolidColor(Color.Black), pathFillType = PathFillType.EvenOdd) {
            moveTo(12f, 2f)
            arcToRelative(10f, 10f, 0f, true, true, 0f, 20f)
            arcToRelative(10f, 10f, 0f, true, true, 0f, -20f)
            close()
            moveTo(16.25f, 7.75f)
            lineTo(13.6f, 13.6f)
            lineTo(7.75f, 16.25f)
            lineTo(10.4f, 10.4f)
            close()
        }
    }.build()
}

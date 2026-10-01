# Design tokens

The one place where the product's colours, font, spacing unit, corner radii and minimum touch-target sizes are defined, for web and Android ([DEC-013](../../docs/DECISIONS.md#accepted-decisions)). The screen rules that go with them are in [FEATURES_AND_SCREENS section 4](../../docs/FEATURES_AND_SCREENS.md#4-rules-every-feature-follows).

## Changing a value

1. Edit [tokens.json](tokens.json). A changed value changes every screen that uses it, so check where it is used first.
2. Run `npm run tokens` from the repository root. It writes [web/src/app/design-tokens.css](../../web/src/app/design-tokens.css) and [DesignTokens.kt](../../android/app/src/main/java/com/community/platform/DesignTokens.kt). Never edit those two files by hand.
3. Run `npm run check:tokens`. It fails when a generated file is out of date, when `globals.css` or `CommunityTheme.kt` types a token colour by hand, when the font name appears outside the `@font-face` rule, when a text colour pair falls below 4.5:1 contrast or the input border below 3:1, or when a stylesheet on the token list (`tokenStylesheets` in [scripts/design-tokens.mjs](../../scripts/design-tokens.mjs)) types a colour, uses an older name or a fallback, sets a corner other than `0` or a radius token, or types a spacing value (margin, padding, gap or offset) instead of `var(--space-unit)` or `calc(var(--space-unit) * n)` with a whole number `n`. It also fails when an Android screen on its token list (`tokenScreens`) types a corner size, or a minimum height of 48 dp or less, instead of using `DesignTokens`. `npm run test:tokens` runs the same checks as tests.
4. Check the changed screens at 320 px / 320 dp and 200% text.

When a feature stylesheet uses only token variables, add it to `tokenStylesheets` so it stays that way; likewise add an Android screen to `tokenScreens` once its corners and target heights come from `DesignTokens`.

## Names

| tokens.json | Web | Android |
| --- | --- | --- |
| `color.<name>`, for example `primaryHover` | `var(--color-primary-hover)` | `DesignTokens.PrimaryHover` |
| `color.dangerSurface`, `color.warningSurface`: backgrounds for errors and for notices that need attention | `var(--color-danger-surface)`, `var(--color-warning-surface)` | `DesignTokens.DangerSurface`, `DesignTokens.WarningSurface` |
| `font.family` | `var(--font-family)`; the `@font-face` rule in `globals.css` names the font file | `R.font.source_sans_3` |
| `font.letterSpacing` (always 0) | `letter-spacing: 0` | `DesignTokens.LetterSpacing` |
| `spacingUnit`: use multiples of it | `var(--space-unit)` | `DesignTokens.SpaceUnit` |
| `controlRadius`, `dialogRadius` | `var(--radius-control)`, `var(--radius-dialog)` | `DesignTokens.ControlRadius`, `DesignTokens.DialogRadius` |
| `minimumWebTarget`, `minimumAndroidTarget` | `var(--target-minimum)` (44 px) | `DesignTokens.MinimumTarget` (48 dp) |

The web stylesheet still has older names (`--ink`, `--muted`, `--green`, `--green-hover`, `--green-soft`, `--canvas`, `--line`, `--white`, `--accent`, `--danger`, `--radius`). They point at the generated variables, so the calendar, reminders, Spaces and agent styles keep working. New styles use the generated names; the stylesheets on the token list may not use the older ones.

## Known gaps

Tracked in [T37](../../docs/TASKS.md#design-and-experience):

- The calendar, reminders and Spaces stylesheets still contain colours, corner sizes and spacing of their own, and so do the Android reminders, calendar and Spaces screens. The other Android screens take their corners and target heights from `DesignTokens` but still type their own spacing.
- The stylesheets on the token list space in whole space units, but still type sizes such as widths, heights and font sizes; the message delete button is 36 px, below the 44 px web target.
- There is no shared text-size scale yet: most web text is sized in px, so it does not grow when the root text size does.

The font is Source Sans 3, under the SIL Open Font License ([licenses/SourceSans3-LICENSE.md](licenses/SourceSans3-LICENSE.md)).

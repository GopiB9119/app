# Design tokens

The one place where the product's colours, font, spacing unit, corner radii and minimum touch-target sizes are defined, for web and Android ([DEC-013](../../docs/DECISIONS.md#accepted-decisions)). The screen rules that go with them are in [FEATURES_AND_SCREENS section 4](../../docs/FEATURES_AND_SCREENS.md#4-rules-every-feature-follows).

## Changing a value

1. Edit [tokens.json](tokens.json). A changed value changes every screen that uses it, so check where it is used first.
2. Run `npm run tokens` from the repository root. It writes [web/src/app/design-tokens.css](../../web/src/app/design-tokens.css) and [DesignTokens.kt](../../android/app/src/main/java/com/community/platform/DesignTokens.kt). Never edit those two files by hand.
3. Run `npm run check:tokens`. It fails when a generated file is out of date, when `globals.css` or `CommunityTheme.kt` types a token colour by hand, when the font name appears outside the `@font-face` rule, when a text colour pair falls below 4.5:1 contrast or the input border below 3:1, or when a stylesheet on the token list (`tokenStylesheets` in [scripts/design-tokens.mjs](../../scripts/design-tokens.mjs)) types a colour, uses an older name or a fallback, or sets a corner other than `0` or a radius token. `npm run test:tokens` runs the same checks as tests.
4. Check the changed screens at 320 px / 320 dp and 200% text.

When a feature stylesheet uses only token variables, add it to `tokenStylesheets` so it stays that way.

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

- The calendar, reminders and Spaces stylesheets and the Android screens still contain colours, corner sizes and spacing of their own.
- Spacing is not yet on the 4-unit scale everywhere, and there are two toggle styles.
- There is no shared text-size scale yet.

The font is Source Sans 3, under the SIL Open Font License ([licenses/SourceSans3-LICENSE.md](licenses/SourceSans3-LICENSE.md)).

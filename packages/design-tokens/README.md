# Design tokens

The one place where the product's colours, font, spacing unit, corner radii and minimum touch-target sizes are defined, for web and Android ([DEC-013](../../docs/DECISIONS.md#accepted-decisions), provisional). The screen rules that go with them are in [FEATURES_AND_SCREENS section 4](../../docs/FEATURES_AND_SCREENS.md#4-rules-every-feature-follows).

## Changing a value

1. Edit [tokens.json](tokens.json). A changed value changes every screen that uses it, so check where it is used first.
2. Run `npm run tokens` from the repository root. It writes [web/src/app/design-tokens.css](../../web/src/app/design-tokens.css) and [DesignTokens.kt](../../android/app/src/main/java/com/community/platform/DesignTokens.kt). Never edit those two files by hand.
3. Run `npm run check:tokens`. It fails when a generated file is out of date, when `globals.css` or `CommunityTheme.kt` types a token colour by hand, when the font name appears outside the `@font-face` rule, or when a text colour pair falls below 4.5:1 contrast (3:1 for the focus colour). `npm run test:tokens` runs the same checks as tests.
4. Check the changed screens at 320 px / 320 dp and 200% text.

## Names

| tokens.json | Web | Android |
| --- | --- | --- |
| `color.<name>`, for example `primaryHover` | `var(--color-primary-hover)` | `DesignTokens.PrimaryHover` |
| `font.family` | `var(--font-family)`; the `@font-face` rule in `globals.css` names the font file | `R.font.source_sans_3` |
| `font.letterSpacing` (always 0) | `letter-spacing: 0` | `DesignTokens.LetterSpacing` |
| `spacingUnit`: use multiples of it | `var(--space-unit)` | `DesignTokens.SpaceUnit` |
| `controlRadius`, `dialogRadius` | `var(--radius-control)`, `var(--radius-dialog)` | `DesignTokens.ControlRadius`, `DesignTokens.DialogRadius` |
| `minimumWebTarget`, `minimumAndroidTarget` | `var(--target-minimum)` (44 px) | `DesignTokens.MinimumTarget` (48 dp) |

The web stylesheet still has older names (`--ink`, `--muted`, `--green`, `--green-hover`, `--green-soft`, `--canvas`, `--line`, `--white`, `--accent`, `--danger`, `--radius`). They now point at the generated variables, so existing feature styles keep working. New styles use the generated names.

## Known gaps

Tracked in [T37](../../docs/TASKS.md#design-and-experience):

- The web feature stylesheets and the Android screens still contain colours, corner sizes and spacing of their own.
- The input border is 1.98:1 on white, where the outline that marks an input needs 3:1, and the placeholder is 3.68:1, where text needs 4.5:1.
- There is no shared text-size scale yet.

The font is Source Sans 3, under the SIL Open Font License ([licenses/SourceSans3-LICENSE.md](licenses/SourceSans3-LICENSE.md)).

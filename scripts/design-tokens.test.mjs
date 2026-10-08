import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkTokens, contrastFailures, contrastPairs, contrastRatio, cssFile, findHandCopies, findScreenViolations, findSpacingViolations, findStyleViolations, globalsFile, kotlinFile,
  loadTokens, read, renderCss, renderKotlin, spacingScreens, staleOutputs, themeFile, tokenScreens, tokenStylesheets,
} from './design-tokens.mjs';

const tokens = loadTokens();

test('the generated web and Android files match tokens.json', () => {
  assert.deepEqual(staleOutputs(tokens).map(([file]) => file), []);
  assert.deepEqual(staleOutputs({ ...tokens, spacingUnit: 8 }).map(([file]) => file), [cssFile, kotlinFile]);
  assert.equal(read(cssFile), renderCss(tokens));
  assert.equal(read(kotlinFile), renderKotlin(tokens));
  for (const [name, value] of Object.entries(tokens.color)) {
    assert.ok(read(cssFile).includes(`: ${value};`), name);
    assert.ok(read(kotlinFile).includes(`Color(0xFF${value.slice(1).toUpperCase()})`), name);
  }
});

test('the global stylesheet and the Android theme use the generated values instead of copies', () => {
  assert.deepEqual(findHandCopies(tokens), []);
  assert.match(read(globalsFile), /--green:\s*var\(--color-primary\)/);
  assert.match(read(themeFile), /primary = DesignTokens\.Primary/);
});

test('a colour typed by hand is reported', () => {
  const globals = read(globalsFile);
  const theme = read(themeFile);
  const copies = findHandCopies(tokens, {
    [globalsFile]: `${globals}\n.extra{color:#0068D6;border-color:#FFF;background:white}`,
    [themeFile]: `${theme}\nval extra = Color(0xFF636366)`,
  });
  assert.deepEqual(copies, [
    'web/src/app/globals.css: colour primary (#0068d6) is typed by hand',
    'web/src/app/globals.css: colour surface (#ffffff) is typed by hand',
    'android/app/src/main/java/com/community/platform/CommunityTheme.kt: colour muted (#636366) is typed by hand',
  ]);
  assert.deepEqual(findHandCopies(tokens, { [globalsFile]: globals.replace('var(--font-family)', '"Segoe UI"') }), [
    'web/src/app/globals.css: body text must take its font from var(--font-family)',
  ]);
  assert.deepEqual(findHandCopies(tokens, { [globalsFile]: `${globals}\n@font-face{font-family:"X";src:url(x.otf)}` }), [
    'web/src/app/globals.css: web text uses the system font list from --font-family, so no @font-face may ship',
  ]);
});

test('text colours keep 4.5:1 contrast and control borders 3:1', () => {
  assert.deepEqual(contrastFailures(tokens), []);
  const failures = contrastFailures({ ...tokens, color: { ...tokens.color, muted: '#9aa59f' } });
  assert.equal(failures.length, 2);
  assert.match(failures[0], /^muted on background: 2\.\d\d:1, needs 4\.5:1$/);
  assert.match(failures[1], /^muted on surface: 2\.\d\d:1, needs 4\.5:1$/);
  // The colours T37 replaced fail the same checks.
  assert.deepEqual(contrastFailures({ ...tokens, color: { ...tokens.color, controlBorder: '#acbcb3', placeholder: '#798980' } }), [
    'placeholder on surface: 3.68:1, needs 4.5:1',
    'controlBorder on background: 1.78:1, needs 3:1',
    'controlBorder on surface: 1.98:1, needs 3:1',
  ]);
  assert.ok(contrastPairs.some(([foreground, background, minimum]) => foreground === 'accent' && background === 'warningSurface' && minimum === 4.5));
});

test('motion durations and curves reach the web stylesheet only', () => {
  const css = renderCss(tokens);
  for (const line of ['--motion-fast: 120ms;', '--motion-medium: 200ms;', '--motion-slow: 320ms;',
    '--ease-standard: cubic-bezier(0.2, 0, 0, 1);', '--ease-exit: cubic-bezier(0.3, 0, 1, 1);']) assert.ok(css.includes(line), line);
  assert.doesNotMatch(renderKotlin(tokens), /motion|ease/i);
  assert.deepEqual(checkTokens({ ...tokens, motion: { ...tokens.motion, fast: 1.5, slow: 5000, easeExit: 'linear; color: red' } }), [
    'motion.fast must be whole milliseconds from 0 to 1000',
    'motion.slow must be whole milliseconds from 0 to 1000',
    'motion.easeExit must be a cubic-bezier() curve',
  ]);
});

test('feature stylesheets moved to tokens use only token variables and token corners', () => {
  // The privacy page (T164), the reminders and inbox screens, live agent progress, the Space header and Space polls joined the guarded stylesheets.
  assert.equal(tokenStylesheets.length, 12);
  assert.deepEqual(findStyleViolations(), []);
  const file = tokenStylesheets[0];
  assert.deepEqual(findStyleViolations({ [file]: [
    '.a { color: #17634f; background: rgba(0, 0, 0, 0.5); border-color: white; }',
    '.b { color: var(--green); border: 1px solid var(--line, #c9d3cc); border-radius: 999px; }',
    '.c { border-radius: var(--radius-control); } .d { border-radius: 0; } /* #fff in a comment */',
  ].join('\n') }), [
    'web/src/features/care/care.module.css: typed colour #17634f',
    'web/src/features/care/care.module.css: typed colour #c9d3cc',
    'web/src/features/care/care.module.css: colour function rgba(',
    'web/src/features/care/care.module.css: named colour white',
    'web/src/features/care/care.module.css: older variable var(--green)',
    'web/src/features/care/care.module.css: older variable var(--line)',
    'web/src/features/care/care.module.css: fallback in var(--line, #c9d3cc)',
    'web/src/features/care/care.module.css: corner radius 999px',
  ]);
});

test('feature stylesheets moved to tokens space in whole space units', () => {
  const file = tokenStylesheets[0];
  assert.deepEqual(findStyleViolations({ [file]: [
    '.a { padding: 9px 12px; margin: 0 auto; gap: var(--space-unit); }',
    '.b { margin-top: calc(var(--space-unit) * 2.5); row-gap: calc(var(--space-unit) / 2); top: 0; }',
    '.c { inset: calc(var(--space-unit) * -2); padding-left: calc(var(--space-unit) * 5); border-top: 3px solid var(--color-border); }',
    '.d:hover { left: 1.5em; } @media (max-width: 440px) { .e { margin: 6px 0; } } /* padding: 10px in a comment */',
  ].join('\n') }), [
    'web/src/features/care/care.module.css: typed spacing 9px',
    'web/src/features/care/care.module.css: typed spacing 12px',
    'web/src/features/care/care.module.css: typed spacing 1.5em',
    'web/src/features/care/care.module.css: typed spacing 6px',
    'web/src/features/care/care.module.css: spacing off the 4 px scale var(--space-unit) * 2.5',
    'web/src/features/care/care.module.css: spacing off the 4 px scale var(--space-unit) / 2',
  ]);
});

test('Android screens moved to tokens take corners and target heights from DesignTokens', () => {
  assert.equal(tokenScreens.length, 8);
  assert.deepEqual(findScreenViolations(), []);
  const file = tokenScreens[0];
  assert.deepEqual(findScreenViolations({ [file]: [
    'Button(shape = RoundedCornerShape(6.dp), modifier = Modifier.heightIn(min = 48.dp))',
    'Row(Modifier.heightIn(min = 44.dp)) // RoundedCornerShape(4.dp) in a comment',
    'Surface(shape = RoundedCornerShape(DesignTokens.ControlRadius), modifier = Modifier.heightIn(min = DesignTokens.MinimumTarget))',
    'Row(Modifier.fillMaxWidth().heightIn(min = 56.dp))',
  ].join('\n') }), [
    'android/app/src/main/java/com/community/platform/feature/identity/IdentityScreen.kt: corner size 6 dp',
    'android/app/src/main/java/com/community/platform/feature/identity/IdentityScreen.kt: target height 48 dp',
    'android/app/src/main/java/com/community/platform/feature/identity/IdentityScreen.kt: target height 44 dp',
  ]);
});

test('Android screens moved to space units type no spacing', () => {
  assert.equal(spacingScreens.length, 6);
  assert.deepEqual(findSpacingViolations(), []);
  const file = spacingScreens[0];
  const where = 'android/app/src/main/java/com/community/platform/feature/identity/IdentityScreen.kt';
  assert.deepEqual(findSpacingViolations({ [file]: [
    'Row(Modifier.padding(horizontal = 20.dp, vertical = unit * 4), horizontalArrangement = Arrangement.spacedBy(6.dp)) {',
    '    Icon(Icons.Default.Check, null, Modifier.size(18.dp)); Spacer(Modifier.width(10.dp)); Text("Save")',
    '}',
    'LazyColumn(contentPadding = PaddingValues(unit * 5), verticalArrangement = Arrangement.spacedBy(DesignTokens.SpaceUnit * 2)) {}',
    'if (busy) LinearProgressIndicator(Modifier.height(3.dp)) else Spacer(Modifier.height(3.dp))',
    'Column(Modifier.padding(0.dp)) {} // Spacer(Modifier.height(14.dp)) in a comment',
    'Box(Modifier.padding(top = 12.dp).size(48.dp))',
  ].join('\n') }), [
    `${where}: typed spacing 20 dp`,
    `${where}: typed spacing 6 dp`,
    `${where}: typed spacing 10 dp`,
    `${where}: typed spacing 12 dp`,
  ]);
});

test('contrast arithmetic matches published reference values', () => {
  assert.equal(contrastRatio('#000000', '#ffffff').toFixed(2), '21.00');
  assert.equal(contrastRatio('#ffffff', '#000000').toFixed(2), '21.00');
  assert.equal(contrastRatio('#ffffff', '#ffffff').toFixed(2), '1.00');
  assert.equal(contrastRatio('#777777', '#ffffff').toFixed(2), '4.48');
});

test('token files that the generators cannot use safely are refused', () => {
  assert.deepEqual(checkTokens(tokens), []);
  const broken = structuredClone(tokens);
  broken.font.family = 'Evil"; } body { display:none';
  broken.color.primary = '#17634F';
  broken.color['bad-name'] = '#000000';
  broken.spacingUnit = 0;
  delete broken.color.surface;
  assert.deepEqual(checkTokens(broken), [
    'font.family must be a plain font name',
    'colour primary must be #rrggbb in lower case',
    'colour name bad-name must be camelCase',
    'spacingUnit must be a whole number from 1 to 96',
    'colour surface is needed for a contrast check',
  ]);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkTokens, contrastFailures, contrastPairs, contrastRatio, cssFile, findHandCopies, findStyleViolations, globalsFile, kotlinFile,
  loadTokens, read, renderCss, renderKotlin, staleOutputs, themeFile, tokenStylesheets,
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
  assert.match(read(globalsFile), /--green:var\(--color-primary\)/);
  assert.match(read(themeFile), /primary = DesignTokens\.Primary/);
});

test('a colour typed by hand is reported', () => {
  const globals = read(globalsFile);
  const theme = read(themeFile);
  const copies = findHandCopies(tokens, {
    [globalsFile]: `${globals}\n.extra{color:#17634F;border-color:#FFF;background:white}`,
    [themeFile]: `${theme}\nval extra = Color(0xFF5A6E67)`,
  });
  assert.deepEqual(copies, [
    'web/src/app/globals.css: colour primary (#17634f) is typed by hand',
    'web/src/app/globals.css: colour surface (#ffffff) is typed by hand',
    'android/app/src/main/java/com/community/platform/CommunityTheme.kt: colour muted (#5a6e67) is typed by hand',
  ]);
  assert.deepEqual(findHandCopies(tokens, { [globalsFile]: globals.replace('var(--font-family)', '"Source Sans 3"') }), [
    'web/src/app/globals.css: "Source Sans 3" may appear only in the @font-face rule',
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
    'controlBorder on background: 1.86:1, needs 3:1',
    'controlBorder on surface: 1.98:1, needs 3:1',
  ]);
  assert.ok(contrastPairs.some(([foreground, background, minimum]) => foreground === 'accent' && background === 'warningSurface' && minimum === 4.5));
});

test('feature stylesheets moved to tokens use only token variables and token corners', () => {
  assert.equal(tokenStylesheets.length, 6);
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

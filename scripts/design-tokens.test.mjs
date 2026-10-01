import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkTokens, contrastFailures, contrastRatio, cssFile, findHandCopies, globalsFile, knownContrastGaps, kotlinFile,
  loadTokens, read, renderCss, renderKotlin, staleOutputs, themeFile,
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

test('text colours keep 4.5:1 contrast and the focus colour 3:1', () => {
  assert.deepEqual(contrastFailures(tokens), []);
  const failures = contrastFailures({ ...tokens, color: { ...tokens.color, muted: '#9aa59f' } });
  assert.equal(failures.length, 2);
  assert.match(failures[0], /^muted on background: 2\.\d\d:1, needs 4\.5:1$/);
  assert.match(failures[1], /^muted on surface: 2\.\d\d:1, needs 4\.5:1$/);
});

test('the shipped colours still below their target stay listed until T37 changes them', () => {
  for (const [foreground, background, minimum, task] of knownContrastGaps) {
    assert.ok(contrastRatio(tokens.color[foreground], tokens.color[background]) < minimum, `${foreground} on ${background} now passes; remove it from knownContrastGaps (${task})`);
  }
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

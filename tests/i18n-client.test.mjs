import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { loadMessages } from './i18n-messages.mjs';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const typescript = require('typescript');
const loaded = loadMessages();
assert.equal(loaded.diagnostics.length, 0);
const messages = loaded.messages;
const { dictionaries, translate, isLanguage, languageLabels, LANGUAGES, core, areas } = messages;
const placeholders = text => new Set([...text.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map(match => match[1]));

test('Only English, Telugu and Hindi are display languages, with native picker labels', () => {
  assert.deepEqual([...LANGUAGES], ['en', 'te', 'hi']);
  assert.deepEqual({ ...languageLabels }, { en: 'English', te: 'తెలుగు', hi: 'हिन्दी' });
  for (const language of LANGUAGES) assert.equal(isLanguage(language), true);
  for (const value of [undefined, null, '', 'TE', 'fr', 'en-US', 'constructor', 'toString']) assert.equal(isLanguage(value), false);
});

for (const language of ['te', 'hi']) {
  test(`${language}: every translated id exists in the English source`, () => {
    assert.ok(Object.keys(dictionaries[language]).length > 0);
    for (const id of Object.keys(dictionaries[language])) assert.ok(Object.hasOwn(dictionaries.en, id), id);
  });

  test(`${language}: translations preserve English named placeholders`, () => {
    for (const [id, text] of Object.entries(dictionaries[language])) {
      assert.deepEqual(placeholders(text), placeholders(dictionaries.en[id]), id);
    }
  });
}

for (const language of LANGUAGES) {
  test(`${language}: no dictionary value is empty`, () => {
    for (const [id, text] of Object.entries(dictionaries[language])) {
      assert.equal(typeof text, 'string', id);
      assert.ok(text.trim().length > 0, id);
    }
  });
}

test('Untranslated ids fall back to English', () => {
  for (const language of ['te', 'hi']) {
    assert.equal(Object.hasOwn(dictionaries[language], 'shell.brandCommunity'), false);
    assert.equal(translate(language, 'shell.brandCommunity'), 'Community');
    assert.equal(translate(language, 'shell.brandPlatform'), 'Platform');
  }
});

test('Each screen area names its ids after itself, so no id can be defined twice', () => {
  const names = Object.keys(areas);
  // The privacy page (T164) added the fifteenth area.
  assert.equal(names.length, 15);
  for (const name of names) {
    for (const id of Object.keys(areas[name].en)) assert.ok(id.startsWith(`${name}.`), `${id} belongs in the ${name} area`);
  }
  for (const id of Object.keys(core.en)) assert.ok(!names.some(name => id.startsWith(`${name}.`)), `${id} uses an area prefix`);
  const sources = [core.en, ...names.map(name => areas[name].en)];
  assert.equal(Object.keys(dictionaries.en).length, sources.reduce((count, source) => count + Object.keys(source).length, 0));
});

test('Every screen area has Telugu and Hindi for each of its English ids, and nothing else', () => {
  for (const [name, area] of Object.entries(areas)) {
    for (const language of ['te', 'hi']) {
      assert.deepEqual(Object.keys(area[language]).sort(), Object.keys(area.en).sort(), `${language}/${name}`);
      for (const [id, text] of Object.entries(area[language])) {
        assert.equal(dictionaries[language][id], text, `${language}/${id} reaches the merged dictionary`);
      }
    }
  }
});

test('Named placeholders insert values literally and never translate user text', () => {
  assert.equal(translate('en', 'shell.inboxUnread', { count: 7 }), 'Notification inbox, 7 unread');
  assert.equal(translate('te', 'shell.inboxUnread', { count: 7 }), dictionaries.te['shell.inboxUnread'].replace('{count}', '7'));
  assert.equal(translate('hi', 'auth.deletionPending', { date: 'User text $& {count}' }), dictionaries.hi['auth.deletionPending'].replace('{date}', () => 'User text $& {count}'));
  assert.equal(translate('en', 'shell.inboxUnread'), 'Notification inbox, {count} unread');
});

test('Server layout awaits and validates the cookie, then seeds html and Providers with the same language', async () => {
  const layoutSource = readFileSync(new URL('../web/src/app/layout.tsx', import.meta.url), 'utf8');
  const layout = typescript.transpileModule(layoutSource, {
    compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS, jsx: typescript.JsxEmit.ReactJSX },
  }).outputText;
  for (const preference of [undefined, 'en', 'te', 'hi', '', 'fr', 'TE', 'te-IN', 'constructor']) {
    let reads = 0;
    const handlers = {};
    const Providers = () => null;
    runInNewContext(layout, { exports: handlers, require: specifier => {
      if (specifier === 'next/headers') return { cookies: async () => {
        reads++;
        return { get: key => { assert.equal(key, 'cp_lang'); return preference === undefined ? undefined : { value: preference }; } };
      } };
      if (specifier === '@/features/i18n/messages') return messages;
      if (specifier === './providers') return { Providers };
      if (specifier === './globals.css') return {};
      return require(specifier);
    } }, { filename: 'layout.tsx' });
    const rendered = await handlers.default({ children: 'synthetic child' });
    const expected = ['en', 'te', 'hi'].includes(preference) ? preference : 'en';
    assert.equal(reads, 1);
    assert.equal(rendered.type, 'html'); assert.equal(rendered.props.lang, expected);
    const provider = rendered.props.children.props.children;
    assert.equal(provider.type, Providers); assert.equal(provider.props.language, expected);
    assert.equal(provider.props.children, 'synthetic child');
  }
});
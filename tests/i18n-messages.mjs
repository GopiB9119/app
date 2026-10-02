// Loads web/src/features/i18n/messages.ts and the area files it imports, compiled one by one with TypeScript,
// without bundling, so the tests read exactly the dictionaries the screens use (T70, T98).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const typescript = require('typescript');
const folder = fileURLToPath(new URL('../web/src/features/i18n/', import.meta.url));

export function loadMessages() {
  const diagnostics = [];
  const loaded = new Map();
  function load(file) {
    if (loaded.has(file)) return loaded.get(file);
    const compiled = typescript.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS },
      reportDiagnostics: true, fileName: path.basename(file),
    });
    diagnostics.push(...compiled.diagnostics);
    const exports = {};
    loaded.set(file, exports);
    runInNewContext(compiled.outputText, { exports, require: specifier => {
      if (!/^\.\/areas\/[a-z]+$/.test(specifier)) throw new Error(`messages.ts may import only its area files, not ${specifier}`);
      return load(path.join(folder, `${specifier}.ts`));
    } }, { filename: path.relative(folder, file) });
    return exports;
  }
  const messages = load(path.join(folder, 'messages.ts'));
  return { messages, diagnostics };
}

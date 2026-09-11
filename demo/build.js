#!/usr/bin/env node
/* ---------------------------------------------------------------------------
 * build.js — produce the offline single-file demo
 *
 *   node demo/build.js   ->   satquery-demo.html   (repo root)
 *
 * Why this exists: the demo has to survive an unfamiliar laptop with no wifi
 * and no toolchain. A single HTML file you can double-click is the only form
 * that reliably does. ES modules cannot be imported over file://, so the
 * modules are linked into one inline <script type="module"> instead.
 *
 * Why it is a linker rather than a concatenation: several modules legitimately
 * define the same helper names at top level (clamp, escapeHtml). Pasting them
 * end to end would be a redeclaration error. So each module is wrapped in its
 * own function scope, returns its exports, and its imports are destructured
 * from the modules already built. That is roughly what a bundler does, in
 * about sixty lines and with no dependencies.
 *
 * No dependencies, on purpose — `node demo/build.js` must work on a machine
 * where `npm install` has never been run.
 * ------------------------------------------------------------------------- */

const fs = require('fs');
const path = require('path');

const DEMO_DIR = __dirname;
const OUT = path.join(DEMO_DIR, '..', 'satquery-demo.html');

/* Dependency order. Kept explicit rather than resolved from the import graph:
 * there are seven modules and a hand-written list is easier to verify than a
 * topological sort nobody reads. */
const MODULES = [
  'src/scene.js',
  'src/render.js',
  'src/api/mock.js',
  'src/ui/trace.js',
  'src/ui/chat.js',
  'src/ui/map.js',
  'src/main.js',
];

/* ---- module parsing ------------------------------------------------------ */

const IMPORT_RE = /^[ \t]*import\s+\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]\s*;?[ \t]*$/gms;
const EXPORT_LIST_RE = /^[ \t]*export\s*\{([^}]*)\}\s*;?[ \t]*$/gm;
const EXPORT_DECL_RE = /^([ \t]*)export\s+(?=(?:const|let|var|function|async function|class)\b)/gm;
const DECL_NAME_RE = /^[ \t]*export\s+(?:const|let|var|class|function|async\s+function)\s+([A-Za-z_$][\w$]*)/gm;

function resolveSpecifier(fromFile, spec) {
  const abs = path.resolve(path.dirname(path.join(DEMO_DIR, fromFile)), spec);
  return path.relative(DEMO_DIR, abs).split(path.sep).join('/');
}

function parseModule(rel) {
  const full = path.join(DEMO_DIR, rel);
  let src = fs.readFileSync(full, 'utf8');

  // Imports: record what each module needs, then strip the statements.
  const imports = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    imports.push({
      names: m[1].split(',').map((s) => s.trim()).filter(Boolean),
      from: resolveSpecifier(rel, m[2]),
    });
  }
  src = src.replace(IMPORT_RE, '');

  // Exports: both `export const foo` declarations and trailing `export { ... }`.
  const exported = new Set();
  for (const m of src.matchAll(DECL_NAME_RE)) exported.add(m[1]);
  for (const m of src.matchAll(EXPORT_LIST_RE)) {
    for (const n of m[1].split(',').map((s) => s.trim()).filter(Boolean)) exported.add(n);
  }
  src = src.replace(EXPORT_LIST_RE, '').replace(EXPORT_DECL_RE, '$1');

  if (/^\s*export\b/m.test(src)) {
    throw new Error(`${rel}: an export form this build does not handle is still present`);
  }

  return { rel, src, imports, exported: [...exported] };
}

function emitModule(mod) {
  const prelude = mod.imports
    .map((i) => `  const { ${i.names.join(', ')} } = __m[${JSON.stringify(i.from)}];`)
    .join('\n');
  const returns = mod.exported.length
    ? `  return { ${mod.exported.map((n) => `${n}: ${n}`).join(', ')} };`
    : '  return {};';

  return `/* ===== ${mod.rel} ===== */
__m[${JSON.stringify(mod.rel)}] = (function () {
${prelude}
${mod.src.trimEnd()}
${returns}
})();`;
}

/* ---- assemble ------------------------------------------------------------ */

function build() {
  const mods = MODULES.map(parseModule);

  // Every imported name must actually be exported by the module it comes from,
  // or the bundle fails at runtime with an undefined that is painful to trace.
  const byRel = new Map(mods.map((m) => [m.rel, m]));
  for (const m of mods) {
    for (const imp of m.imports) {
      const dep = byRel.get(imp.from);
      if (!dep) throw new Error(`${m.rel}: imports from ${imp.from}, which is not in MODULES`);
      if (MODULES.indexOf(imp.from) >= MODULES.indexOf(m.rel)) {
        throw new Error(`${m.rel}: imports ${imp.from}, which is built later — fix MODULES order`);
      }
      for (const n of imp.names) {
        if (!dep.exported.includes(n)) {
          throw new Error(`${m.rel}: imports "${n}" from ${imp.from}, which does not export it`);
        }
      }
    }
  }

  const css = fs.readFileSync(path.join(DEMO_DIR, 'styles.css'), 'utf8');
  const html = fs.readFileSync(path.join(DEMO_DIR, 'index.html'), 'utf8');

  const bundle = [
    'const __m = {};',
    ...mods.map(emitModule),
  ].join('\n\n');

  // Splice into the dev HTML so the two versions can never drift: the markup
  // is read from index.html rather than duplicated here.
  let out = html
    .replace(
      /<link rel="stylesheet" href="styles\.css">/,
      '<style>\n' + css.trim() + '\n</style>'
    )
    .replace(
      /<script type="module" src="src\/main\.js"><\/script>/,
      '<script type="module">\n' + bundle + '\n</script>'
    );

  // Check the tags are gone, not the strings — the module registry legitimately
  // contains "src/main.js" as a key.
  if (/href=["']styles\.css["']/.test(out) || /src=["']src\/main\.js["']/.test(out)) {
    throw new Error('index.html no longer matches the splice points this build expects');
  }

  const banner = `<!--
  SatQuery AI — offline demo build
  GENERATED FILE. Do not edit: run \`node demo/build.js\` instead.
  Source of truth is demo/. Built ${new Date().toISOString()}.

  This is a demo. Scenario data is scripted and the imagery is procedurally
  generated, not real satellite imagery. The app says so on screen and does not
  let you dismiss it. See CONTRACT.md INV-1 / INV-2.

  No network access required. No external fonts, scripts, styles or images.
-->
`;
  out = out.replace(/^<!DOCTYPE html>/i, '<!DOCTYPE html>\n' + banner.trim());

  fs.writeFileSync(OUT, out, 'utf8');

  // A build that silently produces a broken file is worse than no build, so
  // assert the things that would actually break it before declaring success.
  const checks = [
    [!/\bsrc=["']https?:/i.test(out), 'no external script src'],
    [!/<link[^>]+href=["']https?:/i.test(out), 'no external stylesheet'],
    [!/@import\s+url\(/i.test(out), 'no CSS @import'],
    [out.includes('DEMO BUILD'), 'demo label present'],
    [out.includes('__m["src/main.js"]'), 'entry module linked'],
  ];
  let ok = true;
  for (const [pass, label] of checks) {
    if (!pass) ok = false;
    console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${label}`);
  }
  if (!ok) throw new Error('build produced a file that failed its own checks');

  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`\nwrote ${path.relative(process.cwd(), OUT)}  (${kb} KB, ${mods.length} modules)`);
  console.log('open it directly in a browser — no server, no network.');
}

try {
  build();
} catch (err) {
  console.error('\nbuild failed: ' + err.message);
  process.exit(1);
}

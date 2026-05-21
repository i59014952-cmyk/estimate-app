// Build pipeline: compiles all JSX (Babel, classic runtime) and the inline app
// script into a single classic <script>, then minifies with Terser. The source
// files keep using global identifiers and window.* wiring, so Terser is told NOT
// to mangle top-level names (estimateCore.js exposes functions via window.*).
//
// Output: dist/ — a self-contained site with no source .jsx and no in-browser
// Babel. Develop against the root files as before; build only for publishing.

import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import babel from '@babel/core';
import { minify } from 'terser';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const BUNDLE_NAME = 'app.bundle.js';

// Static assets copied verbatim into dist.
const STATIC_FILES = [
  'styles.css',
  'styles-modals.css',
  'one.json',
  'two.json',
  'th.json',
  'client.html',
  'vendor.html',
  '.nojekyll',
];

const stripQuery = (s) => s.split('?')[0];

function parseScripts(html) {
  // Returns ordered list of { kind, ... } describing every <script> tag.
  const tags = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const inline = m[2];
    const srcMatch = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    const typeMatch = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i);
    const type = typeMatch ? typeMatch[1] : '';
    const isBabel = /text\/babel/i.test(type);
    if (srcMatch) {
      tags.push({ kind: 'src', src: srcMatch[1], isBabel, raw: m[0] });
    } else {
      tags.push({ kind: 'inline', code: inline, isBabel, raw: m[0] });
    }
  }
  return tags;
}

async function transformJsx(code, filename) {
  const out = await babel.transformAsync(code, {
    filename,
    babelrc: false,
    configFile: false,
    presets: [['@babel/preset-react', { runtime: 'classic' }]],
    comments: false,
  });
  return out.code;
}

async function main() {
  const html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
  const tags = parseScripts(html);

  const pieces = [];
  for (const tag of tags) {
    if (tag.kind === 'src') {
      if (/^https?:\/\//i.test(tag.src)) continue; // CDN handled separately in HTML
      const file = path.join(ROOT, stripQuery(tag.src));
      const code = await readFile(file, 'utf8');
      pieces.push(`// === ${stripQuery(tag.src)} ===`);
      pieces.push(tag.isBabel ? await transformJsx(code, file) : code);
    } else if (tag.isBabel) {
      // The inline application bootstrap script.
      pieces.push('// === inline app bootstrap ===');
      pieces.push(await transformJsx(tag.code, 'index-inline.jsx'));
    }
  }

  const combined = pieces.join('\n;\n');

  const minified = await minify(combined, {
    compress: { toplevel: false },
    mangle: { toplevel: false }, // keep top-level names — window.* relies on them
    format: { comments: false },
  });
  if (minified.error) throw minified.error;

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  await writeFile(path.join(DIST, BUNDLE_NAME), minified.code, 'utf8');

  // Build dist/index.html: drop @babel/standalone and all local source scripts,
  // keep CDN React/XLSX, inject the single bundle before </body>.
  let outHtml = html;
  for (const tag of tags) {
    if (tag.kind === 'src' && /babel\/standalone/i.test(tag.src)) {
      outHtml = outHtml.replace(tag.raw, '');
    } else if (tag.kind === 'src' && !/^https?:\/\//i.test(tag.src)) {
      outHtml = outHtml.replace(tag.raw, '');
    } else if (tag.kind === 'inline' && tag.isBabel) {
      outHtml = outHtml.replace(tag.raw, '');
    }
  }
  outHtml = outHtml.replace('</body>', `<script src="${BUNDLE_NAME}"></script>\n</body>`);
  await writeFile(path.join(DIST, 'index.html'), outHtml, 'utf8');

  for (const f of STATIC_FILES) {
    if (existsSync(path.join(ROOT, f))) {
      await cp(path.join(ROOT, f), path.join(DIST, f));
    }
  }

  console.log(`Built dist/ — bundle ${BUNDLE_NAME} (${(minified.code.length / 1024).toFixed(1)} KB minified)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function linksIn(text) {
  // Ignore fenced examples, inline code, and HTML comments, retaining line numbers.
  const blank = s => s.replace(/[^\n]/g, ' ');
  const prose = text.replace(/<!--[^]*?-->/g, blank)
    .replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[^]*?^ {0,3}\1[^\n]*$/gm, blank)
    .replace(/(`+)[^\n]*?\1/g, blank);
  const links = [];
  const add = (target, index) => links.push({ target, line: prose.slice(0, index).split('\n').length });
  for (const m of prose.matchAll(/!?\[[^\]\n]*\]\(\s*(<[^>]+>|(?:[^\s()]+|\([^()]*\))+)(?:\s+["'][^]*?["'])?\s*\)/g)) add(m[1].replace(/^<|>$/g, ''), m.index);
  for (const m of prose.matchAll(/^ {0,3}\[[^\]\n]+\]:\s*<?([^\s>]+)>?/gm)) add(m[1], m.index);
  for (const m of prose.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/g)) add(m[1], m.index);
  return links;
}

export function resolveLink(source, target) {
  if (!target || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(target)) return null;
  const pathname = target.split(/[?#]/)[0];
  if (!pathname) return null;
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return pathname; }
  return path.posix.normalize(target.startsWith('/') ? decoded.slice(1) : path.posix.join(path.posix.dirname(source), decoded));
}

export function checkDocLinks(root, files) {
  files ??= execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean);
  const tracked = new Set(files);
  const directories = new Set();
  for (const file of files) for (let dir = path.posix.dirname(file); dir !== '.'; dir = path.posix.dirname(dir)) directories.add(dir);
  const errors = [];
  for (const source of files.filter(f => /\.md$/i.test(f))) {
    if (!existsSync(path.join(root, source))) continue; // sparse checkout
    for (const {target, line} of linksIn(readFileSync(path.join(root, source), 'utf8'))) {
      const resolved = resolveLink(source, target);
      if (resolved !== null && resolved !== '.' && !tracked.has(resolved) && !directories.has(resolved) && !existsSync(path.join(root, resolved))) errors.push({source, line, target, resolved});
    }
  }
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] || '.');
  const errors = checkDocLinks(root);
  for (const e of errors) console.error(`${e.source}:${e.line}: ${e.target} -> ${e.resolved}`);
  console.log(`Dokumentlinks: ${errors.length} tote relative Links`);
  process.exitCode = errors.length ? 1 : 0;
}

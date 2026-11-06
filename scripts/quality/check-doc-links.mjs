#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
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
  // Immutable source snapshots retain original relative links. Their manifest maps
  // original source paths to preserved files, so links resolve in that source context.
  const snapshots = new Map();
  for (const file of files.filter(f => f.endsWith('/manifest.json') && f.startsWith('docs/'))) {
    if (!existsSync(path.join(root, file))) continue;
    let manifest;
    try { manifest = JSON.parse(readFileSync(path.join(root, file), 'utf8')); } catch { continue; }
    if (manifest.state !== 'PRESERVED_PROPOSAL_NOT_APPROVED' || !Array.isArray(manifest.files)) continue;
    const valid = manifest.files.every(f => typeof f.archivePath === 'string' && typeof f.sourcePath === 'string'
      && existsSync(path.join(root, f.archivePath))
      && createHash('sha256').update(readFileSync(path.join(root, f.archivePath))).digest('hex') === f.sha256);
    if (valid) for (const f of manifest.files) snapshots.set(f.archivePath, {file: f, files: manifest.files});
  }
  const errors = [];
  for (const source of files.filter(f => /\.md$/i.test(f))) {
    const content = existsSync(path.join(root, source)) ? readFileSync(path.join(root, source), 'utf8')
      : execFileSync('git', ['show', `:${source}`], {cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
    for (const {target, line} of linksIn(content)) {
      let resolved = resolveLink(source, target);
      const snapshot = snapshots.get(source);
      if (snapshot && resolved !== null) {
        const originalTarget = resolveLink(snapshot.file.sourcePath, target);
        resolved = snapshot.files.find(f => f.sourcePath === originalTarget)?.archivePath ?? resolved;
      }
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

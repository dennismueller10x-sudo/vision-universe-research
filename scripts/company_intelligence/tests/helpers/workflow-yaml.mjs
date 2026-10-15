/* Kleiner, abhaengigkeitsfreier Parser fuer die YAML-Teilmenge der GitHub-Workflows (nur fuer Tests).
 *
 * Unterstuetzt: Mappings, Sequenzen (auch kompakt "- key: v"), Plain-/Einfach-/Doppelt-quotierte Skalare (einzeilig),
 * Block-Skalare | und > mit Chomping (|- |+ >- >+), Kommentare, einfache Flow-Listen/-Maps (auch ueber mehrere Zeilen), fuehrendes "---".
 * Schluessel "on" bleibt der String "on" (GitHub); Werte true/false/null/Ganzzahlen/Dezimalzahlen werden aufgeloest.
 *
 * Alles andere wirft einen Fehler mit Zeilennummer (YamlSubsetError): Anker/Aliasse/Tags/Merge-Keys, komplexe Schluessel,
 * mehrzeilige Plain-/Quoted-Skalare, Einrueckungsindikatoren, Tabs als Einrueckung, doppelte
 * Schluessel, mehrere Dokumente, mehrdeutige Plain-Werte (yes/no/on/off, Zeitstempel, Sexagesimal, 0123, 1_000, .inf, ...).
 * Es soll nie still falsch parsen. Verwendung: parseYaml(text), loadYamlFile(path). */
import {readFileSync} from 'node:fs';

export class YamlSubsetError extends Error {
 constructor(message, line) { super(`YAML-Teilmenge: ${message}${line ? ` (Zeile ${line})` : ''}`); this.name = 'YamlSubsetError'; this.line = line; }
}

const fail = (msg, line) => { throw new YamlSubsetError(msg, line); };

function resolvePlain(text, line, {key = false} = {}) {
 if (text === '') return null;
 if (key) {
  if (/^(?:y|n|yes|no|true|false|off|null|~)$/i.test(text) && text !== 'on') fail('mehrdeutiger Schluessel ' + text, line);
  return text;
 }
 if (text === '~' || /^(?:null|Null|NULL)$/.test(text)) return null;
 if (/^(?:true|True|TRUE)$/.test(text)) return true;
 if (/^(?:false|False|FALSE)$/.test(text)) return false;
 if (/^(?:y|n|yes|no|on|off)$/i.test(text)) fail('mehrdeutiger Plain-Wert ' + text + ' (quotieren)', line);
 if (/^[-+]?(?:0|[1-9][0-9]*)$/.test(text)) return Number(text);
 if (/^[-+]?(?:[0-9]+\.[0-9]*|\.[0-9]+)$/.test(text) && !/^[-+]?0[0-9]/.test(text)) return Number(text);
 if (/^[-+]?(?:0[0-9_]|0b|0x|0o)/i.test(text) || /^[-+]?[0-9][0-9_]*_[0-9_]*$/.test(text) || /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+(?:\.[0-9_]*)?$/.test(text)
  || /^[-+]?(?:\.inf|\.nan)$/i.test(text) || /^[-+]?[0-9][0-9_]*(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/.test(text) || /^\d{4}-\d\d?-\d\d?(?:$|[Tt ]\d)/.test(text)
  || /^[-+]?[0-9_]*\.[0-9_]*$/.test(text)) fail('mehrdeutiger Plain-Wert ' + text, line);
 return text;
}

function checkPlainStart(text, line) {
 if (/^[&*!%@`|>?]/.test(text) || /^-(?:\s|$)/.test(text) || /^:(?:\s|$)/.test(text)) fail('nicht unterstuetzter Skalaranfang "' + text.slice(0, 20) + '"', line);
 if (/^[\[{]/.test(text)) fail('Flow-Collection nicht an dieser Stelle', line);
 if (/:(?:\s|$)/.test(text)) fail('Doppelpunkt im Plain-Skalar (mehrdeutig)', line);
}

/** Einzeiliger quotierter Skalar am Anfang von text; liefert {value, rest}. */
function readQuoted(text, line) {
 const q = text[0];
 let out = '', i = 1;
 for (; i < text.length; i++) {
  const c = text[i];
  if (q === "'") {
   if (c === "'") { if (text[i + 1] === "'") { out += "'"; i++; continue; } break; }
   out += c;
  } else {
   if (c === '"') break;
   if (c === '\\') {
    const n = text[++i];
    const map = {n: '\n', t: '\t', '"': '"', '\\': '\\', '/': '/', r: '\r', 0: '\0', ' ': ' '};
    if (!(n in map)) fail('nicht unterstuetzte Escape-Sequenz \\' + n, line);
    out += map[n];
   } else out += c;
  }
 }
 if (i >= text.length) fail('quotierter Skalar nicht in derselben Zeile beendet (mehrzeilig nicht unterstuetzt)', line);
 return {value: out, rest: text.slice(i + 1)};
}

function endOfValue(rest, line) {
 const t = rest.trim();
 if (t !== '' && !/^#/.test(rest.trimStart()) ) fail('unerwarteter Text nach Wert: ' + t.slice(0, 30), line);
 if (t !== '' && !/^\s/.test(rest)) fail('Kommentar ohne Leerzeichen', line);
}

function stripComment(text) {
 const m = /(^|\s)#/.exec(text);
 return (m ? text.slice(0, m.index) : text).trimEnd();
}

/** Einzeilige Flow-Collection ab text[0] in '[' oder '{'. */
function parseFlow(text, line) {
 let i = 0;
 const ws = () => { while (text[i] === ' ') i++; };
 const scalar = (stops) => {
  ws();
  if (text[i] === '"' || text[i] === "'") { const {value, rest} = readQuoted(text.slice(i), line); i = text.length - rest.length; return {v: value, quoted: true}; }
  let j = i;
  while (j < text.length && !stops.includes(text[j])) j++;
  const raw = text.slice(i, j).trim(); i = j;
  if (/^[&*!]/.test(raw)) fail('Anker/Alias/Tag im Flow', line);
  if (/[\[\]{}]/.test(raw)) fail('Klammer im Flow-Plain-Skalar', line);
  return {v: raw, quoted: false};
 };
 const value = () => {
  ws();
  if (text[i] === '[') {
   i++; const arr = [];
   ws();
   if (text[i] === ']') { i++; return arr; }
   for (;;) {
    arr.push(value()); ws();
    if (text[i] === ',') { i++; ws(); if (text[i] === ']') { i++; return arr; } continue; }
    if (text[i] === ']') { i++; return arr; }
    fail('Flow-Liste nicht beendet (nicht beendet)', line);
   }
  }
  if (text[i] === '{') {
   i++; const obj = {};
   ws();
   if (text[i] === '}') { i++; return obj; }
   for (;;) {
    const k = scalar([':', ',', '}']); ws();
    if (text[i] !== ':') fail('Flow-Map ohne Doppelpunkt', line);
    i++;
    const v = value();
    const key = k.quoted ? k.v : resolvePlain(k.v, line, {key: true});
    if (Object.hasOwn(obj, key)) fail('doppelter Schluessel ' + key, line);
    obj[key] = v; ws();
    if (text[i] === ',') { i++; ws(); if (text[i] === '}') { i++; return obj; } continue; }
    if (text[i] === '}') { i++; return obj; }
    fail('Flow-Map nicht beendet (mehrzeilig nicht unterstuetzt)', line);
   }
  }
  const s = scalar([',', ']', '}']);
  return s.quoted ? s.v : resolvePlain(s.v, line);
 };
 const v = value();
 return {value: v, rest: text.slice(i)};
}

/** Trennt "key: rest" bzw. "key:" ; null wenn die Zeile kein Mapping-Eintrag ist. */
function splitKey(text, line) {
 if (text[0] === '"' || text[0] === "'") {
  const {value, rest} = readQuoted(text, line);
  const m = /^\s*:(?:\s+(.*)|$)/.exec(rest);
  return m ? {key: value, rest: m[1] ?? ''} : null;
 }
 if (/^[\[{]/.test(text)) return null;
 const m = /^(.*?):(?:\s+(.*)|$)/.exec(text);
 if (!m) return null;
 const key = m[1].trim();
 if (key === '' ) fail('leerer Schluessel', line);
 if (/^[&*!?]/.test(key) || key === '<<') fail('Anker/Alias/Tag/Merge-Key/komplexer Schluessel', line);
 return {key: resolvePlain(key, line, {key: true}), rest: m[2] ?? ''};
}

/** Kommentar am Zeilenende einer Flow-Zeile abschneiden, Anfuehrungszeichen beachten. */
function stripFlowComment(text) {
 let q = null;
 for (let i = 0; i < text.length; i++) {
  const c = text[i];
  if (q) { if (c === q) { if (q === "'" && text[i + 1] === "'") i++; else q = null; } else if (q === '"' && c === '\\') i++; continue; }
  if (c === '"' || c === "'") q = c;
  else if (c === '#' && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i).trimEnd();
 }
 return text;
}

/** Offene Klammern ausserhalb von Anfuehrungszeichen (fuer mehrzeilige Flow-Collections). */
function flowDepth(text) {
 let depth = 0, q = null;
 for (let i = 0; i < text.length; i++) {
  const c = text[i];
  if (q) { if (c === q) { if (q === "'" && text[i + 1] === "'") i++; else q = null; } else if (q === '"' && c === '\\') i++; continue; }
  if (c === '"' || c === "'") q = c;
  else if (c === '[' || c === '{') depth++;
  else if (c === ']' || c === '}') depth--;
 }
 return depth;
}

function foldLines(lines) {
 let out = '', prev = null, empties = 0;
 for (const l of lines) {
  if (l === '') { empties++; continue; }
  const more = /^[ \t]/.test(l);
  if (prev === null) out += '\n'.repeat(empties) + l;
  else if (more || prev.more) out += '\n' + '\n'.repeat(empties) + l;
  else out += empties ? '\n'.repeat(empties) + l : ' ' + l;
  prev = {more}; empties = 0;
 }
 return {text: out, trailing: empties};
}

export function parseYaml(source) {
 const raw = String(source).replace(/\r\n?/g, '\n').split('\n');
 if (raw.at(-1) === '') raw.pop();
 const lines = raw.map((text, i) => ({n: i + 1, text}));
 let pos = 0;
 if (/^﻿/.test(lines[0]?.text ?? '')) lines[0].text = lines[0].text.slice(1);
 const indentOf = t => /^ */.exec(t)[0].length;
 const structural = cur => { if (/^ *\t/.test(cur.text)) fail('Tab in Einrueckung', cur.n); return cur; };
 const blank = t => /^\s*(#.*)?$/.test(t);
 const skip = () => { while (pos < lines.length && blank(lines[pos].text)) pos++; };

 function blockScalar(header, parentIndent, line) {
  const m = /^([|>])([-+]?)\s*(?:#.*)?$/.exec(header);
  if (!m) fail('nicht unterstuetzter Block-Skalar-Kopf "' + header.slice(0, 12) + '" (Einrueckungsindikator?)', line);
  const [, style, chomp] = m;
  const body = [];
  let blockIndent = -1;
  while (pos < lines.length) {
   const t = lines[pos].text;
   if (t.trim() === '') { body.push(''); pos++; continue; }
   const ind = indentOf(t);
   if (blockIndent < 0) { if (ind <= parentIndent) break; blockIndent = ind; }
   if (ind < blockIndent) break;
   body.push(t.slice(blockIndent)); pos++;
  }
  let trailing = 0;
  while (body.length && body.at(-1) === '') { body.pop(); trailing++; }
  let text;
  if (style === '|') text = body.join('\n');
  else text = foldLines(body).text;
  if (body.length === 0) return chomp === '+' ? '\n'.repeat(trailing) : '';
  if (chomp === '-') return text;
  if (chomp === '+') return text + '\n'.repeat(trailing + 1);
  return text + '\n';
 }

 function scalarValue(rest, parentIndent, line) {
  const t = rest.trim();
  if (t === '' || t[0] === '#') return undefined; // leer: Verschachtelung oder null
  if (t[0] === '|' || t[0] === '>') return blockScalar(t, parentIndent, line);
  if (t[0] === '"' || t[0] === "'") { const {value, rest: r} = readQuoted(t, line); endOfValue(r, line); return value; }
  if (t[0] === '[' || t[0] === '{') {
   let text = t;
   while (flowDepth(text) > 0 && pos < lines.length) { const nxt = lines[pos++].text.trim(); if (nxt !== '' && nxt[0] !== '#') text += ' ' + stripFlowComment(nxt); }
   const {value, rest: r} = parseFlow(text, line); endOfValue(r, line); return value;
  }
  const plain = stripComment(t);
  checkPlainStart(plain, line);
  return resolvePlain(plain, line);
 }

 function parseBlock(indent) {
  skip();
  if (pos >= lines.length) return null;
  const cur = structural(lines[pos]);
  const ind = indentOf(cur.text);
  if (ind < indent) return null;
  const body = cur.text.slice(ind);
  if (/^-(?:\s|$)/.test(body)) return parseSeq(ind);
  if (splitKey(stripCommentSafe(body), cur.n)) return parseMap(ind);
  pos++;
  const v = scalarValue(body, ind - 1, cur.n);
  skip();
  if (pos < lines.length && indentOf(lines[pos].text) >= indent) fail('mehrzeiliger Plain-Skalar nicht unterstuetzt', lines[pos].n);
  return v === undefined ? null : v;
 }
 function stripCommentSafe(body) { return body[0] === '"' || body[0] === "'" ? body : stripComment(body); }

 function parseMap(indent) {
  const obj = {};
  for (;;) {
   skip();
   if (pos >= lines.length) break;
   const cur = structural(lines[pos]), ind = indentOf(cur.text);
   if (ind < indent) break;
   if (ind > indent) fail('unerwartete Einrueckung', cur.n);
   const body = cur.text.slice(ind);
   if (/^-(?:\s|$)/.test(body)) break; // Sequenz auf gleicher Ebene gehoert dem Elternschluessel (unten behandelt)
   const kv = splitKey(body, cur.n);
   if (!kv) fail('Mapping-Eintrag erwartet', cur.n);
   if (Object.hasOwn(obj, kv.key)) fail('doppelter Schluessel ' + kv.key, cur.n);
   pos++;
   let v = scalarValue(kv.rest, indent, cur.n);
   if (v === undefined) {
    skip();
    const next = pos < lines.length ? lines[pos] : null;
    const nind = next ? indentOf(next.text) : -1;
    if (next && nind > indent) v = parseBlock(nind);
    else if (next && nind === indent && /^-(?:\s|$)/.test(next.text.slice(nind))) v = parseSeq(nind);
    else v = null;
   }
   obj[kv.key] = v;
  }
  return obj;
 }

 function parseSeq(indent) {
  const arr = [];
  for (;;) {
   skip();
   if (pos >= lines.length) break;
   const cur = structural(lines[pos]), ind = indentOf(cur.text);
   if (ind < indent) break;
   if (ind > indent) fail('unerwartete Einrueckung in Sequenz', cur.n);
   const body = cur.text.slice(ind);
   if (!/^-(?:\s|$)/.test(body)) break;
   const after = body.slice(1);
   const lead = /^ */.exec(after)[0].length;
   const content = after.slice(lead);
   if (content === '' || content[0] === '#') {
    pos++; skip();
    const next = pos < lines.length ? lines[pos] : null;
    arr.push(next && indentOf(next.text) > indent ? parseBlock(indentOf(next.text)) : null);
    continue;
   }
   if (/^-(?:\s|$)/.test(content)) fail('verschachtelte Sequenz "- -" nicht unterstuetzt', cur.n);
   const childIndent = ind + 1 + lead;
   if (splitKey(stripCommentSafe(content), cur.n)) {
    lines[pos] = {n: cur.n, text: ' '.repeat(childIndent) + content}; // kompaktes Mapping: Zeile umschreiben
    arr.push(parseMap(childIndent));
   } else {
    pos++;
    const v = scalarValue(content, ind, cur.n);
    arr.push(v === undefined ? null : v);
   }
  }
  return arr;
 }

 skip();
 if (pos < lines.length && /^---\s*(#.*)?$/.test(lines[pos].text)) pos++;
 const root = parseBlock(0);
 skip();
 if (pos < lines.length) {
  if (/^(---|\.\.\.)(\s|$)/.test(lines[pos].text)) fail('mehrere Dokumente nicht unterstuetzt', lines[pos].n);
  fail('nicht verarbeitete Zeile', lines[pos].n);
 }
 return root;
}

export function loadYamlFile(path) { return parseYaml(readFileSync(path, 'utf8')); }

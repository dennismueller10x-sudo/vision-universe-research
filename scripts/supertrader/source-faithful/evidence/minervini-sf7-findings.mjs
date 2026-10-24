/**
 * Supertrader 7.0 Minervini source inventory: page-by-page re-reading of the three Minervini books the owner supplied
 * (#709 source library B12, B07, B03; owner Dropbox, identical bytes). Writes MINERVINI-SF7-FINDINGS.json: every finding
 * the #709 rows lacked or captured only partially, with source, PDF page, German paraphrase, modal force, numbers and
 * the SHA-256 of the normalised original-language passage. Book text is NOT exported into the repository (#709 rule
 * content_exported_to_repo false): the quote hash lets anyone holding the same book bytes verify a finding without the
 * repository carrying copyrighted text.
 *
 * Inputs (private, never committed): --books <dir> with B12.pdf, B07.pdf, B03.pdf (SHA-256 checked against #709), the page texts
 * (b12pages/pNNN.txt from pdftotext, B03_paged.txt from tesseract vie OCR, B07.txt from the Dropbox text extraction) and
 * the reviewer finding files find_b12_a.json, find_b12_b.json, find_b07.json, find_b03.json. Every quote must be an exact
 * substring (whitespace-normalised) of its page, otherwise the build fails.
 *
 *   node scripts/supertrader/source-faithful/evidence/minervini-sf7-findings.mjs --books <dir> [--out <file>]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_FINDINGS = path.join(HERE, 'MINERVINI-SF7-FINDINGS.json');
/** Book identity: #709 SOURCE-LIBRARY sha256 (PDF bytes) and the owner Dropbox content hash of the same file. */
export const BOOKS = Object.freeze({
  B12: Object.freeze({ title: 'Trade Like a Stock Market Wizard (2013), Indonesian machine-like translation', pdfSha256: '2ba966edc23215a897f4529e616c0c0c4f99b242eafae9826dfbbd0c45a54697', dropboxContentHash: '7c988844d9531143c6048c69d471c7c9cba04c1256a3f24dceaff9e53d820a2f', pages: 442, text: 'pdftotext -layout (text layer)' }),
  B07: Object.freeze({ title: 'Momentum Masters (2015), unofficial Indonesian translation', pdfSha256: 'd3fd7f0f1724e6f3ee214a6b2bd5ae40b98cb9da85c273057642638aaab1118a', dropboxContentHash: 'a7fde043270895ddaf53767f93073b2010c0aec1ac5683f483ddc116531dc0ed', pages: 113, text: 'Dropbox text extraction (page markers "Halm. N dari 113")' }),
  B03: Object.freeze({ title: 'Think & Trade Like a Champion (2017), licensed Vietnamese translation', pdfSha256: 'ad332a52d3e9bfa4d9e34aa11123a994a16a15956dba3fe3d93c97d066ba16d2', dropboxContentHash: 'ca3d56ae603a9e9abb105ecd3a1c4fcc546e477ec0a3ad03a4359a160134aa08', pages: 272, text: 'tesseract 5 OCR, language vie, 200 dpi (image-only PDF; digits OCR-sensitive)' }),
});
const FILES = Object.freeze([['B12', 'find_b12_a.json'], ['B12', 'find_b12_b.json'], ['B07', 'find_b07.json'], ['B03', 'find_b03.json']]);
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

function pageTexts(dir) {
  const b12 = new Map(); for (const f of fs.readdirSync(path.join(dir, 'b12pages'))) b12.set(Number(f.slice(1, 4)), norm(fs.readFileSync(path.join(dir, 'b12pages', f), 'utf8')));
  const b07 = new Map(), raw7 = fs.readFileSync(path.join(dir, 'B07.txt'), 'utf8').split(/Halm\. (\d+) dari 113/);
  for (let i = 1; i < raw7.length - 1; i += 2) b07.set(Number(raw7[i]), norm(raw7[i + 1]));
  const b03 = new Map(), raw3 = fs.readFileSync(path.join(dir, 'B03_paged.txt'), 'utf8').split(/=== PDF PAGE (\d+) ===/);
  for (let i = 1; i < raw3.length - 1; i += 2) b03.set(Number(raw3[i]), norm(raw3[i + 1]));
  return { B12: b12, B07: b07, B03: b03 };
}

export function buildFindings(dir) {
  for (const id of ['B12', 'B07', 'B03']) { const h = sha256(fs.readFileSync(path.join(dir, `${id}.pdf`))); if (h !== BOOKS[id].pdfSha256) throw new Error(`BOOK_HASH_MISMATCH:${id}`); }
  const pages = pageTexts(dir), rows = [];
  for (const [src, file] of FILES) {
    for (const f of JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))) {
      const q = norm(f.quote_original), page = pages[src].get(f.pdf_page);
      // B07: a quote may sit across a page marker; accept the neighbouring page and record the page given
      const ok = page?.includes(q) || (src === 'B07' && (pages.B07.get(f.pdf_page + 1)?.includes(q) || pages.B07.get(f.pdf_page - 1)?.includes(q)));
      if (!ok) throw new Error(`QUOTE_NOT_ON_PAGE:${src}:${f.pdf_page}`);
      rows.push({ source: src, pdfPage: f.pdf_page, printedPage: f.printed_page || null, questions: f.q, modal: f.modal, numbers: f.numbers || null, paraphraseDe: f.paraphrase_de, coveredBy: f.covered_by, novelty: f.novelty || null, quoteSha256: sha256(q), quoteChars: q.length });
    }
  }
  rows.sort((a, b) => a.source.localeCompare(b.source) || a.pdfPage - b.pdfPage || a.quoteSha256.localeCompare(b.quoteSha256));
  rows.forEach((r, k) => { r.id = `F7-${r.source}-${String(r.pdfPage).padStart(3, '0')}-${String(k + 1).padStart(3, '0')}`; });
  const count = (pred) => rows.filter(pred).length;
  return {
    schema: 'supertrader-sf7-minervini-findings-1.0.0',
    books: BOOKS,
    method: 'four independent readers (one per book or half book) against the 132 #709 Minervini rows; every quote machine-checked as an exact substring of its page; translation and OCR doubts tagged TRANSLATION; paraphrases in German; human verification of every finding that changes a contract, a variant or a diagnostic (docs/SUPERTRADER_7_MINERVINI_SOURCE_INVENTORY.md section 4)',
    contentExportedToRepo: false,
    counts: { findings: rows.length, bySource: { B12: count((r) => r.source === 'B12'), B07: count((r) => r.source === 'B07'), B03: count((r) => r.source === 'B03') }, notCoveredBy709: count((r) => r.coveredBy === 'NONE'), partiallyCovered: count((r) => /^PARTIAL/.test(r.coveredBy ?? '')), translationFlags: count((r) => r.questions.includes('TRANSLATION')) },
    findings: rows,
  };
}

let cached = null;
export function loadFindings(file = DEFAULT_FINDINGS) {
  if (file === DEFAULT_FINDINGS && cached) return cached;
  const x = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (file === DEFAULT_FINDINGS) cached = x;
  return x;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  if (!get('--books')) throw new Error('usage: --books <dir>');
  const out = get('--out') ? path.resolve(get('--out')) : DEFAULT_FINDINGS;
  const x = buildFindings(path.resolve(get('--books')));
  fs.writeFileSync(out, JSON.stringify(x, null, 1) + '\n');
  process.stdout.write(JSON.stringify({ out: path.relative(process.cwd(), out), ...x.counts }) + '\n');
}

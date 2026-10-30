// Produktivstart-Konfiguration: ein Schritt, nur zulaessige Kombinationen, schreibt nie ins Repository (Kopie im Temp-Ordner).
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {goLiveConfig} from '../go-live-config.mjs';

const repo = new URL('../../../', import.meta.url).pathname;
function copy({clean = false} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vu-golive-'));
  mkdirSync(join(root, 'workers/vu-account/src/legal'), {recursive: true});
  copyFileSync(join(repo, 'workers/vu-account/wrangler.toml'), join(root, 'workers/vu-account/wrangler.toml'));
  let texts = readFileSync(join(repo, 'workers/vu-account/src/legal/texts.mjs'), 'utf8');
  if (clean) {
    // Abnahme simuliert: Stellen ersetzt (Definitionen der Helfer bleiben vor DOCS).
    const at = texts.indexOf('export const DOCS');
    texts = texts.slice(0, at) + texts.slice(at).replace(/(OPEN|CHECK)\((['`])[^'`]*\2\)/g, "'geprueft'");
  }
  writeFileSync(join(root, 'workers/vu-account/src/legal/texts.mjs'), texts);
  return root;
}
const read = (root, f) => readFileSync(join(root, f), 'utf8');

test('Entwuerfe mit offenen Stellen: keine Freigabe, keine Datei geaendert', () => {
  const root = copy();
  const before = read(root, 'workers/vu-account/wrangler.toml');
  assert.throws(() => goLiveConfig({root, legalVersion: 'vu-recht-2026-11-10-1', tax: 'automatic', checkout: 'public'}), /OFFEN/);
  assert.throws(() => goLiveConfig({root, checkout: 'public'}), /Nicht zulaessig/);
  assert.equal(read(root, 'workers/vu-account/wrangler.toml'), before);
});

test('nach der Abnahme: Texte freigegeben, Fassung bestaetigt, Steuer, oeffentlich, Brevo – in einem Schritt', () => {
  const root = copy({clean: true});
  assert.throws(() => goLiveConfig({root, legalVersion: 'vu-recht-2026-11-10-1', tax: 'none', checkout: 'public', dryRun: true}), /STRIPE_TAX_MODE/, 'ohne USt-Ausweis nicht oeffentlich');
  const r = goLiveConfig({root, legalVersion: 'vu-recht-2026-11-10-1', tax: 'automatic', checkout: 'public', brevoSync: 'true', newsletter: 'true'});
  assert.equal(r.changes.length, 5);
  assert.match(read(root, 'workers/vu-account/src/legal/texts.mjs'), /LEGAL_STATUS = 'freigegeben'/);
  const toml = read(root, 'workers/vu-account/wrangler.toml');
  for (const line of ['VU_LEGAL_APPROVED = "vu-recht-2026-11-10-1"', 'STRIPE_TAX_MODE = "automatic"', 'VU_CHECKOUT_ACCESS = "public"',
    'VU_BREVO_SYNC = "true"', 'VU_NEWSLETTER = "true"']) assert.ok(toml.includes(line), line);
  const dev = toml.slice(0, toml.indexOf('[env.production]'));
  assert.ok(dev.includes('VU_LEGAL_APPROVED = ""') && !dev.includes('VU_CHECKOUT_ACCESS = "public"'), 'Entwicklungsabschnitt unveraendert');
});

test('Probelauf schreibt nichts; Brevo allein ist ohne Rechtsfreigabe zulaessig', () => {
  const root = copy();
  const before = read(root, 'workers/vu-account/wrangler.toml');
  goLiveConfig({root, brevoSync: 'true', dryRun: true});
  assert.equal(read(root, 'workers/vu-account/wrangler.toml'), before);
  goLiveConfig({root, brevoSync: 'true'});
  assert.ok(read(root, 'workers/vu-account/wrangler.toml').includes('VU_BREVO_SYNC = "true"'));
});

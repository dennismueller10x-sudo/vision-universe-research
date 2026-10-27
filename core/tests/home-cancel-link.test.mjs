import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accountsEnabled, cancelLinkItem } from '../../scripts/home/cancel-link.mjs';

/* Kuendigungslink (§ 312k BGB) im Footer der Startseite: nur in der Spalte
   "Rechtliches", nur bei freigeschalteten Konten, ohne Konten ist /index.html unveraendert. */
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = p => readFileSync(join(root, p), 'utf8');
const config = endpoint => `globalThis.VU_ACCOUNT_CONFIG = {endpoint: ${JSON.stringify(endpoint)}};`;

test('Link erscheint nur mit Konto-Endpunkt', () => {
  assert.equal(cancelLinkItem(config('')), '');
  assert.equal(cancelLinkItem(config('javascript:alert(1)')), '');
  assert.equal(accountsEnabled(config('https://account.visionuniverse.de')), true);
  assert.match(cancelLinkItem(config('https://account.visionuniverse.de')), /^\n {8}<li><a href="\/konto\/kuendigen\/">Verträge hier kündigen<\/a><\/li>$/);
});

test('Platzhalter steht einmal, in der Spalte Rechtliches', () => {
  const template = read('scripts/home/index.template.html');
  assert.equal(template.split('%%CANCEL_LINK%%').length, 2);
  const legal = template.match(/<h4>Rechtliches<\/h4><ul>([\s\S]*?)<\/ul>/)[1];
  assert.match(legal, /Kontakt<\/a><\/li>%%CANCEL_LINK%%\s*$/);
  // Navigation und Kopf unveraendert: kein Konto-/Kuendigungseintrag ausserhalb des Footers.
  const beforeFooter = template.slice(0, template.indexOf('<footer'));
  assert.ok(!/kuendigen|CANCEL_LINK/.test(beforeFooter));
});

test('Ohne Konten enthaelt /index.html keinen Kuendigungslink', () => {
  if (accountsEnabled(read('konto/config.js'))) return;
  assert.ok(!read('index.html').includes('/konto/kuendigen/'));
});

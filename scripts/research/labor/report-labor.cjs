#!/usr/bin/env node
'use strict';
// Strang G: Berichte. Öffentlich (docs/research/labor/BERICHT.md): nur Zustände, Auswahl, Urteile, ohne Zahlen.
// Privat (--private-out, außerhalb des Repositorys): vollständige Tabellen mit Zahlen aus den entsiegelten Dateien.
//
//   node scripts/research/labor/report-labor.cjs [--dev FILE --test FILE --holdout FILE --private-out FILE]
// FILE = entsiegelter Klartext (run-labor.cjs --phase open). Ohne Klartext nur der öffentliche Teil.
const fs = require('node:fs');
const path = require('node:path');
const Pr = require('./protocol.cjs');
const St = require('./stats.cjs');
const ROOT = Pr.ROOT, RUNS = path.join(ROOT, 'docs/research/labor/runs');
const a = {}; for (let i = 2; i < process.argv.length; i += 2) a[process.argv[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = process.argv[i + 1];
const rj = f => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const pct = x => (Number.isFinite(x) ? (x * 100).toFixed(1).replace('.', ',') + ' %' : '–');
const num = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '–');

const sel = rj(path.join(RUNS, 'selection.json')), tp = rj(path.join(RUNS, 'test-public.json')), hp = rj(path.join(RUNS, 'holdout-public.json'));
const fam = Object.fromEntries(Pr.variants().map(v => [v.id, v.family]));

function publicReport() {
  const L = ['# Strang G – Strategie-Labor: Bericht', '', '**Forschung, nicht zertifiziert.** Nach dem eingefrorenen [Protokoll](PROTOKOLL.md) (SHA-256 `' + Pr.PROTOCOL_SHA256 + '`). Renditezahlen nur im privaten Bericht an den Owner.', ''];
  if (!sel) { L.push('Status: Suche (dev) noch nicht gerechnet.'); return L.join('\n') + '\n'; }
  L.push('## Suche 2016–2023', '', `- Registrierte Varianten: ${sel.trials}; Zustände: ${Object.entries(sel.states).map(([k, v]) => k + ' ' + v).join(', ')}.`);
  if (sel.blocked.length) L.push(`- Nicht gerechnet (blockiert): ${sel.blocked.map(b => b.id + ' (' + b.reason + ')').join(', ')}.`);
  L.push(`- Walk-forward 2018–2023: Die Auswahlregel selbst ${sel.walkForwardSelectorBeatsSpy ? 'lag vor' : 'lag nicht vor'} SPY.`);
  L.push(`- Kandidaten für die Prüfung (vor dem Prüfteil festgeschrieben, Klartext-Hash \`${sel.devPlaintextSha256.slice(0, 16)}…\`): ${sel.candidates.length ? sel.candidates.map(c => c.id + (c.track === 'LOW_LOSS' ? ' (Weg weniger Verlust)' : '')).join(', ') : 'keine'}.`, '');
  if (!sel.candidates.length) L.push('**Urteil: keine Strategie besteht.** Keine Variante erfüllte in der Suche die Zulassungsregeln (§7).', '');
  if (tp) {
    L.push('## Prüfung 2024-01-01 bis 2026-10-02 (einmalig)', '', '| Kandidat | Familie | Weg | über SPY | weniger Verlust | Urteil nach Prüfung |', '|---|---|---|---|---|---|');
    for (const c of tp.candidates) L.push(`| ${c.id} | ${fam[c.id]} | ${c.track === 'BEAT' ? 'schlagen' : 'weniger Verlust'} | ${c.testBeatsSpy ? 'ja' : 'nein'} | ${c.testLowLoss ? 'ja' : 'nein'} | ${c.verdict} |`);
    L.push('');
  }
  if (hp) {
    L.push('## Holdout 2008–2015', '', '| Finalist | über SPY |', '|---|---|');
    for (const f of hp.finalists) L.push(`| ${f.id} | ${f.holdoutBeatsSpy ? 'ja' : 'nein'} |`);
    L.push('');
  }
  L.push('## Grenzen', '', '- Population: heutige Kursdateien plus qualifizierte V13-Ketten delisteter Titel, heutiger SIC; keine historische Indexmitgliedschaft.',
    '- Prüfzeitraum 2024–2026 war für die Profilfamilien durch frühere Studien bekannt (Protokoll §2); nur der Holdout ist unberührt.',
    '- Spread modelliert, nicht beobachtet; Endwerte delisteter Titel als Klassenannahme; Insider-Zuordnung nur über CIK.',
    '- „besteht nicht“ heißt: kein Nachweis, nicht bewiesene Gleichheit.', '');
  return L.join('\n') + '\n';
}

function privateReport(dev, test, holdout) {
  const L = ['# Strang G – Strategie-Labor: privater Bericht mit Zahlen', '', 'Forschung, nicht zertifiziert. Nicht veröffentlichen (öffentliche Renditeaussage braucht Owner-Freigabe und Rechtsberatung).', ''];
  if (dev) {
    const ch = dev.selection.checks;
    L.push('## Suche 2016–2023 (alle Varianten)', '', `Reality Check (White, ${dev.realityCheck ? dev.realityCheck.variants : 0} Varianten): p = ${dev.realityCheck ? num(dev.realityCheck.p, 4) : '–'}, beste ${dev.realityCheck ? dev.realityCheck.bestId : '–'}.`, '',
      '| Variante | Zustand | CAGR | SPY | Gesamt | SPY gesamt | Sharpe | max. Verlust | SPY Verlust | DSR | zugelassen | weniger Verlust |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of dev.results) {
      if (r.state !== 'RUN') { L.push(`| ${r.id} | ${r.state} ${r.reason || r.error || ''} |||||||||||`); continue; }
      const s = r.evaluation.strategy, b = r.evaluation.SPY, c = ch[r.id] || {};
      L.push(`| ${r.id} | RUN | ${pct(s.cagr)} | ${pct(b.cagr)} | ${pct(s.totalReturn)} | ${pct(b.totalReturn)} | ${num(s.sharpe)} | ${pct(s.maxDrawdown)} | ${pct(b.maxDrawdown)} | ${num(c.dsr, 3)} | ${c.eligible ? 'ja' : 'nein'} | ${c.lowLoss ? 'ja' : 'nein'} |`);
    }
    L.push('', '### Walk-forward', '', '| Jahr | Auswahl | Rendite | SPY |', '|---|---|---|---|');
    for (const f of dev.walkForward.folds) L.push(`| ${f.year} | ${f.pick} | ${pct(f.ret)} | ${pct(f.spy)} |`);
    L.push(`| 2018–2023 p. a. | | ${pct(dev.walkForward.cagr)} | ${pct(dev.walkForward.spyCagr)} |`, '');
  }
  if (test) {
    L.push('## Prüfung 2024-01-01 bis 2026-10-02', '', '| Kandidat | CAGR | SPY | Gesamt | SPY gesamt | max. Verlust | SPY Verlust | p (roh) | p (Holm) | Sensitivitäten (CAGR) |', '|---|---|---|---|---|---|---|---|---|---|');
    for (const c of test.candidates) {
      const r = c.result; if (r.state !== 'RUN') { L.push(`| ${c.id} | ${r.state} |||||||||`); continue; }
      const s = r.evaluation.strategy, b = r.evaluation.SPY;
      L.push(`| ${c.id} | ${pct(s.cagr)} | ${pct(b.cagr)} | ${pct(s.totalReturn)} | ${pct(b.totalReturn)} | ${pct(s.maxDrawdown)} | ${pct(b.maxDrawdown)} | ${num(c.test && c.test.pLog, 4)} | ${num(c.holmP, 4)} | ${Object.entries(c.sensitivity).map(([k, v]) => k + ' ' + pct(v.strategy && v.strategy.cagr)).join('; ')} |`);
    }
    L.push('');
  }
  if (holdout) {
    L.push('## Holdout 2008–2015', '', '| Finalist | CAGR | SPY | max. Verlust | SPY Verlust | p gemeinsam (Prüfung+Holdout) |', '|---|---|---|---|---|---|');
    for (const f of holdout.finalists) {
      const r = f.result; if (r.state !== 'RUN') { L.push(`| ${f.id} | ${r.state} |||||`); continue; }
      const t = test && test.candidates.find(c => c.id === f.id), p = t && t.result.state === 'RUN' ? St.pairedTest([...t.result.returns, ...r.returns], [...t.result.spyReturns, ...r.spyReturns]).pLog : null;
      L.push(`| ${f.id} | ${pct(r.evaluation.strategy.cagr)} | ${pct(r.evaluation.SPY.cagr)} | ${pct(r.evaluation.strategy.maxDrawdown)} | ${pct(r.evaluation.SPY.maxDrawdown)} | ${num(p, 4)} |`);
    }
  }
  return L.join('\n') + '\n';
}

fs.writeFileSync(path.join(ROOT, 'docs/research/labor/BERICHT.md'), publicReport());
if (a.privateOut) {
  if (path.resolve(a.privateOut).startsWith(ROOT)) throw Error('PRIVATE_OUT_INSIDE_REPOSITORY');
  fs.writeFileSync(a.privateOut, privateReport(a.dev && rj(a.dev), a.test && rj(a.test), a.holdout && rj(a.holdout)));
}

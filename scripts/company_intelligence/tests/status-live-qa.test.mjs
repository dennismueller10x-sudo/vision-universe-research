import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {judgeAggregate,judgeSection} from '../status-live-qa.mjs';

const ok={schema:1,asOf:'2026-11-28T16:57:36.236Z',dueOverSevenDays:1339,eligibleSources:5298,history:[{asOf:'x'}],sourceRowsIncluded:false,contentIncluded:false,privateOperationalRowsIncluded:false};

test('SL-1 Aggregat: gueltig, nur Zahlen; Befunde fuer fehlendes Schema, leeren Verlauf, Quellenbezug',()=>{
 assert.deepEqual(judgeAggregate(ok),[]);
 assert.deepEqual(judgeAggregate(null),['AGGREGATE_SCHEMA']);
 assert.deepEqual(judgeAggregate({...ok,schema:2}),['AGGREGATE_SCHEMA']);
 assert.ok(judgeAggregate({...ok,history:[]}).includes('AGGREGATE_HISTORY_EMPTY'));
 assert.ok(judgeAggregate({...ok,dueOverSevenDays:null}).includes('AGGREGATE_BACKLOG_MISSING'));
 assert.ok(judgeAggregate({...ok,sourceRowsIncluded:true}).includes('AGGREGATE_NOT_AGGREGATE_ONLY'));
 assert.ok(judgeAggregate({...ok,note:'https://ir.example.com'}).includes('AGGREGATE_HAS_SOURCE_REFERENCE'));
});

test('SL-2 Abschnitt: rendert Zustand und Rueckstand und Tabelle; geladen/nicht verfuegbar/ohne Tabelle sind Befunde',()=>{
 const stand='Stand: 2026-11-28 16:57 UTC · Zustand CRITICAL · 1.339 von 5.298 Quellen mehr als 7 Tage überfällig (25,3 %; gesund bis 10 %, Warnung bis 25 %)';
 assert.deepEqual(judgeSection({stand,rows:3,tableVisible:true}),[]);
 assert.deepEqual(judgeSection({stand:'Bericht wird geladen …',rows:0,tableVisible:false}),['SECTION_STILL_LOADING','SECTION_WITHOUT_HISTORY_TABLE']);
 assert.ok(judgeSection({stand:'Refresh-Bericht nicht verfügbar (erscheint nach dem ersten Lauf des Health-Workflows).',rows:0,tableVisible:false}).includes('SECTION_UNAVAILABLE'));
 assert.ok(judgeSection({stand:'Stand: x · Rückstand nicht gemessen',rows:2,tableVisible:true}).includes('SECTION_WITHOUT_STATUS'));
 assert.ok(judgeSection({stand,rows:0,tableVisible:true}).includes('SECTION_WITHOUT_HISTORY_TABLE'));
});

test('SL-3 Monitor: Auswahl ci-status, Ausgabe, Job mit Zugang nur ueber das Secret; Skript liest, schreibt nur den Bericht',()=>{
 const w=readFileSync(resolve('.github/workflows/monitor.yml'),'utf8');
 assert.match(w,/- ci-status\n/);assert.match(w,/ci_status: \$\{\{ steps\.wahl\.outputs\.ci_status \}\}/);
 assert.match(w,/for k in [^\n]*\bci_status\b/);
 const job=w.slice(w.indexOf('\n  ci-status:'),w.indexOf('\n  technical:'));
 assert.match(job,/if: needs\.auswahl\.outputs\.ci_status == 'true'/);
 assert.match(job,/RESEARCH_ACCESS_PASSWORD: \$\{\{ secrets\.RESEARCH_ACCESS_PASSWORD \}\}/);
 assert.match(job,/status-live-qa\.mjs "\$IN_SITE"/);
 assert.doesNotMatch(job,/git (push|commit)|contents: write/);
 const s=readFileSync(resolve('scripts/company_intelligence/status-live-qa.mjs'),'utf8');
 assert.doesNotMatch(s,/console\.log\([^)]*RESEARCH_ACCESS_PASSWORD/);
});

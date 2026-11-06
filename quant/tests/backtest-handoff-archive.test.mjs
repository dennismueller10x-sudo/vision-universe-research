import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..'),archive=path.join(root,'docs/quant-recovery/methodology-v1');
test('Auftrag 2 retains both exact methodology draft source files with versioned provenance',()=>{
 const m=JSON.parse(fs.readFileSync(path.join(archive,'manifest.json')));assert.equal(m.sourcePR,872);assert.equal(m.sourceCommit,'0a57295f5a1ddffb8bf125646428ce29e9ba281e');assert.equal(m.files.length,2);
 for(const f of m.files){const b=fs.readFileSync(path.join(root,f.archivePath));assert.equal(b.length,f.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),f.sha256);}
 JSON.parse(fs.readFileSync(path.join(archive,'backtest-certification-methodology-v1.0.0.json')));
});
test('preserved methodology draft is not silently imported into active certification policy',()=>{
 const m=JSON.parse(fs.readFileSync(path.join(archive,'manifest.json')));assert.equal(m.runtimePolicyImported,false);assert.equal(m.state,'PRESERVED_PROPOSAL_NOT_APPROVED');assert.equal(fs.existsSync(path.join(root,'quant/methodology/backtest-certification-methodology-v1.0.0.json')),false);
});
test('versioned V6 handoff retains six distinct kinds and all seven future planning items',()=>{
 const s=fs.readFileSync(path.join(root,'docs/quant-recovery/BACKTEST_V6_HANDOFF.md'),'utf8');
 for(const name of ['Same Stock Replay','Pattern Evidence','Signal Backtest','Setup Backtest','Strategy Backtest','Factor Ranking Backtest','Monte-Carlo-Simulation','Walk-Forward-Analyse','Out-of-Sample-Prüfung','Marktregime-Backtests','Parameter-Sensitivität','Event-Driven Backtests','Portfolio-Rebalancing','NOT_CERTIFIED'])assert.ok(s.includes(name),name);
});

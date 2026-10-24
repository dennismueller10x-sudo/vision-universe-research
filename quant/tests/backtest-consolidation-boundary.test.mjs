import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'../..'),require=createRequire(import.meta.url),lock=JSON.parse(fs.readFileSync(path.join(root,'docs/quant-recovery/v51/ui-protection.json')));
test('merged Quant UI refresh, navigation, charts, styles and its QA retain exact Main bytes',()=>{
 for(const [file,expected] of Object.entries(lock.files))assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),expected,file);
});
test('consolidation has no preview routes, frontend hook, hosting configuration or preview renderer',()=>{
 for(const file of ['server/quant-backtest-preview.cjs','server/quant-backtest-preview-site.cjs','scripts/quant/preview-real-backtest.cjs','scripts/quant/preview/integrated.js'])assert.equal(fs.existsSync(path.join(root,file)),false,file);
 const stock=fs.readFileSync(path.join(root,'quant/app/page-stock.js'),'utf8');assert.equal(stock.includes('QXRealBacktestPreview'),false);
 const index=fs.readFileSync(path.join(root,'quant/index.html'),'utf8');assert.equal(index.includes('real-backtest-selection'),false);assert.equal(index.includes('internal-backtest'),false);
});
test('real weekly path never imports a MockProvider, generator, HTTP provider or random-price source',()=>{
 const A=require('../engines/weekly-real-adapter.cjs'),B=require('../engines/weekly-benchmark.cjs'),{run}=require('../../scripts/quant/run-real-weekly-backtest.cjs');
 const r=run(A.load(root,'ref_NVDA'),{benchmark:B.load(root)});assert.equal(r.certification,'NOT_CERTIFIED');assert.equal(r.input.returnBasis,'PRICE_RETURN');
 const modules=Object.keys(require.cache);assert.equal(modules.some(f=>/mock-(provider|generator)\.js$/.test(f)),false);
 assert.ok(r.input.start<'2006-01-01');assert.ok(r.trades.every(t=>t.signalDate<t.entryDate));
});
test('public service contains only a lazy Node facade, never the private implementation or store paths',()=>{
 const source=fs.readFileSync(path.join(root,'quant/api/product-services.js'),'utf8');assert.ok(source.includes("require('./real-backtest-service.cjs')"));assert.equal(source.includes('const realBacktestCache'),false);assert.equal(source.includes("store.loadDetail("),false);
});

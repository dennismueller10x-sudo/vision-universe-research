import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessResourceBudget,budgets} from './resource-budget.mjs';
const resource=(bytes,path='/quant/data/universe.json')=>({bytes,path});
test('recorded baseline fits and a byte regression fails',()=>{
 assert.equal(assessResourceBudget('home',[resource(550404)]).pass,true);
 /* DIE GRENZE WIRD GELESEN, NICHT ABGESCHRIEBEN.
    Hier stand 1700001 - die Grenze plus eins. Als der gemeinsame
    Plattform-Kopf am 29.09.2026 die home-Grenze angehoben hat, wurde
    dieser Test rot, ohne dass an der geprueften REGEL etwas falsch war:
    er hatte nur eine Zahl abgeschrieben, die inzwischen woanders steht.
    Geprueft wird die Regel "ein Byte ueber der Grenze faellt durch" -
    und die gilt unabhaengig davon, wo die Grenze gerade liegt. */
 assert.deepEqual(assessResourceBudget('home',[resource(budgets.home.decodedBytes+1)]).failures,['decodedBytes']);
 assert.equal(assessResourceBudget('home',[resource(budgets.home.decodedBytes)]).pass,true);
});
test('many small requests cannot evade the request budget',()=>{
 assert.deepEqual(assessResourceBudget('screener',Array.from({length:46},()=>resource(1))).failures,['requests']);
});
test('cheap history fanout and fixtures fail independently of size',()=>{
 for(const view of ['home','screener','discover'])assert.throws(()=>assessResourceBudget(view,[resource(1,'/quant/data/market/daily/ref_NVDA.json')]),/fanout/);
 assert.throws(()=>assessResourceBudget('stock',[resource(1,'/quant/tests/fixtures/example.json')]),/Fixture/);
 assert.equal(assessResourceBudget('stock',[resource(2135178,'/quant/data/market/daily/ref_NVDA.json')]).pass,true);
});
test('missing or malformed measurements cannot pass',()=>{
 for(const value of [null,[],[resource(NaN)],[resource(-1)],[resource(Infinity)]])assert.throws(()=>assessResourceBudget('home',value),/evidence/);
});
test('unmeasured workspaces have no invented budget',()=>assert.equal(assessResourceBudget('elliott',[]),null));

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../ui/europe.js',import.meta.url),'utf8'),global={VUDiscover:{},QuantShell:{el:()=>{}}};vm.runInNewContext(source,{globalThis:global});
const allowed=global.VUDiscover.EuropeView.navigationAllowed;
test('Europe selector remains on home and Europe routes without moving existing US detail prices',()=>{
 for(const hash of ['','#/','#/u/US_REAL'])assert.equal(allowed('US_REAL',hash),true);
 for(const hash of ['#/s/US_REAL/AAPL','#/s/US_REAL/NVDA','#/settings','#/maerkte','#/watchlist','#/c/US_REAL/top'])assert.equal(allowed('US_REAL',hash),false);
 for(const hash of ['#/c/EUROPE/all','#/s/EUROPE/ref_DBK_DE_XETR','#/watchlist/EUROPE'])assert.equal(allowed('EUROPE',hash),true);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../../../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
test('early head and later stock router use the stamped CSS cache key',async()=>{
 const boot=read('quant/app/stock-boot.js'),app=read('quant/app/app.js');
 for(const early of [true,false])for(const advertised of [true,false]){
  const links=[],stamped='https://example.test/quant/app/stock.css?v=0123456789abcdef';
  const document={querySelector:s=>s.includes('vu-stock-style')?(advertised?{href:stamped}:null):{getAttribute:k=>k==='content'?'abcdef1234567890':'quant'},createElement:()=>({}),head:{appendChild:l=>{links.push(l);l.onload();}}};
  const global={VUReleaseGuard:{identity:()=>({id:'abcdef1234567890'})}};
  const code=early?boot.slice(boot.indexOf('  function style()'),boot.indexOf('  var api='))+';this.run=style;':app.slice(app.indexOf('  var STOCK_CSS ='),app.indexOf('  var NAMES_VIEW ='))+';this.run=global.QXLoadStockCss;';
  const context={doc:document,document,global,Promise};vm.runInNewContext(code,context);
  await context.run();assert.equal(links.length,1);assert.equal(links[0].href,advertised?stamped:'/quant/app/stock.css?v=abcdef1234567890');
 }
});

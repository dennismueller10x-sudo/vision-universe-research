import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
function setup(){
 const mounted=[];let disposed=0;
 const node=(tag,props={},children=[])=>({tag,...props,children:[...children],appendChild(c){this.children.push(c);},removeAttribute(){}});
 const context={window:{QuantShell:{el:node,clear:r=>r.children=[]},VUDiscover:{},VUCompanyIntelligenceRollout:{eligibility:{APD:{modules:{financials:true}}}},VUCompanyIntelligenceStock:{mount(root,ticker){mounted.push(ticker);root.appendChild(node('section',{class:'same-intelligence-component'}));return ()=>disposed++;}}},document:{createTextNode:text=>({text})}};
 runInNewContext(readFileSync(new URL('../ui/detail.js',import.meta.url),'utf8'),context);
 return {root:node('main'),render:context.window.VUDiscover.Detail.renderInstrument,mounted,disposed:()=>disposed,context};
}
const result={instrument:{symbol:'APD',instrumentId:'vu_379152615958e3',issuerId:'iss_cik_0000002969',companyName:'Air Products and Chemicals',securityType:'COMMON_STOCK',exchange:'NYSE',mic:'XNYS',active:true,cik:'0000002969'},capabilities:{HAS_FUNDAMENTALS:false,HAS_PRICE_HISTORY:false}};
function text(n){return [n.text||'',...(n.children||[]).map(text)].join('');}
test('Master-only Discover path reuses issuer intelligence and preserves price/access capability rules',()=>{
 const f=setup();f.render(f.root,result);assert.deepEqual(f.mounted,['APD']);assert.equal(result.capabilities.HAS_FUNDAMENTALS,false);assert.equal(result.capabilities.HAS_PRICE_HISTORY,false);
 assert(text(f.root).includes('Kursverlauf liegt nicht vor'));assert(text(f.root).includes('Geschäftszahlen liegt vor'));assert(f.root.children.findIndex(n=>n.class==='same-intelligence-component')<f.root.children.findIndex(n=>n.children?.some(c=>c.text==='Stammdaten')));
 f.render(f.root,{...result,instrument:{...result.instrument,symbol:'AAPL'}});assert.equal(f.disposed(),1);assert.deepEqual(f.mounted,['APD','AAPL']);
});
test('Master-only Discover remains usable when intelligence is unavailable or disabled',()=>{
 const f=setup();delete f.context.window.VUCompanyIntelligenceStock;delete f.context.window.VUCompanyIntelligenceRollout;f.render(f.root,result);assert.deepEqual(f.mounted,[]);assert(text(f.root).includes('Geschäftszahlen liegt nicht vor'));assert(text(f.root).includes('Stammdaten'));
});

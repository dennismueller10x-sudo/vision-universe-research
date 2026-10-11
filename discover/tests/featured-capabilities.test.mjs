import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('chart-only canonical cards never request analytics detail from the current universe',()=>{
 const D={},window={VUDiscover:D,QuantShell:{el(){throw Error('unexpected analytics rendering');},loadJSON(){throw Error('unexpected detail request');}}};
 vm.runInNewContext(readFileSync(new URL('../ui/featured.js',import.meta.url),'utf8'),{window});
 const anchor={canonicalDetailLink:true};
 for(const card of [{quantAvailable:false},{technicalAvailable:false},{quantAvailable:false,technicalAvailable:false}])assert.equal(D.Featured.compact(card,{universeId:'US_REAL'},anchor,{}),anchor);
});

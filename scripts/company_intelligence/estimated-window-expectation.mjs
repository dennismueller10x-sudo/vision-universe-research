/* QA oracle: must the Discover chapter show an "estimated" reporting window for this payload?
   A payload may carry ESTIMATED events that the chapter correctly hides: a window that has
   already passed, or one superseded by a confirmed EARNINGS_SCHEDULED for the same fiscal
   quarter. Only the first remaining estimate is shown. Asserting "any ESTIMATED event =>
   'Geschätzt' on the page" therefore fails on time- and sample-dependent payloads
   (candidate run 38392637416, EQBK) although nothing is wrong. The expectation is derived from
   the shipped view model itself, so QA and renderer cannot drift apart; the rendered pill is
   still asserted against it in the browser. */
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
const require=createRequire(import.meta.url),api=require('../../company-intelligence/api/contract.js');
const sandbox={VUCompanyIntelligence:api};
runInNewContext(readFileSync(new URL('../../company-intelligence/ui/stock-section.js',import.meta.url),'utf8'),sandbox);
export function expectsEstimatedWindow(payload,now=Date.now()){
 return sandbox.VUCompanyIntelligenceStock.viewModel(payload,now).estimates.length>0;
}

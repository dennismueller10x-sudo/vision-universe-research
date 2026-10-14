/* QA oracles for the "Als Nächstes" estimated reporting window.
   expectsEstimatedWindow: exact expectation from the shipped view model (what the chapter MUST render
   given its own filters: passed or superseded windows are hidden, only the first window is shown).
   mustShowEstimatedWindow: INDEPENDENT lower bound computed from raw events only, no view model. It
   catches a view-model defect that wrongly discards valid estimates (the exact oracle would then agree
   with the broken renderer). Lower bound = strict subset of rendered cases:
   - eventType/confirmationStatus ESTIMATED with a valid dateEnd (contract.js demands dateStart/dateEnd),
   - not cancelled/withdrawn/postponed (eventStatus or status), no startsAt (a clock instant would be judged
     by the view model against "now"),
   - dateEnd >= UTC today + 2 days (safety margin against midnight flapping between QA and render),
   - no CONFIRMED EARNINGS_SCHEDULED with the same fiscalYear and fiscalQuarter (superseded; checked
     regardless of that event's own activity, which only makes the bound smaller).
   If at least one event qualifies the view model's estimates list is non-empty (it shows the first), so
   at least one 'Geschätzt' pill must be rendered. */
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
const require=createRequire(import.meta.url),api=require('../../company-intelligence/api/contract.js');
const sandbox={VUCompanyIntelligence:api};
runInNewContext(readFileSync(new URL('../../company-intelligence/ui/stock-section.js',import.meta.url),'utf8'),sandbox);
export function expectsEstimatedWindow(payload,now=Date.now()){
 return sandbox.VUCompanyIntelligenceStock.viewModel(payload,now).estimates.length>0;
}
const INACTIVE=['CANCELLED','CANCELED','WITHDRAWN','POSTPONED'];
export function mustShowEstimatedWindow(payload,now=Date.now()){
 const limit=new Date(now+2*86400000).toISOString().slice(0,10),events=payload.events||[];
 return events.filter(e=>e.confirmationStatus==='ESTIMATED'&&!INACTIVE.includes(e.eventStatus)&&!INACTIVE.includes(e.status)&&!e.startsAt
  &&/^\d{4}-\d{2}-\d{2}$/.test(e.dateEnd||'')&&e.dateEnd>=limit
  &&!events.some(c=>c.confirmationStatus==='CONFIRMED'&&c.eventType==='EARNINGS_SCHEDULED'&&e.fiscalYear&&e.fiscalQuarter&&c.fiscalYear===e.fiscalYear&&c.fiscalQuarter===e.fiscalQuarter));
}

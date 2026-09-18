// Subresource budgets derived from Phase14's measured localhost baseline.
// Not network-transfer bytes, a production latency SLA, or full-universe proof.
export const budgets=Object.freeze({
 home:{decodedBytes:750000,requests:45,history:false},
 stock:{decodedBytes:3000000,requests:50,history:true},
 screener:{decodedBytes:750000,requests:45,history:false},
 discover:{decodedBytes:750000,requests:45,history:false}
});
export function assessResourceBudget(view,resources){
 const budget=budgets[view];if(!budget)return null;
 if(!Array.isArray(resources)||!resources.length)throw Error('Missing resource evidence: '+view);
 for(const r of resources){
  if(typeof r.path!=='string'||!r.path.startsWith('/')||!Number.isFinite(r.bytes)||r.bytes<0)throw Error('Invalid resource evidence: '+view);
  if(r.path.includes('/fixtures/'))throw Error('Fixture loaded: '+view);
  if(!budget.history&&r.path.includes('/daily/ref_'))throw Error('Unexpected price-history fanout: '+view);
 }
 const decodedBytes=resources.reduce((s,r)=>s+r.bytes,0),requests=resources.length;
 const failures=[];
 if(decodedBytes>budget.decodedBytes)failures.push('decodedBytes');
 if(requests>budget.requests)failures.push('requests');
 return {view,decodedBytes,requests,budget,pass:failures.length===0,failures};
}

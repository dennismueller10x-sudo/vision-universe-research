'use strict';
const fs=require('node:fs'),path=require('node:path');
const V=require('./research-validation.cjs'),C=require('./research-contract.cjs');
// Supported VU registry initialization includes the already inspected signal history.
// Absence of another interval from this ledger never proves it was unseen.
function openVisionUniverseHoldoutStore(directory,{root=path.resolve(__dirname,'../..')}={}) {
  const p=path.join(root,'quant/data/product/signal-backtest-v1.json'),sourceHash=C.shaFile(p),s=JSON.parse(fs.readFileSync(p,'utf8'));
  const from=s.source?.from,to=s.source?.to;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))throw Error('EXISTING_STUDY_EXPOSURE_RANGE_UNKNOWN');
  const id='existing-signal-history:'+sourceHash,store=V.openHoldoutStore(directory),state=store.read();
  if(!state.ledger.entries.some(e=>e.id===id)) {
    // source.to is the label of the last weekly bucket (its Friday); while that week is still running the label lies in
    // the future. Published results cannot cover more than what was observed, so the exposure ends at the observation.
    const observedAt=new Date().toISOString(),end=to+'T23:59:59.999Z';
    store.expose({id,purpose:'EXPLORATION',from:from+'T00:00:00Z',to:end<observedAt?end:observedAt,observedAt,ruleHash:C.shaFile(path.join(root,'quant/engines/signal-backtest.js')),sourceArtifact:'quant/data/product/signal-backtest-v1.json',sourceHash,scope:'ALREADY_PUBLISHED_RESULTS_NOT_UNTOUCHED_HOLDOUT'},state.resultHash);
  }
  return store;
}
module.exports={openVisionUniverseHoldoutStore};

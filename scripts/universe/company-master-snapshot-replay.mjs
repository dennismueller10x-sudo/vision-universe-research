/** An offline replay of unchanged committed listing inputs is not a new
 * classification publication. New provider discovery uses the live classifier;
 * offline classifier differences stay explicit staged review proposals. */
import {createHash} from 'node:crypto';
export function verifiedExistingDnaSnapshot(previous,decision,document){
 const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 const proof=document?.corrections?.length===1?document.corrections[0]:null;
 return document?.schemaVersion==='tiingo2-existing-eligibility-correction-1'&&proof?.ticker==='DNA'&&proof.securityId==='ref_DNA'&&proof.instrumentId===previous?.instrumentId&&previous?.instrumentId==='vu_f4c48467a5f4ef'&&previous.cik==='0001830214'&&previous.masterMemberId==='ref_DNA'&&previous.productEligibility==='ELIGIBLE'&&previous.productEligibilityReason==='TIINGO2_VERIFIED_CURRENT_LISTING'&&decision?.product_eligibility==='ELIGIBLE'&&decision.product_eligibility_reason==='TIINGO2_VERIFIED_CURRENT_LISTING'&&decision.active_status==='ACTIVE'&&proof.corporateActionGateWaived===false&&proof.afterInstrumentSha256===digest(previous)&&proof.afterDecisionSha256===digest(decision);
}
export function replayCommittedClassification(previous,incoming,{sourceKind,sourceRow}={}){
 const fields=['securityType','securityTypeConfidence','securityTypeBasis','shareClass','subtype','adrEvidence','classificationAgrees'];
 const inputs=['symbol','exchange','companyName','currency','assetTypeRaw','firstTradeDate','lastTradeDate','active','productEligibility','productEligibilityReason','securityClass','masterMemberId'];
 const incremental=sourceRow?.active===true&&(sourceRow.selection?.startsWith('tiingo2:')&&previous?.productEligibilityReason==='TIINGO2_VERIFIED_INCREMENTAL_ADDITION'||sourceRow.existingEligibilityVerified===true&&previous?.symbol==='DNA'&&previous.productEligibilityReason==='TIINGO2_VERIFIED_CURRENT_LISTING');
 const sameInputs=previous&&inputs.every(field=>incremental&&field==='lastTradeDate'&&!sourceRow.endDate||((previous[field]??null)===(incoming[field]??null)));
 if(sourceKind!=='COMMITTED_GATE_UNIVERSES'||!sameInputs)return {instrument:incoming,proposal:null};
 // The appended raw membership row is a projection, not another provider
 // response. It omits the latest-history endDate and carries no SEC metadata.
 // Preserve verified provenance when replaying that identical projection;
 // explicit changed listing/policy or conflicting known CIK evidence still
 // enters the normal sync. A previously absent issuer requires staged review.
 let instrument=incoming,identityProposal=null;
 if(incremental&&(!previous.cik||!incoming.cik||incoming.cik===previous.cik)&&(!previous.issuerId||!incoming.issuerId||incoming.issuerId===previous.issuerId)){
  instrument={...incoming};
  if(!previous.cik&&incoming.cik)identityProposal={symbol:incoming.symbol,exchange:incoming.exchange,instrumentId:previous.instrumentId,decision:'STAGED_ISSUER_MAPPING_REVIEW',reason:'UNCHANGED_COMMITTED_LISTING_REQUIRES_VERIFIED_ISSUER_ENRICHMENT',changes:[{field:'cik',committed:null,proposed:incoming.cik},{field:'issuerId',committed:previous.issuerId??null,proposed:incoming.issuerId??null}]};
  for(const field of ['companyNameStatus','activeBasis','lastTradeDate','cik','cikSource','issuerId','issuerIdSource'])instrument[field]=previous[field]??null;
 }
 const changes=fields.filter(field=>(previous[field]??null)!==(incoming[field]??null));
 if(!changes.length)return {instrument,proposal:identityProposal};
 instrument={...instrument};for(const field of fields)instrument[field]=previous[field]??null;
 return {instrument,proposal:{symbol:incoming.symbol,exchange:incoming.exchange,instrumentId:previous.instrumentId,decision:identityProposal?'STAGED_CLASSIFICATION_AND_ISSUER_REVIEW':'STAGED_CLASSIFICATION_REVIEW',reason:'UNCHANGED_COMMITTED_LISTING_INPUTS',changes:[...changes.map(field=>({field,committed:previous[field]??null,proposed:incoming[field]??null})),...(identityProposal?.changes||[])]}};
}

/** Committed append order and encoding are part of the protected delivery.
 * Keep exact bytes only when the complete reconstructed shard is equivalent. */
export function unchangedSnapshotShardBytes(previousBytes,next,{sourceKind}={}){
 if(sourceKind!=='COMMITTED_GATE_UNIVERSES'||previousBytes===null)return null;
 let prior;try{prior=JSON.parse(previousBytes);}catch{return null;}
 if(prior.shard!==next.shard||prior.engine!==next.engine||prior.count!==next.count||!Array.isArray(prior.instruments)||prior.instruments.length!==next.instruments.length)return null;
 const byId=new Map(next.instruments.map(row=>[row.instrumentId,JSON.stringify(row)]));
 if(byId.size!==next.instruments.length||new Set(prior.instruments.map(row=>row.instrumentId)).size!==prior.instruments.length||prior.instruments.some(row=>byId.get(row.instrumentId)!==JSON.stringify(row)))return null;
 return previousBytes;
}

/** An offline replay of unchanged committed listing inputs is not a new
 * classification publication. New provider discovery uses the live classifier;
 * offline classifier differences stay explicit staged review proposals. */
export function replayCommittedClassification(previous,incoming,{sourceKind}={}){
 const fields=['securityType','securityTypeConfidence','securityTypeBasis','shareClass','subtype','adrEvidence','classificationAgrees'];
 const inputs=['symbol','exchange','companyName','currency','assetTypeRaw','firstTradeDate','lastTradeDate','active','productEligibility','productEligibilityReason','securityClass','masterMemberId'];
 if(sourceKind!=='COMMITTED_GATE_UNIVERSES'||!previous||inputs.some(field=>(previous[field]??null)!==(incoming[field]??null)))return {instrument:incoming,proposal:null};
 const changes=fields.filter(field=>(previous[field]??null)!==(incoming[field]??null));
 if(!changes.length)return {instrument:incoming,proposal:null};
 const instrument={...incoming};for(const field of fields)instrument[field]=previous[field]??null;
 return {instrument,proposal:{symbol:incoming.symbol,exchange:incoming.exchange,instrumentId:previous.instrumentId,decision:'STAGED_CLASSIFICATION_REVIEW',reason:'UNCHANGED_COMMITTED_LISTING_INPUTS',changes:changes.map(field=>({field,committed:previous[field]??null,proposed:incoming[field]??null}))}};
}

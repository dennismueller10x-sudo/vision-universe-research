import test from 'node:test';import assert from 'node:assert/strict';import{parseReferenceCSV,normalizeOfficialReferences,effectiveCommonSource,effectiveSecurityTypeSource,mergeTypedETFReferences,mergeClassifiedXetraReferences}from'../../scripts/market/build-europe-reference.mjs';
test('official CSV parser preserves quoted metadata and excludes header context rows',()=>{
 const text='\uFEFFName;ISIN;Symbol;Market;Currency;"last Price"\n"European Equities"\n"Issuer; ""Class""";NL0010273215;ASML;Amsterdam;EUR;123.45\n';
 const rows=parseReferenceCSV(text);assert.equal(rows.length,1);assert.equal(rows[0].Name,'Issuer; "Class"');assert.equal(rows[0].Currency,'EUR');
});
test('unfiltered Euronext stock categories cannot turn rights into equity candidates',()=>{
 const text='Name;ISIN;Symbol;Market;Currency;lastPrice\nCommon;FR0000121014;MC;Paris;EUR;500\nRights;FR0000000001;RIGHT;Paris;EUR;12\nPreferred;FR0000000002;PREF;Paris;EUR;20\n';
 const result=normalizeOfficialReferences({venueCSVs:[{mic:'XPAR',text,sourceId:'OFFICIAL'}],commonISINs:new Set(['FR0000121014']),preferredISINs:new Set(['FR0000000002'])});
 assert.equal(result.rows[0].assetType,'EQUITY');assert.equal(result.rows[1].assetType,null);assert.equal(result.rows[2].listingType,'PREFERRED');assert(result.rows.every(row=>!Object.hasOwn(row,'lastPrice')&&row.issuerCountry===null));
});
test('official SIX participation types and Nasdaq share currencies retain conservative share subtype',()=>{
 const result=normalizeOfficialReferences({six:{colNames:['ValorSymbol','ShortName','ISIN','TradingBaseCurrency','SecTypeCode','SecTypeDesc','TradingState'],rowData:[['ROP','ROCHE PS','CH1499059983','CHF','PC','Participation Certificate','T']]},nordic:[{mic:'XSTO',sourceId:'OFFICIAL_STO',data:{data:{instrumentListing:{rows:[{symbol:'VOLV B',fullName:'Volvo B',isin:'SE0000115446',currency:'SEK',assetClass:'SHARES',lastSalePrice:'999'}]}}}}]});
 assert.equal(result.rows[0].officialSecurityType,'Participation Certificate');assert.equal(result.rows[0].listingType,'UNKNOWN');assert.equal(result.rows[1].symbol,'VOLV-B');assert.equal(result.rows[1].tradingCurrency,'SEK');assert.equal(result.rows[1].listingType,'UNKNOWN');assert.equal(result.rows[1].lastSalePrice,undefined);
});


test('common classification source rejects ignored GET filters and incomplete POST pages',()=>{
 assert.equal(effectiveCommonSource({method:'GET',filter:{issueType:'101'},observedRows:300,total:300}),false);
 assert.equal(effectiveCommonSource({method:'POST',filter:{issueType:'106'},observedRows:10,total:10}),false);
 assert.equal(effectiveCommonSource({method:'POST',filter:{issueType:'101'},observedRows:20,total:300}),false);
 assert.equal(effectiveCommonSource({method:'POST',filter:{issueType:'101'},observedRows:300,total:300}),true);
});

test('preferred classification requires effective complete POST106 evidence too',()=>{
 assert.equal(effectiveSecurityTypeSource({method:'GET',filter:{issueType:'106'},observedRows:18,total:18},'106'),false);
 assert.equal(effectiveSecurityTypeSource({method:'POST',filter:{issueType:'106'}},'106'),false);
 assert.equal(effectiveSecurityTypeSource({method:'POST',filter:{issueType:'106'},observedRows:18,total:18},'106'),true);
});

test('normalizer keeps per-ISIN classification provenance and typed ETF merge leaves conflicts ambiguous',()=>{const text='Name;ISIN;Symbol;Market;Currency\nShare;FR0000121014;MC;Paris;EUR\nTracker;IE0000000001;ETF;Paris;EUR\n';const base=normalizeOfficialReferences({venueCSVs:[{mic:'XPAR',text,sourceId:'CSV'}],commonISINs:new Set(['FR0000121014']),classificationSourcesByISIN:new Map([['FR0000121014','ACTUAL_POST101']])});assert.equal(base.rows[0].classificationEvidenceSourceId,'ACTUAL_POST101');const etf={mic:'XPAR',symbol:'ETF',isin:'IE0000000001',tradingCurrency:'EUR',assetType:'ETF',listingType:null};const merged=mergeTypedETFReferences(base,{rows:[etf],sources:{}});assert.equal(merged.rows.filter(r=>r.symbol==='ETF').length,1);assert.equal(merged.rows.find(r=>r.symbol==='ETF').assetType,'ETF');const conflict=mergeTypedETFReferences(base,{rows:[{...etf,tradingCurrency:'USD'}],sources:{}});assert.equal(conflict.rows.filter(r=>r.symbol==='ETF').length,2);});

test('Xetra foundation references admit only exact active official CS rows and retain unknown share rights',()=>{const base={rows:[],sources:{}},good={mic:'XETR',assetType:'EQUITY',officialInstrumentType:'CS',officialStatus:'ACTIVE',exchangeMnemonic:'LOCAL',officialInstrumentName:'Official local share',isin:'DE0000000001',tradingCurrency:'EUR',listingTypeHint:'PREFERRED_HINT',referenceSourceId:'T7'};const result=mergeClassifiedXetraReferences(base,{candidates:[good,{...good,officialInstrumentType:'RIGHT'},{...good,officialStatus:'INACTIVE'}],referenceSources:{T7:{source_system:'DEUTSCHE_BOERSE_XETRA_T7_REFERENCE'}}});assert.equal(result.rows.length,1);assert.equal(result.rows[0].officialSecurityTypeCode,'CS');assert.equal(result.rows[0].listingType,'PREFERRED_HINT');assert.equal(result.rows[0].classificationState,'OFFICIAL_XETRA_CS_SHARE_SUBTYPE_UNRESOLVED');});

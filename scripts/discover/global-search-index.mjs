/** Deterministic canonical search/home projections. Reads existing US outputs;
 * never changes scores, prices, IDs or ranking populations. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Admission=require('../../core/europe-discover-eligibility.js'),Identity=require('../../core/identity.js'),Quality=require('../../core/discover-universe.js');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
export async function produceGlobal(root){
 const us=await read(join(root,'discover/data/search/US_REAL.json')),manifest=await read(join(root,'discover/data/europe/manifest.json')),eu=await read(join(root,'discover/data/europe/catalog.json'));
 const entries=[],shards=new Map();
 for(const e of us.entries){const key=Identity.shardKey(e.s);if(!shards.has(key)){try{shards.set(key,(await read(join(root,'quant/data/universe/instruments',key+'.json'))).instruments||[]);}catch(_){shards.set(key,[]);}}const candidates=shards.get(key).filter(m=>m.symbol===e.s),master=candidates.find(m=>m.instrumentId===e.i)||candidates.find(m=>m.active&&m.primaryListing)||candidates.find(m=>m.active)||candidates[0]||{};
 entries.push({...e,securityId:Identity.securityIdForTicker(e.s),companyId:master.issuerId||e.i,listingId:master.instrumentId||e.i||Identity.securityIdForTicker(e.s),ticker:e.s,region:'US',href:'#/s/US_REAL/'+encodeURIComponent(e.s),aliases:[...(master.aliases||[]),...(master.legacyIds||[])].filter(a=>typeof a==='string'),isin:master.isin||null,homePrimary:false});}
 for(const s of eu.securities){const l=s.listings.find(x=>x.listingId===s.primaryListingId);if(!l||!manifest.series[s.securityId]||!Admission.identity(s,l).ready)throw Error('PUBLISHED_PRIMARY_IDENTITY_REQUIRED');entries.push({i:s.instrumentId,s:s.securityId,n:s.name,m:1,securityId:s.securityId,companyId:s.companyId,listingId:l.listingId,ticker:l.ticker,displaySymbol:l.ticker,region:'EUROPE',href:'#/s/EUROPE/'+encodeURIComponent(s.securityId),aliases:[...new Set([...(s.aliases||[]),...(l.aliases||[]),s.canonicalTicker,l.providerSymbol].filter(Boolean))],isin:s.isin,country:l.identityAdmission.issuerCountry,mic:l.mic,currency:l.currency,asOf:l.latest.date,logoKey:s.logo?.key||null,a:l.mic,homePrimary:true,catalogSha256:manifest.catalog.sha256});}
 if(new Set(entries.map(e=>e.securityId)).size!==entries.length)throw Error('DUPLICATE_CANONICAL_SEARCH_SECURITY');
 const index={schema:'vu-canonical-discover-search-1',universeId:'GLOBAL',universeLabel:'Alle Aktien',count:entries.length,counts:{US:us.entries.length,EUROPE:eu.securities.length},entries};
 await writeFile(join(root,'discover/data/search/GLOBAL.json'),JSON.stringify(index)+'\n');
 // Home is a projection of the existing event/relevance selection, never a
 // fixed list of tickers or a regional quota. Global search stays independent.
 const curated=(await read(join(root,'discover/data/home/US_REAL.json'))).surfaces.filter(s=>s.type==='hero').flatMap(s=>s.cards||[]),cards=[];
 for(const selected of curated){const d=entries.find(e=>e.s===selected.symbol&&e.region==='US');if(!d)continue;const card={...selected,securityId:d.securityId,companyName:d.n,href:d.href,region:'US'};card.homeCardQuality=Quality.homeCardQuality(card);if(card.homeCardQuality.status==='HOME_CARD_READY')cards.push(card);}
 await mkdir(join(root,'discover/data/global'),{recursive:true});await writeFile(join(root,'discover/data/global/home.json'),JSON.stringify({schema:'vu-canonical-discover-home-1',cards})+'\n');
 return {total:entries.length,europe:eu.securities.length,homeCards:cards.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(await produceGlobal(process.cwd())));

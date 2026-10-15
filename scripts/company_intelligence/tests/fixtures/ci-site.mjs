/* Gemeinsames Fixture: ein in sich stimmiges Release (Discover + Quant + Company Intelligence ON/OFF/Bootstrap). */
import {createHash} from 'node:crypto';
import {CI_INDEX_SCHEMA} from '../../propagation-proof.mjs';
export const sha256 = b => createHash('sha256').update(b).digest('hex');
export const sha16 = b => sha256(b).slice(0, 16);
export const J = o => Buffer.from(JSON.stringify(o));
export const COMMIT = 'b'.repeat(40);
export const D = '/discover/data/stocks/US_REAL/AAPL.json';

export function stampedPage(meta, product, assets) {
 const links = assets.map(a => a.path.endsWith('.css') ? '<link rel="stylesheet" href="' + a.path + '?v=' + a.v + '">' : '<script src="' + a.path + '?v=' + a.v + '"></script>').join('\n');
 return Buffer.from('<!doctype html><meta name="vu-release" data-product="' + product + '" content="' + meta + '">\n' + links);
}

/** Ein in sich stimmiges Release: Discover + Quant + (mode ON|OFF) Company Intelligence. Die Generation wird aus Salt/Commit abgeleitet. */
export function build({commit = COMMIT, mode = 'ON', salt = '', quant = true, gen: genOverride = null, legacy = false, cohort = 2, issuers = 1} = {}) {
 const map = new Map(), put = (p, b) => map.set(p, Buffer.isBuffer(b) ? b : Buffer.from(b));
 // Discover (wie im Hauptfixture, kompakt)
 const dScript = Buffer.from('/* detail ' + commit + ' */'), dId = sha16(Buffer.from('d' + commit));
 const dContent = Buffer.from('<meta name="vu-release" data-product="discover" content="' + dId + '">\n<template id="dx-lazy-detail"><script src="/discover/ui/detail.js?v=' + sha16(dScript) + '"></script></template>');
 put('/discover/', '<script data-content="/__research/content/discover/index.html?v=' + sha16(dContent) + '"></script>');
 put('/__research/content/discover/index.html', dContent); put('/discover/ui/detail.js', dScript); put(D, J({symbol: 'AAPL', commit}));
 // Quant
 const qId = sha16(Buffer.from('q' + commit + salt));
 if (quant) {
  const js = Buffer.from('/* quant bundle ' + commit + ' */'), css = Buffer.from('/* quant css ' + commit + ' */');
  const qContent = stampedPage(qId, 'quant', [{path: '/quant/ui/quant.css', v: sha16(css)}, {path: '/quant/release-bundle.js', v: sha16(js)}]);
  put('/quant/', '<script data-content="/__research/content/quant/index.html?v=' + sha16(qContent) + '"></script>');
  put('/__research/content/quant/index.html', qContent); put('/quant/release-bundle.js', js); put('/quant/ui/quant.css', css);
 }
 put('/release-id.json', J({schema: 'vu-release-id-1', commit, products: quant ? {quant: qId, discover: dId} : {discover: dId}}));
 put('/release-delivery.json', J({sourceCommit: commit}));
 const gen = genOverride || sha256(Buffer.from('gen-' + commit + salt)).slice(0, 24), generatedAt = '2026-10-14T13:45:17Z';
 const info = {commit, map, gen, qId, dId, dataSha256: sha256(map.get(D)), generatedAt, lookupPath: 'snapshots/' + gen + '/lookup/AA.json', issuerPath: 'snapshots/' + gen + '/iss_cik_0000000001.json'};
 const rolloutText = (stage, off, g) => '(function(g){"use strict";const cohort=[' + Array.from({length: cohort}, (_, i) => JSON.stringify('T' + i)).join(',') + '];function enabled(){}const config={stage:' + stage + ',' + (off ? 'productionOff:!0,' : '') + 'cohort,eligibility:null,enabled,expectedGeneration:"' + g + '",base:"/company-intelligence/data/"};typeof module<"u"&&module.exports?module.exports=config:g.VUCompanyIntelligenceRollout=config})(typeof globalThis<"u"?globalThis:this);';
 if (mode === 'ON') {
  const lookup = J({shard: 'AA', gen}), issuer = J({companyId: 'iss_cik_0000000001', gen});
  const index = J({companyCount: 1, coveredCompanyCount: 1, generatedAt, generation: gen, lookupShards: ['AA', 'AC'], schema: CI_INDEX_SCHEMA, scope: 'CONTROLLED_COHORT', state: 'PREVIEW'});
  const manifest = {schema: 1, generation: gen, generatedAt, assets: {'index.json': {bytes: index.length, sha256: sha256(index)}, [info.lookupPath]: {bytes: lookup.length, sha256: sha256(lookup)}, [info.issuerPath]: {bytes: issuer.length, sha256: sha256(issuer)}}, tickers: ['AAPL', 'NVDA']};
  put('/company-intelligence/data/index.json', index);
  put('/company-intelligence/data/' + info.lookupPath, lookup); put('/company-intelligence/data/' + info.issuerPath, issuer);
  put('/company-intelligence/config/rollout.js', rolloutText(1, false, gen));
  const delivery = {status: 'PASS', generation: gen, files: 3, bytes: 99, retainedGenerations: 1, privateObjectsRead: 0, approvalId: 'x', cohortStocks: cohort, issuers, checkedAt: '2026-10-14T15:27:35.565Z'};
  // GOOD-Pfad: consumerCache, keine acceptedGeneration. Bootstrap-Pfad (verifyProductionConsumer): acceptedGeneration, kein consumerCache, keine refresh.json.
  put('/company-intelligence-delivery.json', J(legacy ? {...delivery, acceptedGeneration: '21cc611a43b06f488418b58a'} : {...delivery, consumerCache: {cachedAssets: 0, remoteAssets: 0}}));
  if (!legacy) put('/company-intelligence-refresh.json', J({schema: 1, status: 'PASS', generation: gen, generatedAt, manifest, inventory: {}, cohortStocks: cohort, issuers}));
  Object.assign(info, {index, lookup, issuer, manifest});
 } else {
  const index = J({schema: CI_INDEX_SCHEMA, state: 'DISABLED', companies: {}, tickers: {}});
  put('/company-intelligence/data/index.json', index);
  put('/company-intelligence/config/rollout.js', rolloutText(0, true, 'f'.repeat(24)));
  info.index = index;   // delivery.json und refresh.json fehlen: 404
 }
 info.rolloutText = rolloutText;
 return info;
}


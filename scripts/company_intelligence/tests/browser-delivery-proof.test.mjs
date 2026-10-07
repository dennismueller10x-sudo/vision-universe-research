import test from 'node:test';
import assert from 'node:assert/strict';
import {assertConsumerResponses} from '../browser-delivery-proof.mjs';
const trace = statuses => ['index.json', 'snapshots/g/lookup/AA.json', 'snapshots/g/issuer.json'].flatMap(path => statuses.map(status => ({url:'https://research.visionuniverse.de/company-intelligence/data/'+path,status})));
test('ordinary stock hydration may complete two successful reads of each immutable path',()=>{
 assertConsumerResponses(trace([200]),'AAPL');
 assertConsumerResponses(trace([200,200]),'AAPL');
 assertConsumerResponses(trace([503,200,502,200]),'AAPL');
});
test('bounded retry proof rejects permanent errors, exhausted retries and unbounded mounts',()=>{
 for(const statuses of [[403,200],[404,200],[304,200],[501,200],[503,503,503,200],[200,503],[200,200,200]])assert.throws(()=>assertConsumerResponses(trace(statuses),'AAPL'));
 assert.throws(()=>assertConsumerResponses(trace([200]).slice(0,2),'AAPL'));
 assert.throws(()=>assertConsumerResponses([...trace([200]),{url:'https://research.visionuniverse.de/company-intelligence/data/unexpected.json',status:200}],'AAPL'));
});

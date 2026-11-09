import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {edgeGutterOk,MIN_EDGE_GUTTER} from '../edge-gutter.mjs';

test('EG-1 Randabstand: gemessene Discover-Werte bestehen, Text am Rand nicht',()=>{
 assert.equal(MIN_EDGE_GUTTER,14);
 assert.equal(edgeGutterOk({left:16,right:374,viewport:390}),true);
 assert.equal(edgeGutterOk({left:24,right:744,viewport:768}),true);
 assert.equal(edgeGutterOk({left:162,right:1278,viewport:1440}),true);
 assert.equal(edgeGutterOk({left:0,right:390,viewport:390}),false);
 assert.equal(edgeGutterOk({left:16,right:385,viewport:390}),false);
 assert.equal(edgeGutterOk({left:NaN,right:1,viewport:390}),false);
});

test('EG-2 die Abnahme misst den Randabstand, nicht das padding des kastenlosen Kapitels (Lauf 42619189495)',()=>{
 const qa=readFileSync(new URL('../discover-beta-qa.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(qa,/paddingLeft/);
 assert.match(qa,/edgeGutterOk\(gutter\)/);
 const css=readFileSync(new URL('../../../company-intelligence/ui/stock-section.css',import.meta.url),'utf8');
 assert.match(css,/\.dx-chapter\.ci-company-intelligence\{padding:0;border:0/); // bewusst kastenlos (VU3)
});

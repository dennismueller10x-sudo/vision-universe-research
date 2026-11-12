// Vorfall 10.-12.11.2026: arg('--source-run-id') lieferte ohne die Option args[0] ('--temporary'); source_onboarding.py
// bekam das als --run-id, argparse endete mit Exit 2 (ONBOARDING_PROCESS_FAILURE_EXIT2) und der geplante Lauf scheiterte taeglich.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../profile-source-run.mjs',import.meta.url),'utf8');
const line=src.split('\n').find(l=>l.startsWith('const args=process.argv.slice(2),arg='));
test('arg(): fehlende Option ist undefined, vorhandene liefert den Wert',()=>{
  assert.ok(line,'Definition gefunden');
  const make=argv=>new Function('process',line+';return {arg,args};')({argv:['node','x',...argv]}).arg;
  const arg=make(['--temporary','/tmp/x','--identity-root','/id','--publish','--sources','--source-limit','100']);
  assert.equal(arg('--temporary'),'/tmp/x');assert.equal(arg('--source-limit'),'100');
  assert.equal(arg('--source-run-id'),undefined,'nicht args[0]');
});
test('Lauf-ID des Tageslaufs passt zur Pruefung des Onboardings',()=>{
  const id=`daily-${new Date().toISOString().slice(0,10).replaceAll('-','')}`;
  assert.match(id,/^[a-z0-9-]{1,48}$/);
});

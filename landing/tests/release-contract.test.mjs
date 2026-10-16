import test from 'node:test';
import {execFileSync} from 'node:child_process';
test('Öffentliche Freigabe übernimmt nur den konkreten Rechtstext bei unveränderter abgenommener Anmeldung',()=>{
  execFileSync('python3',[new URL('./release_contract.py',import.meta.url).pathname],{stdio:'pipe'});
});

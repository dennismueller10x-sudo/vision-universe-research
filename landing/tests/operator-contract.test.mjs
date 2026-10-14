import test from 'node:test';
import {execFileSync} from 'node:child_process';
test('Kontrollierter Postfachtest schützt Altbestand und prüft den Entwurf vor Versand',()=>{
  execFileSync('python3',[new URL('./operator_contract.py',import.meta.url).pathname],{stdio:'pipe'});
});

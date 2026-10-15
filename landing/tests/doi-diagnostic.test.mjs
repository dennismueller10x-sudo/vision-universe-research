import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('DOI-Diagnose schützt Autorisierung, private Übergabe und freie Providerfehler',()=>{
 execFileSync('python3',[fileURLToPath(new URL('./doi_diagnostic_contract.py',import.meta.url))],{stdio:'pipe'});
});

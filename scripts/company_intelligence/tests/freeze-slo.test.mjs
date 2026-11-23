/* Frischealarm Rollback-Freeze: WARNING ab 5 Tagen, CRITICAL ab 6 Tagen, abgelaufen/fehlend sofort CRITICAL (Steuerung 23.11.2026). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {freezeStatus,FREEZE_LIFETIME_MS} from '../freeze-expiry.mjs';
import {freezeSLO,applyFreeze,freezeNote,FREEZE_CRITICAL_HOURS} from '../freeze-slo.mjs';
const H=3600000,NOW=Date.parse('2026-11-23T12:00:00Z');
const ageDays=d=>freezeStatus({generation:'a'.repeat(24),manifest:{generatedAt:new Date(NOW-d*24*H).toISOString()}},NOW);
test('Schwellen: 4,9 Tage gesund, 5 Tage WARNING, 6 Tage CRITICAL, 7 Tage abgelaufen CRITICAL',()=>{
 assert.equal(freezeSLO(ageDays(4.9)),'HEALTHY');
 assert.equal(freezeSLO(ageDays(5.01)),'WARNING');
 assert.equal(freezeSLO(ageDays(5.9)),'WARNING');
 assert.equal(freezeSLO(ageDays(6.01)),'CRITICAL');
 assert.equal(freezeSLO(ageDays(7.5)),'CRITICAL');
 assert.equal(FREEZE_CRITICAL_HOURS,24);
});
test('fehlend, unlesbar und ohne Datum sind CRITICAL; kein Feld laesst das Urteil unveraendert',()=>{
 assert.equal(freezeSLO(freezeStatus(null,NOW)),'CRITICAL');
 assert.equal(freezeSLO({state:'UNREADABLE',warn:true}),'CRITICAL');
 assert.equal(freezeSLO(freezeStatus({generation:'x',manifest:{generatedAt:'kaputt'}},NOW)),'CRITICAL');
 const v={status:'HEALTHY',exitCode:0};assert.equal(applyFreeze(v),v);
});
test('applyFreeze hebt nur an, nie ab; Exit-Code 1 nur bei CRITICAL; OFF bleibt bei gesundem Freeze',()=>{
 const mk=(status,days,exitCode=status==='CRITICAL'?1:0)=>applyFreeze({status,exitCode,rollbackFreeze:ageDays(days)});
 assert.deepEqual([mk('HEALTHY',1).status,mk('HEALTHY',1).exitCode],['HEALTHY',0]);
 assert.deepEqual([mk('HEALTHY',5.5).status,mk('HEALTHY',5.5).exitCode],['WARNING',0]);
 assert.deepEqual([mk('HEALTHY',6.5).status,mk('HEALTHY',6.5).exitCode],['CRITICAL',1]);
 assert.deepEqual([mk('OFF',1).status,mk('OFF',1).freezeSLO],['OFF','HEALTHY']);
 assert.equal(mk('OFF',5.5).status,'WARNING');
 assert.deepEqual([mk('CRITICAL',1).status,mk('CRITICAL',1).exitCode],['CRITICAL',1],'ein CRITICAL wird nie abgesenkt');
 assert.equal(mk('WARNING',1).status,'WARNING');
});
test('Meldung: Fehler bei CRITICAL, Warnung bei WARNING, nichts bei gesund; nennt den Notfall-Workflow',()=>{
 assert.equal(freezeNote(applyFreeze({status:'HEALTHY',exitCode:0,rollbackFreeze:ageDays(1)})),null);
 assert.match(freezeNote(applyFreeze({status:'HEALTHY',exitCode:0,rollbackFreeze:ageDays(5.5)})),/^::warning::.*EXPIRING/);
 assert.match(freezeNote(applyFreeze({status:'HEALTHY',exitCode:0,rollbackFreeze:ageDays(8)})),/^::error::.*EXPIRED.*refreeze-recover/);
 assert.ok(FREEZE_LIFETIME_MS===7*24*H);
});

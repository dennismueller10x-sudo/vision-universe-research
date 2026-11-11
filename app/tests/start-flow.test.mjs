// Startablauf (Strang AA): ohne Sitzung die native Maske, mit Sitzung die Willkommensseite; Web-Anmeldeseite nie zuerst.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startFlow, isNativeApp} from '../www/js/start-flow.js';

const fakeAuth = ({saved = false, throws = false, hang = false, rejectRefresh = false} = {}) => {
  let signedIn = false;
  return {state: () => ({signedIn}), calls: [], async restore(opts) {
    this.calls.push(opts || {});
    if (hang) return new Promise(() => {});
    if (throws) throw new Error('STORE');
    if (saved) signedIn = true;
    if (opts?.forceRefresh && rejectRefresh) { signedIn = false; }
    return {signedIn};
  }};
};

test('App ohne Sitzung: Maske zuerst (Tor), "Spaeter anmelden" moeglich', async () => {
  assert.deepEqual(await startFlow({native: true, auth: fakeAuth()}), {signedIn: false, gate: true, view: 'account'});
});
test('App mit gespeicherter Sitzung: Willkommensseite, kein Tor', async () => {
  assert.deepEqual(await startFlow({native: true, auth: fakeAuth({saved: true})}), {signedIn: true, gate: false, view: 'start'});
});
test('Biometrie an: Refresh wird erzwungen; abgelehnt -> Maske', async () => {
  const a = fakeAuth({saved: true, rejectRefresh: true});
  const r = await startFlow({native: true, auth: a, biometricEnabled: true});
  assert.deepEqual(a.calls, [{forceRefresh: true}]); assert.equal(r.view, 'account');
  assert.equal((await startFlow({native: true, auth: fakeAuth({saved: true}), biometricEnabled: true})).view, 'start');
});
test('Speicherfehler oder haengender Speicher blockieren den Start nicht und fuehren zur Maske', async () => {
  assert.equal((await startFlow({native: true, auth: fakeAuth({throws: true})})).view, 'account');
  const t = Date.now();
  assert.equal((await startFlow({native: true, auth: fakeAuth({hang: true}), timeoutMs: 30})).view, 'account');
  assert.ok(Date.now() - t < 1000);
});
test('Kein App-Kontext (Browser-Entwicklung): nie das Tor', async () => {
  assert.equal((await startFlow({native: false, auth: fakeAuth()})).view, 'start');
});
test('App-Erkennung: Capacitor-Global ODER Marke VUApp/1', () => {
  assert.equal(isNativeApp({Capacitor: {isNativePlatform: () => true}}), true);
  assert.equal(isNativeApp({navigator: {userAgent: 'Mozilla/5.0 Mobile/15E148 VUApp/1 VUEdge/1'}}), true);
  assert.equal(isNativeApp({navigator: {userAgent: 'Mozilla/5.0 Safari'}}), false);
});
test('main.js: Start ueber startFlow, Rahmen erst danach; Abmelden fuehrt zur Maske; Web-Anmeldung nie in der App', () => {
  const main = fs.readFileSync(new URL('../www/js/main.js', import.meta.url), 'utf8');
  assert.match(main, /const start = await startFlow\(/);
  assert.ok(main.indexOf('await startFlow(') < main.indexOf('show(start.view)'), 'Ansicht erst nach der Sitzungspruefung');
  assert.doesNotMatch(main, /\n  show\('start'\);\n  hideSplash/, 'kein sofortiges Laden der Webseite vor dem Tor');
  assert.match(main, /if \(native\) \{ gate = true;[^\n]*show\('account'\)/, 'Abmelden -> Maske');
});

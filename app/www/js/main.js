import {readConfig} from './config.js';
import {pickStore} from './token-store.js';
import {createAuth, OFFLINE} from './auth.js';
import {createApi} from './api.js';
import {biometricStore, nativePreferences} from './biometric.js';
import {createPush} from './push.js';

const $ = id => document.getElementById(id);
// Startbild: wird nach dem Start ausgeblendet; zusaetzlich nach spaetestens 5 s, damit ein Fehler nie ein weisses Startbild stehen laesst.
const hideSplash = () => { try { (globalThis.VUNative?.SplashScreen || globalThis.Capacitor?.Plugins?.SplashScreen)?.hide?.(); } catch { /* ohne Plugin weiter */ } };
if (globalThis.Capacitor?.isNativePlatform?.()) setTimeout(hideSplash, 5000);
// Der Pfad gilt von js/main.js aus: das Bundle liegt in www/vendor/ (nicht in www/js/vendor/).
if (globalThis.Capacitor?.isNativePlatform?.()) { try { await import('../vendor/native.js'); } catch { /* ohne Bundle: Arbeitsspeicher, Anmeldung bleibt nutzbar */ } }
const config = readConfig();
const n = globalThis.VUNative;
const baseStore = pickStore();
const biometric = n && baseStore.kind === 'keychain' ? biometricStore({store: baseStore, plugin: n.NativeBiometric, preferences: nativePreferences(n, 'vu.biometric.v1')}) : null;
await biometric?.init();
const auth = createAuth({config, store: biometric || baseStore});
const api = createApi({config, auth});
const cap = globalThis.Capacitor;
const native = Boolean(cap?.isNativePlatform?.());
if (native) document.documentElement.classList.add('native');
let gate = false;   // Anmelde-Bildschirm beim Start (nur nativ, nur ohne Sitzung)
const push = createPush({plugin: n?.PushNotifications, api, platform: cap?.getPlatform?.(), preferences: n ? nativePreferences(n, 'vu.push.v1') : {get: async () => null, set: async () => {}}});
await push.init();
let current = null;
let pendingBack = null;
let lastFrame = 'start';

// ---- Native Randgeste (iOS, VUBridgeViewController) ------------------------
// Die Shell reicht nur Navigationszustand und Haptik-Wuensche weiter; die Website im Iframe kann native Funktionen nie direkt rufen.
const nativeNav = globalThis.webkit?.messageHandlers?.vuNav;
const toNative = msg => { try { nativeNav?.postMessage(msg); } catch { /* aeltere App ohne Handler */ } };
const isFrameView = name => Boolean($('v-' + name)?.querySelector('iframe'));
// Haptik: iOS ueber den eigenen Handler (kein Plugin noetig), Android ueber @capacitor/haptics, falls im Bundle.
function haptic(style) {
  if (nativeNav) { toNative({type: 'haptic', style}); return; }
  const h = globalThis.VUNative?.Haptics;
  try { if (style === 'impact') h?.impact?.({style: 'LIGHT'}); else h?.selectionChanged?.(); } catch { /* optional */ }
}
function currentFrame() { return $('v-' + current)?.querySelector('iframe'); }
function panelState(name) { toNative({type: 'state', back: true, forward: false, key: 'panel:' + name, backKey: null, forwardKey: null, settled: true}); }
globalThis.VUAppNav = {
  go(direction) {
    if (!isFrameView(current)) { if (direction === 'back') show(lastFrame); return; }
    const frame = currentFrame();
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage(direction === 'forward' ? {type: 'vu:forward'} : {type: 'vu:back', request: 0}, config.contentOrigin);
  },
};
// Zustand des sichtbaren Iframes (Herkunft und Fenster geprueft) an die native Geste; ab Start, nicht erst nach der Anmeldung.
addEventListener('message', event => {
  const frame = currentFrame();
  if (event.origin !== config.contentOrigin || event.source !== frame?.contentWindow) return;
  const d = event.data || {};
  if (d.type === 'vu:nav-state') toNative({type: 'state', back: Boolean(d.back), forward: Boolean(d.forward), settled: Boolean(d.settled),
    key: typeof d.key === 'string' ? d.key.slice(0, 200) : null, backKey: typeof d.backKey === 'string' ? d.backKey.slice(0, 200) : null,
    forwardKey: typeof d.forwardKey === 'string' ? d.forwardKey.slice(0, 200) : null});
  if (d.type === 'vu:haptic') haptic(d.style === 'impact' ? 'impact' : 'selection');
});

// ---- Token-Bruecke fuer die Website im Rahmen (Strang AA) --------------------
// Cookies von konto.visionuniverse.de sind im Rahmen unter capacitor://localhost Drittanbieter-Cookies (WKWebView/ITP blockiert sie).
// Darum gibt es genau eine Anmeldung, die native; die Website bekommt das Zugriffstoken NUR auf Anfrage, NUR von einem unserer Rahmen
// (Herkunft = contentOrigin und Fenster = ein Rahmen dieser Shell) und die Antwort geht mit targetOrigin = contentOrigin (nie '*').
// Das Refresh-Token verlaesst die Shell nie; Erneuerung macht auth.accessToken()/forceRefresh().
let restoreDone = () => {};
const restored = new Promise(resolve => { restoreDone = resolve; });
const frameWindows = () => [...document.querySelectorAll('.frame-view iframe')].map(f => f.contentWindow).filter(Boolean);
addEventListener('message', async event => {
  const d = event.data || {};
  if (d.type !== 'vu:token-request' || event.origin !== config.contentOrigin || !frameWindows().includes(event.source)) return;
  if (!(typeof d.id === 'string' || typeof d.id === 'number') || String(d.id).length > 64) return;
  await Promise.race([restored, new Promise(resolve => setTimeout(resolve, 20000))]);   // Start/Face ID abwarten
  let token = null;
  try { token = d.force ? await auth.forceRefresh() : await auth.accessToken(); } catch { token = null; }
  try { event.source.postMessage({type: 'vu:token', id: d.id, token: token || null}, config.contentOrigin); } catch { /* Rahmen weg */ }
});
// Anmelden/Abmelden in der Shell: geladene Seiten holen sich ein neues Token (sie laden sich neu, kein Zustand im Rahmen).
let wasSignedIn = null;
auth.onChange(s => {
  if (wasSignedIn !== null && wasSignedIn !== s.signedIn) frameWindows().forEach(w => { try { w.postMessage({type: 'vu:auth-changed'}, config.contentOrigin); } catch { /* optional */ } });
  wasSignedIn = s.signedIn;
});

// ---- Navigation ----------------------------------------------------------
function show(name) {
  pendingBack = null;
  current = name;
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== 'v-' + name; });
  document.querySelectorAll('#tabs button').forEach(b => { if (b.dataset.view === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  const view = $('v-' + name);
  const frame = view.querySelector('iframe');
  if (frame && !frame.src) frame.src = config.contentOrigin + view.dataset.path;   // erst beim ersten Besuch laden
  if (name === 'watchlist') loadWatchlist();
  if (name === 'account') renderAccount();
  if (frame) { lastFrame = name; try { frame.contentWindow?.postMessage({type: 'vu:nav-query'}, config.contentOrigin); } catch { /* noch nicht geladen */ } }
  else panelState(name);
}
document.querySelectorAll('#tabs button, .back').forEach(b => b.addEventListener('click', () => show(b.dataset.view)));
$('skip-login').addEventListener('click', () => { gate = false; show('start'); });

// ---- Verbindung ----------------------------------------------------------
function setOffline(off) { $('offline').hidden = !off; }
setOffline(globalThis.navigator ? !navigator.onLine : false);
addEventListener('online', () => { setOffline(false); if (current === 'watchlist') loadWatchlist(); });
addEventListener('offline', () => setOffline(true));

// ---- Konto ---------------------------------------------------------------
function text(id, value) { $(id).textContent = value ?? ''; }
async function renderAccount() {
  const s = auth.state();
  $('login').hidden = s.signedIn; $('account-info').hidden = !s.signedIn;
  if (!s.signedIn) return;
  $('biometric-setting').hidden = !biometric;
  $('biometric-enabled').checked = biometric?.enabled() || false;
  $('push-enabled').checked = push.enabled();
  text('acc-email', s.user.email); text('acc-plan', 'wird geladen'); text('acc-session', baseStore.kind === 'keychain' ? (biometric?.enabled() ? 'Keychain / Keystore mit Biometrie' : 'Keychain / Keystore') : 'nur Arbeitsspeicher (Entwicklung)');
  try { const me = await api.me(); text('acc-plan', me?.entitlements?.plan_id || 'free'); }
  catch (e) { text('acc-plan', e.code === OFFLINE ? 'offline' : 'nicht verfügbar'); }
}
$('login').addEventListener('submit', async ev => {
  ev.preventDefault();
  const err = $('login-error'); err.hidden = true;
  try { await auth.signIn($('email').value, $('password').value); $('password').value = '';
    if (biometric && !biometric.asked() && await biometric.available()) {
      const enabled = confirm('Künftig mit Face ID / Touch ID / Fingerabdruck anmelden?');
      await biometric.choose(enabled).catch(() => { text('settings-state', 'Biometrie konnte nicht aktiviert werden.'); });
    }
    await push.resume().catch(() => { text('settings-state', 'Benachrichtigungen konnten nicht synchronisiert werden.'); }); renderAccount();
    if (gate) { gate = false; show('start'); } }
  catch (e) {
    err.textContent = {INVALID_CREDENTIALS: 'E-Mail oder Passwort stimmt nicht.', invalid_credentials: 'E-Mail oder Passwort stimmt nicht.',
      email_not_confirmed: 'Bitte zuerst die E-Mail-Adresse bestätigen.', [OFFLINE]: 'Keine Verbindung. Bitte später erneut versuchen.',
      NOT_CONFIGURED: 'Die App ist nicht konfiguriert.'}[e.code] || 'Anmeldung nicht möglich.';
    err.hidden = false;
  }
});
$('logout').addEventListener('click', async () => { try { await push.disable(); } catch { /* Serverbereinigung beim naechsten Anmelden wiederholen. */ }
  await auth.signOut(); renderAccount(); renderWatchlist(null); });
$('biometric-enabled').addEventListener('change', async ev => {
  try { await biometric.choose(ev.target.checked); } catch { ev.target.checked = biometric.enabled(); }
});
$('push-enabled').addEventListener('change', async ev => {
  try { if (ev.target.checked) await push.enable(); else await push.disable(); text('settings-state', 'Einstellung gespeichert.'); }
  catch { ev.target.checked = push.enabled(); text('settings-state', 'Benachrichtigungen konnten nicht geändert werden. Bitte Berechtigung und Verbindung prüfen.'); }
});
auth.onChange(() => { if (current === 'account') renderAccount(); });

// ---- Watchlist -----------------------------------------------------------
function renderWatchlist(data, note) {
  const list = $('wl-list'); list.replaceChildren();
  text('wl-state', note || '');
  for (const item of (data?.items || [])) {
    const li = document.createElement('li');
    const name = document.createElement('span'); name.textContent = item.ticker;
    const rm = document.createElement('button'); rm.type = 'button'; rm.textContent = 'Entfernen'; rm.setAttribute('aria-label', item.ticker + ' entfernen');
    rm.addEventListener('click', async () => {
      try { await api.removeFromWatchlist(item); await loadWatchlist(); }
      catch (e) { text('wl-state', e.code === OFFLINE ? 'Keine Verbindung. Änderung nicht gespeichert.' : 'Entfernen nicht möglich.'); }
    });
    li.append(name, rm); list.append(li);
  }
}
async function loadWatchlist() {
  if (!auth.state().signedIn) return renderWatchlist(null, 'Bitte unter „Konto“ anmelden.');
  text('wl-state', 'lädt …');
  try {
    const data = await api.watchlist();
    renderWatchlist(data, data.items.length ? '' : 'Noch keine Werte. Die Watchlist ist dieselbe wie im Web.');
  } catch (e) {
    renderWatchlist(null, e.code === OFFLINE ? 'Keine Verbindung. Die Watchlist wird nach der Wiederverbindung geladen.'
      : e.code === 'NOT_AUTHENTICATED' ? 'Bitte erneut anmelden.' : 'Watchlist nicht verfügbar.');
  }
}

// ---- Start ---------------------------------------------------------------
$('config-missing').hidden = config.configured;
(async () => {
  show('start');
  hideSplash();
  // Ohne Biometrie wie vor E4: ein haengender Speicher blockiert den Start nicht. Mit Biometrie: Pruefung und Refresh abwarten.
  try {
    if (biometric?.enabled()) await auth.restore({forceRefresh: true});
    else await Promise.race([auth.restore(), new Promise(resolve => setTimeout(resolve, 4000))]);
  } catch { /* ohne gespeicherte Sitzung weiter */ }
  restoreDone();
  if (auth.state().signedIn) await push.resume().catch(() => {});
  // Ohne Sitzung zuerst die Anmeldung anbieten (die App hat keine eigene Leiste mehr); "Spaeter anmelden" fuehrt in die App.
  if (native && !auth.state().signedIn && current === 'start') { gate = true; $('skip-login').hidden = false; show('account'); }
  if (native) {
    const n = globalThis.VUNative || {};
    hideSplash();
    let backRequest = 0;
    // Die Webseite darf Konto oder Watchlist der App oeffnen (z. B. aus ihrem Menue): {type:'vu:open', view:'account'|'watchlist'}
    addEventListener('message', event => {
      const frame = $('v-' + current)?.querySelector('iframe');
      if (event.origin !== config.contentOrigin || event.source !== frame?.contentWindow || event.data?.type !== 'vu:open') return;
      if (event.data.view === 'account' || event.data.view === 'watchlist') show(event.data.view);
    });
    addEventListener('message', event => {
      const frame = $('v-' + current)?.querySelector('iframe');
      if (event.origin !== config.contentOrigin || event.source !== frame?.contentWindow || event.data?.type !== 'vu:back-result' || event.data.request !== pendingBack) return;
      pendingBack = null;
      if (!event.data.handled) n.App?.minimizeApp();
    });
    n.App?.addListener('backButton', () => {
      if (pendingBack !== null) return;
      const frame = $('v-' + current)?.querySelector('iframe');
      if (!frame?.contentWindow) { show('start'); return; }
      const request = ++backRequest; pendingBack = request;
      frame.contentWindow.postMessage({type: 'vu:back', request}, config.contentOrigin);
      // Offline/old content cannot answer; keep a usable root fallback.
      setTimeout(() => { if (pendingBack === request) { pendingBack = null; n.App?.minimizeApp(); } }, 1000);
    });
    try { n.App?.addListener('resume', () => { auth.accessToken().catch(() => {}); }); } catch { /* optional */ }
    try { n.Network?.addListener('networkStatusChange', st => setOffline(!st.connected)); } catch { /* optional */ }
  }
  globalThis.__vuReady = true;
})();

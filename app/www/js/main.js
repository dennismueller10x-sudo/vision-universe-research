import {readConfig} from './config.js';
import {pickStore} from './token-store.js';
import {createAuth, OFFLINE} from './auth.js';
import {createApi} from './api.js';

const $ = id => document.getElementById(id);
if (globalThis.Capacitor?.isNativePlatform?.()) { try { await import('./vendor/native.js'); } catch { /* ohne Bundle: Arbeitsspeicher, Anmeldung bleibt nutzbar */ } }
const config = readConfig();
const auth = createAuth({config, store: pickStore()});
const api = createApi({config, auth});
const cap = globalThis.Capacitor;
const native = Boolean(cap?.isNativePlatform?.());
let current = null;

// ---- Navigation ----------------------------------------------------------
function show(name) {
  current = name;
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== 'v-' + name; });
  document.querySelectorAll('#tabs button').forEach(b => { if (b.dataset.view === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  const view = $('v-' + name);
  const frame = view.querySelector('iframe');
  if (frame && !frame.src) frame.src = config.contentOrigin + view.dataset.path;   // erst beim ersten Besuch laden
  if (name === 'watchlist') loadWatchlist();
  if (name === 'account') renderAccount();
}
document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.view)));

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
  text('acc-email', s.user.email); text('acc-plan', 'wird geladen'); text('acc-session', native ? 'Keychain' : 'nur Arbeitsspeicher (Entwicklung)');
  try { const me = await api.me(); text('acc-plan', me?.entitlements?.plan_id || 'free'); }
  catch (e) { text('acc-plan', e.code === OFFLINE ? 'offline' : 'nicht verfügbar'); }
}
$('login').addEventListener('submit', async ev => {
  ev.preventDefault();
  const err = $('login-error'); err.hidden = true;
  try { await auth.signIn($('email').value, $('password').value); $('password').value = ''; renderAccount(); }
  catch (e) {
    err.textContent = {INVALID_CREDENTIALS: 'E-Mail oder Passwort stimmt nicht.', invalid_credentials: 'E-Mail oder Passwort stimmt nicht.',
      email_not_confirmed: 'Bitte zuerst die E-Mail-Adresse bestätigen.', [OFFLINE]: 'Keine Verbindung. Bitte später erneut versuchen.',
      NOT_CONFIGURED: 'Die App ist nicht konfiguriert.'}[e.code] || 'Anmeldung nicht möglich.';
    err.hidden = false;
  }
});
$('logout').addEventListener('click', async () => { await auth.signOut(); renderAccount(); renderWatchlist(null); });
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
  await auth.restore();
  show('discover');
  if (native) {
    const n = globalThis.VUNative || {};
    try { await n.SplashScreen?.hide(); } catch { /* ohne Plugin weiter */ }
    try { n.App?.addListener('resume', () => { auth.accessToken().catch(() => {}); }); } catch { /* optional */ }
    try { n.Network?.addListener('networkStatusChange', st => setOffline(!st.connected)); } catch { /* optional */ }
  }
  globalThis.__vuReady = true;
})();

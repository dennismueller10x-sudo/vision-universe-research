import {createConsentManager, STORAGE_KEY} from './consent-state.js';

let storage;
try {storage = window.localStorage;} catch { /* Storage can be unavailable. */ }
const manager = createConsentManager({storage});
const banner = document.getElementById('cookie-banner');
const dialog = document.getElementById('cookie-dialog');
const form = document.getElementById('cookie-form');
const message = document.getElementById('cookie-message');
const announcement = document.getElementById('cookie-announcement');
let returnFocus;
let expiryTimer;
let storageUnavailable = false;

function render() {
  const state = manager.snapshot();
  clearTimeout(expiryTimer);
  if (state.expiresAt) expiryTimer = setTimeout(refreshState, Math.min(state.expiresAt - Date.now(), 2147483647));
  banner.hidden = !state.needsChoice;
  document.getElementById('cookie-banner-summary').textContent = state.services.length ?
    'Wir speichern deine Cookie-Auswahl in diesem Browser. Optionale Statistik- und Marketingdienste werden nur nach deiner Einwilligung freigegeben. Details zu den Diensten findest du in den Einstellungen.' :
    'Wir speichern deine Cookie-Auswahl in diesem Browser. Aktuell verwenden wir keine optionalen Analyse- oder Marketingdienste.';
  for (const category of ['statistics', 'marketing']) {
    const input = document.getElementById('cookie-' + category);
    input.disabled = !state.available[category];
    input.checked = state.preferences[category];
    const services = state.services.filter(s => s.category === category);
    if (services.length) document.getElementById('cookie-' + category + '-description').textContent =
      services.map(s => `${s.name}: ${s.description}`).join(' ');
  }
  return state;
}
function refreshState(fromStorage = false) {
  try {manager.refresh({fromStorage}); render();}
  catch {message.textContent = 'Bitte prüfe deine Cookie-Einstellungen erneut.';}
}
function openSettings(trigger) {
  returnFocus = trigger;
  manager.refresh(); render(); message.textContent = storageUnavailable ?
    'Deine Auswahl gilt für diesen Besuch. Dein Browser erlaubt keine dauerhafte Speicherung.' : '';
  if (!dialog.open) dialog.showModal();
}
function save(preferences) {
  try {
    const result = manager.save(preferences);
    render();
    const text = result.persisted ? 'Deine Cookie-Auswahl wurde gespeichert.' :
      'Deine Auswahl gilt für diesen Besuch. Dein Browser erlaubt uns nicht, sie dauerhaft zu speichern.';
    if (dialog.open) dialog.close();
    else if (banner.contains(document.activeElement)) document.querySelector('[data-cookie-settings]:not(.cookie-banner *)')?.focus();
    announcement.textContent = text;
    announcement.toggleAttribute('data-storage-unavailable', !result.persisted);
    storageUnavailable = !result.persisted;
  } catch {
    message.textContent = 'Optionale Dienste konnten nicht freigegeben werden. Bitte wähle nur notwendige Dienste.';
    render();
  }
}
document.addEventListener('click', event => {
  const settings = event.target.closest('[data-cookie-settings]');
  if (settings) {event.preventDefault(); openSettings(settings); return;}
  const button = event.target.closest('[data-cookie-choice]');
  if (button) save({statistics: button.dataset.cookieChoice === 'all', marketing: button.dataset.cookieChoice === 'all'});
});
form.addEventListener('submit', event => {
  event.preventDefault();
  save({statistics: document.getElementById('cookie-statistics').checked, marketing: document.getElementById('cookie-marketing').checked});
});
document.getElementById('cookie-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('keydown', event => {
  if (event.key !== 'Tab') return;
  const controls = [...dialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled])')].filter(e => e.getClientRects().length);
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last.focus();}
  else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first.focus();}
});
dialog.addEventListener('close', () => {
  if (returnFocus?.isConnected && !returnFocus.closest('[hidden]')) returnFocus.focus();
  else document.querySelector('footer [data-cookie-settings]')?.focus();
});
window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY || event.key === null) refreshState(true);
});
window.addEventListener('pageshow', () => refreshState());
document.addEventListener('visibilitychange', () => {if (!document.hidden) refreshState();});
// Future first-party integrations must register both activation and real cleanup.
// The existing CSP still blocks external scripts/connections until separately reviewed.
window.VisionUniverseConsent = Object.freeze({
  allows: category => manager.allows(category),
  registerService: service => {const state = manager.registerService(service); render(); return state;}
});
render();

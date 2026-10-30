// Oeffentliche Seiten auf konto.visionuniverse.de – ohne Research-Passwortmaske und ohne Anmeldung:
//   /rechtliches/…  Impressum, Datenschutz, Bedingungen, Widerrufsbelehrung, Muster-Formular, Newsletter
//   /kuendigen      Kuendigungsfunktion (§ 312k BGB): „Jetzt kündigen“ -> Eingangsbestaetigung
//   /widerrufen     Widerrufsfunktion (§ 356a BGB): „Vertrag widerrufen“ -> Angaben ->
//                   „Widerruf bestätigen“ -> Eingangsbestaetigung (Seite und E-Mail)
// Reines HTML ohne Skript (CSP: kein Skript, nur eigene Formularziele). Formulare pruefen die Herkunft
// (gleicher Host). Die Research-Passwortmaske bleibt unveraendert; sie ist keine Sicherheitsgrenze und
// darf gesetzliche Verbraucherrechte nicht erschweren – deshalb liegen diese Seiten hier.

import {HttpError, readText} from './http.mjs';
import {DOCS, LINKS, LEGAL_STATUS, LEGAL_VERSION, COMPANY} from './legal/texts.mjs';
import {receivePublicCancellation, receivePublicWithdrawal} from './cancellation.mjs';
import * as v from './validate.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

// **fett**, [Text](/pfad) und [Text](https://…); alles andere wird maskiert.
export function inline(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((\/[A-Za-z0-9/_.#-]*|https:\/\/[A-Za-z0-9./_#?=&;-]+)\)/g, (m, t, href) => `<a href="${href}">${t}</a>`)
    .replace(/\[\[(OFFEN|PRÜFEN): ([^\]]+)\]\]/g, '<mark class="open">[$1: $2]</mark>')
    .replace(/\n/g, '<br>');
}

function block(b) {
  if (b.h) return `<h2>${inline(b.h)}</h2>`;
  if (b.ul) return `<ul>${b.ul.map(x => `<li>${inline(x)}</li>`).join('')}</ul>`;
  if (b.note) return `<p class="note">${inline(b.note)}</p>`;
  return `<p>${inline(b.p)}</p>`;
}

const CSS = `:root{color-scheme:light dark;--bg:#fff;--fg:#0d0f12;--muted:#5d636b;--line:#e3e5e8;--soft:#f5f6f2;--acc:#4f6b00;--btn:#c8f531}
@media(prefers-color-scheme:dark){:root{--bg:#08080a;--fg:#f4f5f1;--muted:#a1a7af;--line:#26282c;--soft:#141518;--acc:#c8f531}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto;padding:28px 18px 56px}header a{color:var(--fg);font-weight:800;letter-spacing:.06em;text-decoration:none;font-size:13px}
h1{font-size:clamp(28px,6vw,38px);line-height:1.1;letter-spacing:-.03em;margin:22px 0 14px}h2{font-size:19px;margin:28px 0 8px}
a{color:var(--acc);font-weight:600}.note,.draft{padding:12px 14px;border-radius:14px;background:var(--soft);border:1px solid var(--line);font-size:14px}
.draft{border-color:#e0a100}mark.open{background:#fff3cd;color:#3d2e00;border-radius:4px;padding:0 3px}
form{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;margin-top:18px;padding:18px;border:1px solid var(--line);border-radius:18px;min-width:0}
label{display:grid;grid-template-columns:minmax(0,1fr);gap:6px;font-weight:600;font-size:14px;min-width:0}input,select,textarea{width:100%;max-width:100%;min-width:0;font:inherit;font-size:16px;min-height:48px;padding:10px 12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--fg)}
textarea{min-height:90px}button{font:inherit;font-weight:800;min-height:52px;padding:12px 22px;border-radius:999px;border:0;background:var(--btn);color:#08080a;cursor:pointer}
.secondary{background:transparent;color:var(--fg);border:1px solid var(--line)}.muted{color:var(--muted);font-size:14px}
dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px}dt{color:var(--muted)}dd{margin:0;font-weight:600;overflow-wrap:anywhere}
footer{margin-top:40px;font-size:14px;display:flex;flex-wrap:wrap;gap:8px 16px}@media print{form,footer,header{display:none}}`;

const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY', 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

function page(title, body, {status = 200, robots = 'index'} = {}) {
  const draft = LEGAL_STATUS !== 'freigegeben'
    ? `<p class="draft"><strong>Entwurf</strong> – Fassung ${esc(LEGAL_VERSION)}, noch nicht rechtlich freigegeben. Markierte Stellen werden vor der Freigabe ergänzt.</p>` : '';
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="${robots === 'index' ? 'index,follow' : 'noindex,nofollow'}"><title>${esc(title)} · Vision Universe</title><style>${CSS}</style></head>
<body><main><header><a href="${LINKS.index}">VISION UNIVERSE</a></header><h1>${esc(title)}</h1>${draft}${body}
<footer><a href="${LINKS.kuendigen}">Verträge hier kündigen</a><a href="${LINKS.widerrufen}">Vertrag widerrufen</a><a href="${LINKS.agb}">Bedingungen</a><a href="${LINKS.datenschutz}">Datenschutz</a><a href="${LINKS.impressum}">Impressum</a></footer>
</main></body></html>`;
  return new Response(html, {status, headers: HEADERS});
}

export function legalPage(key) {
  return () => {
    const doc = DOCS[key];
    return page(doc.title, doc.blocks.map(block).join(''));
  };
}

export function legalIndex() {
  const items = [['impressum', 'Impressum'], ['agb', 'Nutzungs- und Vertragsbedingungen (Free und Pro)'], ['widerrufsbelehrung', 'Widerrufsbelehrung'],
    ['widerrufsformular', 'Muster-Widerrufsformular'], ['datenschutz', 'Datenschutzerklärung'], ['newsletter', 'Newsletter: Datenschutz und Einwilligung']];
  return page('Rechtliches', `<ul>${items.map(([k, t]) => `<li><a href="${LINKS[k]}">${esc(t)}</a></li>`).join('')}</ul>
<p><a href="${LINKS.kuendigen}">Verträge hier kündigen</a> · <a href="${LINKS.widerrufen}">Vertrag widerrufen</a></p>
<p class="muted">Anbieter: ${esc(COMPANY.name)}, ${esc(COMPANY.street)}, ${esc(COMPANY.city)}.</p>`);
}

// Formulare nur vom eigenen Host (Origin, sonst Referer). Kein Skript, kein Cookie noetig.
function assertSameOrigin(ctx) {
  const own = ctx.cfg.apiOrigin;
  const origin = ctx.request.headers.get('Origin');
  const referer = ctx.request.headers.get('Referer') || '';
  if (origin ? origin !== own : !referer.startsWith(own + '/')) throw new HttpError(403, 'ORIGIN_NOT_ALLOWED');
}
async function readForm(ctx) {
  if (!/^application\/x-www-form-urlencoded\b/i.test(ctx.request.headers.get('Content-Type') || '')) throw new HttpError(415, 'FORM_REQUIRED');
  return new URLSearchParams(await readText(ctx.request, 8192));
}
const field = (name, label, value, attrs = '') =>
  `<label>${esc(label)}<input name="${name}" value="${esc(value || '')}" ${attrs}></label>`;
const hidden = (name, value) => `<input type="hidden" name="${name}" value="${esc(value || '')}">`;
const errorBox = text => text ? `<p class="note" role="alert"><strong>${esc(text)}</strong></p>` : '';
const MESSAGES = {EMAIL_INVALID: 'Bitte gib eine gültige E-Mail-Adresse an.', NAME_REQUIRED: 'Bitte gib deinen Namen an.',
  RATE_LIMITED: 'Zu viele Anfragen. Bitte versuche es in einer Stunde erneut oder schreibe an ' + COMPANY.email + '.'};

function receipt(title, text, data) {
  const when = new Date(data.receivedAt).toLocaleString('de-DE', {timeZone: 'Europe/Berlin', dateStyle: 'long', timeStyle: 'medium'}) + ' Uhr';
  return page(title, `<p>${esc(text)}</p><dl><dt>Bestätigungsnummer</dt><dd>${esc(data.confirmationId)}</dd><dt>Eingang</dt><dd>${esc(when)}</dd>
<dt>E-Mail-Bestätigung</dt><dd>${data.emailSent ? 'versendet' : 'folgt (wird nachgereicht)'}</dd></dl>
<p class="muted">Bitte speichere oder drucke diese Seite als Nachweis.</p>`, {robots: 'noindex'});
}

// ---------------------------------------------------------------- Kuendigen (§ 312k BGB)
function cancelPage(values = {}, error = null) {
  return page('Verträge hier kündigen', `<p>Hier kündigst du dein Vision-Universe-Abonnement – ohne Anmeldung. Die ordentliche Kündigung wirkt zum Ende des bezahlten Monats; danach gilt automatisch Free. Angemeldet geht es auch im Konto unter „Abonnement“.</p>
${errorBox(error)}<form method="post" action="${LINKS.kuendigen}">
${field('fullName', 'Name (Pflicht)', values.fullName, 'required maxlength="120" autocomplete="name"')}
${field('email', 'E-Mail-Adresse deines Kontos (Pflicht)', values.email, 'type="email" required maxlength="254" autocomplete="email"')}
${field('reference', 'Vertrags- oder Rechnungsnummer (optional)', values.reference, 'maxlength="120"')}
<label>Art der Kündigung<select name="kind"><option value="ordinary">Ordentlich (zum nächstmöglichen Termin)</option><option value="extraordinary"${values.kind === 'extraordinary' ? ' selected' : ''}>Außerordentlich (fristlos)</option></select></label>
<label>Grund (nur bei außerordentlicher Kündigung)<textarea name="reason" maxlength="500">${esc(values.reason || '')}</textarea></label>
<button type="submit">Jetzt kündigen</button></form>`, {robots: 'noindex'});
}
export const cancelGet = () => cancelPage();
export async function cancelPost(ctx) {
  assertSameOrigin(ctx);
  const f = await readForm(ctx);
  const values = {fullName: f.get('fullName'), email: f.get('email'), reference: f.get('reference'), kind: f.get('kind'), reason: f.get('reason')};
  let email;
  try { email = v.email(values.email); } catch { return cancelPage(values, MESSAGES.EMAIL_INVALID); }
  const fullName = v.shortText(values.fullName, 120);
  if (!fullName) return cancelPage(values, MESSAGES.NAME_REQUIRED);
  try { await ctx.limit('cancellation', ctx.ip || email); await ctx.limit('cancellationEmail', email); }
  catch { return cancelPage(values, MESSAGES.RATE_LIMITED); }
  const kind = values.kind === 'extraordinary' ? 'extraordinary' : 'ordinary';
  const r = await receivePublicCancellation(ctx, {email, fullName, reference: v.shortText(values.reference, 120), kind,
    reason: kind === 'extraordinary' ? v.shortText(values.reason, 500) : null});
  return receipt('Deine Kündigung ist eingegangen', 'Wir haben deine Kündigung gespeichert und bestätigen sie per E-Mail. Den Zeitpunkt der Beendigung teilen wir dir unverzüglich mit.', r);
}

// ---------------------------------------------------------------- Widerrufen (§ 356a BGB)
// Schritt 1 „Vertrag widerrufen“ (Angaben), Schritt 2 Bestaetigungsseite mit „Widerruf bestätigen“.
// Abgefragt werden nur Name, Vertragsangabe und E-Mail fuer die Eingangsbestaetigung – kein Grund.
function withdrawForm(values = {}, error = null) {
  return page('Vertrag widerrufen', `<p>Hier widerrufst du deinen Vertrag über Vision Universe Pro innerhalb der Widerrufsfrist von 14 Tagen – ohne Anmeldung und ohne Angabe von Gründen. Einzelheiten stehen in der <a href="${LINKS.widerrufsbelehrung}">Widerrufsbelehrung</a>. Möchtest du nur zum Monatsende beenden, nutze <a href="${LINKS.kuendigen}">Verträge hier kündigen</a>.</p>
${errorBox(error)}<form method="post" action="${LINKS.widerrufen}">${hidden('step', 'review')}
${field('fullName', 'Name', values.fullName, 'required maxlength="120" autocomplete="name"')}
${field('email', 'E-Mail-Adresse (für die Eingangsbestätigung; am besten die deines Kontos)', values.email, 'type="email" required maxlength="254" autocomplete="email"')}
${field('reference', 'Vertrag (z. B. Rechnungsnummer oder „Vision Universe Pro, bestellt am …“)', values.reference, 'maxlength="120"')}
<button type="submit">Weiter</button></form>`, {robots: 'noindex'});
}
export const withdrawGet = () => withdrawForm();
export async function withdrawPost(ctx) {
  assertSameOrigin(ctx);
  const f = await readForm(ctx);
  const values = {fullName: f.get('fullName'), email: f.get('email'), reference: f.get('reference') || 'Vision Universe Pro'};
  if (f.get('step') === 'edit') return withdrawForm(values);
  let email;
  try { email = v.email(values.email); } catch { return withdrawForm(values, MESSAGES.EMAIL_INVALID); }
  const fullName = v.shortText(values.fullName, 120);
  if (!fullName) return withdrawForm(values, MESSAGES.NAME_REQUIRED);
  const reference = v.shortText(values.reference, 120);
  if (f.get('step') !== 'confirm') {
    return page('Widerruf bestätigen', `<p>Bitte prüfe deine Angaben. Mit „Widerruf bestätigen“ erklärst du den Widerruf deines Vertrags.</p>
<p class="note">Hiermit widerrufe ich den von mir abgeschlossenen Vertrag über die Erbringung der folgenden Dienstleistung: <strong>${esc(reference)}</strong>.</p>
<dl><dt>Name</dt><dd>${esc(fullName)}</dd><dt>E-Mail</dt><dd>${esc(email)}</dd><dt>Vertrag</dt><dd>${esc(reference)}</dd></dl>
<form method="post" action="${LINKS.widerrufen}">${hidden('step', 'confirm')}${hidden('fullName', fullName)}${hidden('email', email)}${hidden('reference', reference)}
<button type="submit">Widerruf bestätigen</button></form>
<form method="post" action="${LINKS.widerrufen}">${hidden('step', 'edit')}${hidden('fullName', fullName)}${hidden('email', email)}${hidden('reference', reference)}
<button class="secondary" type="submit">Angaben ändern</button></form>`, {robots: 'noindex'});
  }
  try { await ctx.limit('cancellation', ctx.ip || email); await ctx.limit('cancellationEmail', email); }
  catch { return withdrawForm(values, MESSAGES.RATE_LIMITED); }
  const r = await receivePublicWithdrawal(ctx, {email, fullName, reference});
  return receipt('Dein Widerruf ist eingegangen', `Wir haben deinen Widerruf vom ${new Date(r.receivedAt).toLocaleDateString('de-DE', {timeZone: 'Europe/Berlin'})} erhalten und bestätigen den Eingang per E-Mail. Wir beenden Pro und erstatten Zahlungen nach der Widerrufsbelehrung.`, r);
}
export function htmlError(e) {
  if (e instanceof HttpError && e.status === 403) return page('Anfrage nicht möglich', '<p>Bitte nutze das Formular auf dieser Seite.</p>', {status: 403, robots: 'noindex'});
  if (e instanceof HttpError && e.status === 415) return page('Anfrage nicht möglich', '<p>Bitte nutze das Formular auf dieser Seite.</p>', {status: 415, robots: 'noindex'});
  return page('Gerade nicht erreichbar', `<p>Bitte versuche es gleich noch einmal oder schreibe an <a href="mailto:${COMPANY.email}">${COMPANY.email}</a>. Zur Fristwahrung genügt auch eine E-Mail.</p>`, {status: 503, robots: 'noindex'});
}

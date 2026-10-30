// Transaktions-E-Mails ueber Brevo (v3 REST, wie landing/server/newsletter.mjs).
// Ohne BREVO_API_KEY oder Absender wird nichts versendet: send() meldet dann
// "not_configured", der Aufrufer haelt das fest, der Betrieb holt es nach.

import {plainText, LEGAL_BASE, LEGAL_VERSION, COMPANY} from './legal/texts.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
// Eingaben Dritter landen in einer E-Mail an eine Adresse, die jeder eintragen
// kann. Links daraus werden entfernt, damit der Versand nicht fuer Phishing taugt.
export const neutralize = s => String(s ?? '').replace(/(https?:\/\/|www\.)\S*/gi, '[Link entfernt]').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').slice(0, 500);

export function createMailer({apiKey, apiBase = 'https://api.brevo.com', sender, senderName = 'Vision Universe', fetchImpl}) {
  const configured = Boolean(apiKey && sender);
  return {
    configured,
    async send({to, subject, text, html}) {
      if (!configured) return 'not_configured';
      try {
        const res = await fetchImpl(`${apiBase}/v3/smtp/email`, {method: 'POST',
          headers: {'api-key': apiKey, Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'VisionUniverse-Account/1.0'},
          body: JSON.stringify({sender: {email: sender, name: senderName}, to: [{email: to}], subject, textContent: text, htmlContent: html,
            tags: ['vu-account']})});
        return res.ok ? 'sent' : 'failed';
      } catch { return 'failed'; }
    },
  };
}

const berlin = iso => new Date(iso).toLocaleString('de-DE', {timeZone: 'Europe/Berlin', dateStyle: 'long', timeStyle: 'short'}) + ' Uhr';
const dateOnly = iso => new Date(iso).toLocaleDateString('de-DE', {timeZone: 'Europe/Berlin', dateStyle: 'long'});

// Kuendigungsbestaetigung (§ 312k Abs. 4 BGB): Inhalt der Erklaerung, Datum und
// Uhrzeit des Eingangs, Zeitpunkt der Beendigung (sobald feststehend).
export function cancellationConfirmation({confirmationId, receivedAt, email, fullName, reference, kind, reason, planName, endsAt, status, provider}) {
  const kindText = kind === 'extraordinary' ? 'außerordentliche (fristlose) Kündigung' : 'ordentliche Kündigung zum nächstmöglichen Zeitpunkt';
  let endText;
  if (endsAt) endText = `Dein Vertrag endet am ${dateOnly(endsAt)}. Bis dahin bleibt dein Zugang erhalten; danach wird nichts mehr abgebucht.`;
  else if (provider === 'apple' || provider === 'google') endText = 'Dein Abonnement wurde über den App Store bzw. Google Play abgeschlossen. Den Beendigungszeitpunkt bestätigen wir, sobald der Anbieter die Kündigung meldet; du kannst sie dort auch direkt auslösen.';
  else if (status === 'no_contract') endText = 'Zu dieser Adresse haben wir kein laufendes Abonnement gefunden. Falls du ein Abonnement mit einer anderen Adresse abgeschlossen hast, antworte bitte mit der Rechnungsnummer.';
  else endText = 'Deine Kündigung ist wirksam eingegangen. Wir ordnen sie deinem Vertrag zu und teilen dir den Zeitpunkt der Beendigung unverzüglich in einer weiteren E-Mail mit.';
  const rows = [
    ['Bestätigungsnummer', confirmationId],
    ['Eingang', berlin(receivedAt)],
    ['Art', kindText],
    ['Name', fullName ? neutralize(fullName) : '–'],
    ['E-Mail', email],
    ['Vertrag', [planName, reference ? neutralize(reference) : null].filter(Boolean).join(' · ') || '–'],
    ...(kind === 'extraordinary' ? [['Grund', reason ? neutralize(reason) : '–']] : []),
  ];
  const subject = `Eingangsbestätigung deiner Kündigung (${confirmationId.slice(0, 8)})`;
  const text = ['Hallo,', '', 'wir haben deine Kündigung erhalten. Das ist der Inhalt deiner Erklärung:', '',
    ...rows.map(([k, v]) => `${k}: ${v}`), '', endText, '',
    'Bitte bewahre diese E-Mail als Nachweis auf. Du hast nicht gekündigt? Dann antworte auf diese E-Mail oder setze dein Abonnement unter https://research.visionuniverse.de/konto/abo/ fort.',
    '', 'Vision Universe'].join('\n');
  const html = `<!doctype html><html lang="de"><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
<p>Hallo,</p><p>wir haben deine Kündigung erhalten. Das ist der Inhalt deiner Erklärung:</p>
<table cellpadding="6" style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="color:#555">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`).join('')}</table>
<p>${esc(endText)}</p>
<p style="color:#555">Bitte bewahre diese E-Mail als Nachweis auf. Du hast nicht gekündigt? Dann antworte auf diese E-Mail oder setze dein Abonnement in deinem Konto unter „Abonnement“ fort.</p>
<p>Vision Universe</p></body></html>`;
  return {subject, text, html};
}

// Zweite Nachricht, sobald die Kuendigung ausgefuehrt ist: Zeitpunkt der Beendigung.
export function cancellationFinal({confirmationId, receivedAt, email, planName, endsAt, status}) {
  const subject = `Deine Kündigung ist ausgeführt (${confirmationId.slice(0, 8)})`;
  const endText = status === 'no_contract'
    ? 'Zu deiner Kündigung haben wir kein laufendes Abonnement gefunden. Es wird nichts abgebucht. Falls du ein Abonnement mit einer anderen Adresse abgeschlossen hast, antworte bitte mit der Rechnungsnummer.'
    : `Dein Vertrag${planName ? ' ' + planName : ''} endet am ${dateOnly(endsAt)}. Bis dahin bleibt dein Zugang erhalten; danach wird nichts mehr abgebucht.`;
  const rows = [['Bestätigungsnummer', confirmationId], ['Eingang der Kündigung', berlin(receivedAt)], ['E-Mail', email]];
  const text = ['Hallo,', '', endText, '', ...rows.map(([k, v]) => `${k}: ${v}`), '',
    'Du hast nicht gekündigt? Dann antworte bitte auf diese E-Mail; du kannst dein Abonnement bis zum Laufzeitende in deinem Konto unter „Abonnement“ fortsetzen.',
    '', 'Vision Universe'].join('\n');
  const html = `<!doctype html><html lang="de"><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
<p>Hallo,</p><p><strong>${esc(endText)}</strong></p>
<table cellpadding="6" style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="color:#555">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
<p style="color:#555">Du hast nicht gekündigt? Dann antworte bitte auf diese E-Mail; du kannst dein Abonnement bis zum Laufzeitende in deinem Konto unter „Abonnement“ fortsetzen.</p>
<p>Vision Universe</p></body></html>`;
  return {subject, text, html};
}

// Betriebsalarm ohne personenbezogene Daten (nur Zahlen).
export function opsAlert(health) {
  const lines = [`Offene Kündigungen: ${health.open}`, `Davon überfällig (> 24 h): ${health.overdue}`,
    `Bestätigungen seit > 30 min nicht zugestellt: ${health.mails_unsent_30min}`, `Endgültig nicht zustellbar: ${health.mails_dead}`];
  const text = ['Vision Universe – Kündigungen brauchen Bearbeitung.', '', ...lines, '',
    'Bearbeiten: node scripts/account/cancellations.mjs list (bzw. Workflow „Konten — Kündigungen bearbeiten“).'].join('\n');
  return {subject: 'Alarm: Kündigungen brauchen Bearbeitung', text,
    html: `<pre style="font-family:system-ui,sans-serif">${esc(text)}</pre>`};
}

// Eingangsbestaetigung des Widerrufs (§ 356a Abs. 4 BGB): Inhalt der Erklaerung, Datum und Uhrzeit des Eingangs.
export function withdrawalConfirmation({confirmationId, receivedAt, email, fullName, reference}) {
  const statement = `Hiermit widerrufe ich den von mir abgeschlossenen Vertrag über die Erbringung der folgenden Dienstleistung: ${neutralize(reference || 'Vision Universe Pro')}.`;
  const rows = [['Bestätigungsnummer', confirmationId], ['Eingang', berlin(receivedAt)], ['Name', fullName ? neutralize(fullName) : '–'], ['E-Mail', email]];
  const next = 'Wir beenden Pro und erstatten erhaltene Zahlungen nach Maßgabe der Widerrufsbelehrung unverzüglich, spätestens binnen 14 Tagen. Dein Konto bleibt als Free bestehen. Wir melden uns, falls wir deinen Vertrag nicht eindeutig zuordnen können.';
  const subject = `Eingangsbestätigung deines Widerrufs (${confirmationId.slice(0, 8)})`;
  const text = ['Hallo,', '', 'wir haben deinen Widerruf erhalten. Deine Erklärung:', '', statement, '', ...rows.map(([k, v]) => `${k}: ${v}`), '', next, '',
    'Du hast nicht widerrufen? Dann antworte bitte auf diese E-Mail.', '', 'Vision Universe', `${COMPANY.name}, ${COMPANY.street}, ${COMPANY.city}`].join('\n');
  const html = `<!doctype html><html lang="de"><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
<p>Hallo,</p><p>wir haben deinen Widerruf erhalten. Deine Erklärung:</p><blockquote>${esc(statement)}</blockquote>
<table cellpadding="6" style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="color:#555">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`).join('')}</table>
<p>${esc(next)}</p><p style="color:#555">Du hast nicht widerrufen? Dann antworte bitte auf diese E-Mail.</p><p>Vision Universe</p></body></html>`;
  return {subject, text, html};
}

// Vertragsbestaetigung (§ 312f Abs. 2 BGB) mit dem Vertragsinhalt, den Bedingungen und der Widerrufsbelehrung
// samt Muster-Formular als Text (dauerhafter Datentraeger).
export function contractConfirmation({email, subscriptionRef, amount, currency, interval, confirmedAt, concludedAt, paymentPending}) {
  const price = new Intl.NumberFormat('de-DE', {style: 'currency', currency: currency || 'EUR'}).format((amount ?? 100) / 100);
  const rows = [
    ['Vertragspartner', `${COMPANY.name}, ${COMPANY.street}, ${COMPANY.city}`],
    ['Produkt', 'Vision Universe Pro (Abonnement)'],
    ['Preis', `${price} pro ${interval === 'year' ? 'Jahr' : 'Monat'} inkl. gesetzlicher Umsatzsteuer`],
    ['Laufzeit', '1 Monat, verlängert sich automatisch um jeweils 1 Monat; kündbar jederzeit zum Ende des bezahlten Monats'],
    ['Vertragsschluss', berlin(concludedAt || new Date().toISOString())],
    ...(confirmedAt ? [['Sofortiger Beginn verlangt', berlin(confirmedAt)]] : []),
    ['Abo-Kennung', subscriptionRef],
    ['Konto', email],
    ['Fassung der Bedingungen', LEGAL_VERSION],
  ];
  const pending = paymentPending ? 'Deine Zahlung (z. B. SEPA-Lastschrift) wird noch bestätigt. Pro gilt, sobald sie bestätigt ist; bis dahin nutzt du Free.' : '';
  const subject = 'Vertragsbestätigung: Vision Universe Pro';
  const legal = ['NUTZUNGS- UND VERTRAGSBEDINGUNGEN', plainText('agb'), '', 'WIDERRUFSBELEHRUNG', plainText('widerrufsbelehrung'), '', 'MUSTER-WIDERRUFSFORMULAR', plainText('widerrufsformular')].join('\n');
  const text = ['Hallo,', '', 'vielen Dank für deine Bestellung. Hiermit bestätigen wir deinen Vertrag:', '', ...rows.map(([k, v]) => `${k}: ${v}`), '',
    ...(pending ? [pending, ''] : []),
    `Kündigen: ${LEGAL_BASE}/kuendigen · Widerrufen: ${LEGAL_BASE}/widerrufen · Abonnement verwalten: https://research.visionuniverse.de/konto/abo/`, '',
    'Bitte bewahre diese E-Mail auf. Sie enthält die Bedingungen und die Widerrufsbelehrung in der bei Vertragsschluss geltenden Fassung.', '',
    legal, '', 'Vision Universe'].join('\n');
  const html = `<!doctype html><html lang="de"><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
<p>Hallo,</p><p>vielen Dank für deine Bestellung. Hiermit bestätigen wir deinen Vertrag:</p>
<table cellpadding="6" style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="color:#555">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`).join('')}</table>
${pending ? `<p><strong>${esc(pending)}</strong></p>` : ''}
<p><a href="${LEGAL_BASE}/kuendigen">Verträge hier kündigen</a> · <a href="${LEGAL_BASE}/widerrufen">Vertrag widerrufen</a> · <a href="https://research.visionuniverse.de/konto/abo/">Abonnement verwalten</a></p>
<p style="color:#555">Bitte bewahre diese E-Mail auf. Sie enthält die Bedingungen und die Widerrufsbelehrung in der bei Vertragsschluss geltenden Fassung.</p>
<pre style="white-space:pre-wrap;font-family:system-ui,sans-serif;font-size:13px;color:#333">${esc(legal)}</pre><p>Vision Universe</p></body></html>`;
  return {subject, text, html};
}

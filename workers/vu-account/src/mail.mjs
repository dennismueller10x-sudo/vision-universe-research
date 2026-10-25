// Transaktions-E-Mails ueber Brevo (v3 REST, wie landing/server/newsletter.mjs).
// Ohne BREVO_API_KEY oder Absender wird nichts versendet: send() meldet dann
// "not_configured", der Aufrufer haelt das fest, der Betrieb holt es nach.

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
  else endText = 'Wir ordnen deine Kündigung deinem Vertrag zu und teilen dir den Zeitpunkt der Beendigung unverzüglich in einer weiteren E-Mail mit.';
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

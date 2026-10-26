#!/usr/bin/env node
// Vision Universe — Supabase Auth des ENTWICKLUNGSprojekts einstellen (Management-API).
//
//   SUPABASE_ACCESS_TOKEN=sbp_… SUPABASE_PROJECT_REF=<ref> VU_ACCOUNT_API_ORIGIN=https://… \
//   [BREVO_SMTP_LOGIN=… BREVO_SMTP_KEY=… VU_MAIL_SENDER=konto@visionuniverse.de] \
//     node scripts/account/supabase-auth-config.mjs [--dry-run]
//
// Setzt, was docs/accounts/SETUP.md (S3/S4) sonst von Hand verlangt: Site-URL,
// Redirect-URL des Workers, E-Mail-Bestaetigung, Passwortregeln, Hook
// "Before User Created" (Registrierungssperre), eigenes SMTP ueber Brevo und
// deutsche Vorlagen. Bricht ab, wenn der Projektname nicht nach Entwicklung
// aussieht (dev/test/staging) - es sei denn, die Ref ist das ausdruecklich
// benannte Produktionsprojekt (PRODUCTION_REF, docs/accounts/PRODUCTION.md).
// Dafuer genuegt ein Token mit Auth-Rechten; die Projektdaten werden dann
// nicht gelesen.
// Gibt nur die Namen geaenderter Einstellungen aus, nie Werte von Geheimnissen.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const SITE = 'https://research.visionuniverse.de/konto/';
// Die eine Produktionsdatenbank (Owner-Entscheidung 26.10.2026).
export const PRODUCTION_REF = 'qiytbnpoqvldsatpfkeh';
const SECRET_FIELDS = new Set(['smtp_pass']);

const mailTemplate = (title, intro, action) => `<!doctype html><html lang="de"><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
<h2>${title}</h2><p>${intro}</p>
<p><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;border-radius:6px;text-decoration:none">${action}</a></p>
<p style="color:#555">Der Link gilt eine Stunde und nur auf dem Gerät, auf dem du die Anfrage gestellt hast. Du warst das nicht? Dann ignoriere diese E-Mail.</p>
<p>Vision Universe</p></body></html>`;

export function desiredAuthConfig({apiOrigin, smtp}) {
  const cfg = {
    site_url: SITE,
    uri_allow_list: `${apiOrigin}/v1/auth/callback**`,
    disable_signup: false,                       // Sperre: Hook + Worker, nicht dieser Schalter
    external_email_enabled: true,
    mailer_autoconfirm: false,
    mailer_secure_email_change_enabled: true,
    security_update_password_require_reauthentication: true,
    password_min_length: 10,
    password_required_characters: 'abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789',
    refresh_token_rotation_enabled: true,
    security_refresh_token_reuse_interval: 10,
    hook_before_user_created_enabled: true,
    hook_before_user_created_uri: 'pg-functions://postgres/public/hook_before_user_created',
    mailer_subjects_confirmation: 'Bestätige deine Registrierung bei Vision Universe',
    mailer_templates_confirmation_content: mailTemplate('Registrierung bestätigen', 'Bitte bestätige deine E-Mail-Adresse, um dein Vision-Universe-Konto zu aktivieren.', 'E-Mail bestätigen'),
    mailer_subjects_recovery: 'Passwort zurücksetzen – Vision Universe',
    mailer_templates_recovery_content: mailTemplate('Passwort zurücksetzen', 'Du hast ein neues Passwort für dein Vision-Universe-Konto angefordert.', 'Neues Passwort setzen'),
    mailer_subjects_email_change: 'Neue E-Mail-Adresse bestätigen – Vision Universe',
    mailer_templates_email_change_content: mailTemplate('E-Mail-Adresse ändern', 'Bitte bestätige die neue E-Mail-Adresse für dein Vision-Universe-Konto.', 'Neue Adresse bestätigen'),
  };
  if (smtp) Object.assign(cfg, {smtp_host: 'smtp-relay.brevo.com', smtp_port: '587', smtp_user: smtp.login, smtp_pass: smtp.key,
    smtp_admin_email: smtp.sender, smtp_sender_name: 'Vision Universe', smtp_max_frequency: 60, rate_limit_email_sent: 30});
  return cfg;
}

export async function configureAuth({token, ref, apiOrigin, smtp, production = false, dryRun = false, fetchImpl = fetch, log = console.log}) {
  if (!/^sbp_[A-Za-z0-9]+$/.test(String(token || ''))) throw new Error('SUPABASE_ACCESS_TOKEN fehlt (persoenliches Zugriffstoken sbp_…)');
  if (!/^[a-z0-9]{20}$/.test(String(ref || ''))) throw new Error('SUPABASE_PROJECT_REF fehlt (20 Zeichen, aus der Projekt-URL)');
  if (!/^https:\/\/[a-z0-9.-]+$/.test(String(apiOrigin || ''))) throw new Error('VU_ACCOUNT_API_ORIGIN fehlt (https://<host>)');
  if (smtp && !(smtp.login && smtp.key && /^[a-z0-9._%+-]+@visionuniverse\.de$/.test(String(smtp.sender || '')))) {
    throw new Error('SMTP unvollstaendig: BREVO_SMTP_LOGIN, BREVO_SMTP_KEY und VU_MAIL_SENDER (@visionuniverse.de)');
  }
  const call = async (method, path, body) => {
    const res = await fetchImpl(`https://api.supabase.com${path}`, {method,
      headers: {Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? {'Content-Type': 'application/json'} : {})},
      body: body ? JSON.stringify(body) : undefined});
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Supabase ${method} ${path.replace(ref, '<ref>')}: ${res.status} ${String(data.message || '').slice(0, 160)}`);
    return data;
  };
  if (production) {
    if (ref !== PRODUCTION_REF) throw new Error('Produktion: SUPABASE_PROJECT_REF ist nicht das freigegebene Produktionsprojekt - Abbruch.');
    log('Produktionsprojekt (feste Ref) - Projektname wird nicht geprueft.');
  } else {
    const project = await call('GET', `/v1/projects/${ref}`);
    if (!/(^|[^a-z])(dev|test|staging)([^a-z]|$)/i.test(String(project.name || ''))) {
      throw new Error('Projektname enthaelt nicht dev/test/staging - Abbruch (nur das Entwicklungsprojekt wird eingestellt).');
    }
  }
  const current = await call('GET', `/v1/projects/${ref}/config/auth`);
  const want = desiredAuthConfig({apiOrigin, smtp});
  const changes = Object.fromEntries(Object.entries(want).filter(([k, v]) => SECRET_FIELDS.has(k) || String(current[k] ?? '') !== String(v)));
  const names = Object.keys(changes);
  log(names.length ? `Zu aendern: ${names.join(', ')}` : 'Auth-Einstellungen bereits wie vorgesehen.');
  if (!names.length || dryRun) return {changed: dryRun ? [] : names, planned: names};
  await call('PATCH', `/v1/projects/${ref}/config/auth`, changes);
  log('Auth-Einstellungen gesetzt.');
  return {changed: names, planned: names};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const e = process.env;
  const smtp = e.BREVO_SMTP_KEY ? {login: e.BREVO_SMTP_LOGIN, key: e.BREVO_SMTP_KEY, sender: e.VU_MAIL_SENDER} : null;
  if (!smtp) console.log('::warning::Kein BREVO_SMTP_KEY - Supabase sendet mit dem eingebauten Dienst (2 E-Mails/Stunde).');
  configureAuth({token: e.SUPABASE_ACCESS_TOKEN, ref: e.SUPABASE_PROJECT_REF, apiOrigin: e.VU_ACCOUNT_API_ORIGIN, smtp,
    production: process.argv.includes('--production'),
    dryRun: process.argv.includes('--dry-run')}).catch(err => { console.error(`FEHLER: ${err.message}`); process.exit(1); });
}

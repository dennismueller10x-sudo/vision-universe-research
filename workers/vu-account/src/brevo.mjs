// Brevo: Kontaktverwaltung und Newsletter-Einwilligung (Double-Opt-in). Supabase bleibt fuehrend.
//
// Zwei getrennte Zwecke:
//   A Kontaktverwaltung (VU_BREVO_SYNC=on): jedes bestaetigte Konto als Kontakt mit Adresse und Tarif in den
//     Listen "Vision Universe App – Nutzer" und "… – Free"/"… – Pro". Zweck: Vertrags- und Servicekommunikation.
//     Keine Werbeerlaubnis; die Listen werden nie fuer Werbung genutzt (docs/accounts/BREVO.md).
//   B Newsletter (VU_NEWSLETTER=on): nur auf eigenen Wunsch, Bestaetigung per Brevo-DOI-Mail (bestehende,
//     abgenommene Vorlage und Liste der Landingpage). Nur bestaetigte Kontakte in der Newsletter-Liste duerfen
//     Werbung erhalten; Abmeldungen bei Brevo werden uebernommen.
// Geloeschte Konten und alte Adressen werden bei Brevo entfernt (billing.brevo_jobs, Trigger in der Datenbank).
// Keine Schluessel oder Adressen in Protokollen.

export const NEWSLETTER = Object.freeze({
  // Wortgleich mit landing/server/newsletter.mjs (CONSENT_VERSION, CONSENT_TEXT); ein Test vergleicht beide.
  version: 'vu-newsletter-v1',
  text: 'Ich möchte den Vision-Universe-Newsletter per E-Mail erhalten: Neuigkeiten zu Vision Universe, neue Research-Inhalte und Informationen zu seinen Produkten einschließlich des App-Starts. Ich kann mich jederzeit über den Abmeldelink abmelden.',
  templateName: 'VU | Newsletter | DE | API Double Opt In | v1',
  templateTag: 'optin',
  redirect: 'https://www.visionuniverse.de/newsletter/bestaetigt/',
  pendingDays: 30,
});

export async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Was an einer Vorlage fehlt, damit Brevo sie fuer doubleOptinConfirmation annimmt und sie zur Einwilligung passt.
export function doiProblems(t) {
  const html = String(t?.htmlContent || '');
  return [
    t?.name !== NEWSLETTER.templateName && 'NAME',
    t?.isActive !== true && 'NICHT_AKTIV',
    t?.doiTemplate !== true && 'KEINE_DOI_VORLAGE',
    t?.tag !== NEWSLETTER.templateTag && 'TAG',
    !html.includes('{{ params.DOIurl }}') && 'KEIN_DOIURL',
    html.includes('{{ doubleoptin }}') && 'ALTER_DOI_PLATZHALTER',
    !html.includes(NEWSLETTER.text) && 'EINWILLIGUNGSTEXT',
  ].filter(Boolean);
}

export class BrevoError extends Error {
  constructor(status, code) { super(code || `BREVO_${status}`); this.status = status; this.code = code || `BREVO_${status}`; }
}

export function createBrevo({apiKey, apiBase = 'https://api.brevo.com', fetchImpl}) {
  const configured = Boolean(apiKey);
  async function call(method, path, body) {
    if (!configured) throw new BrevoError(0, 'BREVO_NOT_CONFIGURED');
    const res = await fetchImpl(`${apiBase}/v3${path}`, {method, headers: {'api-key': apiKey, Accept: 'application/json',
      ...(body !== undefined ? {'Content-Type': 'application/json'} : {}), 'User-Agent': 'VisionUniverse-Account/1.0'},
      body: body !== undefined ? JSON.stringify(body) : undefined});
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    return {status: res.status, ok: res.ok, data};
  }
  let template = null;
  return {
    configured,
    async contact(email) {
      const r = await call('GET', `/contacts/${encodeURIComponent(email)}`);
      if (r.status === 404) return null;
      if (!r.ok) throw new BrevoError(r.status, r.data?.code);
      return r.data;
    },
    // Anlegen oder aktualisieren; listIds hinzu, unlinkListIds entfernen (nur fuer bestehende Kontakte).
    async upsert(email, {attributes = {}, listIds = [], unlinkListIds = []} = {}) {
      const r = await call('POST', '/contacts', {email, attributes, listIds, updateEnabled: true});
      if (!(r.ok || r.status === 204)) throw new BrevoError(r.status, r.data?.code);
      if (unlinkListIds.length) {
        const u = await call('PUT', `/contacts/${encodeURIComponent(email)}`, {unlinkListIds});
        if (!(u.ok || u.status === 204)) throw new BrevoError(u.status, u.data?.code);
      }
    },
    async unlink(email, listIds) {
      const r = await call('PUT', `/contacts/${encodeURIComponent(email)}`, {unlinkListIds: listIds});
      if (r.status === 404) return false;
      if (!(r.ok || r.status === 204)) throw new BrevoError(r.status, r.data?.code);
      return true;
    },
    async remove(email) {
      const r = await call('DELETE', `/contacts/${encodeURIComponent(email)}`);
      if (r.status === 404) return false;
      if (!(r.ok || r.status === 204)) throw new BrevoError(r.status, r.data?.code);
      return true;
    },
    // Bestehende, abgenommene DOI-Vorlage – keine neue Vorlage. Brevo liefert doiTemplate nur im Einzelabruf
    // (/smtp/templates/{id}), nicht in der Liste; geprueft wird wie auf der Landingpage (landing/server/newsletter.mjs).
    async doiTemplateId() {
      if (template) return template;
      const r = await call('GET', '/smtp/templates?templateStatus=true&limit=100&offset=0');
      if (!r.ok) throw new BrevoError(r.status, r.data?.code);
      for (const c of (r.data?.templates || []).filter(x => x.name === NEWSLETTER.templateName)) {
        const d = await call('GET', `/smtp/templates/${encodeURIComponent(c.id)}`);
        if (!d.ok) throw new BrevoError(d.status, d.data?.code);
        if (doiProblems(d.data).length === 0) { template = d.data.id; return template; }
      }
      throw new BrevoError(0, 'DOI_TEMPLATE_MISSING');
    },
    async doubleOptIn(email, listId) {
      const templateId = await this.doiTemplateId();
      const r = await call('POST', '/contacts/doubleOptinConfirmation', {email, includeListIds: [listId], templateId,
        redirectionUrl: NEWSLETTER.redirect, contactPixelTrackingConsent: false, attributes: {VU_EMAIL_CONSENT: 'subscribed'}});
      if (r.status === 201 || r.status === 204) return true;
      throw new BrevoError(r.status, r.data?.code);
    },
  };
}

const planList = (cfg, plan) => (plan === 'free' ? cfg.brevo.lists.free : cfg.brevo.lists.pro);
const err = e => String(e.code || e.message || e).slice(0, 120);

// Ein Konto abgleichen (Kontaktverwaltung A).
async function syncContact(deps, row) {
  const {cfg, brevo} = deps;
  const lists = cfg.brevo.lists;
  const target = planList(cfg, row.plan);
  const other = row.plan === 'free' ? lists.pro : lists.free;
  await brevo.upsert(row.email, {attributes: {VU_TARIF: row.plan === 'free' ? 'FREE' : 'PRO'},
    listIds: [lists.users, target].filter(Boolean), unlinkListIds: [other].filter(Boolean)});
}

// Newsletter-Einwilligung pruefen und weiterfuehren (B).
export async function advanceConsent(deps, c) {
  const {store, brevo, cfg, now} = deps;
  const list = cfg.brevo.lists.newsletter;
  if (c.status === 'requested') {
    const existing = await brevo.contact(c.email);
    if (existing && (existing.listIds || []).includes(list) && !existing.emailBlacklisted) {
      // Bereits bestaetigte Anmeldung (z. B. ueber die Landingpage): kein zweiter DOI.
      return (await store.newsletterUpdate(c.id, 'confirmed', 'BEREITS_BESTAETIGT')).status;
    }
    try { await brevo.doubleOptIn(c.email, list); }
    catch (e) { return (await store.newsletterUpdate(c.id, 'failed', err(e))).status; }
    return (await store.newsletterUpdate(c.id, 'pending')).status;
  }
  const contact = await brevo.contact(c.email);
  const subscribed = Boolean(contact && (contact.listIds || []).includes(list) && !contact.emailBlacklisted);
  if (c.status === 'pending') {
    if (subscribed) return (await store.newsletterUpdate(c.id, 'confirmed')).status;
    const age = now() - Date.parse(c.doi_sent_at || c.requested_at);
    if (age > NEWSLETTER.pendingDays * 864e5) return (await store.newsletterUpdate(c.id, 'expired')).status;
    return (await store.newsletterUpdate(c.id, 'pending')).status;
  }
  if (c.status === 'confirmed') {
    if (!subscribed) return (await store.newsletterUpdate(c.id, 'withdrawn', contact?.emailBlacklisted ? 'ABGEMELDET_BEI_BREVO' : 'NICHT_IN_LISTE')).status;
    return (await store.newsletterUpdate(c.id, 'confirmed')).status;
  }
  return c.status;
}

// Cron: Entfernungsauftraege, Kontaktabgleich, Newsletter-Einwilligungen. Fehler je Eintrag werden vermerkt,
// der Lauf geht weiter.
export async function runBrevo(deps, {limit = 25} = {}) {
  const {store, brevo, cfg, log} = deps;
  const out = {removed: 0, synced: 0, consents: 0, errors: 0};
  if (!brevo.configured) return {...out, skipped: 'BREVO_NOT_CONFIGURED'};
  for (const job of await store.brevoJobsDue(limit) || []) {
    try { await brevo.remove(job.email); await store.brevoJobDone(job.id, null); out.removed++; }
    catch (e) { await store.brevoJobDone(job.id, err(e)); out.errors++; }
  }
  if (cfg.brevo.sync && cfg.brevo.lists.users) {
    for (const row of await store.brevoPending(limit) || []) {
      try { await syncContact(deps, row); await store.brevoMark(row.user_id, row.email, row.state, null); out.synced++; }
      catch (e) { await store.brevoMark(row.user_id, row.email, row.state, err(e)); out.errors++; }
    }
  }
  if (cfg.brevo.newsletter && cfg.brevo.lists.newsletter) {
    const sha = await sha256Hex(NEWSLETTER.text);
    for (const c of await store.newsletterDue(limit, NEWSLETTER.version, sha) || []) {
      try { await advanceConsent(deps, c); out.consents++; }
      catch (e) { out.errors++; log('error', 'NEWSLETTER_CHECK_FAILED', {consent: c.id, code: err(e)}); }
    }
  }
  if (out.errors) log('error', 'BREVO_SYNC_ERRORS', out);
  return out;
}

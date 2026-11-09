// Kuendigungen (§ 312k BGB): Eingang, Zuordnung, Ausfuehrung, Bestaetigung.
// Gemeinsam genutzt von Worker (Anfragen, Cron) und Betriebsskript
// (scripts/account/cancellations.mjs). deps = {store, stripe, mailer, cfg, log, now}.
//
// Ablauf ohne Anmeldung (VU_CANCELLATION_AUTO_PROCESS=false, Vorgabe):
//   1 Eingang speichern - die Kuendigung ist damit abgegeben
//   2 Zuordnung vorschlagen (nur lesend: Adresse, Rechnungs-/Abo-Nummer)
//   3 Eingangsbestaetigung in den Postausgang, sofort versuchen
//   4 Ausfuehrung durch eine berechtigte Person -> Abschlussbestaetigung
// Nichts davon macht die Kuendigung von einer weiteren Handlung des Kunden
// abhaengig (kein Login, kein Bestaetigungslink).

import {cancellationConfirmation, cancellationFinal, opsAlert, withdrawalConfirmation, contractConfirmation} from './mail.mjs';
import {normalizeStripeSubscription} from './providers/stripe-adapter.mjs';

const STRIPE_SUB = /^sub_[A-Za-z0-9]{6,}$/;
export const PLAN_NAMES = Object.freeze({plus: 'Vision Universe Plus', pro: 'Vision Universe Pro'});

export class CancellationError extends Error {}

async function syncStripe(deps, subscriptionId) {
  const sub = await deps.stripe.retrieveSubscription(subscriptionId);
  const snapshot = normalizeStripeSubscription(sub, {stateAt: new Date(deps.now()).toISOString()});
  await deps.store.applySubscription(snapshot);
  return snapshot;
}

// Ordentliche Kuendigung eines Stripe-Abos zum Laufzeitende (idempotent).
export async function cancelStripeAtPeriodEnd(deps, subscriptionId) {
  if (!STRIPE_SUB.test(String(subscriptionId))) throw new CancellationError('SUBSCRIPTION_ID_INVALID');
  await deps.stripe.updateSubscription(subscriptionId, {cancel_at_period_end: 'true'}, `vu-cancel-${subscriptionId}`);
  return syncStripe(deps, subscriptionId);
}

// E-Mail-Inhalt erst beim Versand aus dem Vorgang bauen (keine personen-
// bezogenen Daten doppelt im Postausgang).
async function renderMail(deps, mail) {
  if (mail.kind === 'ops_alert') return opsAlert(mail.payload || {});
  if (mail.kind === 'contract_confirmation') return contractConfirmation({...(mail.payload || {}), email: mail.to_email});
  const c = await deps.store.getCancellation(mail.cancellation_id);
  if (!c) throw new CancellationError('CANCELLATION_NOT_FOUND');
  const base = {confirmationId: c.id, receivedAt: c.requested_at, email: c.email, planName: PLAN_NAMES[c.match_plan_id] || null,
    endsAt: c.ends_at, status: c.status};
  if (mail.kind === 'cancellation_final') return cancellationFinal(base);
  if (mail.kind === 'withdrawal_receipt') return withdrawalConfirmation({...base, fullName: c.full_name, reference: c.reference});
  return cancellationConfirmation({...base, fullName: c.full_name, reference: c.reference, kind: c.kind, reason: c.reason,
    provider: c.status === 'manual_review' ? c.match_provider : null});
}

async function sendOne(deps, mail) {
  let result = 'failed', error = null;
  try {
    const content = await renderMail(deps, mail);
    result = await deps.mailer.send({to: mail.to_email, ...content});
    if (result !== 'sent') error = result === 'not_configured' ? 'MAIL_NOT_CONFIGURED' : 'PROVIDER_REJECTED';
  } catch (e) { error = String(e.message || e).slice(0, 200); }
  const status = await deps.store.mailResult(mail.id, result, error);
  if (status !== 'sent') deps.log('error', 'MAIL_NOT_SENT', {mail: mail.id, kind: mail.kind, status, error});
  return status;
}

// Postausgang abarbeiten (Cron, Betriebsskript, direkt nach dem Einstellen).
export async function deliverDueMails(deps, limit = 20) {
  const due = await deps.store.claimDueMails(limit);
  const results = [];
  for (const mail of due || []) results.push({id: mail.id, kind: mail.kind, status: await sendOne(deps, mail)});
  return results;
}

async function enqueueAndSend(deps, entry) {
  const id = await deps.store.enqueueMail(entry);
  const results = await deliverDueMails(deps, 10);
  const own = results.find(r => r.id === id);
  return own ? own.status === 'sent' : false;
}

// --- Eingang ohne Anmeldung ------------------------------------------------
export async function receivePublicCancellation(deps, {email, fullName, reference, kind, reason}) {
  const received = await deps.store.recordCancellation({email, full_name: fullName, reference, kind, reason, source: 'public'});
  let proposal = {status: 'manual_review'};
  try { proposal = await deps.store.proposeCancellationMatch(received.id); }
  catch (e) { deps.log('error', 'CANCELLATION_MATCH_FAILED', {cancellation: received.id, code: String(e.code || e.message).slice(0, 80)}); }

  // Nur mit ausdruecklicher Freigabe (VU_CANCELLATION_AUTO_PROCESS=true) und nur bei
  // eindeutigem Vorschlag sofort ausfuehren. Vorgabe: aus.
  if (deps.cfg.cancellation.autoProcess && proposal.status === 'pending_assignment') {
    try { await executeCancellation(deps, received.id, {operator: 'auto', sendFinal: false}); }
    catch (e) { deps.log('error', 'CANCELLATION_AUTO_PROCESS_FAILED', {cancellation: received.id, code: String(e.code || e.message).slice(0, 80)}); }
  }
  const emailSent = await enqueueAndSend(deps, {kind: 'cancellation_receipt', cancellation_id: received.id, to_email: email,
    dedupe_key: `receipt:${received.id}`});
  return {confirmationId: received.id, receivedAt: received.requested_at, emailSent};
}

// --- Widerruf (§ 356a BGB) -------------------------------------------------
// Eingang speichern und sofort bestaetigen (Inhalt, Datum, Uhrzeit). Beendigung und Erstattung
// entscheidet eine berechtigte Person (Vorgang immer in "manual_review"); die Frist ist mit dem
// Absenden gewahrt.
export async function receivePublicWithdrawal(deps, {email, fullName, reference}) {
  const received = await deps.store.recordCancellation({email, full_name: fullName, reference, kind: 'withdrawal', source: 'public'});
  try { await deps.store.proposeCancellationMatch(received.id); }
  catch (e) { deps.log('error', 'WITHDRAWAL_MATCH_FAILED', {cancellation: received.id, code: String(e.code || e.message).slice(0, 80)}); }
  deps.log('warn', 'WITHDRAWAL_RECEIVED', {cancellation: received.id});
  const emailSent = await enqueueAndSend(deps, {kind: 'withdrawal_receipt', cancellation_id: received.id, to_email: email,
    dedupe_key: `withdrawal:${received.id}`});
  return {confirmationId: received.id, receivedAt: received.requested_at, emailSent};
}

// --- Vertragsbestaetigung (§ 312f BGB): einmal je Abo, ueber den Postausgang ------------
export async function queueContractConfirmation(deps, {email, subscriptionRef, plan, amount, currency, interval, confirmedAt, paymentPending}) {
  if (!email || !subscriptionRef) return null;
  const id = await deps.store.enqueueMail({kind: 'contract_confirmation', to_email: email, dedupe_key: `contract:${subscriptionRef}`,
    payload: {subscriptionRef, plan, amount, currency, interval, confirmedAt, paymentPending: Boolean(paymentPending),
      concludedAt: new Date(deps.now()).toISOString()}});
  await deliverDueMails(deps, 10);
  return id;
}

// --- Eingang mit Anmeldung (Identitaet durch Login belegt) -----------------
export async function receiveSignedInCancellation(deps, {user, blocking}) {
  const received = await deps.store.recordCancellation({user_id: user.id, email: user.email || 'unbekannt@invalid', kind: 'ordinary',
    reference: blocking.provider_subscription_id, source: 'signed_in'});
  await deps.store.setCancellationMatch(received.id, user.id, 'signed_in');
  let snapshot = null;
  try { snapshot = (await executeCancellation(deps, received.id, {operator: 'signed_in', sendFinal: false})).snapshot; }
  catch (e) {
    deps.log('error', 'CANCELLATION_PROCESS_FAILED', {cancellation: received.id, code: String(e.code || e.message).slice(0, 80)});
    await deps.store.updateCancellation(received.id, {status: 'manual_review', note: 'PROCESS_FAILED'});
  }
  const emailSent = user.email ? await enqueueAndSend(deps, {kind: 'cancellation_receipt', cancellation_id: received.id,
    to_email: user.email, dedupe_key: `receipt:${received.id}`}) : false;
  return {confirmationId: received.id, receivedAt: received.requested_at, emailSent, snapshot};
}

// --- Bearbeitung ------------------------------------------------------------
const notifyAccount = c => Boolean(c.match_account_email && c.email
  && c.match_account_email.toLowerCase() !== c.email.toLowerCase());

export async function executeCancellation(deps, id, {operator, sendFinal = true}) {
  if (!operator) throw new CancellationError('OPERATOR_REQUIRED');
  const c = await deps.store.getCancellation(id);
  if (!c) throw new CancellationError('CANCELLATION_NOT_FOUND');
  if (c.status === 'completed') return {status: 'completed', alreadyDone: true, snapshot: null};
  if (c.status !== 'pending_assignment') throw new CancellationError('CANCELLATION_NOT_ASSIGNABLE');
  if (c.match_provider !== 'stripe') throw new CancellationError('MANAGED_BY_STORE');
  const snapshot = await cancelStripeAtPeriodEnd(deps, c.match_subscription_ref);
  await deps.store.updateCancellation(id, {status: 'completed', provider: 'stripe', user_id: c.match_user_id,
    subscription_ref: c.match_subscription_ref, ends_at: snapshot.current_period_end, note: `ausgefuehrt: ${operator}`,
    processed_by: operator});
  if (sendFinal) {
    await enqueueAndSend(deps, {kind: 'cancellation_final', cancellation_id: id, to_email: c.email, dedupe_key: `final:${id}`});
  }
  // Zuordnung zu einem Konto mit anderer Adresse (Rueckfrage, Rechnungsnummer):
  // der Kontoinhaber erfaehrt es immer und kann bis zum Laufzeitende fortsetzen.
  if (notifyAccount(c)) {
    await enqueueAndSend(deps, {kind: 'cancellation_final', cancellation_id: id, to_email: c.match_account_email,
      dedupe_key: `final-account:${id}`});
  }
  return {status: 'completed', endsAt: snapshot.current_period_end, snapshot};
}

export async function assignAndExecute(deps, id, userId, {operator}) {
  if (!operator) throw new CancellationError('OPERATOR_REQUIRED');
  await deps.store.setCancellationMatch(id, userId, operator);
  return executeCancellation(deps, id, {operator});
}

// Kein Vertrag zuzuordnen: abschliessen und mitteilen.
export async function closeWithoutContract(deps, id, {operator}) {
  if (!operator) throw new CancellationError('OPERATOR_REQUIRED');
  const c = await deps.store.getCancellation(id);
  if (!c) throw new CancellationError('CANCELLATION_NOT_FOUND');
  if (c.status === 'completed') throw new CancellationError('CANCELLATION_ALREADY_COMPLETED');
  await deps.store.updateCancellation(id, {status: 'no_contract', note: `kein Vertrag: ${operator}`, processed_by: operator});
  return enqueueAndSend(deps, {kind: 'cancellation_final', cancellation_id: id, to_email: c.email, dedupe_key: `final:${id}`});
}

// Nicht zugestellte Bestaetigungen: erneut senden oder begruendet aufgeben.
export async function retryMails(deps, cancellationId, {operator}) {
  if (!operator) throw new CancellationError('OPERATOR_REQUIRED');
  const requeued = await deps.store.resolveMails(cancellationId || null, 'retry', operator);
  return {requeued, delivered: await deliverDueMails(deps, 100)};
}

export async function dropMails(deps, cancellationId, {operator, note}) {
  if (!operator) throw new CancellationError('OPERATOR_REQUIRED');
  if (!cancellationId) throw new CancellationError('ID_REQUIRED');
  if (!String(note || '').trim()) throw new CancellationError('NOTE_REQUIRED');
  return {dropped: await deps.store.resolveMails(cancellationId, 'drop', operator, String(note).slice(0, 200))};
}

// --- Ueberwachung (Cron) ----------------------------------------------------
export function needsAttention(h) {
  return Boolean(h && (Number(h.overdue) > 0 || Number(h.mails_dead) > 0 || Number(h.mails_unsent_30min) > 0));
}

export async function runScheduled(deps) {
  const delivered = await deliverDueMails(deps, 50);
  const health = await deps.store.cancellationHealth();
  let alerted = false;
  if (needsAttention(health)) {
    deps.log('error', 'CANCELLATIONS_NEED_ATTENTION', health);
    if (deps.cfg.cancellation.opsAlertEmail) {
      // Hoechstens ein Alarm je Stunde.
      const hour = new Date(deps.now()).toISOString().slice(0, 13);
      await deps.store.enqueueMail({kind: 'ops_alert', to_email: deps.cfg.cancellation.opsAlertEmail, payload: health,
        dedupe_key: `ops:${hour}`});
      await deliverDueMails(deps, 5);
      alerted = true;
    }
  }
  return {delivered, health, alerted};
}

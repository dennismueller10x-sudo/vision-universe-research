// VORBEREITET, NICHT ANGESCHLOSSEN: Apple In-App Purchase und Google Play Billing.
//
// Beide Normalisierer bilden die (bereits verifizierten und entschluesselten)
// Anbieterdaten auf denselben Schnappschuss ab wie stripe-adapter.mjs. Danach
// gilt dieselbe Datenbanklogik: Kunde->Nutzer, Preis->Tarif, Reihenfolge,
// Doppelabo-Erkennung, Berechtigung. Es fehlen bewusst noch:
//   Apple   Pruefung der JWS-Signatur (x5c-Kette bis Apple Root CA G3) der
//           App Store Server Notifications V2, Abruf ueber die App Store Server API
//   Google  Pruefung des Pub/Sub-OIDC-Tokens der Real-Time Developer
//           Notifications, Abruf purchases.subscriptionsv2 mit Dienstkonto
// Bis dahin antwortet der Worker auf /v1/billing/webhook/apple|google mit 501.
//
// Kunde: Die App setzt beim Kauf appAccountToken (Apple) bzw.
// obfuscatedExternalAccountId (Google) = Supabase-Benutzer-ID. Der Server
// verknuepft "apple:<originalTransactionId>" bzw. "google:<purchaseToken-Hash>"
// erst nach Pruefung mit genau diesem Nutzer (billing_link_customer).

const isoMs = ms => (ms ? new Date(Number(ms)).toISOString() : null);

// Apple: decodierte JWSTransactionDecodedPayload + JWSRenewalInfoDecodedPayload.
export function normalizeAppleTransaction({transaction, renewal, notificationType, subtype, signedDateMs}) {
  const expires = Number(transaction.expiresDate || 0);
  let status = expires > Number(signedDateMs) ? 'active' : 'expired';
  if (transaction.revocationDate) status = 'revoked';
  else if (notificationType === 'DID_FAIL_TO_RENEW' && subtype === 'GRACE_PERIOD') status = 'in_grace_period';
  else if (notificationType === 'DID_FAIL_TO_RENEW') status = 'past_due';
  else if (transaction.offerType === 1 && status === 'active') status = 'trialing';
  return {
    provider: 'apple',
    provider_subscription_id: String(transaction.originalTransactionId),
    provider_customer_id: `apple:${transaction.originalTransactionId}`,
    provider_price_id: transaction.productId,
    status,
    current_period_start: isoMs(transaction.purchaseDate),
    current_period_end: isoMs(expires),
    cancel_at_period_end: renewal ? Number(renewal.autoRenewStatus) === 0 : false,
    canceled_at: null, ended_at: status === 'expired' || status === 'revoked' ? isoMs(transaction.revocationDate || expires) : null,
    trial_end: null,
    grace_until: isoMs(renewal?.gracePeriodExpiresDate),
    livemode: transaction.environment === 'Production',
    claimed_user_id: transaction.appAccountToken || null,
    state_at: isoMs(signedDateMs),
  };
}

// Google: SubscriptionPurchaseV2 (purchases.subscriptionsv2.get).
const GOOGLE_STATUS = {
  SUBSCRIPTION_STATE_ACTIVE: 'active', SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'in_grace_period',
  SUBSCRIPTION_STATE_ON_HOLD: 'on_hold', SUBSCRIPTION_STATE_PAUSED: 'paused',
  SUBSCRIPTION_STATE_CANCELED: 'active', // gekuendigt, laeuft bis Ablauf
  SUBSCRIPTION_STATE_EXPIRED: 'expired', SUBSCRIPTION_STATE_PENDING: 'incomplete',
};
export function normalizeGoogleSubscription({purchase, purchaseTokenHash, eventTimeMs, testPurchase}) {
  const line = (purchase.lineItems || [])[0] || {};
  const status = GOOGLE_STATUS[purchase.subscriptionState];
  if (!status) throw new Error('GOOGLE_STATE_UNKNOWN');
  return {
    provider: 'google',
    provider_subscription_id: purchaseTokenHash,
    provider_customer_id: `google:${purchaseTokenHash}`,
    provider_price_id: `${line.productId}:${line.offerDetails?.basePlanId || ''}`,
    status,
    current_period_start: purchase.startTime || null,
    current_period_end: line.expiryTime || null,
    cancel_at_period_end: purchase.subscriptionState === 'SUBSCRIPTION_STATE_CANCELED' || line.autoRenewingPlan?.autoRenewEnabled === false,
    canceled_at: purchase.canceledStateContext ? new Date(Number(eventTimeMs)).toISOString() : null,
    ended_at: status === 'expired' ? line.expiryTime || null : null,
    trial_end: null,
    grace_until: status === 'in_grace_period' ? line.expiryTime || null : null,
    livemode: !testPurchase,
    claimed_user_id: purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId || null,
    state_at: isoMs(eventTimeMs),
  };
}

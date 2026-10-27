// Serverseitige Funktionspruefung. Die Berechtigung selbst rechnet die
// Datenbank (public.effective_entitlements); hier nur die Auswertung.
// subscriptionGrantsAccess ist die gleiche Regel wie
// public.subscription_grants_access (Gleichheit belegt ein Test an derselben
// Fallliste) - der Worker nutzt sie nur zur Anzeige, nie zur Freigabe.

const DAY = 24 * 3600 * 1000;

export function subscriptionGrantsAccess({status, current_period_end, grace_until}, at = Date.now()) {
  const end = current_period_end ? Date.parse(current_period_end) : null;
  if (status === 'active' || status === 'trialing') return end !== null && at < end + 2 * DAY;
  if (status === 'past_due' || status === 'in_grace_period') {
    const until = grace_until ? Date.parse(grace_until) : end !== null ? end + 7 * DAY : null;
    return until !== null && at < until;
  }
  return false;
}

export function featureDecision(entitlements, feature) {
  const features = entitlements?.features || {};
  if (!Object.prototype.hasOwnProperty.call(features, feature)) return {allowed: false, limit: 0, plan: entitlements?.plan_id || 'free'};
  const value = features[feature];
  return {allowed: value === true || (typeof value === 'number' && value > 0), limit: value === true ? null : value,
    plan: entitlements.plan_id};
}

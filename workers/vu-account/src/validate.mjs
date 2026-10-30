// Eingabepruefung. Dieselben Regeln nutzt die Oberflaeche (konto/account-api.js)
// fuer sofortige Hinweise; verbindlich ist nur diese Pruefung hier.

import {HttpError} from './http.mjs';

const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function email(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v.length > 254 || !EMAIL.test(v)) throw new HttpError(400, 'EMAIL_INVALID');
  return v;
}

// 10 bis 72 Zeichen (bcrypt nutzt nur 72 Byte), mindestens drei Zeichenklassen.
export function password(value) {
  const v = String(value || '');
  const bytes = new TextEncoder().encode(v).length;
  if (v.length < 10 || bytes > 72) throw new HttpError(400, 'PASSWORD_LENGTH');
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(v)).length;
  if (classes < 3) throw new HttpError(400, 'PASSWORD_WEAK');
  return v;
}

export function displayName(value) {
  if (value === null || value === undefined || value === '') return null;
  const v = String(value).replace(/[\u0000-\u001f\u007f<>]/g, '').trim();
  if (!v || v.length > 80) throw new HttpError(400, 'DISPLAY_NAME_INVALID');
  return v;
}

const SETTINGS = {
  display_currency: v => /^[A-Z]{3}$/.test(v) && ['EUR', 'USD', 'CHF', 'GBP'].includes(v),
  appearance: v => ['light', 'dark', 'system'].includes(v),
  experience_level: v => ['beginner', 'advanced'].includes(v),
  notification_settings: v => v && typeof v === 'object' && !Array.isArray(v)
    && Object.entries(v).every(([k, b]) => ['WATCHLIST_NEWS', 'EARNINGS', 'PRICE_EVENT', 'SUPERTRADER_SIGNAL',
      'QUANT_CHANGE', 'MARKET_REGIME_CHANGE'].includes(k) && typeof b === 'boolean'),
};

export function settingsPatch(body) {
  const out = {};
  for (const [key, value] of Object.entries(body || {})) {
    if (!SETTINGS[key] || !SETTINGS[key](value)) throw new HttpError(400, 'SETTING_INVALID', key);
    out[key] = value;
  }
  return out;
}

export function profilePatch(body) {
  const out = {};
  for (const [key, value] of Object.entries(body || {})) {
    if (key === 'display_name') out.display_name = displayName(value);
    else if (key === 'locale' && ['de-DE', 'en-US'].includes(value)) out.locale = value;
    else throw new HttpError(400, 'PROFILE_FIELD_INVALID', key);
  }
  return out;
}

export const priceKey = value => {
  const v = String(value || '');
  if (!/^[a-z][a-z0-9_]{1,47}$/.test(v)) throw new HttpError(400, 'PRICE_INVALID');
  return v;
};

export function shortText(value, max) {
  if (value === null || value === undefined) return null;
  const v = String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (v.length > max) throw new HttpError(400, 'TEXT_TOO_LONG');
  return v || null;
}

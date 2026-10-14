// First-party preference storage only. No user ID, email, analytics or network.
export const STORAGE_KEY = 'vu_cookie_preferences';
export const POLICY_VERSION = 'coming-soon-2026-10-12-v1';
export const MAX_AGE = 180 * 24 * 60 * 60 * 1000;
const categories = ['statistics', 'marketing'];

export function createConsentManager({storage, now = Date.now} = {}) {
  const services = new Map();
  let choice = null;
  let sessionOnly = false;
  const active = new Set();
  const manifest = () => [...services.keys()].sort();
  const available = category => [...services.values()].some(s => s.category === category);
  const valid = value => !!value && value.version === POLICY_VERSION &&
    Array.isArray(value.services) && JSON.stringify(value.services) === JSON.stringify(manifest()) &&
    Number.isFinite(value.savedAt) && value.savedAt <= now() &&
    value.expiresAt === value.savedAt + MAX_AGE && value.expiresAt > now() &&
    categories.every(c => typeof value.preferences?.[c] === 'boolean' && (!value.preferences[c] || available(c)));
  const read = () => {
    try {const value = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null'); return valid(value) ? value : null;}
    catch {return null;}
  };
  choice = read();
  const allows = category => category === 'necessary' ||
    (categories.includes(category) && valid(choice) && choice.preferences[category] === true);
  const sync = () => {
    for (const [id, service] of services) {
      if (active.has(id) && !allows(service.category)) {service.disable(); active.delete(id);}
    }
    for (const [id, service] of services) {
      if (!active.has(id) && allows(service.category)) {
        try {service.enable(); active.add(id);}
        catch (error) {service.disable(); throw error;}
      }
    }
  };
  const snapshot = () => ({needsChoice: !valid(choice), expiresAt: valid(choice) ? choice.expiresAt : null,
    preferences: Object.fromEntries(categories.map(c => [c, allows(c)])),
    available: Object.fromEntries(categories.map(c => [c, available(c)])),
    services: [...services.values()].map(({id, category, name, description}) => ({id, category, name, description}))});
  return {
    snapshot, allows,
    registerService(service) {
      if (!service || !/^[a-z][a-z0-9-]{0,49}$/.test(service.id) || services.has(service.id) ||
          !categories.includes(service.category) || typeof service.name !== 'string' || !service.name.trim() ||
          typeof service.description !== 'string' || !service.description.trim() ||
          typeof service.enable !== 'function' || typeof service.disable !== 'function') {
        throw new Error('Optionale Dienste benötigen eindeutige Kennung, Kategorie, Beschreibung und Aktivierung/Widerruf.');
      }
      services.set(service.id, service);
      choice = read(); // Changed service manifest requires a fresh decision.
      sync();
      return snapshot();
    },
    save(preferences = {}) {
      const savedAt = now();
      choice = {version: POLICY_VERSION, services: manifest(), savedAt, expiresAt: savedAt + MAX_AGE,
        preferences: Object.fromEntries(categories.map(c => [c, available(c) && preferences[c] === true]))};
      let persisted = false;
      try {storage?.setItem(STORAGE_KEY, JSON.stringify(choice)); persisted = !!storage;}
      catch { /* Browsers may block storage. The current visit still works. */ }
      sessionOnly = !persisted;
      try {sync();}
      catch (error) {
        // Fail closed if an optional service cannot apply the user's decision.
        choice.preferences = {statistics: false, marketing: false};
        try {sync();} catch { /* Service-specific cleanup must be verified before release. */ }
        try {storage?.setItem(STORAGE_KEY, JSON.stringify(choice));} catch {}
        throw error;
      }
      return {persisted, ...snapshot()};
    },
    refresh({fromStorage = false} = {}) {
      if (fromStorage || !sessionOnly || !valid(choice)) choice = read();
      sync(); return snapshot();
    }
  };
}

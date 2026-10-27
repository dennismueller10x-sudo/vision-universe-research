/* Adresse der Konto-API (workers/vu-account, Produktion: docs/accounts/PRODUCTION.md).
   LEER = Konten aus: Die Seiten unter /konto/ zeigen dann "noch nicht freigeschaltet"
   und senden nichts. Gesetzt mit der Owner-Freigabe vom 27.10.2026 nach dem Ausrollen
   des Workers; der Kuendigungslink im Footer folgt ueber home-refresh.yml. */
globalThis.VU_ACCOUNT_CONFIG = {endpoint: 'https://konto.visionuniverse.de'};

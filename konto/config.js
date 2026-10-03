/* Oeffentliche Konto-Konfiguration. Der Supabase "anon key" ist absichtlich
   oeffentlich (er erlaubt nur, was Row-Level-Security zulaesst). Der
   Service-Role-Key gehoert NIE hierher - nur in die Vercel-Umgebung.

   Solange enabled=false ist, zeigt /konto/ nur "Konten folgen in Kuerze". */
window.VU_ACCOUNT_CONFIG = {
  enabled: false,
  supabaseUrl: "",
  anonKey: "",
  apiBase: "https://vision-universe-research.vercel.app",
  // Verwaltung der Store-Abos (Kuendigen geht nur beim Store).
  manageSubscription: {
    APP_STORE: "https://apps.apple.com/account/subscriptions",
    MAC_APP_STORE: "https://apps.apple.com/account/subscriptions",
    PLAY_STORE: "https://play.google.com/store/account/subscriptions"
  }
};

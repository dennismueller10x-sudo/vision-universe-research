/* Vorübergehende 5xx bei einer Auslieferung (GitHub Pages schaltet das Paket um) sind kein Befund der Technical-Seite.
   Messung 20.11.2026: 7 rote Läufe des Monitor-Jobs technical, jeweils ein einzelner 503 auf wechselnden Dateien
   (Logo-PNG, technical/data/meta.json, intraday/index.json), fünf davon weniger als eine Minute neben einer Auslieferung.
   Ein 5xx wird nachgeladen; nur was nach allen Versuchen weiter 5xx liefert, bleibt ein Befund. 4xx bleibt immer ein Befund. */
export async function ohneVorubergehende5xx({failed, errs, holen, versuche = 3, wartenMs = 2000, warten = (ms) => new Promise((r) => setTimeout(r, ms))}) {
  const bleibt = [], erholt = [];
  for (const f of failed) {
    const m = /^(\d{3}) (\S+)$/.exec(f);
    if (!m || Number(m[1]) < 500) { bleibt.push(f); continue; }
    let ok = false;
    for (let i = 0; i < versuche && !ok; i++) {
      if (i) await warten(wartenMs);
      try { ok = (await holen(m[2])) < 400; } catch { ok = false; }
    }
    (ok ? erholt : bleibt).push(f);
  }
  /* Die Konsolenmeldung zum erholten 5xx ("Failed to load resource ... status of 503") verschwindet mit ihm, je erholter Anfrage eine. */
  const fehler = [...errs];
  for (let i = 0; i < erholt.length; i++) {
    const k = fehler.findIndex((e) => /Failed to load resource.*status of 5\d\d/.test(e));
    if (k >= 0) fehler.splice(k, 1);
  }
  return {failed: bleibt, errs: fehler, erholt};
}

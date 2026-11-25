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

/* Eine Szene wird GENAU EINMAL neu geladen, und nur, wenn in derselben Szene vorher ein 5xx beobachtet wurde (Steuerung 23.11.2026,
   Monitor technical 14:48 UTC: 503 auf /technical/engine/chart-explain.js, danach Selektor-Timeout 90 s). Ohne vorherigen 5xx bleibt ein
   Timeout rot. Auch der zweite Lauf kann scheitern: dann bleibt es ein Befund (kein dritter Versuch).
   lauf: die Szene (wirft bei Fehler). fuenfxx: liefert die in dieser Szene beobachteten 5xx-Eintraege ("503 /pfad"). neuLaden: Seite neu laden. */
export async function szeneMitWiederholung({lauf, fuenfxx, neuLaden}) {
  try { await lauf(); return {fehler: null, wiederholt: false, code: null}; }
  catch (e) {
    const beobachtet = fuenfxx().filter((f) => /^5\d\d /.test(f));
    if (!beobachtet.length) return {fehler: e, wiederholt: false, code: null};
    const code = beobachtet[0].slice(0, 3);
    await neuLaden();
    try { await lauf(); return {fehler: null, wiederholt: true, code, erster: e}; }
    catch (e2) { return {fehler: e2, wiederholt: true, code, erster: e}; }
  }
}

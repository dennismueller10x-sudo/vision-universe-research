/* =========================================================================
   VISION UNIVERSE — rejection-lifecycle.js

   WAS MIT EINER ABGELEHNTEN KURSREIHE PASSIERT

   Der Vorfall, der dieses Modul noetig gemacht hat (16.-18.09.2026): der
   Abendlauf holte fuer jeden Titel genau EINE neue Bar - den Schluss des
   Tages. Die Qualitaetspruefung verlangt mindestens zwei Bars, weil sich
   an einer einzelnen nichts pruefen laesst; sie lehnte deshalb 6.831 von
   6.876 Titeln mit dem Code `too_few_bars` ab. Die Ablehnung sperrte
   jeden dieser Titel sieben Tage lang fuer neue Anfragen. Am naechsten
   Morgen holte der Lauf 45 Titel, uebersprang 6.831 - und die Tageskurse
   standen still, waehrend zwei Sitzungen gehandelt wurden.

   Keiner dieser Titel war "kaputt". Die Ablehnung beschrieb das
   ABFRAGEFENSTER, nicht das Instrument.

   DIE UNTERSCHEIDUNG, DIE GEFEHLT HAT

   Eine Ablehnung kann dreierlei bedeuten, und die drei brauchen drei
   verschiedene Antworten:

     PERMANENT_REJECT   Das Instrument traegt strukturell keine brauchbare
                        Tagesreihe. Kein taeglicher Versuch - aber auch
                        keine Sperre auf ewig: nach der langen Frist wird
                        erneut gefragt, denn auch ein Instrument aendert
                        sich.

     TEMPORARY_REJECT   Der Anbieter, die Daten oder die Qualitaet waren
                        in diesem Moment nicht in Ordnung. Morgen wieder
                        fragen. Sonderfall: ein Fensterartefakt wie
                        `too_few_bars` bei einem inkrementellen Abruf sagt
                        gar nichts ueber den Titel - der naechste Lauf
                        fragt sofort wieder.

     STALE_REJECT       Die Ablehnung ist aelter als ihre Frist. Sie gilt
                        nicht mehr; es wird neu geprueft.

   Dazu der vierte Zustand, der keine Ablehnung mehr ist:

     RECOVERED          Seit der Ablehnung liegen wieder gueltige Daten
                        vor. Der Eintrag verschwindet, der Titel laeuft im
                        normalen Tageslauf mit.

   KEIN TITEL WIRD DAUERHAFT AUSGESCHLOSSEN, weil ein Lauf ihn einmal
   abgelehnt hat. Das ist die Regel, aus der alles andere hier folgt.
   ========================================================================= */
(function (global) {
  "use strict";

  var MODULE_VERSION = "rejection-lifecycle-1.0.0";

  var STUNDE = 3600000;
  var TAG = 24 * STUNDE;

  /* Wie lange eine Ablehnung gilt, je Klasse. */
  var FRISTEN = {
    /* Ein Fensterartefakt haelt keine Stunde: es beschreibt den Abruf,
       nicht den Titel. */
    windowArtifact: 0,
    /* Ein Anbieter- oder Qualitaetsproblem bekommt knapp einen Tag Ruhe -
       der naechste regulaere Lauf fragt wieder. Wiederholt sich dieselbe
       Ursache, waechst die Frist (siehe frist()); so kostet ein Titel,
       der wirklich nicht kann, nicht jeden Tag eine Anfrage - und ein
       Titel, der einmal gestolpert ist, verliert keine Woche. */
    temporary: 20 * STUNDE,
    /* Weiter als das waechst keine temporaere Frist. */
    temporaryMax: 7 * TAG,
    /* Strukturell ungeeignet: nicht taeglich, aber auch nicht nie. */
    permanent: 30 * TAG
  };

  /* WELCHER CODE WAS BEDEUTET

     Die Zuordnung ist bewusst knapp und begruendet. Was hier nicht steht,
     gilt als temporaer - im Zweifel wird erneut gefragt, nicht dauerhaft
     gesperrt. Das ist die sichere Richtung: eine ueberfluessige Anfrage
     kostet Kontingent, eine falsche Dauersperre kostet die Daten. */
  var STRUKTURELL = [
    /* Die Reihe ist zu kurz, um irgendetwas zu rechnen - das liegt am
       Instrument (junge Notierung, ausgesetzter Handel), nicht am Lauf. */
    "insufficient_history",
    /* Der Anbieter kennt das Papier nicht. */
    "unknown_security", "not_supported"
  ];

  /* Codes, die NUR aus dem Abfragefenster entstehen koennen: sie treten
     auf, wenn wenige neue Bars geholt wurden, und sagen nichts ueber die
     gespeicherte Reihe. */
  var FENSTER = ["too_few_bars"];

  function istStrukturell(codes) {
    return codes.some(function (c) { return STRUKTURELL.indexOf(c) !== -1; });
  }
  function istFenster(codes, kontext) {
    if (!codes.length || !codes.every(function (c) { return FENSTER.indexOf(c) !== -1; })) return false;
    /* Bei einem Vollabruf ist zu wenig Material eine Aussage ueber den
       Titel; bei einem inkrementellen Fenster ist es eine ueber das
       Fenster. */
    return !kontext || kontext.window !== "full";
  }

  function codesVon(eintrag) {
    var roh = (eintrag && (eintrag.codes || eintrag.code || "")) + "";
    return roh.split(",")
      .map(function (s) { return s.trim().replace(/^adjustmentContradicted:\s*/, ""); })
      .filter(Boolean);
  }

  /**
   * Klassifiziert EINEN Eintrag des Ablehnungsregisters.
   *
   * @param {object} eintrag  { at, codes, confirmations?, window? }
   * @param {object} opts     { now, staleAfterMs }
   * @returns {object} { class, retryDue, ageMs, codes, reason, retryAfterMs }
   */
  function klassifiziere(eintrag, opts) {
    opts = opts || {};
    var now = opts.now === undefined ? Date.now() : opts.now;
    var staleAfter = opts.staleAfterMs === undefined ? 7 * TAG : opts.staleAfterMs;
    var at = eintrag && eintrag.at ? Date.parse(eintrag.at) : NaN;
    var alter = isFinite(at) ? now - at : Infinity;
    var codes = codesVon(eintrag);
    var bestaetigungen = (eintrag && eintrag.confirmations) || 1;

    /* Ein Eintrag ohne lesbaren Zeitpunkt ist kein Beweis fuer
       irgendetwas - er wird neu geprueft. */
    if (!isFinite(at)) {
      return ergebnis("STALE_REJECT", true, alter, codes, "ohne lesbaren Zeitpunkt", 0);
    }

    if (istFenster(codes, eintrag)) {
      return ergebnis("TEMPORARY_REJECT", alter >= FRISTEN.windowArtifact, alter, codes,
                      "Fensterartefakt: beschreibt den Abruf, nicht den Titel", FRISTEN.windowArtifact);
    }

    /* Strukturell gilt erst, wenn es mehr als einmal bestaetigt wurde.
       Eine einzelne Messung ist ein Hinweis, kein Befund. */
    if (istStrukturell(codes) && bestaetigungen >= 2) {
      return ergebnis("PERMANENT_REJECT", alter >= FRISTEN.permanent, alter, codes,
                      "strukturell ungeeignet, " + bestaetigungen + "-mal bestaetigt", FRISTEN.permanent);
    }

    if (alter >= staleAfter) {
      return ergebnis("STALE_REJECT", true, alter, codes,
                      "aelter als die Frist von " + Math.round(staleAfter / TAG) + " Tagen", 0);
    }

    var frist = temporaereFrist(bestaetigungen);
    return ergebnis("TEMPORARY_REJECT", alter >= frist, alter, codes,
                    "Anbieter-, Daten- oder Qualitaetszustand, " + bestaetigungen +
                    "-mal gesehen (Frist " + Math.round(frist / STUNDE) + " h)", frist);
  }

  /* Dieselbe Ursache zum wiederholten Mal verdoppelt die Ruhe - bis zur
     Obergrenze. Ein Stolpern kostet einen Tag, ein Dauerzustand hoechstens
     eine Woche, und danach wird trotzdem wieder gefragt. */
  function temporaereFrist(bestaetigungen) {
    var n = Math.max(1, bestaetigungen || 1);
    return Math.min(FRISTEN.temporary * Math.pow(2, n - 1), FRISTEN.temporaryMax);
  }

  function ergebnis(klasse, faellig, alter, codes, grund, frist) {
    return { class: klasse, retryDue: !!faellig, ageMs: alter, codes: codes,
             reason: grund, retryAfterMs: frist };
  }

  /**
   * Darf dieser Titel heute gefragt werden?
   *
   * Die eine Frage, die der Ingest stellt. Ohne Eintrag: ja.
   */
  function darfAbfragen(eintrag, opts) {
    if (!eintrag) return { allowed: true, class: "RECOVERED", reason: "keine Ablehnung" };
    var k = klassifiziere(eintrag, opts);
    return { allowed: k.retryDue, class: k.class, reason: k.reason, codes: k.codes, ageMs: k.ageMs };
  }

  /**
   * Klassifiziert ein ganzes Register und sagt, was zu tun ist.
   *
   * @param {object} register  { securityId: { at, codes, ... } }
   * @returns {object} { total, byClass, retry, keep, entries }
   */
  function pruefeRegister(register, opts) {
    var ids = Object.keys(register || {});
    var byClass = { PERMANENT_REJECT: 0, TEMPORARY_REJECT: 0, STALE_REJECT: 0 };
    var byCode = {};
    var retry = [], keep = [], entries = {};
    ids.forEach(function (id) {
      var k = klassifiziere(register[id], opts);
      entries[id] = k;
      byClass[k.class] = (byClass[k.class] || 0) + 1;
      k.codes.forEach(function (c) { byCode[c] = (byCode[c] || 0) + 1; });
      (k.retryDue ? retry : keep).push(id);
    });
    return { total: ids.length, byClass: byClass, byCode: byCode,
             retry: retry, keep: keep, entries: entries };
  }

  /**
   * Schreibt einen Eintrag fort: dieselbe Ursache ein zweites Mal ist
   * eine Bestaetigung, eine andere Ursache faengt von vorne an.
   */
  function fortschreiben(vorher, neu) {
    var alteCodes = codesVon(vorher).join(",");
    var neueCodes = codesVon(neu).join(",");
    var bestaetigungen = (vorher && alteCodes === neueCodes && alteCodes)
      ? ((vorher.confirmations || 1) + 1) : 1;
    return { at: neu.at, codes: neueCodes, window: neu.window || null,
             confirmations: bestaetigungen,
             firstAt: (vorher && alteCodes === neueCodes && vorher.firstAt) || (vorher && alteCodes === neueCodes ? vorher.at : neu.at) };
  }

  var api = {
    MODULE_VERSION: MODULE_VERSION,
    FRISTEN: FRISTEN, STRUKTURELL: STRUKTURELL, FENSTER: FENSTER,
    temporaereFrist: temporaereFrist,
    klassifiziere: klassifiziere,
    darfAbfragen: darfAbfragen,
    pruefeRegister: pruefeRegister,
    fortschreiben: fortschreiben
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.VURejectionLifecycle = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

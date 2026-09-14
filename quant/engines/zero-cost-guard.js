/* =========================================================================
   VISION UNIVERSE — zero-cost-guard.js

   Die Nullkostenschranke.

   In der Entwicklung darf die Ablage NICHTS kosten. Das ist keine
   Sparsamkeit, sondern eine Betriebsregel: eine Rechnung, die durch
   einen automatischen Lauf entsteht, hat niemand entschieden.

   DIE WICHTIGSTE REGEL: GERECHNET WIRD VORHER

   Nicht mitzaehlen und abbrechen, wenn es zu spaet ist - sondern
   ausrechnen, bevor das erste Byte hinausgeht. Ein Lauf, der bei Objekt
   6.000 merkt, dass er die Freigrenze reisst, hat sie schon gerissen.

   NICHT GEGEN 100 PROZENT PLANEN

   Die Freigrenzen sind die Klippe, nicht das Ziel. Geplant wird gegen
   Sicherheitsgrenzen darunter - der Abstand faengt ab, was eine
   Schaetzung nicht wissen kann: einen zweiten Lauf am selben Tag, einen
   Wiederherstellungslauf, eine Reihe, die laenger ist als der
   Durchschnitt.

   WAS "CLASS A" UND "CLASS B" SIND

   R2 zaehlt schreibende Operationen (PUT, LIST) als Class A und lesende
   (GET, HEAD) als Class B. LIST ist ausdruecklich Class A, obwohl es
   nichts schreibt - wer es als Lesevorgang einplant, verschaetzt sich
   beim Wiederaufbau um den Faktor, der weh tut.
   ========================================================================= */
"use strict";

const VERSION = "zero-cost-guard-1.0.0";

/* Die Freigrenzen des Anbieters. Sie stehen hier als Daten, weil sie
   sich aendern koennen und dann an EINER Stelle geaendert werden. */
const FREE_TIER = {
  provider: "cloudflare-r2",
  storageBytes: 10 * 1000 * 1000 * 1000,   /* 10 GB-Monat */
  classAOperations: 1000000,
  classBOperations: 10000000,
  egressBytes: null,                        /* R2 berechnet keinen Egress. */
  note: "Freigrenzen laut Anbieter. Sie sind die Klippe, nicht das Ziel."
};

/* Die Grenzen, gegen die geplant wird. Vom Eigentuemer vorgegeben. */
const SAFETY_CEILING = {
  storageBytes: 8.0 * 1000 * 1000 * 1000,  /* 8,0 GB */
  classAOperations: 750000,
  classBOperations: 7500000,
  note: "Sicherheitsgrenzen des Eigentuemers. Ein Lauf, der sie reissen " +
        "wuerde, schreibt nicht - er fragt."
};

/* Ein kleiner Vorrat fuer die Buchfuehrung selbst: Nutzungsstand lesen
   und schreiben, Index schreiben. Ohne ihn koennte sich der Waechter
   selbst aussperren - er braucht Operationen, um zu melden, dass keine
   mehr frei sind. */
const BOOKKEEPING_RESERVE = { classA: 200, classB: 200 };

const BLOCKED = "ZERO_COST_GUARD_BLOCKED";
const ALLOWED = "ZERO_COST_GUARD_PASSED";

/** Monatsschluessel in UTC. Die Abrechnung des Anbieters laeuft je Monat. */
function monthKey(date) {
  const d = date ? new Date(date) : new Date();
  return d.toISOString().slice(0, 7);
}

function emptyUsage(month) {
  return {
    version: VERSION, month: month || monthKey(),
    classAOperations: 0, classBOperations: 0,
    storageBytes: 0, objectCount: 0,
    bytesUploaded: 0, bytesDownloaded: 0,
    runs: [], updatedAt: null
  };
}

/**
 * Nutzung fortschreiben. Reiner Zustandsuebergang, damit ein Test ihn
 * ohne Netz pruefen kann.
 */
function applyUsage(state, delta) {
  const s = state && state.month ? state : emptyUsage(delta && delta.month);
  const d = delta || {};
  const next = Object.assign({}, s, {
    classAOperations: s.classAOperations + (d.classAOperations || 0),
    classBOperations: s.classBOperations + (d.classBOperations || 0),
    /* Speicher ist ein STAND, keine Summe: er wird gesetzt, nicht
       addiert. Wer ihn addiert, meldet nach zehn Laeufen das Zehnfache
       dessen, was im Eimer liegt. */
    storageBytes: d.storageBytes === undefined ? s.storageBytes : d.storageBytes,
    objectCount: d.objectCount === undefined ? s.objectCount : d.objectCount,
    bytesUploaded: s.bytesUploaded + (d.bytesUploaded || 0),
    bytesDownloaded: s.bytesDownloaded + (d.bytesDownloaded || 0),
    updatedAt: new Date().toISOString()
  });
  if (d.run) {
    next.runs = (s.runs || []).concat([d.run]).slice(-50);
  }
  return next;
}

/**
 * Was kostet eine geplante Operation?
 *
 * Gezaehlt wird, was der Anbieter zaehlt - nicht, was sich gut anfuehlt.
 *
 * @param {object} plan
 *   kind          BACKFILL | BULK_UPLOAD | DAILY_UPDATE | RECOVERY | REINDEX
 *   objectWrites  Zahl der PUT
 *   objectReads   Zahl der GET
 *   objectHeads   Zahl der HEAD
 *   listPages     Zahl der LIST-Seiten (Class A!)
 *   indexWrites   Zahl der PUT auf Index-/Zustandsobjekte
 *   bytesDelta    Zuwachs an belegtem Speicher
 */
function estimateOperations(plan) {
  const p = plan || {};
  const classA = (p.objectWrites || 0) + (p.indexWrites || 0) + (p.listPages || 0);
  const classB = (p.objectReads || 0) + (p.objectHeads || 0);
  return {
    kind: p.kind || "UNKNOWN",
    classAOperations: classA,
    classBOperations: classB,
    breakdown: {
      objectWrites: p.objectWrites || 0,
      indexWrites: p.indexWrites || 0,
      listPages: p.listPages || 0,
      objectReads: p.objectReads || 0,
      objectHeads: p.objectHeads || 0
    },
    bytesDelta: p.bytesDelta || 0,
    note: "LIST zaehlt als Class A, obwohl es nichts schreibt."
  };
}

function pct(used, limit) {
  if (!limit) return 0;
  return +((used / limit) * 100).toFixed(2);
}

/**
 * Der Waechter. Gibt ein Urteil, keine Warnung.
 *
 * @param {object} input
 *   operation       Name der geplanten Operation (fuer den Bericht)
 *   estimate        Ergebnis von estimateOperations()
 *   usage           Nutzungsstand des laufenden Monats
 *   currentStorageBytes  gemessener Bestand im Eimer
 *   ceiling         optional, sonst SAFETY_CEILING
 */
function evaluate(input) {
  const inp = input || {};
  const ceiling = inp.ceiling || SAFETY_CEILING;
  const usage = inp.usage && inp.usage.month ? inp.usage : emptyUsage();
  const est = inp.estimate || estimateOperations({});

  const currentStorage = inp.currentStorageBytes === undefined
    ? (usage.storageBytes || 0) : inp.currentStorageBytes;
  const projectedStorage = currentStorage + (est.bytesDelta || 0);

  /* Der Vorrat fuer die Buchfuehrung wird dem Plan zugeschlagen, nicht
     der Grenze abgezogen: sonst sieht ein Bericht so aus, als waere
     mehr frei, als der naechste Lauf vorfindet. */
  const projectedClassA = usage.classAOperations + est.classAOperations + BOOKKEEPING_RESERVE.classA;
  const projectedClassB = usage.classBOperations + est.classBOperations + BOOKKEEPING_RESERVE.classB;

  const limits = [
    { id: "STORAGE", current: currentStorage, projected: projectedStorage,
      ceiling: ceiling.storageBytes, freeTier: FREE_TIER.storageBytes, unit: "bytes" },
    { id: "CLASS_A", current: usage.classAOperations, projected: projectedClassA,
      ceiling: ceiling.classAOperations, freeTier: FREE_TIER.classAOperations, unit: "operations" },
    { id: "CLASS_B", current: usage.classBOperations, projected: projectedClassB,
      ceiling: ceiling.classBOperations, freeTier: FREE_TIER.classBOperations, unit: "operations" }
  ].map((l) => Object.assign(l, {
    projectedFreeTierPercent: pct(l.projected, l.freeTier),
    projectedCeilingPercent: pct(l.projected, l.ceiling),
    headroom: l.ceiling - l.projected,
    exceeded: l.projected > l.ceiling
  }));

  const exceeded = limits.filter((l) => l.exceeded);
  const verdict = exceeded.length ? BLOCKED : ALLOWED;

  return {
    version: VERSION,
    verdict,
    operation: inp.operation || est.kind,
    month: usage.month,
    evaluatedAt: new Date().toISOString(),

    /* Die Felder, die der Eigentuemer namentlich verlangt hat. */
    CURRENT_STORAGE_BYTES: currentStorage,
    PROJECTED_STORAGE_BYTES: projectedStorage,
    ESTIMATED_CLASS_A: est.classAOperations,
    ESTIMATED_CLASS_B: est.classBOperations,
    PROJECTED_FREE_TIER_USAGE_PERCENT: Math.max(...limits.map((l) => l.projectedFreeTierPercent)),

    limits,
    exceeded: exceeded.map((l) => l.id),
    estimate: est,
    currentUsage: {
      month: usage.month,
      classAOperations: usage.classAOperations,
      classBOperations: usage.classBOperations,
      storageBytes: currentStorage,
      objectCount: usage.objectCount,
      updatedAt: usage.updatedAt
    },
    freeTier: FREE_TIER,
    ceiling,
    bookkeepingReserve: BOOKKEEPING_RESERVE,
    ownerDecisionRequired: verdict === BLOCKED,
    reason: verdict === BLOCKED
      ? `Die geplante Operation "${inp.operation || est.kind}" wuerde ` +
        exceeded.map((l) => l.id).join(" und ") + " ueber die Sicherheitsgrenze heben. " +
        "Es wurde nichts geschrieben."
      : "Alle Sicherheitsgrenzen eingehalten."
  };
}

/**
 * Das Budget fuer EINEN Lauf.
 *
 * Der Waechter urteilt vorher; dieses Objekt sorgt dafuer, dass der Lauf
 * sein Urteil auch einhaelt. Ohne es waere die Vorabrechnung eine
 * Absichtserklaerung: ein Fehler in der Schaetzung, eine Wiederholung
 * mehr, und der Lauf schreibt trotzdem weiter.
 *
 * Es wirft. Ein ueberzogenes Budget ist kein Grund weiterzumachen.
 */
function createBudget(opts) {
  const o = opts || {};
  let classA = o.classAOperations === undefined ? 0 : o.classAOperations;
  let classB = o.classBOperations === undefined ? 0 : o.classBOperations;
  const spent = { classA: 0, classB: 0, bytesUploaded: 0, bytesDownloaded: 0, writesSkipped: 0 };
  const unmetered = o.unmetered === true;

  return {
    unmetered,
    consumeClassA(n, what) {
      spent.classA += n || 1;
      if (unmetered) return;
      if (spent.classA > classA) {
        throw new Error(BLOCKED + ": Class-A-Budget erschoepft (" + spent.classA + "/" + classA +
                        ") bei " + (what || "Schreibvorgang") + ". Es wird nicht weitergeschrieben.");
      }
    },
    consumeClassB(n, what) {
      spent.classB += n || 1;
      if (unmetered) return;
      if (spent.classB > classB) {
        throw new Error(BLOCKED + ": Class-B-Budget erschoepft (" + spent.classB + "/" + classB +
                        ") bei " + (what || "Lesevorgang") + ".");
      }
    },
    noteUpload(bytes) { spent.bytesUploaded += bytes || 0; },
    noteDownload(bytes) { spent.bytesDownloaded += bytes || 0; },
    noteSkippedWrite() { spent.writesSkipped++; },
    get spent() { return Object.assign({}, spent); },
    get remaining() {
      return unmetered
        ? { classA: Infinity, classB: Infinity }
        : { classA: classA - spent.classA, classB: classB - spent.classB };
    }
  };
}

/** Lesbare Zeile fuer Bericht und Protokoll. */
function formatVerdict(v) {
  const lines = [];
  lines.push(`${v.verdict}  (${v.operation}, Monat ${v.month})`);
  for (const l of v.limits) {
    const fmt = (n) => l.unit === "bytes" ? (n / 1e9).toFixed(2) + " GB" : n.toLocaleString("de-DE");
    lines.push(`  ${l.id.padEnd(8)} jetzt ${fmt(l.current).padStart(12)}` +
               `   geplant ${fmt(l.projected).padStart(12)}` +
               `   Grenze ${fmt(l.ceiling).padStart(12)}` +
               `   ${String(l.projectedCeilingPercent).padStart(6)} %` +
               (l.exceeded ? "   UEBERSCHRITTEN" : ""));
  }
  return lines.join("\n");
}

module.exports = {
  VERSION, FREE_TIER, SAFETY_CEILING, BOOKKEEPING_RESERVE, BLOCKED, ALLOWED,
  monthKey, emptyUsage, applyUsage, estimateOperations, evaluate,
  createBudget, formatVerdict
};

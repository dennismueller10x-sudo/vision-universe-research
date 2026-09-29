/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/post-queue.js

   JEDER KNOPFDRUCK IST EIN AUFTRAG, UND KEINER GEHT VERLOREN
   (Owner-Auftrag "WORK OWNS THE POST", 29.09., §45-§47)

   "JETZT POST ERSTELLEN" legt genau einen Auftrag in diese Warteschlange.
   Laeuft gerade ein Work-Job, wartet der Auftrag - er wird nicht
   verworfen und nicht zusammengelegt. Ist kein Work-Job offen, wird der
   aelteste wartende Auftrag zu genau einem Work-Job.

   Die Grenze von einem gleichzeitig offenen Work-Job (MAX_OPEN_CREATIVE_
   JOBS) bleibt damit, was sie ist: eine Kostengrenze fuer ChatGPT Work.
   Sie drosselt die Geschwindigkeit, nicht die Zahl der Beitraege. Offene
   Candidates im Approval Center zaehlen hier nicht - sie blockieren nie.

   AUTO (Zeitplan) benutzt dieselbe Schlange und denselben Work-Prozess;
   es legt nur dann einen Auftrag an, wenn nichts wartet und nichts
   laeuft.
   ========================================================================= */
"use strict";

const ZUSTAENDE = ["QUEUED", "DISPATCHED", "FAILED"];
const MAX_VERSUCHE = 3;

function leer() { return { version: 1, entries: [] }; }

function kopie(q) {
  const b = q && Array.isArray(q.entries) ? q : leer();
  return { version: 1, entries: b.entries.map((e) => Object.assign({}, e)) };
}

function wartende(q) {
  return kopie(q).entries.filter((e) => e.state === "QUEUED")
    .sort((a, b) => String(a.requestedAt).localeCompare(String(b.requestedAt)));
}

/** Legt genau einen Auftrag an. Ein wiederholter Lauf mit derselben runId
    (z. B. ein erneut gestarteter Workflow) legt keinen zweiten an. */
function anmelden(q, spec) {
  const n = kopie(q);
  const runId = spec.runId ? String(spec.runId) : null;
  if (runId && n.entries.some((e) => e.runId === runId)) {
    return { queue: n, entry: n.entries.find((e) => e.runId === runId), neu: false };
  }
  const trigger = spec.trigger === "AUTO" ? "AUTO" : "MANUAL";
  const entry = {
    id: "req_" + String(spec.requestedAt).replace(/[^0-9]/g, "").slice(0, 14) + "_" +
      (runId || String(n.entries.length + 1)),
    requestedAt: spec.requestedAt, trigger, topic: spec.topic || null, runId,
    state: "QUEUED", contentId: null, dispatchedAt: null, attempts: 0, lastError: null
  };
  n.entries.push(entry);
  return { queue: n, entry, neu: true };
}

/** Was jetzt zu tun ist - reine Entscheidung. */
function naechsterSchritt(q, offeneWorkJobs) {
  const w = wartende(q);
  if (!w.length) return { handlung: "NICHTS", grund: "Kein wartender Auftrag." };
  if (Number(offeneWorkJobs) > 0) {
    return { handlung: "WARTEN", entry: w[0], wartend: w.length,
      grund: "Ein Work-Job laeuft noch; " + w.length + " Auftrag/Auftraege warten und " +
        "werden danach der Reihe nach bearbeitet." };
  }
  return { handlung: "DISPATCH", entry: w[0], wartend: w.length,
    grund: "Kein Work-Job offen - der aelteste wartende Auftrag wird zum Work-Job." };
}

/** AUTO legt nur an, wenn nichts wartet und nichts laeuft. */
function autoErlaubt(q, offeneWorkJobs) {
  return wartende(q).length === 0 && Number(offeneWorkJobs) === 0;
}

function markiere(q, id, aenderung) {
  const n = kopie(q);
  const e = n.entries.find((x) => x.id === id);
  if (!e) throw new Error("post-queue: kein Auftrag " + id);
  if (aenderung.state && ZUSTAENDE.indexOf(aenderung.state) === -1) {
    throw new Error("post-queue: unbekannter Zustand " + aenderung.state);
  }
  Object.assign(e, aenderung);
  return n;
}

/** Ein gescheiterter Versuch: nach MAX_VERSUCHE endgueltig FAILED, sonst
    bleibt der Auftrag in der Schlange und kommt beim naechsten Lauf dran. */
function fehlschlag(q, id, fehler) {
  const e = kopie(q).entries.find((x) => x.id === id);
  const versuche = ((e && e.attempts) || 0) + 1;
  return markiere(q, id, { attempts: versuche, lastError: String(fehler || "").slice(0, 300),
    state: versuche >= MAX_VERSUCHE ? "FAILED" : "QUEUED" });
}

module.exports = { ZUSTAENDE, MAX_VERSUCHE, leer, wartende, anmelden, naechsterSchritt,
  autoErlaubt, markiere, fehlschlag };

'use strict';
/* =========================================================================
   SETUP OOS (setup-oos-1.0.0) - Lernen/Testen (zeitlich) fuer SETUP_BACKTEST.

   Reiner Auswerter ohne Datei- oder Netzzugriff. Er macht das OOS-Gate der
   Backtest-Zertifizierung technisch auswertbar, setzt aber keine Norm:

     - Der Vertrag (quant/methodology/backtest-certification-v1.json) verlangt
       oosMinPerSegment je Segment, definiert aber KEINE Segmentierung und
       KEIN Erfolgskriterium. Beides ist eine Owner-Entscheidung.
     - Ohne freigegebene Segmentdefinition endet die Auswertung immer in
       FAIL: OOS_NOT_MEASURABLE_YET (zu wenige abgeschlossene Ergebnisse)
       oder OOS_SEGMENT_DEFINITION_MISSING. Es gibt keinen Standardschnitt.
     - Eine Segmentierung wird nur aus einem freigegebenen Methodikfeld
       gelesen (segmentationFromMethodology). Das Feld
       kinds.SETUP_BACKTEST.oosSegmentation existiert heute NICHT; es ist
       nur ein Vorschlag (docs/quant/SETUP_OOS_EVALUATION.md). Tests
       uebergeben Segmentierungen direkt.
     - PASS des OOS-Gates zertifiziert nichts: SETUP_BACKTEST braucht
       zusaetzlich alle anderen Gates und die Owner-Freigabe
       (setup-state-v1.json requirements.backtestCertification).

   Eingabe evaluateSetupOos({ rows, completedCount, minPerSegment, segmentation })
     rows           Array abgeschlossener Ereignisse { date: "YYYY-MM-DD",
                    net: Zahl, b: { median } | null } (Form aus
                    build-setup-outcomes.mjs) oder null, wenn der Erzeuger
                    keine Ereigniszeilen exportiert.
     completedCount Zahl abgeschlossener Ergebnisse, falls rows === null.
     minPerSegment  Mindestgroesse je Segment (Vertrag: 30).
     segmentation   null (heute) oder { id, method, cutDate?, embargoDays,
                    criterion: { metric, rule } }.

   Ausgabe { schemaVersion, status: PASS|FAIL, reasonCode, minPerSegment,
             completed, segmentation, purged, segments: { train, test } | null }
   ========================================================================= */
const VERSION = 'setup-oos-1.0.0';
const DAY = 86400000;
const METHODS = ['CHRONOLOGICAL_MEDIAN_EVENT_DATE', 'FIXED_CALENDAR_CUT'];
const METRICS = ['MEDIAN_EXCESS', 'MEDIAN_NET'];
const RULES = ['POSITIVE_IN_BOTH', 'SIGN_REPLICATES'];
const REASONS = ['OOS_NOT_MEASURABLE_YET', 'OOS_SEGMENT_DEFINITION_MISSING', 'OOS_SEGMENT_DEFINITION_INVALID', 'OOS_ROWS_NOT_EXPORTED',
  'OOS_SEGMENT_TOO_SMALL', 'OOS_DIRECTION_NOT_REPLICATED', 'OOS_MIN_PER_SEGMENT_INVALID'];

function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(s + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}
const ms = (s) => Date.parse(s + 'T00:00:00Z');
function median(xs) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const sign = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);

/** Nur gueltige, abgeschlossene Zeilen; sortiert nach Datum (stabil). */
function completedRows(rows) {
  return rows.filter((r) => r && isDate(r.date) && typeof r.net === 'number' && Number.isFinite(r.net))
    .map((r) => ({ date: r.date, net: r.net, excess: r.b && typeof r.b.median === 'number' && Number.isFinite(r.b.median) ? r.net - r.b.median : null }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function validSegmentation(s) {
  if (!s || typeof s !== 'object') return false;
  if (typeof s.id !== 'string' || !s.id) return false;
  if (!METHODS.includes(s.method)) return false;
  if (s.method === 'FIXED_CALENDAR_CUT' && !isDate(s.cutDate)) return false;
  if (s.method !== 'FIXED_CALENDAR_CUT' && s.cutDate !== undefined && s.cutDate !== null) return false;
  if (!Number.isSafeInteger(s.embargoDays) || s.embargoDays < 0 || s.embargoDays > 3660) return false;
  if (!s.criterion || !METRICS.includes(s.criterion.metric) || !RULES.includes(s.criterion.rule)) return false;
  return true;
}

/** Schnittdatum: Testsegment = Ereignisse mit date >= cut. Beim Median-Schnitt
    ist cut das Datum des Median-Ereignisses (untere Mitte); Ereignisse
    desselben Tages landen nie in beiden Segmenten. */
function cutDateOf(s, rows) {
  if (s.method === 'FIXED_CALENDAR_CUT') return s.cutDate;
  return rows[(rows.length - 1) >> 1].date;
}

function summary(list, metric) {
  const vals = list.map((r) => (metric === 'MEDIAN_EXCESS' ? r.excess : r.net)).filter((x) => x !== null);
  return { n: vals.length, nAll: list.length, from: list.length ? list[0].date : null, to: list.length ? list[list.length - 1].date : null, metric: median(vals) };
}

function result(status, reasonCode, extra) {
  return Object.assign({ schemaVersion: VERSION, status, reasonCode, minPerSegment: null, completed: 0, segmentation: null, purged: 0, segments: null }, extra);
}

function evaluateSetupOos(input) {
  const inp = input || {};
  const min = inp.minPerSegment;
  if (!Number.isSafeInteger(min) || min < 1) return result('FAIL', 'OOS_MIN_PER_SEGMENT_INVALID', { minPerSegment: null });
  const rows = Array.isArray(inp.rows) ? completedRows(inp.rows) : null;
  const completed = rows ? rows.length : (Number.isSafeInteger(inp.completedCount) && inp.completedCount > 0 ? inp.completedCount : 0);
  const base = { minPerSegment: min, completed };
  /* 1. Zu wenig abgeschlossene Ergebnisse fuer zwei Segmente: nicht messbar. */
  if (completed < 2 * min) return result('FAIL', 'OOS_NOT_MEASURABLE_YET', base);
  /* 2. Keine freigegebene Segmentdefinition: kein Standardschnitt, FAIL. */
  const s = inp.segmentation;
  if (s === null || s === undefined) return result('FAIL', 'OOS_SEGMENT_DEFINITION_MISSING', base);
  if (!validSegmentation(s)) return result('FAIL', 'OOS_SEGMENT_DEFINITION_INVALID', base);
  base.segmentation = s.id;
  /* 3. Ohne Ereigniszeilen ist kein Schnitt rechenbar. */
  if (!rows) return result('FAIL', 'OOS_ROWS_NOT_EXPORTED', base);
  const metric = s.criterion.metric;
  const cut = cutDateOf(s, rows), cutMs = ms(cut);
  const test = rows.filter((r) => r.date >= cut);
  const before = rows.filter((r) => r.date < cut);
  /* Purge/Embargo: Trainingsereignisse, deren Fenster in den Test reicht, fallen weg. */
  const train = before.filter((r) => ms(r.date) + s.embargoDays * DAY < cutMs);
  const segments = { cutDate: cut, train: summary(train, metric), test: summary(test, metric) };
  Object.assign(base, { purged: before.length - train.length, segments });
  if (segments.train.n < min || segments.test.n < min) return result('FAIL', 'OOS_SEGMENT_TOO_SMALL', base);
  const a = sign(segments.train.metric), b = sign(segments.test.metric);
  const ok = s.criterion.rule === 'POSITIVE_IN_BOTH' ? a > 0 && b > 0 : a !== 0 && a === b;
  return result(ok ? 'PASS' : 'FAIL', ok ? null : 'OOS_DIRECTION_NOT_REPLICATED', base);
}

/** Einzige zulaessige Quelle einer Segmentierung ausserhalb von Tests:
    kinds.SETUP_BACKTEST.oosSegmentation im Zertifizierungsvertrag, nur mit
    ausdruecklicher Owner-Freigabe (approval.approvedBy und approval.approvedAt).
    Das Feld existiert heute nicht -> null. */
function segmentationFromMethodology(methodology) {
  const k = methodology && methodology.kinds && methodology.kinds.SETUP_BACKTEST;
  const s = k && k.oosSegmentation;
  if (!s || !s.approval || typeof s.approval.approvedBy !== 'string' || !s.approval.approvedBy || !isDate(s.approval.approvedAt)) return null;
  return s;
}

/** Klartext fuer das Gate. Der heutige Fall behaelt den bisherigen Wortlaut. */
const VALUE_TEXT = {
  OOS_NOT_MEASURABLE_YET: 'erst mit abgeschlossenen Ergebnissen messbar',
  OOS_SEGMENT_DEFINITION_MISSING: 'Segmentdefinition fehlt (Owner-Entscheidung)',
  OOS_SEGMENT_DEFINITION_INVALID: 'Segmentdefinition ungültig',
  OOS_ROWS_NOT_EXPORTED: 'Ereigniszeilen nicht exportiert',
  OOS_SEGMENT_TOO_SMALL: 'Segment unter der Mindestgröße',
  OOS_DIRECTION_NOT_REPLICATED: 'Richtung im Testzeitraum nicht bestätigt',
  OOS_MIN_PER_SEGMENT_INVALID: 'Mindestgröße je Segment ungültig'
};
function gateValue(r) { return r.status === 'PASS' ? 'im Testzeitraum bestätigt (' + r.segmentation + ')' : VALUE_TEXT[r.reasonCode]; }

module.exports = { VERSION, METHODS, METRICS, RULES, REASONS, evaluateSetupOos, segmentationFromMethodology, gateValue };

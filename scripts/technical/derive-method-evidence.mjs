#!/usr/bin/env node
/* Evidenz-Status je Methode — abgeleitet aus den Studien, nicht von Hand vergeben (Master Mission II §58/§59, §85/§86).

   Stufen (Definition, vorab):
     VALIDATED        vorab registrierte Hypothese auf unabhaengiger Stichprobe bestaetigt (KI + Holm)
     SUPPORTED        Holdout-Effekt mit 95 %-KI ausserhalb von "kein Effekt", aber nicht vorab registriert bestaetigt
     NOT_ESTABLISHED  geprueft, kein belastbarer Effekt
     DESCRIPTIVE_ONLY ohne Prognoseanspruch (beschreibend)
   Rolle im Produkt: CORE | CONTEXT | EXPERIMENTAL | REMOVE (Keep/Downweight/Remove, §86).

   Quellen: evidence-1W.json (Richtungs-Ablation, Holdout = Zeitraum ab 2019) und
   elliott-validation/report-confirmatory-v22-sticky.json (vorab registrierte Hypothesen). */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/ti-data.mjs";

const ev = JSON.parse(readFileSync(join(ROOT, "quant/data/technical-intelligence/evidence/evidence-1W.json"), "utf8"));
const cf = join(ROOT, "quant/data/technical-intelligence/elliott-validation/report-confirmatory-v22-sticky.json");
const conf = existsSync(cf) ? JSON.parse(readFileSync(cf, "utf8")) : null;
const H = conf ? conf.preregisteredHypotheses : {};
const ho = ev.directionAblation.holdout, pct = (x) => (x * 100).toFixed(1).replace(".", ",") + " %";

/** Richtungs-Trefferquote im Holdout: KI-Untergrenze > 50 % → SUPPORTED (Richtung), sonst NOT_ESTABLISHED. */
function direction(key) {
  const a = ho[key];
  if (!a || !a.n) return { level: "NOT_ESTABLISHED", stat: "keine Daten" };
  const sup = a.ci && a.ci[0] > 0.5;
  return { level: sup ? "SUPPORTED" : "NOT_ESTABLISHED", stat: "Richtung nach 13 Wochen im Prüfzeitraum ab 2019: " + pct(a.hitRate) + " (95 %-KI " + pct(a.ci[0]) + "–" + pct(a.ci[1]) + ", n = " + a.n.toLocaleString("de-DE") + "); vorzeichenbereinigte Ø-Rendite " + pct(a.meanSignedReturn) + " gegenüber „immer long“ " + pct(ho.ALWAYS_LONG.meanSignedReturn) };
}
const LABEL = { VALIDATED: "Bestätigt", SUPPORTED: "Gestützt (schwach)", NOT_ESTABLISHED: "Kein Vorteil belegt", DESCRIPTIVE_ONLY: "Beschreibend" };
const out = { generatedAt: new Date().toISOString(), definitions: {
  VALIDATED: "vorab registrierte Hypothese auf unabhängiger Stichprobe bestätigt", SUPPORTED: "Holdout-Effekt statistisch von null verschieden, aber nicht vorab registriert bestätigt; wirtschaftlich gering",
  NOT_ESTABLISHED: "geprüft, kein belastbarer Effekt", DESCRIPTIVE_ONLY: "ohne Prognoseanspruch" }, methods: {} };
function add(key, level, role, stat, consumer, pro) { out.methods[key] = { level, label: LABEL[level], role, stat, consumer, pro }; }

const dTrend = direction("TREND"), dMom = direction("MOMENTUM"), dStr = direction("STRUCTURE"), dPat = direction("PATTERN"), dConf = direction("CONFLUENCE");
add("TREND", dTrend.level, "CORE", dTrend.stat, "Trendrichtung ist die verlässlichste Beschreibung der Lage; einen wirtschaftlichen Vorteil belegt sie allein nicht.", dTrend.stat);
add("MOMENTUM", dMom.level, "CORE", dMom.stat, "Bewegungsstärke beschreibt den Schwung; Prognosewert klein.", dMom.stat);
add("STRUCTURE", dStr.level, "CORE", dStr.stat, "Hochs und Tiefs beschreiben die Struktur.", dStr.stat);
add("PATTERN", dPat.level, "CONTEXT", dPat.stat, "Chartformationen beschreiben Lagen; ein Vorteil ist nicht belegt.", dPat.stat);
add("CONFLUENCE", dConf.level, "CORE", dConf.stat, "Die Einigkeit der Verfahren beschreibt, wie eindeutig das Bild ist – keine Trefferwahrscheinlichkeit.", dConf.stat);
const h = (k) => (H[k] ? k + " " + (H[k].confirmed ? "bestätigt" : "nicht bestätigt") + " (" + H[k].est + ", KI " + H[k].lo + " bis " + H[k].hi + ")" : k + " nicht geprüft");
const elliottValidated = H.H1 && H.H1.confirmed && H.H2 && H.H2.confirmed;
add("ELLIOTT", elliottValidated ? "VALIDATED" : "NOT_ESTABLISHED", elliottValidated ? "CORE" : "CONTEXT",
  "Vorab registrierter Test auf unabhängigen Titeln: " + ["H1", "H2", "H3", "H4", "H5"].map(h).join("; "),
  "In der vorab festgelegten Prüfung auf unabhängigen Aktien brachte die Elliott-Zählung keinen Prognosevorteil gegenüber derselben Kursstruktur ohne Zählung. Sie dient hier als Sprache für Struktur und Szenarien.",
  "Kontext, kein Prognosebeitrag (" + ["H1", "H2", "H3"].map(h).join("; ") + ")");
add("FIBONACCI", H.H7 && H.H7.confirmed ? "SUPPORTED" : "NOT_ESTABLISHED", "CONTEXT", "Häufung an Fibonacci-Niveaus: keine (Verhältnis ≈ 1); " + h("H7"),
  "Wendepunkte häufen sich nicht an Fibonacci-Niveaus; Fibonacci zählt nur, wo mehrere Anker zusammenfallen.", h("H7"));
add("TIMING_EARLY", H.H6 && H.H6.confirmed ? "VALIDATED" : "NOT_ESTABLISHED", "CONTEXT", h("H6"),
  "Wer früh in der laufenden Gegenbewegung einsteigt, lag historisch besser als beim Einstieg nach der späten Bestätigung – das gilt auch ohne Elliott-Zählung.",
  h("H6") + " — Effekt des Zeitpunkts, nicht des Elliott-Labels (gleicher Effekt bei Rückläufen ohne Fortsetzungs-Lesart)");
add("WYCKOFF", "DESCRIPTIVE_ONLY", "CONTEXT", "keine Richtungsstimme (Gewicht 0)", "Wyckoff beschreibt Handelsspannen.", "Gewicht 0; Richtungstrefferquote in TRAIN/VALIDATION < 50 %");
add("VOLUME", "DESCRIPTIVE_ONLY", "CONTEXT", "Wochenreihen ohne Volumen; Tagesstudie zu klein", "Volumen ergänzt die Beschreibung, wo vorhanden.", "nicht belastbar geprüft (Volumen nur in Tagesdaten)");
writeFileSync(join(ROOT, "quant/methodology/technical-method-evidence.json"), JSON.stringify(out, null, 1));
console.log(Object.entries(out.methods).map(([k, v]) => k + ": " + v.level + "/" + v.role).join(" · "));

#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — assert-zero-cost-mode.mjs

   ZERO_COST_MODE = HARD, als Riegel statt als Vorsatz

   Owner 17.09.2026: "Keine Anwendung, kein Workflow und kein Deployment
   darf Workers Paid aktivieren, den Billing-Plan veraendern, die
   Subscription veraendern, kostenpflichtige Cloudflare-Ressourcen
   erzeugen, die Billing-/Subscription-API fuer ein Upgrade verwenden
   oder automatisch auf einen Paid-Plan wechseln."

   Ein Satz in einer Dokumentation haelt das nicht. Dieses Skript schon:
   es durchsucht alles, was laufen kann, nach den Stellen, an denen so
   etwas ueberhaupt stattfinden koennte - und faellt durch, wenn es eine
   findet.

   WAS GESUCHT WIRD

     1. Cloudflare-API-Pfade, die Geld kosten koennen
        /subscriptions, /billing, /rate_plans, /plans
     2. wrangler-Schalter, die einen Tarif setzen
        --usage-model, usage_model
     3. Konfigurationen, die es ohne Paid nicht gibt
        new_classes ohne SQLite, unbound-Modelle
     4. Woerter, die auf eine Automatisierung hindeuten
        "upgrade to paid", "enable paid", "activate subscription"

   WAS NICHT GESUCHT WIRD

   Das Wort "Paid" in einer Erklaerung. Dieses Repository sagt an vielen
   Stellen, dass Workers Paid NICHT aktiviert wird - das ist der Grund
   fuer die Existenz dieses Skripts und kein Verstoss gegen es. Gesucht
   wird, was AUSFUEHRBAR ist: Aufrufe, Schalter, Konfiguration.
   ========================================================================= */

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(root, "quant", "data", "market", "commercial");

/* Alles, was laufen kann. Dokumentation steht absichtlich nicht darin -
   sie fuehrt nichts aus. */
const ZIELE = [".github/workflows", "scripts", "worker", "quant/engines", "quant/config",
               "providers", "discover/ui", "discover/engines"];
const AUSFUEHRBAR = /\.(mjs|js|cjs|yml|yaml|sh|toml|json)$/i;

const MUSTER = [
  { id: "cloudflareSubscriptionApi",
    re: /api\.cloudflare\.com[^"'\s]*\/(subscriptions|billing|rate_plans)\b/i,
    was: "Aufruf der Cloudflare-Billing- oder Subscription-API" },
  { id: "subscriptionWrite",
    re: /(PUT|POST|PATCH)[^\n]{0,80}\/(subscriptions|billing|rate_plans)\b/i,
    was: "schreibender Aufruf auf einen Tarif" },
  { id: "usageModelFlag",
    re: /--usage-model\b/,
    was: "wrangler-Schalter, der ein Abrechnungsmodell setzt" },
  { id: "usageModelConfig",
    re: /^\s*usage_model\s*=/m,
    was: "usage_model in der Konfiguration" },
  { id: "durableObjectsOhneSqlite",
    re: /^\s*new_classes\s*=/m,
    was: "Durable Objects ohne SQLite-Backend - die gibt es nur im kostenpflichtigen Tarif" },
  { id: "planWechsel",
    re: /\b(upgrade[_\s-]?to[_\s-]?paid|enable[_\s-]?paid|activate[_\s-]?subscription|set[_\s-]?plan)\b/i,
    was: "Formulierung, die nach einem automatischen Tarifwechsel aussieht" }
];

function gehe(dir) {
  const voll = join(root, dir);
  if (!existsSync(voll)) return [];
  const out = [];
  (function rein(d) {
    for (const e of readdirSync(d)) {
      if (e === "node_modules" || e === ".git") continue;
      const f = join(d, e);
      if (statSync(f).isDirectory()) rein(f);
      else if (AUSFUEHRBAR.test(extname(f))) out.push(f);
    }
  })(voll);
  return out;
}

const dateien = ZIELE.reduce((a, z) => a.concat(gehe(z)), []);
const funde = [];
for (const datei of dateien) {
  const rel = datei.slice(root.length + 1);
  /* Dieses Skript selbst enthaelt die Muster - es ist der Waechter, nicht
     der Verstoss. */
  if (rel === "scripts/market/assert-zero-cost-mode.mjs") continue;
  const text = readFileSync(datei, "utf8");
  for (const m of MUSTER) {
    const treffer = m.re.exec(text);
    if (treffer) {
      const zeile = text.slice(0, treffer.index).split("\n").length;
      funde.push({ file: rel, line: zeile, pattern: m.id, what: m.was });
    }
  }
}

/* Und die Gegenprobe an der Konfiguration selbst: das eine Durable
   Object MUSS SQLite-gestuetzt sein, sonst braucht es einen Paid-Tarif. */
const toml = existsSync(join(root, "worker", "wrangler.toml"))
  ? readFileSync(join(root, "worker", "wrangler.toml"), "utf8") : "";
const sqlite = /new_sqlite_classes\s*=/.test(toml);
const keinUsageModel = !/^\s*usage_model\s*=/m.test(toml);

const bericht = {
  schemaVersion: "zero-cost-mode-1.0.0",
  contract: "ZERO_COST_MODE = HARD",
  decidedBy: "Owner",
  decidedAt: "2026-09-17",
  checkedAt: new Date().toISOString(),
  scanned: { files: dateien.length, roots: ZIELE },
  rules: MUSTER.map((m) => ({ id: m.id, what: m.was })),
  findings: funde,
  worker: { sqliteBackedDurableObject: sqlite, noUsageModel: keinUsageModel },
  PAID_SERVICES_ENABLED: 0,
  note: "Gesucht wird, was ausfuehrbar ist - Aufrufe, Schalter, Konfiguration. Das Wort 'Paid' in " +
        "einer Erklaerung ist kein Verstoss; dieses Repository sagt an vielen Stellen, dass Workers " +
        "Paid nicht aktiviert wird, und genau deshalb gibt es diese Pruefung.",
  fallback: "Realtime -> Snapshot -> letzte abgeschlossene Sitzung -> Historie. Bei PROTECT (85 %) " +
            "wird Realtime kontrolliert beendet; das Produkt gibt kein Geld aus.",
  verdict: null
};
bericht.verdict = (funde.length === 0 && sqlite && keinUsageModel) ? "PASS" : "FAIL";

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "zero-cost-mode.json"), JSON.stringify(bericht, null, 2) + "\n");

console.log("ZERO_COST_MODE = HARD");
console.log("");
console.log("  " + dateien.length + " ausfuehrbare Dateien durchsucht");
console.log("  Durable Object SQLite-gestuetzt: " + (sqlite ? "ja" : "NEIN"));
console.log("  kein usage_model gesetzt:        " + (keinUsageModel ? "ja" : "NEIN"));
console.log("  Funde:                           " + funde.length);
for (const f of funde) console.log("    " + f.file + ":" + f.line + "  " + f.what);
console.log("");
console.log("URTEIL: " + bericht.verdict + "   PAID_SERVICES_ENABLED = 0");
if (bericht.verdict !== "PASS") process.exit(1);

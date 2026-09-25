/* Der Befund vom 25.09.2026, als Vertrag festgehalten.
 *
 * `sync-history-store.mjs` beschreibt seinen Vertrag selbst: "--pull Ablage ->
 * .market-cache (vor Faktoren und Technical), --push .market-cache -> Ablage
 * (nach dem Gate-Lauf)". Der Pull war verdrahtet, der Push in KEINEM Workflow.
 * Das Verhalten des Skripts war dabei durchgehend geprueft
 * (history-sync-boundary.test.mjs, 14 Faelle) - nur rief es niemand. Zehn
 * Handelstage Rueckstand bei 5.646 von 5.676 Titeln, und mit derselben Ursache
 * eingefrorene Wochenreihen, also auch Musterstudie, Mustervergleich und
 * Belastbarkeit.
 *
 * Ein Test ueber das Skript hatte das nie gefunden. Deshalb prueft diese Datei
 * den Aufruf: dass ihn ein Workflow ausfuehrt, dass er planmaessig laeuft, dass
 * er nicht an einer Ereignisart haengt, und dass er dort steht, wo ein
 * abgewiesener Repo-Push ihn nicht mitnimmt.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const workflowDir = join(root, ".github", "workflows");
const workflow = (file) => readFileSync(join(workflowDir, file), "utf8");
const refresh = workflow("market-data-refresh.yml");

/* Ein Schritt, gefunden ueber seinen Namen bis zum naechsten `- name:`. */
function step(text, name) {
  const start = text.indexOf(`      - name: ${name}`);
  if (start < 0) return null;
  const next = text.indexOf("\n      - name:", start + 1);
  return { start, body: text.slice(start, next < 0 ? text.length : next) };
}

test("irgendein Workflow fuehrt den Push in die dauerhafte Ablage aus", () => {
  const rufer = readdirSync(workflowDir)
    .filter((f) => f.endsWith(".yml"))
    .filter((f) => /sync-history-store\.mjs[^\n]*--push/.test(workflow(f)));
  assert.ok(rufer.length > 0,
    "kein Workflow ruft sync-history-store.mjs --push - genau dieser Zustand hat die Ablage zehn Handelstage einfrieren lassen");
  assert.ok(rufer.includes("market-data-refresh.yml"),
    "der taegliche Abruf zieht die Ablage nicht nach: " + rufer.join(", "));
});

test("der Abruf laeuft planmaessig - sonst zieht ihn niemand nach", () => {
  assert.match(refresh, /^\s+schedule:/m);
  assert.match(refresh, /cron:\s*'[^']*'/,
    "ohne Zeitplan haengt die Aktualitaet der Ablage an einem Menschen, der dispatcht");
});

test("Vorabrechnung und Push haengen am Zugang, nicht an der Ereignisart", () => {
  for (const name of [
    "Vorabrechnung fuer den Abgleich der dauerhaften Ablage",
    "Dauerhafte Ablage auf den frischen Stand bringen"
  ]) {
    const s = step(refresh, name);
    assert.ok(s, `Schritt fehlt: ${name}`);
    const bedingung = s.body.match(/^\s+if:\s*(.+)$/m)?.[1] ?? "";
    assert.match(bedingung, /steps\.history_store\.outputs\.ready == 'true'/,
      `${name} prueft den Zugang nicht`);
    assert.doesNotMatch(bedingung, /github\.event/,
      `${name} haengt an einer Ereignisart - ein planmaessiger Lauf wuerde ihn ueberspringen`);
  }
});

test("der Push steht nach Gate B und vor dem Repo-Push", () => {
  const gateB = refresh.indexOf("--phase=integrity");
  const push = step(refresh, "Dauerhafte Ablage auf den frischen Stand bringen");
  const repoPush = step(refresh, "Commit und Push");
  assert.ok(gateB > 0 && push && repoPush);
  assert.ok(gateB < push.start,
    "was Gate B nicht veroeffentlichen darf, darf auch nicht dauerhaft abgelegt werden");
  assert.ok(push.start < repoPush.start,
    "steht der Ablage-Push nach dem Repo-Push, nimmt ein abgewiesener Push ihn mit - Lauf 36078691085");
});

test("der Push laeuft nur mit gerechnetem Budget", () => {
  const push = step(refresh, "Dauerhafte Ablage auf den frischen Stand bringen");
  assert.match(push.body, /--operation DAILY_UPDATE/);
  assert.match(push.body, /--preflight "\$RUNNER_TEMP\/history-store-push-preflight\.json"/);
  const vorab = step(refresh, "Vorabrechnung fuer den Abgleich der dauerhaften Ablage");
  assert.match(vorab.body, /preflight-zero-cost\.mjs --operation DAILY_UPDATE/);
  assert.match(vorab.body, /--out "\$RUNNER_TEMP\/history-store-push-preflight\.json"/,
    "der Push liest eine Vorabrechnung, die dieser Schritt schreiben muss");
});

test("der Hebel ohne Abruf ist dispatchbar und fragt keinen Anbieter", () => {
  const lever = workflow("history-store-sync.yml");
  assert.match(lever, /^on:\s*\n\s+workflow_dispatch:/m);
  assert.match(lever, /sync-history-store\.mjs[\s\S]{0,200}--push/);
  assert.doesNotMatch(lever, /TIINGO/,
    "der Hebel soll die Ablage nachschreiben, nicht neu abrufen");
});

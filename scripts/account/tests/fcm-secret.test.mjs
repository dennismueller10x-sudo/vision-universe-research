// Firebase-Servicekonto (app/README.md E4): account.yml, Teil ausrollen, setzt FCM_SERVICE_ACCOUNT aus dem GitHub-Secret beim
// Worker. Geprueft wird der echte Schritt aus der Workflow-Datei mit einem wrangler-Stub: Wert nur ueber stdin an wrangler,
// nie ins Protokoll; kaputtes JSON oder kein Servicekonto bricht ab, ohne etwas zu setzen; fehlt das Secret, nur eine Warnung.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const WF = readFileSync(join(ROOT, ".github/workflows/account.yml"), "utf8");
const STEP = "- name: Secrets zu Cloudflare (Supabase, Brevo, FCM)";

function stepBlock() {
  const lines = WF.split("\n"), i = lines.findIndex((l) => l.trim() === STEP);
  assert.ok(i >= 0, "Schritt " + STEP + " fehlt in account.yml");
  const indent = lines[i].indexOf("-"), out = [];
  for (let k = i + 1; k < lines.length; k++) {
    const l = lines[k];
    if (l.trim() && l.search(/\S/) <= indent) break;
    out.push(l);
  }
  return out.join("\n");
}
function runScript() {
  const block = stepBlock().split("\n"), r = block.findIndex((l) => /^\s*run: \|\s*$/.test(l));
  const pad = block[r + 1].search(/\S/);
  return block.slice(r + 1).map((l) => l.slice(pad)).join("\n");
}

const SENTINEL = "SENTINEL-PRIVATE-KEY-7f3a";
/* PEM-Rahmen zur Laufzeit zusammengesetzt: assert-no-billing-secrets.mjs sucht die Rahmenzeile im Quelltext. */
const PEM = (w) => "-----" + w + " " + ["PRIVATE", "KEY"].join(" ") + "-----";
const ACCOUNT = JSON.stringify({ type: "service_account", project_id: "vision-universe-app", client_email: "fcm@vision-universe-app.iam.gserviceaccount.com",
  private_key: PEM("BEGIN") + "\n" + SENTINEL + "\n" + PEM("END") + "\n" });

function run(fcm) {
  const dir = mkdtempSync(join(tmpdir(), "fcm-secret-"));
  try {
    const bin = join(dir, "bin"), log = join(dir, "puts.jsonl");
    spawnSync("mkdir", ["-p", bin]);
    /* npx-Stub: zeichnet nur auf, welcher Name mit welchem stdin gesetzt wurde; nichts geht ins Netz. */
    writeFileSync(join(bin, "npx"), "#!/usr/bin/env bash\nname=''; prev=''; for a in \"$@\"; do [ \"$prev\" = put ] && name=\"$a\"; prev=\"$a\"; done\n" +
      "val=$(cat); node -e 'require(\"fs\").appendFileSync(process.argv[1], JSON.stringify({name:process.argv[2], val:process.argv[3]})+\"\\n\")' \"$PUTLOG\" \"$name\" \"$val\"\n");
    chmodSync(join(bin, "npx"), 0o755);
    const env = { PATH: bin + ":" + process.env.PATH, PUTLOG: log, WRANGLER: "wrangler@stub", SEC: "sb_secret_test", BREVO: "",
      FCM_SERVICE_ACCOUNT: fcm, HOME: dir };
    const res = spawnSync("bash", ["-c", runScript()], { env, encoding: "utf8" });
    const puts = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
    return { code: res.status, out: res.stdout + res.stderr, puts };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("FCM-1 · gueltiges Servicekonto: genau dieser Wert geht per stdin an wrangler, nichts davon ins Protokoll", () => {
  const r = run(ACCOUNT);
  assert.equal(r.code, 0, r.out);
  const fcm = r.puts.find((p) => p.name === "FCM_SERVICE_ACCOUNT");
  assert.ok(fcm, "FCM_SERVICE_ACCOUNT wurde nicht gesetzt: " + r.out);
  assert.equal(fcm.val, ACCOUNT, "Wert unveraendert an wrangler");
  assert.match(r.out, /FCM_SERVICE_ACCOUNT hinterlegt/);
  for (const teil of [SENTINEL, "vision-universe-app", "iam.gserviceaccount.com", PEM("BEGIN")]) assert.ok(!r.out.includes(teil), "im Protokoll: " + teil);
});

test("FCM-2 · kaputtes JSON oder kein Servicekonto: Abbruch, nichts gesetzt, kein Inhalt im Protokoll", () => {
  for (const bad of ["{" + SENTINEL, JSON.stringify({ type: "authorized_user", private_key: SENTINEL }), JSON.stringify({ type: "service_account", project_id: "x", client_email: "a@b" })]) {
    const r = run(bad);
    assert.notEqual(r.code, 0, "muss abbrechen: " + r.out);
    assert.match(r.out, /::error::FCM_SERVICE_ACCOUNT/);
    assert.ok(!r.puts.some((p) => p.name === "FCM_SERVICE_ACCOUNT"), "darf nicht gesetzt werden");
    assert.ok(!r.out.includes(SENTINEL), "Inhalt im Protokoll");
  }
});

test("FCM-3 · ohne GitHub-Secret: Warnung, Worker-Secret bleibt unberuehrt, Lauf geht weiter", () => {
  const r = run("");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /::warning::FCM_SERVICE_ACCOUNT fehlt/);
  assert.ok(!r.puts.some((p) => p.name === "FCM_SERVICE_ACCOUNT"));
  assert.ok(r.puts.some((p) => p.name === "SUPABASE_SECRET_KEY"), "die uebrigen Secrets laufen wie bisher");
});

test("FCM-4 · Muster: Secret nur ueber env, nie als ${{ }} im Shell-Text, nie per echo, wrangler-Ausgabe verworfen", () => {
  const block = stepBlock(), script = runScript();
  assert.match(block, /FCM_SERVICE_ACCOUNT: \$\{\{ secrets\.FCM_SERVICE_ACCOUNT \}\}/);
  assert.ok(!/\$\{\{/.test(script), "kein ${{ }} im Shell-Text (ADR-005)");
  assert.ok(!/echo[^\n]*\$FCM_SERVICE_ACCOUNT|echo[^\n]*\$\{FCM_SERVICE_ACCOUNT/.test(script), "kein echo des Werts");
  assert.match(script, /secret put "\$1" --env production > \/dev\/null 2>&1/, "wrangler-Ausgabe verworfen");
  assert.match(script, /printf '%s' "\$FCM_SERVICE_ACCOUNT" \| node -e/, "Pruefung liest von stdin");
});

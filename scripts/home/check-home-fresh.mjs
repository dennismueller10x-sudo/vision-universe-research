#!/usr/bin/env node
/* Alarm (kein Code-Gate): zeigt die ausgelieferte Startseite (index.html) den Tagesstand der Produktdaten?
   index.html ist die Ausgabe von scripts/home/build-home.mjs; home-refresh.yml setzt sie nach den Datenlaeufen neu ein.
   Weicht sie vom Generator auf den aktuellen Daten ab, ist der Lauf nach dem Datenlauf ausgeblieben oder uebersprungen.
   Aufruf: node scripts/home/check-home-fresh.mjs   Exit 1 bei Abweichung (der Monitor wird rot, GitHub meldet es). Schreibt nichts. */
import { readFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = join(mkdtempSync(join(tmpdir(), "home-fresh-")), "index.html");
execFileSync(process.execPath, [join(root, "scripts/home/build-home.mjs"), "--out=" + out], { cwd: root, stdio: "pipe" });
const fresh = readFileSync(out, "utf8"), live = readFileSync(join(root, "index.html"), "utf8");
if (fresh === live) { console.log("Startseite zeigt den Tagesstand der Produktdaten."); process.exit(0); }
const date = (h) => (/Schluss<br>(\d\d\.\d\d\.\d\d)/.exec(h) || [])[1] || "?";
console.error("ALARM Startseite: index.html (Schluss " + date(live) + ") weicht vom Generator auf den aktuellen Daten ab (Schluss " + date(fresh) + ").");
console.error("home-refresh.yml hat nach dem Datenlauf nicht neu eingesetzt: Lauf, Bedingung (conclusion/Chartbild-Marke) und Zeitpunkt pruefen, dann per workflow_dispatch nachholen.");
process.exit(1);

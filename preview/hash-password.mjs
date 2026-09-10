/* =========================================================================
   VISION UNIVERSE — preview/hash-password.mjs

   ERZEUGT DEN EINTRAG FUER PREVIEW_USERS.

   Das Passwort wird eingelesen, gehasht und sofort vergessen. Es
   erscheint nicht auf dem Bildschirm, nicht in der Kommandozeile und
   damit auch nicht in der Shell-Historie - deshalb gibt es KEINE
   Moeglichkeit, es als Argument zu uebergeben. Ein Passwort in
   `history` ist ein Passwort, das jemand findet.

   Ausfuehren:
     node preview/hash-password.mjs
   ========================================================================= */
import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "./auth.mjs";

function frage(text, verdeckt) {
  return new Promise((fertig) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (verdeckt) {
      /* Die Eingabe nicht spiegeln. Ohne das steht das Passwort im
         Terminal-Rueckblick jedes Zuschauers. */
      const schreiben = rl._writeToOutput ? rl._writeToOutput.bind(rl) : null;
      rl._writeToOutput = function (s) {
        if (schreiben && (s.includes(text) || s.trim() === "")) schreiben(s);
      };
    }
    rl.question(text, (antwort) => { rl.close(); if (verdeckt) process.stdout.write("\n"); fertig(antwort); });
  });
}

const istTerminal = process.stdin.isTTY;

async function main() {
  console.log("\nVision Universe — Zugangsdaten fuer die interne Vorschau\n");

  const kennung = (await frage("  Kennung oder E-Mail: ", false)).trim().toLowerCase();
  if (!kennung || kennung.includes(":")) {
    console.error("\n  Die Kennung darf nicht leer sein und keinen Doppelpunkt enthalten.\n");
    process.exit(1);
  }

  const passwort = await frage("  Passwort (bleibt unsichtbar): ", istTerminal);
  if (String(passwort).length < 12) {
    /* Keine Zeichenklassenregeln - die erzeugen "Passwort1!" und sonst
       nichts. Laenge ist das einzige Kriterium, das wirklich traegt. */
    console.error("\n  Mindestens 12 Zeichen. Laenge schlaegt Sonderzeichen.\n");
    process.exit(1);
  }
  const wiederholung = await frage("  Passwort wiederholen:         ", istTerminal);
  if (passwort !== wiederholung) {
    console.error("\n  Die Eingaben stimmen nicht ueberein.\n");
    process.exit(1);
  }

  const eintrag = hashPassword(passwort);
  /* Gegenprobe: der erzeugte Hash muss das Passwort auch bestaetigen.
     Ein Hilfsskript, das einen unbrauchbaren Eintrag ausgibt, faellt
     erst auf, wenn niemand mehr hineinkommt. */
  if (!verifyPassword(passwort, eintrag)) {
    console.error("\n  Der erzeugte Hash bestaetigt das Passwort nicht. Nichts ausgegeben.\n");
    process.exit(1);
  }

  console.log("\n  ------------------------------------------------------------");
  console.log("  PREVIEW_USERS (als Secret hinterlegen, NICHT committen):\n");
  console.log(`  ${kennung}:${eintrag}`);
  console.log("\n  PREVIEW_SESSION_SECRET (frisch erzeugt, ebenfalls als Secret):\n");
  console.log(`  ${randomBytes(48).toString("base64url")}`);
  console.log("  ------------------------------------------------------------");
  console.log("\n  Mehrere Tester: Eintraege mit ';' verbinden.");
  console.log("  Das Passwort selbst steht nirgends - nur dieser Hash.\n");
}

main().catch((err) => {
  console.error("\n  Abbruch:", (err && err.message) || String(err), "\n");
  process.exit(1);
});

/* Seiteneffekt-Import fuer Tests, deren geprueftes Produktskript selbst `git`
   aufruft (z. B. build-release.mjs): entfernt alle GIT_*-Variablen aus
   process.env, damit auch dessen Kindprozesse nie das umgebende Repository
   treffen. Nur das eigene Prozess-Environment; keine Datei, keine Konfiguration. */
import { isolatedGitEnv } from "./isolated-git-env.mjs";
const sauber = isolatedGitEnv();
for (const k of Object.keys(process.env)) if (k.startsWith("GIT_")) delete process.env[k];
Object.assign(process.env, Object.fromEntries(Object.entries(sauber).filter(([k]) => k.startsWith("GIT_"))));

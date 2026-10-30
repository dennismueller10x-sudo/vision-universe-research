#!/usr/bin/env bash
# Git-Bundle-Kette: Speicherbedarf, Hardlink, Vollstaendigkeit, Wiederherstellung, Fehlerfaelle.
# Nur synthetische Daten, lokales restic-Repository, kein Netz.
#
#   tests/git-bundle-test.sh          (G01-G19)
#   VU_TEST_BLOB_MB=40 tests/...       groesseres Test-Repository fuer die Speichermessung
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
T="$(mktemp -d "${TMPDIR:-/tmp}/vu-gitb-test.XXXXXX")"
PASS=0 FAIL=0
ok()   { PASS=$((PASS+1)); echo "PASS  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL  $1"; }
check(){ local name="$1"; shift; if "$@"; then ok "$name"; else bad "$name"; fi; }
cleanup() { [ -n "${VU_TEST_KEEP:-}" ] && echo "Testverzeichnis: $T" || { chmod -R u+w "$T" 2>/dev/null; rm -rf "$T"; }; }
trap cleanup EXIT

export RESTIC_REPOSITORY="$T/repo" RESTIC_PASSWORD="synthetic-restic-password-gitb"
export VU_WORK="$T/work" VU_STATUS_DIR="$T/work/status" VU_SOURCES=git VU_RETRY_DELAYS="1" VU_CHECK_SUBSET=100%
export VU_GIT_RESERVE_GB=0 VU_GIT_WARN_GB=0 VU_DISK_TRACE="$T/trace.txt"
restic init >/dev/null 2>&1 || { echo "restic init fehlgeschlagen"; exit 2; }
G() { git -c user.email=synth@example.invalid -c user.name=synth -C "$T/work-src" "$@"; }
status_of() { python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d["status"])' "$VU_STATUS_DIR/$1.json"; }
manifest_of() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["manifest"][sys.argv[2]])' "$VU_STATUS_DIR/$1.json" "$2"; }
snap_count() { restic snapshots --json --tag "src:$1" | python3 -c 'import json,sys; print(len(json.load(sys.stdin) or []))'; }
objset() { git -C "$1" rev-list --all --objects | cut -d' ' -f1 | sort | sha256sum | cut -c1-16; }
refset() { git -C "$1" for-each-ref --format='%(objectname) %(refname)' | sort | sha256sum | cut -c1-16; }
export -f objset refset
peak_kb() { awk -v s="$1" '$2 ~ "^"s":" {split($3,a,"="); if (a[2]>m) m=a[2]} END {print m+0}' "$VU_DISK_TRACE"; }
restore_to() {  # quelle snapshot ziel -> mirror-pfad
  "$ROOT/bin/vu-restore.sh" get "$1" "$3" "$2" > "$3.log" 2>&1 || return 1
  echo "$3$VU_WORK/git/${1#gitb-}.git"
}

# ---------------------------------------------------------------- Quelle (inkompressible Daten)
BLOB_MB="${VU_TEST_BLOB_MB:-24}"
git init -q --bare "$T/remote.git"
git init -q "$T/work-src"
for i in $(seq 1 8); do head -c $((BLOB_MB * 131072)) /dev/urandom > "$T/work-src/blob$i.bin"; G add -A; G commit -qm "c$i"; done
G branch -M main
for b in feature/a feature/b data/state; do G checkout -qb "$b"; echo "$b" > "$T/work-src/b.txt"; G add -A; G commit -qm "$b"; G checkout -q main; done
G tag -a v1 -m v1; G remote add origin "$T/remote.git"; G push -q origin --all; G push -q origin --tags
export VU_GIT_REPOS="demo=file://$T/remote.git"

# ---------------------------------------------------------------- G01-G04 Erstlauf
"$ROOT/bin/vu-backup.sh" > "$T/run1.md" 2>&1; rc=$?
check "G01 Erstlauf gruen, Voll-Bundle im geteilten Format (Kopf + Pack)" bash -c "[ $rc -eq 0 ] && [ '$(manifest_of gitb-demo bundleLayout)' = split ] && [ '$(manifest_of gitb-demo bundleKind)' = full ]"
S1=$(restic snapshots --json --tag src:gitb-demo --latest 1 | python3 -c 'import json,sys;print(json.load(sys.stdin)[-1]["short_id"])')
files=$(restic ls "$S1" "$VU_WORK/gitb/demo" | sed 's#.*/##' | sort | tr '\n' ' ')
check "G02 Snapshot enthaelt .bundle.head und .bundle.pack, keine zweite Bundle-Kopie" bash -c "echo '$files' | grep -q 'bundle.head' && echo '$files' | grep -q 'bundle.pack' && ! echo '$files' | grep -qE '\.bundle( |$)'"
mirror_kb=$(( $(manifest_of gitb-demo bytes) / 1024 )); peak_split=$(peak_kb gitb-demo)
echo "      Mirror ${mirror_kb} KB, Spitzenbelegung geteilt ${peak_split} KB"
check "G03 Hardlink: Spitzenbelegung hoechstens Mirror + 10 % (keine zweite Kopie)" test "$peak_split" -le $(( mirror_kb * 110 / 100 + 1024 ))
# Bundle-Inhalt unveraendert: head+pack aus restic ist ein gueltiges Bundle mit genau den Refs des Klons
restic restore "$S1" --target "$T/raw" >/dev/null 2>&1
d="$T/raw$VU_WORK/gitb/demo"; base=$(awk '{print $2}' "$d/chain.txt")
cat "$d/$base.head" "$d/$base.pack" > "$T/joined.bundle"
check "G04 head+pack = gueltiges Bundle (git bundle verify), SHA-256 = chain.txt, Refs = Server" bash -c "
  git -C '$T/remote.git' bundle verify '$T/joined.bundle' >/dev/null 2>&1 &&
  [ \"\$(sha256sum '$T/joined.bundle' | cut -c1-64)\" = \"\$(awk '{print \$1}' '$d/chain.txt')\" ] &&
  [ \"\$(git bundle list-heads '$T/joined.bundle' | sort | sha256sum)\" = \"\$(git -C '$T/remote.git' for-each-ref --format='%(objectname) %(refname)' | sort | sha256sum)\" ]"

# ---------------------------------------------------------------- G05 Vergleich mit klassischem Voll-Bundle
VU_GIT_REPOS="democ=file://$T/remote.git" VU_GIT_SPLIT=false "$ROOT/bin/vu-backup.sh" > "$T/runc.md" 2>&1
peak_classic=$(peak_kb gitb-democ)
echo "      Spitzenbelegung klassisch ${peak_classic} KB (Ersparnis $(( (peak_classic - peak_split) * 100 / peak_classic )) %)"
check "G05 klassisches Voll-Bundle braucht ~2 x Mirror, geteiltes ~1 x (gemessen)" test "$peak_classic" -ge $(( peak_split * 17 / 10 ))

# ---------------------------------------------------------------- G06 Vollstaendige Wiederherstellung
m=$(restore_to gitb-demo "$S1" "$T/r1")
check "G06 Wiederherstellung: fsck --full, alle Objekte und Refs identisch mit dem Server" bash -c "
  [ -n '$m' ] && git -C '$m' fsck --full --no-progress >/dev/null 2>&1 &&
  [ \"\$(objset '$m')\" = \"\$(objset '$T/remote.git')\" ] && [ \"\$(refset '$m')\" = \"\$(refset '$T/remote.git')\" ]"
check "G07 Wiederherstellung kopiert das Pack nicht (Staging leer, ein Pack im Ergebnis)" bash -c "[ ! -e '$T/r1/.stage' ] && [ \$(ls '$m'/objects/pack/*.pack | wc -l) -eq 1 ]"

# ---------------------------------------------------------------- G08 Inkrementell
head -c 300000 /dev/urandom > "$T/work-src/inc1.bin"; G add -A; G commit -qm inc1; G push -q origin main
"$ROOT/bin/vu-backup.sh" > "$T/run2.md" 2>&1; rc=$?
S2=$(restic snapshots --json --tag src:gitb-demo --latest 1 | python3 -c 'import json,sys;print(json.load(sys.stdin)[-1]["short_id"])')
check "G08 Folgelauf: inkrementelles Bundle, klein, Kette 2" bash -c "[ $rc -eq 0 ] && [ '$(manifest_of gitb-demo bundleKind)' = inc ] && [ $(manifest_of gitb-demo bundleBytes) -lt 2000000 ] && [ $(manifest_of gitb-demo chainLength) -eq 2 ]"

# ---------------------------------------------------------------- G09-G10 Force-Push und Branch-Loeschung
old_main=$(git -C "$T/remote.git" rev-parse main); old_fa=$(git -C "$T/remote.git" rev-parse feature/a)
G reset -q --hard HEAD~2; echo rewritten > "$T/work-src/r.txt"; G add -A; G commit -qm rewritten
G push -q -f origin main; G push -q origin --delete feature/a
"$ROOT/bin/vu-backup.sh" > "$T/run3.md" 2>&1; rc=$?
S3=$(restic snapshots --json --tag src:gitb-demo --latest 1 | python3 -c 'import json,sys;print(json.load(sys.stdin)[-1]["short_id"])')
m3=$(restore_to gitb-demo "$S3" "$T/r3")
check "G09 nach Force-Push und Branch-Loeschung: neuester Stand = Server" bash -c "[ $rc -eq 0 ] && [ \"\$(refset '$m3')\" = \"\$(refset '$T/remote.git')\" ] && git -C '$m3' fsck --no-progress >/dev/null 2>&1"
m2=$(restore_to gitb-demo "$S2" "$T/r2")
check "G10 frueherer Stand vollstaendig: alter main und geloeschter Branch wiederherstellbar" bash -c "
  [ \"\$(git -C '$m2' rev-parse main)\" = '$old_main' ] && [ \"\$(git -C '$m2' rev-parse feature/a)\" = '$old_fa' ] &&
  git -C '$m2' fsck --full --no-progress >/dev/null 2>&1"

# ---------------------------------------------------------------- G11 Lauf ohne Aenderungen
"$ROOT/bin/vu-backup.sh" > "$T/run4.md" 2>&1; rc=$?
check "G11 Lauf ohne neue Objekte: nur Refs, Kette unveraendert" bash -c "[ $rc -eq 0 ] && [ '$(manifest_of gitb-demo bundleKind)' = none ] && [ $(manifest_of gitb-demo chainLength) -eq 3 ]"

# ---------------------------------------------------------------- G12 Wachstum
for i in 1 2 3; do head -c $((BLOB_MB * 65536)) /dev/urandom > "$T/work-src/grow$i.bin"; G add -A; G commit -qm "grow$i"; G push -q origin main
  "$ROOT/bin/vu-backup.sh" > "$T/grow$i.md" 2>&1 || break; done
Sg=$(restic snapshots --json --tag src:gitb-demo --latest 1 | python3 -c 'import json,sys;print(json.load(sys.stdin)[-1]["short_id"])')
mg=$(restore_to gitb-demo "$Sg" "$T/rg")
check "G12 Wachstum ueber mehrere Laeufe: Kette 6, Mirror waechst, Wiederherstellung = Server" bash -c "
  [ $(manifest_of gitb-demo chainLength) -eq 6 ] && [ $(manifest_of gitb-demo bytes) -gt $((mirror_kb * 1024)) ] &&
  [ \"\$(objset '$mg')\" = \"\$(objset '$T/remote.git')\" ]"

# ---------------------------------------------------------------- G19 gemischte Kette (klassisch + neu)
VU_GIT_REPOS="democ=file://$T/remote.git" "$ROOT/bin/vu-backup.sh" > "$T/runc2.md" 2>&1; rc=$?
Sc=$(restic snapshots --json --tag src:gitb-democ --latest 1 | python3 -c 'import json,sys;print(json.load(sys.stdin)[-1]["short_id"])')
mc=$(restore_to gitb-democ "$Sc" "$T/rc")
check "G19 bestehende Kette mit klassischem Voll-Bundle laeuft weiter und bleibt wiederherstellbar" bash -c "
  [ $rc -eq 0 ] && [ '$(manifest_of gitb-democ bundleKind)' = inc ] && [ \"\$(objset '$mc')\" = \"\$(objset '$T/remote.git')\" ]"

# ---------------------------------------------------------------- G13-G14 Speicherplatzmangel
before=$(snap_count gitb-demo)
VU_GIT_RESERVE_GB=1 VU_TEST_FREE_KB=500000 "$ROOT/bin/vu-backup.sh" > "$T/nospace.md" 2>&1; rc=$?
check "G13 zu wenig Platz vor dem Klon: Abbruch mit Meldung, nichts geladen, kein Snapshot" bash -c "
  [ $rc -ne 0 ] && [ '$(status_of gitb-demo)' = failed ] && grep -q 'zu wenig Speicher' '$VU_STATUS_DIR/gitb-demo.json' &&
  [ ! -e '$VU_WORK/git/demo.git' ] && [ $(snap_count gitb-demo) -eq $before ]"
# klassisches Voll-Bundle (Rueckfall) ohne Platz: Abbruch statt volle Platte
VU_GIT_REPOS="demon=file://$T/remote.git" VU_GIT_SPLIT=false VU_TEST_FREE_KB=$((mirror_kb / 2)) "$ROOT/bin/vu-backup.sh" > "$T/nospace2.md" 2>&1; rc=$?
check "G14 Rueckfall auf klassisches Bundle ohne Platz: Abbruch vor dem Schreiben" bash -c "[ $rc -ne 0 ] && grep -q 'klassisches Voll-Bundle braucht' '$VU_STATUS_DIR/gitb-demon.json' && [ $(snap_count gitb-demon) -eq 0 ]"
VU_GIT_WARN_GB=100000 "$ROOT/bin/vu-backup.sh" > "$T/warn.md" 2>&1
check "G15 wenig Restplatz nach dem Klon: Warnung im Status" bash -c "[ '$(status_of gitb-demo)' = warn ] && grep -q 'Speicher knapp' '$VU_STATUS_DIR/gitb-demo.json'"

# ---------------------------------------------------------------- G16 Abgebrochener Lauf
mkdir -p "$T/slowbin"; real=$(command -v restic)
cat > "$T/slowbin/restic" <<EOF
#!/usr/bin/env bash
case " \$* " in *" backup "*src:gitb-demok*) touch "$T/in-backup"; sleep 60 ;; esac
exec "$real" "\$@"
EOF
chmod +x "$T/slowbin/restic"
( export PATH="$T/slowbin:$PATH" VU_GIT_REPOS="demok=file://$T/remote.git"; exec setsid "$ROOT/bin/vu-backup.sh" > "$T/killed.md" 2>&1 ) & bg=$!
for _ in $(seq 300); do [ -e "$T/in-backup" ] && break; sleep 0.2; done
kill -9 -- -"$bg" 2>/dev/null; wait "$bg" 2>/dev/null
restic unlock >/dev/null 2>&1
VU_GIT_REPOS="demok=file://$T/remote.git" "$ROOT/bin/vu-backup.sh" > "$T/after-kill.md" 2>&1; rc=$?
Sk=$(restic snapshots --json --tag src:gitb-demok --latest 1 | python3 -c 'import json,sys;s=json.load(sys.stdin) or [];print(s[-1]["short_id"] if s else "")')
mk=$(restore_to gitb-demok "$Sk" "$T/rk")
check "G16 Abbruch waehrend des Hochladens: kein halber Stand, naechster Lauf vollstaendig, Repository fehlerfrei" bash -c "
  [ -e '$T/in-backup' ] && [ $rc -eq 0 ] && [ $(snap_count gitb-demok) -eq 1 ] && [ '$(manifest_of gitb-demok bundleKind)' = full ] &&
  [ \"\$(refset '$mk')\" = \"\$(refset '$T/remote.git')\" ] && restic check >/dev/null 2>&1"

# ---------------------------------------------------------------- G17-G18 Beschaedigte Kette
python3 "$ROOT/lib/bundle_split.py" check "$d/$base.head" "$d/$base.pack" >/dev/null 2>&1; good=$?
cp "$d/$base.pack" "$T/bad.pack"; chmod u+w "$T/bad.pack"
printf '\xff' | dd of="$T/bad.pack" bs=1 seek=$(( $(stat -c %s "$T/bad.pack") / 2 )) conv=notrunc 2>/dev/null
python3 "$ROOT/lib/bundle_split.py" check "$d/$base.head" "$T/bad.pack" >/dev/null 2>&1; badrc=$?
( VU_BACKUP_ROOT="$ROOT"; source "$ROOT/lib/common.sh"; mkdir -p "$T/corrupt"; cp "$d/chain.txt" "$d/refs.txt" "$d/$base.head" "$T/corrupt/"; cp "$T/bad.pack" "$T/corrupt/$base.pack"
  gitb_assemble "$T/corrupt" "$T/corrupt-out.git" ) > "$T/corrupt.log" 2>&1; asmrc=$?
check "G17 verfaelschtes Byte im Pack: Pruefung und Wiederherstellung lehnen ab" bash -c "[ $good -eq 0 ] && [ $badrc -ne 0 ] && [ $asmrc -ne 0 ] && grep -q 'Pruefsumme' '$T/corrupt.log'"
# mittleren Stand der Kette entfernen (simuliert verlorenes Bundle)
restic forget "$S2" >/dev/null 2>&1
"$ROOT/bin/vu-verify.sh" chain > "$T/chain.out" 2>&1; vrc=$?
restore_to gitb-demo "$Sg" "$T/rbroken" >/dev/null; rrc=$?
check "G18 fehlendes Bundle in der Kette: Kettenpruefung und Wiederherstellung melden es, kein halber Mirror" bash -c "
  [ $vrc -ne 0 ] && grep -q 'gitb-demo: Kette UNVOLLSTAENDIG' '$T/chain.out' && [ $rrc -ne 0 ] && grep -q 'fehlt, Kette unvollstaendig' '$T/rbroken.log'"

echo; echo "Ergebnis: $PASS bestanden, $FAIL fehlgeschlagen"
echo "Messung: Mirror ${mirror_kb} KB; Spitze geteilt ${peak_split} KB; Spitze klassisch ${peak_classic} KB"
[ "$FAIL" -eq 0 ]

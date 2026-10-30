# shellcheck shell=bash
# Gemeinsame Teile der Git-Bundle-Kette (Sicherung: sources/git.sh, Wiederherstellung: bin/vu-restore.sh).
#
# Speicher: Das Voll-Bundle wird nicht neu gepackt. Es besteht aus einem kleinen Kopf (.head) und
# dem Pack des Mirror-Klons, per Hardlink uebernommen (.pack). Auf der Platte liegt der Inhalt
# dadurch nur einmal. Kette und Pruefsumme beziehen sich auf das Bundle head+pack.
#
# Platz: vor dem Klon wird mit der Groesse des letzten Mirrors (Manifest) plus Wachstum und
# Reserve gerechnet; reicht der Platz nicht, bricht die Quelle ab, bevor etwas geladen wird.
#   VU_GIT_RESERVE_GB  (Standard 4)   Reserve fuer restic-Cache, Temp-Dateien, inkrementelles Bundle
#   VU_GIT_GROWTH_PCT  (Standard 15)  Aufschlag auf die letzte Mirror-Groesse
#   VU_GIT_EXPECTED_GB                Schaetzung fuer den ersten Lauf (ohne Manifest)
#   VU_GIT_WARN_GB     (Standard 8)   freier Platz nach dem Klon darunter: Warnung im Status
#   VU_DISK_TRACE      Datei: Speicherverlauf je Schritt (Messung, Tests)
#   VU_TEST_FREE_KB    nur Tests: freien Platz vorgeben

vu_free_kb() {  # pfad -> freie KB
  if [ -n "${VU_TEST_FREE_KB:-}" ]; then echo "$VU_TEST_FREE_KB"; return; fi
  df -Pk "$1" | awk 'NR==2 {print $4}'
}

vu_disk_trace() {  # schritt
  [ -n "${VU_DISK_TRACE:-}" ] || return 0
  local used free
  used=$(du -sk "$VU_WORK" 2>/dev/null | cut -f1)
  free=$(df -Pk "$VU_WORK" | awk 'NR==2 {print $4}')
  echo "$(date -u +%H:%M:%S) $1 work_kb=$used free_kb=$free" >> "$VU_DISK_TRACE"
}

gb() { awk -v k="$1" 'BEGIN {printf "%.1f", k / 1048576}'; }

# Kann das Voll-Bundle aus dem Pack des Mirrors gebildet werden? Ausgabe: Pfad des Packs.
# Bedingungen: genau ein Pack, keine losen Objekte, keine Alternates/Promisor, SHA-1-Repository.
gitb_single_pack() {
  local m="$1" packs
  [ "$(git -C "$m" rev-parse --show-object-format 2>/dev/null)" = sha1 ] || return 1
  [ -s "$m/objects/info/alternates" ] && return 1
  compgen -G "$m/objects/pack/*.promisor" >/dev/null && return 1
  packs=$(compgen -G "$m/objects/pack/pack-*.pack" || true)
  [ "$(printf '%s\n' "$packs" | grep -c .)" -eq 1 ] || return 1
  [ "$(git -C "$m" count-objects | awk '{print $1}')" -eq 0 ] || return 1
  printf '%s\n' "$packs"
}

# Geteiltes Voll-Bundle anlegen: <basis>.head + <basis>.pack (Hardlink). Ausgabe: SHA-256 von head+pack.
gitb_write_split() {
  local m="$1" pack="$2" base="$3" sum rc
  { echo "# v2 git bundle"; git -C "$m" for-each-ref --format='%(objectname) %(refname)'; echo; } > "$base.head" || return 1
  ln "$pack" "$base.pack" || { log "Hardlink nicht moeglich (anderes Dateisystem?)"; return 1; }
  sum=$(python3 "$VU_BACKUP_ROOT/lib/bundle_split.py" check "$base.head" "$base.pack" "${pack%.pack}.idx") || return 1
  # dieselbe Pruefung wie beim klassischen Bundle: git liest Kopf und Pack als ein Bundle
  { cat "$base.head" "$base.pack" 2>/dev/null; } | git -C "$m" bundle verify -q - >/dev/null 2>&1
  rc=("${PIPESTATUS[@]}")
  [ "${rc[1]}" -eq 0 ] || { log "git bundle verify lehnt das geteilte Bundle ab"; return 1; }
  echo "$sum"
}

# Bundle-Kette aus einem Verzeichnis (chain.txt, refs.txt, Bundles) zu einem Mirror zusammensetzen.
# Verbraucht die Bundle-Dateien (das Pack wird verschoben, nicht kopiert), damit der Platz nur
# einmal gebraucht wird. Jede Pruefsumme wird vorher gegen chain.txt geprueft.
gitb_assemble() {
  local d="$1" m="$2" sum f got n=0
  [ -s "$d/chain.txt" ] && [ -s "$d/refs.txt" ] || { log "chain.txt oder refs.txt fehlt"; return 1; }
  while read -r sum f; do
    [ -n "$f" ] || continue
    if [ -f "$d/$f" ]; then got=$(python3 "$VU_BACKUP_ROOT/lib/bundle_split.py" sha "$d/$f")
    elif [ -f "$d/$f.head" ] && [ -f "$d/$f.pack" ]; then got=$(python3 "$VU_BACKUP_ROOT/lib/bundle_split.py" sha "$d/$f.head" "$d/$f.pack")
    else log "Bundle $f fehlt, Kette unvollstaendig"; return 1; fi
    [ "$got" = "$sum" ] || { log "Pruefsumme von $f stimmt nicht"; return 1; }
    n=$((n + 1))
  done < "$d/chain.txt"
  git init --quiet --bare "$m" || return 1
  git -C "$m" config gc.auto 0
  while read -r sum f; do
    [ -n "$f" ] || continue
    if [ -f "$d/$f" ]; then
      git -C "$m" bundle unbundle "$d/$f" >/dev/null 2>&1 || { log "Bundle $f laesst sich nicht einspielen"; return 1; }
      rm -f "$d/$f"
    else
      local tmp="$m/objects/pack/tmp-restore-$n.pack" h
      mv "$d/$f.pack" "$tmp" || return 1
      # index-pack prueft jedes Objekt (Hash) und schreibt den Index; die Daten werden nicht kopiert
      h=$(git -C "$m" index-pack "$tmp" 2>/dev/null) || { log "Pack aus $f laesst sich nicht indizieren"; return 1; }
      h=${h##*[[:space:]]}; h=${h#pack	}
      mv "$tmp" "$m/objects/pack/pack-$h.pack"
      mv "${tmp%.pack}.idx" "$m/objects/pack/pack-$h.idx"
      [ -f "${tmp%.pack}.rev" ] && mv "${tmp%.pack}.rev" "$m/objects/pack/pack-$h.rev"
      rm -f "$d/$f.head"
    fi
  done < "$d/chain.txt"
  awk '{print "create " $2 " " $1}' "$d/refs.txt" | git -C "$m" update-ref --stdin || { log "Refs lassen sich nicht setzen (Objekte fehlen?)"; return 1; }
  git -C "$m" show-ref --verify --quiet refs/heads/main && git -C "$m" symbolic-ref HEAD refs/heads/main
  return 0
}

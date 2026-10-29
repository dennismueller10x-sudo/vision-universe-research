# shellcheck shell=bash
# Quelle: Postgres-Datenbank (Supabase) per pg_dump im Custom-Format.
#
# VU_SUPABASE_DB_URL    Session-Pooler-URI einer Rolle mit Leserecht auf die
#                       Schemata (eigene Backup-Rolle, nicht der Worker-Zugang).
# VU_SUPABASE_SCHEMAS   Standard: public billing auth storage supabase_migrations
# VU_SUPABASE_PROJECT   Projekt-Ref; die URL muss ihn enthalten (Schutz vor
#                       versehentlich falscher Datenbank).
# pg_dump >= 17 muss vorhanden sein (Server ist Postgres 17); sonst Docker postgres:17.
#
# Personen- und Zahlungsbezug: der Dump liegt nur verschluesselt im restic-Repository.

pg_dump_cmd() {
  local v
  v=$(pg_dump --version 2>/dev/null | grep -oE '[0-9]+' | head -1 || true)
  if [ -n "$v" ] && [ "$v" -ge 17 ]; then echo native; return; fi
  if command -v docker >/dev/null && docker info >/dev/null 2>&1; then echo docker; return; fi
  echo none
}

backup_supabase() {
  local source="supabase-${VU_SUPABASE_PROJECT:-db}" dir="$VU_WORK/db"
  VU_SOURCE="$source"
  require_env VU_SUPABASE_DB_URL VU_SUPABASE_PROJECT || { record "$source" skipped "nicht eingerichtet"; return 0; }
  case "$VU_SUPABASE_DB_URL" in
    postgresql://*"$VU_SUPABASE_PROJECT"*) ;;
    *) record "$source" failed "Datenbank-URL gehoert nicht zum erwarteten Projekt"; return 1 ;;
  esac
  rm -rf "$dir"; mkdir -p "$dir"; chmod 700 "$dir"
  local schemas args=() s mode
  schemas="${VU_SUPABASE_SCHEMAS:-public billing auth storage supabase_migrations}"
  for s in $schemas; do args+=("--schema=$s"); done
  mode=$(pg_dump_cmd)
  local dump=(pg_dump --format=custom --no-owner --no-privileges "${args[@]}")
  local schema_only=(pg_dump --schema-only --no-owner "${args[@]}")
  case "$mode" in
    native)
      retry "${dump[@]}" --file="$dir/db.dump" "$VU_SUPABASE_DB_URL" 2> >(redact >&2) \
        && "${schema_only[@]}" --file="$dir/schema.sql" "$VU_SUPABASE_DB_URL" 2> >(redact >&2) ;;
    docker)
      retry docker run --rm -e DB_URL="$VU_SUPABASE_DB_URL" -v "$dir:/out" postgres:17 \
        sh -c "${dump[*]} --file=/out/db.dump \"\$DB_URL\" && ${schema_only[*]} --file=/out/schema.sql \"\$DB_URL\"" 2> >(redact >&2) ;;
    *) record "$source" failed "kein pg_dump >= 17 verfuegbar"; return 1 ;;
  esac || { record "$source" failed "pg_dump fehlgeschlagen"; rm -rf "$dir"; return 1; }

  local size
  size=$(stat -c %s "$dir/db.dump" 2>/dev/null || echo 0)
  if [ "$size" -lt 1000 ]; then record "$source" failed "Dump verdaechtig klein ($size Bytes)"; rm -rf "$dir"; return 1; fi
  # Lesbarkeit pruefen: Inhaltsverzeichnis des Dumps muss sich lesen lassen.
  local tables
  if [ "$mode" = native ]; then tables=$(pg_restore --list "$dir/db.dump" | grep -c ' TABLE DATA ' || true)
  else tables=$(docker run --rm -v "$dir:/out" postgres:17 pg_restore --list /out/db.dump | grep -c ' TABLE DATA ' || true); fi
  printf '{"kind":"pg_dump","bytes":%s,"records":%s}\n' "$size" "$tables" > "$dir/manifest.json"

  local drift summary
  drift=$(compare_with_previous "$source" "$dir/manifest.json")
  summary=$(restic_backup_source "$source" "$dir") || { record "$source" failed "restic backup fehlgeschlagen"; rm -rf "$dir"; return 1; }
  record "$source" ok "Dump gesichert ($tables Tabellen mit Daten)" "$(python3 -c 'import json,sys; print(json.dumps({"summary": json.loads(sys.argv[1]), "drift": json.loads(sys.argv[2])}))' "$summary" "$drift")"
  rm -rf "$dir"
}

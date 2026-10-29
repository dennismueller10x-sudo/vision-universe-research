#!/usr/bin/env bash
# Restore-Probe fuer eine age-verschluesselte Konten-Datenbanksicherung - isoliert.
#
#   vu-db-restore-drill.sh <vu-accounts-....dump.age> [erwartete-zeilen.txt]
#
# - Spielt die Sicherung in eine WEGWERF-Datenbank (Docker postgres:17 auf 127.0.0.1,
#   ohne Netzzugang nach aussen), nie in Supabase.
# - Den privaten age-Schlüssel liest das Skript verdeckt von der Tastatur (read -rs).
#   Er landet nur in einer temporaeren Datei mit Rechten 600, die am Ende mit shred
#   geloescht wird. Er erscheint nicht in argv, Logs oder Shell-Historie.
# - Ausgabe: Tabellen mit Zeilenzahl. Mit einer Datei erwarteter Zahlen ("schema.tabelle=n",
#   z. B. aus einer Lese-Abfrage der Produktion) wird verglichen.
#
# Umgebung: VU_DRILL_MODE=docker (Standard, z. B. Google Cloud Shell) oder local
# (PGBIN=/usr/lib/postgresql/<v>/bin, fuer Tests). VU_AGE_KEY_FILE nur fuer Tests.
set -uo pipefail
dump_age="${1:?Pfad zur .dump.age-Datei}"; expected="${2:-}"
mode="${VU_DRILL_MODE:-docker}"
W="$(mktemp -d /tmp/vu-db-drill.XXXXXX)"; chmod 755 "$W"
CONTAINER="vu-db-drill-$$" PORT="${VU_DRILL_PORT:-55433}"
cleanup() {
  [ -f "$W/key" ] && shred -u "$W/key" 2>/dev/null
  [ "$mode" = docker ] && docker rm -f "$CONTAINER" >/dev/null 2>&1
  [ "$mode" = local ] && ${AS_PG:-} "$PGBIN/pg_ctl" -D "$W/pgdata" -m immediate stop >/dev/null 2>&1
  rm -rf "$W"
}
trap cleanup EXIT

head -c 21 "$dump_age" | grep -q 'age-encryption.org' || { echo "keine age-Datei"; exit 2; }

umask 077
if [ -n "${VU_AGE_KEY_FILE:-}" ]; then
  cp "$VU_AGE_KEY_FILE" "$W/key"
else
  echo "Privaten age-Schluessel einfuegen (Zeile AGE-SECRET-KEY-1...), Eingabe bleibt unsichtbar:"
  IFS= read -rs keyline; echo
  printf '%s\n' "$keyline" > "$W/key"; unset keyline
fi
umask 022
age -d -i "$W/key" -o "$W/db.dump" "$dump_age" || { echo "Entschluesseln fehlgeschlagen (falscher Schluessel?)"; exit 1; }
shred -u "$W/key"

# Umgebung wie bei Supabase, damit Richtlinien, Standardwerte und Funktionen anlegbar sind:
# Rollen (ohne Login), Schema "extensions" mit den dort ueblichen Erweiterungen.
cat > "$W/setup.sql" <<'SQL'
do $$ begin
  perform 1;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
  if not exists (select 1 from pg_roles where rolname='supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
  if not exists (select 1 from pg_roles where rolname='supabase_admin') then create role supabase_admin nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator nologin; end if;
end $$;
create schema if not exists extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
SQL
chmod 644 "$W/setup.sql"

if [ "$mode" = docker ]; then
  docker run -d --rm --name "$CONTAINER" -e POSTGRES_PASSWORD=drill -e POSTGRES_USER=drill \
    -p "127.0.0.1:$PORT:5432" -v "$W:/drill" postgres:17 >/dev/null || exit 1
  for _ in $(seq 60); do docker exec "$CONTAINER" pg_isready -U drill >/dev/null 2>&1 && break; sleep 1; done
  # Rollen, die ein Supabase-Dump referenziert (--no-owner/--no-privileges entfernen das meiste).
  docker exec "$CONTAINER" psql -q -U drill -d postgres -c "create database drill" >/dev/null
  docker exec -i "$CONTAINER" psql -q -U drill -d drill < "$W/setup.sql" >/dev/null 2>&1
  docker exec "$CONTAINER" pg_restore --no-owner --no-privileges -U drill -d drill /drill/db.dump > "$W/restore.log" 2>&1
  SQL() { docker exec "$CONTAINER" psql -At -U drill -d drill -c "$1"; }
else
  [ "$(id -u)" = 0 ] && AS_PG="runuser -u postgres --" && mkdir -p "$W/pgdata" && chown postgres "$W/pgdata"
  ${AS_PG:-} "$PGBIN/initdb" -D "$W/pgdata" -U drill --auth=trust >/dev/null 2>&1 || exit 1
  ${AS_PG:-} "$PGBIN/pg_ctl" -D "$W/pgdata" -o "-p $PORT -k $W/pgdata -c listen_addresses=127.0.0.1" -l "$W/pgdata/pg.log" -w start >/dev/null || exit 1
  "$PGBIN/psql" -q -h 127.0.0.1 -p "$PORT" -U drill -d postgres -c "create database drill"
  "$PGBIN/psql" -q -h 127.0.0.1 -p "$PORT" -U drill -d drill -f "$W/setup.sql" >/dev/null 2>&1
  "$PGBIN/pg_restore" --no-owner --no-privileges -h 127.0.0.1 -p "$PORT" -U drill -d drill "$W/db.dump" > "$W/restore.log" 2>&1
  SQL() { "$PGBIN/psql" -At -h 127.0.0.1 -p "$PORT" -U drill -d drill -c "$1"; }
fi

errors=$(grep -c 'error:' "$W/restore.log" || true)
SQL "select n.nspname||'.'||c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in ('public','billing','auth','storage','supabase_migrations') order by 1" \
  | while read -r t; do echo "$t=$(SQL "select count(*) from $t")"; done > "$W/actual.txt"
echo "Wiederhergestellte Tabellen: $(wc -l < "$W/actual.txt"), Fehlermeldungen beim Einspielen: $errors"
cat "$W/actual.txt"
rc=0
[ -s "$W/actual.txt" ] || { echo "FEHLER: keine Tabellen wiederhergestellt"; rc=1; }
if [ -n "$expected" ]; then
  if diff <(sort "$expected") <(sort "$W/actual.txt") > "$W/diff.txt"; then
    echo "OK: Zeilenzahlen stimmen mit der Erwartung ueberein"
  else
    echo "ABWEICHUNG zur Erwartung:"; cat "$W/diff.txt"; rc=1
  fi
fi
[ "$errors" -eq 0 ] || { echo "Hinweis: pg_restore meldete $errors Fehler (Auszug):"; grep 'error:' "$W/restore.log" | head -5; }
exit "$rc"

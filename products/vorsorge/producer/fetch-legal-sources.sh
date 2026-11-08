#!/usr/bin/env bash
# Laedt amtliche Primaerquellen der Vorsorge-Foerderregeln (gemeinfrei, § 5 UrhG)
# nach vorsorge/data/funding-rules/sources/: Volltext, SHA-256, Abrufzeit, HTTP-Status.
set -uo pipefail
OUT=vorsorge/data/funding-rules/sources
mkdir -p "$OUT"
UA="Mozilla/5.0 (compatible; VisionUniverseResearch/1.0; +https://research.visionuniverse.de)"
manifest="$OUT/manifest.json"
echo '{"schemaVersion":"vu-vorsorge-legal-sources-1.0.0","sources":[' > "$manifest.tmp"
first=1
fetch() { # id url kind
  local id="$1" url="$2" kind="$3" raw="$OUT/$1.raw" status
  status=$(curl -sSL -A "$UA" --max-time 60 -o "$raw" -w '%{http_code}' "$url" || echo 000)
  local sha="" bytes=0 text="$OUT/$id.txt"
  if [ "$status" = "200" ] && [ -s "$raw" ]; then
    sha=$(sha256sum "$raw" | cut -d' ' -f1); bytes=$(stat -c%s "$raw")
    if [ "$kind" = "pdf" ]; then pdftotext -layout "$raw" "$text" || true
    else python3 - "$raw" "$text" <<'PY'
import sys,re,html
s=open(sys.argv[1],encoding='utf-8',errors='replace').read()
s=re.sub(r'(?is)<(script|style|nav|header|footer)[^>]*>.*?</\1>',' ',s)
s=re.sub(r'(?i)<br\s*/?>|</p>|</li>|</h\d>|</tr>','\n',s)
s=html.unescape(re.sub(r'<[^>]+>',' ',s))
s='\n'.join(l.strip() for l in s.splitlines() if l.strip())
open(sys.argv[2],'w').write(s)
PY
    fi
  fi
  rm -f "$raw"
  [ $first -eq 1 ] || echo ',' >> "$manifest.tmp"; first=0
  printf '{"id":"%s","url":"%s","kind":"%s","httpStatus":"%s","sha256":"%s","bytes":%s,"fetchedAt":"%s","textFile":"%s"}' \
    "$id" "$url" "$kind" "$status" "$sha" "$bytes" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$( [ -s "$text" ] && echo "$id.txt" || echo "")" >> "$manifest.tmp"
  echo "$id: HTTP $status, $bytes Bytes"
}
fetch bgbl-2026-I-156 "https://www.recht.bund.de/bgbl/1/2026/156/regelungstext.pdf?__blob=publicationFile&v=1" pdf
fetch bundestag-kw13-2026-altersvorsorge "https://www.bundestag.de/dokumente/textarchiv/2026/kw13-de-altersvorsorge-1156798" html
fetch bmf-faq-reform-private-altersvorsorge "https://www.bundesfinanzministerium.de/Content/DE/FAQ/reform-der-privaten-altersvorsorge.html" html
fetch bmf-pm-2026-08-12-fruehstartrente "https://www.bundesfinanzministerium.de/Content/DE/Pressemitteilungen/Finanzpolitik/2026/08/2026-08-12-regierungsentwurf-fruehstartrente.html" html
fetch bundestag-hib-fruehstartrente "https://www.bundestag.de/presse/hib/kurzmeldungen-1211024" html
fetch estg-84 "https://www.gesetze-im-internet.de/estg/__84.html" html
fetch estg-85 "https://www.gesetze-im-internet.de/estg/__85.html" html
fetch estg-86 "https://www.gesetze-im-internet.de/estg/__86.html" html
fetch estg-10a "https://www.gesetze-im-internet.de/estg/__10a.html" html
echo ']}' >> "$manifest.tmp"
mv "$manifest.tmp" "$manifest"

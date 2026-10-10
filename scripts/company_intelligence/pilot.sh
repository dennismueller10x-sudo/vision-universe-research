#!/usr/bin/env bash
# Explicit, isolated pilot. Credentials come from the workflow environment only.
set -euo pipefail
state_root="${RUNNER_TEMP:?}/intelligence-pilot"
namespace="${PILOT_NAMESPACE:-pilot-$(python3 -c 'import hashlib,os;print(hashlib.sha256(os.environ["PILOT_BRANCH"].encode()).hexdigest()[:24])')}"
if [[ ! "$namespace" =~ ^pilot-[a-zA-Z0-9_-]{1,64}$ ]]; then echo "INVALID_PILOT_NAMESPACE" >&2; exit 1; fi
export PILOT_NAMESPACE="$namespace"
cohort='AAPL,NVDA,TSLA,MSFT,XPEV,PLTR,SOFI,ROOT,U,XYZ,TOST,TGT,AFRM,META,GOOG,GOOGL,ACU,CHE,AOS,RARE,PYXS,VEON'
node scripts/company_intelligence/privacy.mjs
restore=(pull --namespace "$namespace" --file "$RUNNER_TEMP/pilot-checkpoint.tar.gz")
if [ "${PILOT_INITIALIZE:-false}" = true ]; then restore+=(--initialize); fi
node scripts/company_intelligence/sync-state.mjs "${restore[@]}" > "$RUNNER_TEMP/pilot-restore.json"
if [ -f "$RUNNER_TEMP/pilot-checkpoint.tar.gz" ]; then
  python3 scripts/company_intelligence/checkpoint.py restore --state "$state_root" --snapshot "$RUNNER_TEMP/pilot-checkpoint.tar.gz"
fi
python3 - <<'PYCODE'
import json,os,sys
from pathlib import Path
sys.path.insert(0,'scripts')
from company_intelligence.acceptance import fingerprint
root=Path(os.environ['RUNNER_TEMP'])/'intelligence-pilot'
payload=fingerprint(root) if (root/'state.sqlite').exists() else {'state':'EMPTY'}
(Path(os.environ['RUNNER_TEMP'])/'pilot-before.json').write_text(json.dumps(payload,sort_keys=True))
PYCODE
# Initial existing financial projection is offline. Further runs reuse durable issuer state.
if [ ! -f "$state_root/latest-run.json" ]; then
  python3 scripts/company_intelligence/cli.py run --state "$state_root" --tickers "$cohort" --limit 100
fi
if [ "${PILOT_NETWORK:-false}" = true ]; then
  args=(poll --network --tickers "$cohort" --state "$state_root" --request-budget 100 --max-seconds 240)
  if [ "${PILOT_LANE:-feeds}" = sec ] && [ $((10#$(date -u +%H) % 4)) -eq 0 ]; then
    args=(sec-stream --network --sec-fetch --source-tickers "$cohort" --sec-documents --sec-document-issuers 2 --state "$state_root" --limit 10 --stream-days 3 --request-budget 100 --max-seconds 240)
  fi
  python3 scripts/company_intelligence/cli.py "${args[@]}"
else
  python3 scripts/company_intelligence/cli.py run --state "$state_root" --tickers "$cohort" --limit 100
fi
python3 scripts/company_intelligence/prepare-public.py --source "$state_root/public/company-intelligence/data" --out "$RUNNER_TEMP/intelligence-consumer" --tickers "$cohort" > "$RUNNER_TEMP/pilot-consumer.json"
# Consumer pointer is published only after private state is durably preserved.
python3 scripts/company_intelligence/checkpoint.py pack --state "$state_root" --snapshot "$RUNNER_TEMP/pilot-updated.tar.gz"
preserve=(push --namespace "$namespace" --file "$RUNNER_TEMP/pilot-updated.tar.gz")
if python3 -c 'import json,sys;sys.exit(json.load(open(sys.argv[1]))["status"]!="INITIALIZE")' "$RUNNER_TEMP/pilot-restore.json"; then preserve+=(--initialize); fi
node scripts/company_intelligence/sync-state.mjs "${preserve[@]}" > "$RUNNER_TEMP/pilot-preserve.json"
node scripts/company_intelligence/public-delivery.mjs --namespace "$namespace" --directory "$RUNNER_TEMP/intelligence-consumer" > "$RUNNER_TEMP/pilot-publication.json"
node scripts/company_intelligence/download-public.mjs --namespace "$namespace" --out "$RUNNER_TEMP/pilot-pages" > "$RUNNER_TEMP/pilot-pages.json"
node scripts/company_intelligence/verify-pilot-delivery.mjs
python3 - <<'PY'
import json, os
from pathlib import Path
root=Path(os.environ['RUNNER_TEMP'])
report={'namespace':os.environ['PILOT_NAMESPACE'], **{k:json.loads((root/f'pilot-{k}.json').read_text()) for k in ('restore','preserve','consumer','publication','delivery','pages','before')}}
r=json.loads((root/'intelligence-pilot/latest-run.json').read_text())
import sys
sys.path.insert(0,'scripts')
from company_intelligence.acceptance import fingerprint
report['after']=fingerprint(root/'intelligence-pilot')
report['run']={k:r[k] for k in ('status','run','httpStats','publicRequests','secRequests','runtimeSeconds','databaseBytes','export') if k in r}
(root/'pilot-report.json').write_text(json.dumps(report,sort_keys=True))
print(json.dumps(report,sort_keys=True))
PY

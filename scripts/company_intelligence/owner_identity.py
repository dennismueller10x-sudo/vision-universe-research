"""Resolution-only legal name from existing exact-CIK SEC consumer evidence.

The native verifier is unchanged. No inferred suffix, identity remap, network
request, source grant or exported Company Master name change occurs here.
"""
from copy import deepcopy
from pathlib import Path
import json
from .model import normalize, SUFFIX, timestamp
from .earnings import valid_date
from datetime import datetime, timezone, timedelta
ROOT=Path(__file__).resolve().parents[2]

def ownership_company(company, root=ROOT, now=None):
    # Company Master display names omit legal suffixes. Reuse the existing
    # exact-CIK SEC consumer name only when the complete base already matches.
    # No name inference, suffix invention, identity remap or Master mutation.
    value=deepcopy(company);reference=None
    stamp=timestamp(now) if now else datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z")
    oldest=(datetime.fromisoformat(stamp.replace("Z","+00:00"))-timedelta(days=30)).date().isoformat()
    path=Path(root)/'quant/data/sec/consumer'/('CIK'+str(company.get('cik'))+'.json')
    if path.is_file():
        data=json.loads(path.read_text())
        base=lambda name:normalize(SUFFIX.sub('',name))
        name=data.get('name')
        asof=data.get('asOf')
        dated=asof if valid_date(asof) else timestamp(asof)
        if dated and oldest<=dated[:10]<=stamp[:10] and data.get('cik')==company.get('cik') and isinstance(name,str) and base(name) in {base(n)for n in company['names']} and name not in value['names']:
            value['names'].append(name)
            import hashlib
            reference={'name':name,'cik':data['cik'],'publicCommittedPath':str(path.relative_to(root)),
                'contentHash':hashlib.sha256(path.read_bytes()).hexdigest(),'asOf':data.get('asOf')}
    return value,reference


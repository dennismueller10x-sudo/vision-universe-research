"""Primaerdaten einer SEC-Einreichung: XBRL-Instanz und Linkbases (Presentation, Calculation, Label).

companyfacts liefert nur nicht-dimensionale Fakten ohne Statement-Bezug. Fuer die manuelle Ground Truth (TTM-EPS,
Umsatz-Abschlusszeile) wird hier die Einreichung selbst gelesen:
  - facts(concepts): alle Fakten der Instanz mit Periode, Dimensionen, decimals
  - presentation(): Rollen (Statements) -> Baum der Konzepte in Reihenfolge, inkl. totalLabel/preferredLabel
  - calculation(): Rollen -> Summenbeziehungen (parent -> [(child, weight)])
  - labels(): Konzept -> Standard- und Gesamtlabel
SEC Fair Access: User-Agent mit Kontakt, hoechstens 5 Anfragen je Sekunde, Cache unter --cache.
  python3 sec_filing_xbrl.py <cik> <accession> <cache-dir> [concept ...]
"""
import json
import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

UA = "VisionUniverse research info@visionuniverse.de"
_last = [0.0]
NS = {"xbrli": "http://www.xbrl.org/2003/instance", "link": "http://www.xbrl.org/2003/linkbase",
      "xlink": "http://www.w3.org/1999/xlink", "xbrldi": "http://xbrl.org/2006/xbrldi"}


def _get(url, cache):
    path = Path(cache) / re.sub(r"[^A-Za-z0-9._-]", "_", url.split("/Archives/")[-1])
    if path.exists():
        return path.read_bytes()
    wait = 0.21 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read()
    _last[0] = time.time()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return data


class Filing:
    def __init__(self, cik, accession, cache):
        self.cik = str(int(cik))
        self.accession = accession
        self.cache = cache
        self.base = f"https://www.sec.gov/Archives/edgar/data/{self.cik}/{accession.replace('-', '')}/"
        index = json.loads(_get(self.base + "index.json", cache))
        self.files = [item["name"] for item in index["directory"]["item"]]

    def _file(self, *suffixes):
        for name in self.files:
            if name.endswith(suffixes):
                return _get(self.base + name, self.cache)
        return None

    def instance(self):
        data = self._file("_htm.xml")
        if data is None:  # aeltere Einreichungen: <ticker>-<datum>.xml
            candidates = [n for n in self.files if n.endswith(".xml") and not n.endswith(("_cal.xml", "_def.xml", "_lab.xml", "_pre.xml"))
                          and n != "FilingSummary.xml" and not n.startswith("R")]
            data = _get(self.base + candidates[0], self.cache) if candidates else None
        return ET.fromstring(data) if data else None

    def facts(self, concepts):
        return self.facts_where(lambda namespace, local: local in concepts)

    def facts_where(self, predicate):
        """Fakten, deren (Namespace-URI, lokaler Name) das Praedikat erfuellen; mit Namespace im Ergebnis."""
        root = self.instance()
        if root is None:
            return []
        contexts = {}
        for ctx in root.findall("xbrli:context", NS):
            period = ctx.find("xbrli:period", NS)
            start = period.findtext("xbrli:startDate", namespaces=NS)
            end = period.findtext("xbrli:endDate", namespaces=NS) or period.findtext("xbrli:instant", namespaces=NS)
            dims = {m.get("dimension"): (m.text or "").strip() for m in ctx.iter("{http://xbrl.org/2006/xbrldi}explicitMember")}
            contexts[ctx.get("id")] = {"start": start.strip() if start else None, "end": end.strip() if end else None, "dims": dims}
        out = []
        for element in root:
            namespace = element.tag[1:].split("}")[0] if element.tag.startswith("{") else ""
            local = element.tag.split("}")[-1]
            if not predicate(namespace, local):
                continue
            ctx = contexts.get(element.get("contextRef"), {})
            try:
                value = float(element.text)
            except (TypeError, ValueError):
                continue
            out.append({"concept": local, "namespace": namespace, "value": value, "start": ctx.get("start"), "end": ctx.get("end"),
                        "dims": ctx.get("dims"), "decimals": element.get("decimals"), "unit": element.get("unitRef")})
        return out

    def _linkbase(self, suffix, arc):
        data = self._file(suffix)
        if data is None:
            return {}
        root = ET.fromstring(data)
        roles = {}
        for link in root:
            role = link.get("{http://www.w3.org/1999/xlink}role")
            locs = {loc.get("{http://www.w3.org/1999/xlink}label"): loc.get("{http://www.w3.org/1999/xlink}href", "").split("#")[-1]
                    for loc in link if loc.tag.endswith("loc")}
            arcs = []
            for a in link:
                if not a.tag.endswith(arc):
                    continue
                parent = locs.get(a.get("{http://www.w3.org/1999/xlink}from"))
                child = locs.get(a.get("{http://www.w3.org/1999/xlink}to"))
                arcs.append({"parent": parent, "child": child, "order": float(a.get("order") or 0),
                             "weight": float(a.get("weight") or 0), "preferredLabel": a.get("preferredLabel")})
            if arcs:
                roles.setdefault(role, []).extend(arcs)
        return roles

    def presentation(self):
        return self._linkbase("_pre.xml", "presentationArc")

    def calculation(self):
        return self._linkbase("_cal.xml", "calculationArc")


def concept_name(href_fragment):
    """'us-gaap_Revenues' -> 'Revenues'"""
    return href_fragment.split("_", 1)[-1] if "_" in href_fragment else href_fragment


if __name__ == "__main__":
    cik, accession, cache, *concepts = sys.argv[1:]
    filing = Filing(cik, accession, cache)
    for fact in filing.facts(set(concepts)):
        print(json.dumps(fact))

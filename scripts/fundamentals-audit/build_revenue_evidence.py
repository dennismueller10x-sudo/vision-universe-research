"""Belege fuer die Umsatz-Abschlusszeile je Einreichung (Presentation-/Calculation-Linkbase der Einreichung).

Fuer jede Einreichung, in der us-gaap:Revenues kleiner ist als ein anderes positives Umsatzkonzept derselben Periode
(Mehrdeutigkeit E2-R), wird aus den Primaerdaten der Einreichung bestimmt, welches Konzept die Umsatzzeile der
Gewinn- und Verlustrechnung ist:
  1. FilingSummary.xml: Rollen der Kategorie "Statements", deren Titel eine Ergebnisrechnung bezeichnet
     (operations / income / earnings, nicht parenthetical, balance, cash flow, equity, comprehensive-only)
  2. Presentation-Linkbase dieser Rollen: welche Umsatzkonzepte stehen dort als Zeile?
  3. Calculation-Linkbase dieser Rollen: summiert Revenues den Vertragsumsatz (Revenues -> Vertragsumsatz, Gewicht +1)?
Entscheidung:
  REVENUES_STATEMENT_TOTAL      Revenues steht in der Ergebnisrechnung und das andere Konzept nicht - oder es ist
                                dort ein Summand von Revenues
  OTHER_STATEMENT_LINE          nur das andere Konzept steht in der Ergebnisrechnung (Revenues nur im Anhang)
  AMBIGUOUS                     beide ohne Summenbeziehung, keines, oder keine lesbare Ergebnisrechnung
Kein Raten: ohne Beleg AMBIGUOUS. SEC Fair Access ueber sec_filing_xbrl (<= 5 Anfragen/s, Cache).
  python3 build_revenue_evidence.py <conflicts.json> <cache-dir> <out.json> [--limit N] [--redecide]
"""
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sec_filing_xbrl import Filing, _get, concept_name  # noqa: E402

RIVALS = ("RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax",
          "SalesRevenueNet", "SalesRevenueGoodsNet", "SalesRevenueServicesNet")
INCOME = re.compile(r"operations|income|earnings|profit|loss", re.I)
NOT_INCOME = re.compile(r"parenthetical|balance|financial condition|financial position|cash flow|"
                        r"stockholders|shareholders|partners'|members'|changes in equity|statements? of equity|details|tables|policies", re.I)


def income_statement_roles(filing):
    data = None
    if "FilingSummary.xml" in filing.files:
        data = _get(filing.base + "FilingSummary.xml", filing.cache)
    if not data:
        return []
    root = ET.fromstring(data)
    roles = []
    for report in root.iter("Report"):
        category = (report.findtext("MenuCategory") or "").strip()
        long_name = (report.findtext("LongName") or "").strip()
        role = (report.findtext("Role") or "").strip()
        title = long_name.split(" - ", 2)[-1] if " - " in long_name else long_name
        is_statement = category == "Statements" or " - Statement - " in long_name
        if is_statement and INCOME.search(title) and not NOT_INCOME.search(title):
            roles.append(role)
    return roles


def decide(filing, rival_concepts):
    roles = income_statement_roles(filing)
    if not roles:
        return {"decision": "AMBIGUOUS", "basis": "NO_INCOME_STATEMENT_ROLE"}
    pre = filing.presentation()
    cal = filing.calculation()
    in_statement = set()
    for role in roles:
        for arc in pre.get(role, []):
            for href in (arc["parent"], arc["child"]):
                if href:
                    in_statement.add(concept_name(href))
    revenues_in = "Revenues" in in_statement
    rivals_in = sorted(c for c in rival_concepts if c in in_statement)
    revenues_total_label = any(
        arc["child"] and concept_name(arc["child"]) == "Revenues" and (arc["preferredLabel"] or "").endswith("totalLabel")
        for role in roles for arc in pre.get(role, []))
    summand = False
    for role in roles:
        for arc in cal.get(role, []):
            if arc["parent"] and arc["child"] and concept_name(arc["parent"]) == "Revenues" \
                    and concept_name(arc["child"]) in rival_concepts and arc["weight"] > 0:
                summand = True
    base = {"incomeStatementRoles": roles, "revenuesInStatement": revenues_in, "rivalsInStatement": rivals_in,
            "rivalIsSummandOfRevenues": summand, "revenuesTotalLabel": revenues_total_label}
    if revenues_in and (not rivals_in or summand):
        return dict(base, decision="REVENUES_STATEMENT_TOTAL", basis="PRESENTATION" + ("+CALCULATION" if summand else ""))
    if revenues_in and rivals_in and revenues_total_label:
        # Beide Zeilen in der Ergebnisrechnung, Revenues mit Gesamtlabel: Revenues ist die Summenzeile.
        return dict(base, decision="REVENUES_STATEMENT_TOTAL", basis="PRESENTATION_TOTAL_LABEL")
    if rivals_in and not revenues_in:
        return dict(base, decision="OTHER_STATEMENT_LINE", concept=rivals_in[0] if len(rivals_in) == 1 else None,
                    basis="PRESENTATION")
    return dict(base, decision="AMBIGUOUS", basis="BOTH_OR_NEITHER_IN_STATEMENT")


def main():
    conflicts_path, cache, out_path = sys.argv[1:4]
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
    conflicts = json.load(open(conflicts_path))
    by_filing = {}
    for c in conflicts:
        by_filing.setdefault((c["cik"], c["accn"]), set()).update(RIVALS)
    out = {}
    if Path(out_path).exists():
        out = json.load(open(out_path))["filings"]
    items = sorted(by_filing.items())[:limit] if limit else sorted(by_filing.items())
    for k, ((cik, accn), rivals) in enumerate(items):
        if accn in out and out[accn].get("basis") != "FILING_NOT_READABLE" and "--redecide" not in sys.argv:
            continue
        try:
            out[accn] = dict(decide(Filing(cik, accn, cache), rivals), cik=cik)
        except Exception as exc:  # noqa: BLE001 - eine unlesbare Einreichung ist AMBIGUOUS, nicht ein Abbruch
            out[accn] = {"cik": cik, "decision": "AMBIGUOUS", "basis": "FILING_NOT_READABLE", "error": str(exc)[:200]}
        if k % 25 == 0:
            json.dump({"filings": out}, open(out_path, "w"))
            print(k, accn, out[accn]["decision"], flush=True)
    summary = {}
    for v in out.values():
        summary[v["decision"]] = summary.get(v["decision"], 0) + 1
    json.dump({"schema": "vu-sec-revenue-statement-evidence-1.0.0", "summary": summary, "filings": out}, open(out_path, "w"), indent=0)
    print(json.dumps(summary))


if __name__ == "__main__":
    main()

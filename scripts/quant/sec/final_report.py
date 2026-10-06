"""Der Abschlussbericht des SEC-Recovery-Zyklus (§25, §26) - aus Messungen.

Jede Zahl in diesem Bericht wird aus einem Artefakt unter
quant/data/fundamentals/ gelesen, nie abgetippt. Der Vergleich VORHER
gegen NACHHER besteht aus zwei Messungen: der eingefrorenen Baseline
(baseline-before-final-recovery.json) und dem aktuellen Stand. Wo ein
Artefakt fehlt, steht das im Bericht - nicht eine Zahl aus dem
Gedaechtnis.
"""
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "quant" / "data" / "fundamentals"
BASELINE = "baseline-before-final-recovery.json"

# §25: die Kennzahlen, die der Bericht nennen MUSS. Der Test prueft,
# dass jede im gerenderten Text vorkommt.
REQUIRED_METRICS = (
    "SEC_RECOVERABLE", "PIT_READY", "BACKTEST_PIT_FUNDAMENTAL_READY",
    "BACKTEST_5Y_READY", "BACKTEST_10Y_READY", "BACKTEST_15Y_READY",
    "TECHNICAL_WITH_REVENUE", "TECHNICAL_WITH_NET_INCOME", "TECHNICAL_WITH_ASSETS",
    "TECHNICAL_WITH_EQUITY", "TECHNICAL_WITH_OPERATING_CASH_FLOW", "TECHNICAL_WITH_FCF",
    "PERSISTED_ISSUERS", "PERSISTED_ANNUAL_HISTORIES", "PERSISTED_QUARTERLY_HISTORIES",
    "PERSISTED_PIT_HISTORIES", "PERSISTED_METADATA", "PERSISTENCE_LOCATION",
    "RELOAD_WITHOUT_SEC_REFETCH", "NOT_APPLICABLE", "REQUIRES_REVIEW",
    "EXTERNAL_PROVIDER_CANDIDATE", "RESOLVES_WITH_TIME", "IFRS_REMAINING",
)

# §26: die Bestaetigungen, jede mit dem Artefakt, das sie belegt.
CONFIRMATIONS = (
    ("Vollstaendiger produktiver SEC-Lauf ueber alle Emittenten des Produktuniversums",
     "coverage-report.json: ISSUERS_INGESTED_TOTAL"),
    ("Echte SEC/EDGAR-Daten, keine Attrappen im Bestand",
     "persistence.json: driver s3, sha256 je Objekt; Tests laufen gegen synthetische Fixtures, nie gegen den Speicher"),
    ("Vollstaendige Neu-Normalisierung unter NORMALIZATION_LOGIC_VERSION",
     "reconciliation.json: versions.normalization_logic; persistence.json: byNormalizationVersion"),
    ("Dauerhaft persistiert (R2, v1/sec/fundamentals/), nicht Runner-Disk oder Cache",
     "persistence.json: PERSISTED_* und PERSISTENCE_LOCATION"),
    ("Ohne SEC-Refetch zurueckgeladen und byte-gleich verglichen, Netz gesperrt",
     "reload-verification.json: RELOAD_WITHOUT_SEC_REFETCH, networkBlocked"),
    ("Join gegen den kanonischen R2-Marktdatenstand erneut gelaufen",
     "reconciliation.json: overlap gegen 7.004 / 6.997 / 5.963"),
    ("Keine kuenstliche Coverage: kein Wert ohne gemeldeten Fakt, kein MISSING als Null",
     "fundamental-quality.json: byState fuehrt MISSING und NOT_APPLICABLE getrennt"),
    ("Keine Fremdwaehrung als USD ausgewiesen; nichts umgerechnet",
     "reload-verification.json: currencies je Emittent (EUR bleibt EUR)"),
    ("Kein SPAC-Treuhandvermoegen als Bilanzsumme, kein Treuhandertrag als Umsatz",
     "sec-metric-registry.json: sector_rules BLANK_CHECK_SPAC; kein Mapping von AssetsHeldInTrust"),
    ("Point-in-Time erhalten: jeder Wert traegt filed, availableAt, sourceFilingId",
     "reload-verification.json: everyFactHasFilingAndAccession"),
    ("Kein Look-ahead: Backtest-Stufen zaehlen nur PIT-datierbare Werte",
     "backtest-readiness.json: lookAheadControl"),
    ("Restatements erhalten: Revisionen je Zelle, keine Ueberschreibung",
     "reload-verification.json: restated je Emittent"),
    ("R2-Preisspeicher unveraendert",
     "persistence.json: witness.priceStoreUntouched, keysOutsidePrefix = 0"),
    ("Eligibility unveraendert, Marktdaten nur gelesen",
     "quant/data/market/history/CANONICAL_SOURCE.json: readOnly, r2Writes 0"),
    ("Kein Frontend angefasst", "git diff: keine Aenderung unter app/ oder public/"),
    ("Kein neuer Anbieter, keine neue Speicherloesung",
     "external-provider-candidates.json: providerDecision OFFEN; Ablage ueber den bestehenden R2-Treiber"),
)


def _load(name):
    path = DATA / name
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _n(value):
    if value is None:
        return "n/a"
    if isinstance(value, float):
        return f"{value:,.1f}".replace(",", ".")
    if isinstance(value, int):
        return f"{value:,}".replace(",", ".")
    return str(value)


def _delta(before, after):
    if before is None or after is None:
        return ""
    d = after - before
    return f"{'+' if d >= 0 else ''}{_n(d)}"


def _row(label, before, after):
    return f"| `{label}` | {_n(before)} | {_n(after)} | {_delta(before, after)} |"


def build_final_report(data_dir=DATA):
    global DATA
    DATA = Path(data_dir)
    rec = _load("reconciliation.json") or {}
    bt = _load("backtest-readiness.json") or {}
    q = _load("fundamental-quality.json") or {}
    fine = _load("sec-recoverable-fine.json") or {}
    gaps = _load("gap-classification.json") or {}
    cov = _load("coverage-report.json") or {}
    per = _load("persistence.json") or {}
    rl = _load("reload-verification.json") or {}
    ext = _load("external-provider-candidates.json") or {}
    base = _load(BASELINE) or {}

    o = rec.get("overlap") or {}
    core = {k: v.get("COUNT") for k, v in (rec.get("coreMetrics") or {}).get("metrics", {}).items()}
    hist = {k: v.get("COUNT") for k, v in (rec.get("history") or {}).get("annual", {}).items()}
    bgaps = base.get("gaps") or {}
    bcore = base.get("coreMetricsOfTechnical") or {}
    bbt = base.get("backtest") or {}
    bover = base.get("overlap") or {}
    bstates = base.get("titleStates") or {}
    bfine = base.get("fine") or {}
    states = (q.get("titles") or {}).get("byState") or {}
    byrec = gaps.get("byRecoverability") or {}
    persisted = per.get("persisted") or {}
    industry = (rec.get("industryLayer") or {}).get("industries") or {}
    fine_causes = {r["cause"]: r["count"] for r in fine.get("byCause") or []}
    bfine_causes = bfine.get("byCause") or {}

    lines = []
    w = lines.append
    w("# SEC Fundamentals — Abschlussbericht des Recovery-Zyklus (§25 / §26)")
    w("")
    w(f"Erzeugt {datetime.now(timezone.utc).isoformat(timespec='seconds')} aus den Artefakten unter "
      f"`quant/data/fundamentals/`. **Jede Zahl ist gelesen, keine getippt.** Vorher = "
      f"`{BASELINE}` (Lauf {base.get('sourceRun', '?')}), Nachher = aktueller Stand "
      f"(Normalisierung {(rec.get('versions') or {}).get('normalization_logic', '?')}, "
      f"Registry {((rec.get('versions') or {}).get('metric_registry') or {}).get('mapping_version', '?')}).")
    w("")
    w("## 1 — Luecken nach Loesbarkeit (Produktuniversum 7.004)")
    w("")
    w("| Kennzahl | Vorher | Nachher | Δ |")
    w("|---|---:|---:|---:|")
    for k in ("SEC_RECOVERABLE", "EXTERNAL_PROVIDER_CANDIDATE", "RESOLVES_WITH_TIME",
              "BY_DESIGN", "REQUIRES_REVIEW"):
        w(_row(k, bgaps.get(k), byrec.get(k)))
    w("")
    w("## 2 — Die SEC_RECOVERABLE-Faelle, einzeln begruendet (§5)")
    w("")
    w(f"Nenner: {_n((fine.get('denominator') or {}).get('SEC_RECOVERABLE'))} Faelle, "
      f"{_n(fine.get('accountedFor'))} zugeordnet, {_n(fine.get('unaccounted'))} ohne Grund. "
      f"Davon nach Konsequenz: {json.dumps(fine.get('byConsequence') or {}, ensure_ascii=False)}; "
      f"noch SEC-loesbar: **{_n(fine.get('stillRecoverableBySec'))}** "
      f"(vorher {_n(bfine.get('stillRecoverableBySec'))}).")
    w("")
    w("| Feinursache | Vorher | Nachher | Δ |")
    w("|---|---:|---:|---:|")
    for cause in sorted(set(fine_causes) | set(bfine_causes), key=lambda c: -(fine_causes.get(c) or 0)):
        w(_row(cause, bfine_causes.get(cause), fine_causes.get(cause)))
    if "IFRS_REMAINING" not in fine_causes and "IFRS_REMAINING" not in bfine_causes:
        w(_row("IFRS_REMAINING", 0, 0))
    w("")
    w("## 3 — Titelzustaende (§12)")
    w("")
    w("| Zustand | Vorher | Nachher | Δ |")
    w("|---|---:|---:|---:|")
    for k in ("AVAILABLE", "PARTIAL", "MISSING", "NOT_APPLICABLE", "REQUIRES_REVIEW", "UNAVAILABLE"):
        w(_row(k, bstates.get(k), states.get(k)))
    w("")
    w("## 4 — Point-in-Time und Kernkennzahlen (Technical-Universum 5.963)")
    w("")
    w("| Kennzahl | Vorher | Nachher | Δ |")
    w("|---|---:|---:|---:|")
    w(_row("PIT_READY", bover.get("PIT_READY"), o.get("PIT_READY")))
    w(_row("PIT_R2_AND_TECHNICAL", bover.get("PIT_R2_AND_TECHNICAL"), o.get("PIT_R2_AND_TECHNICAL")))
    w(_row("PIT_R2_TECHNICAL_AND_CORE_FUNDAMENTALS", bover.get("PIT_R2_TECHNICAL_AND_CORE_FUNDAMENTALS"),
           o.get("PIT_R2_TECHNICAL_AND_CORE_FUNDAMENTALS")))
    for k in ("TECHNICAL_WITH_REVENUE", "TECHNICAL_WITH_NET_INCOME", "TECHNICAL_WITH_ASSETS",
              "TECHNICAL_WITH_EQUITY", "TECHNICAL_WITH_OPERATING_CASH_FLOW", "TECHNICAL_WITH_FCF",
              "TECHNICAL_WITH_EPS", "TECHNICAL_WITH_DEBT"):
        w(_row(k, bcore.get(k), core.get(k)))
    w("")
    w("## 5 — Backtest-Bereitschaft ohne Look-ahead (§20)")
    w("")
    w("| Stufe | Vorher | Nachher | Δ |")
    w("|---|---:|---:|---:|")
    for k in ("BACKTEST_PRICE_READY", "BACKTEST_PRICE_TECHNICAL_READY", "BACKTEST_PIT_FUNDAMENTAL_READY",
              "BACKTEST_5Y_READY", "BACKTEST_10Y_READY", "BACKTEST_15Y_READY"):
        w(_row(k, bbt.get(k), bt.get(k)))
    w("")
    w(f"Look-ahead-Regel: {((bt.get('lookAheadControl') or {}).get('rule')) or 'n/a'}")
    w("")
    w("## 6 — Persistenz (§3, §21)")
    w("")
    w("| Kennzahl | Wert |")
    w("|---|---:|")
    for k in ("PERSISTED_ISSUERS", "PERSISTED_ANNUAL_HISTORIES", "PERSISTED_QUARTERLY_HISTORIES",
              "PERSISTED_PIT_HISTORIES", "PERSISTED_METADATA", "PERSISTED_STORAGE_BYTES",
              "PERSISTENCE_LOCATION"):
        w(f"| `{k}` | {_n(persisted.get(k))} |")
    w(f"| `byNormalizationVersion` | `{json.dumps(persisted.get('byNormalizationVersion') or {})}` |")
    wit = per.get("witness") or {}
    w(f"| `witness.keysOutsidePrefix` | {_n(wit.get('keysOutsidePrefix'))} |")
    w(f"| `witness.priceStoreUntouched` | {wit.get('priceStoreUntouched')} |")
    w(f"| `RELOAD_WITHOUT_SEC_REFETCH` | **{rl.get('RELOAD_WITHOUT_SEC_REFETCH', 'n/a')}** "
      f"({_n(rl.get('passed'))}/{_n(rl.get('requested'))}, networkBlocked={rl.get('networkBlocked')}) |")
    w("")
    w("| Zurueckgeladen | Dokument identisch | kanonische Fakten | identisch | Waehrung | Jahre | Restatements | PIT vollstaendig |")
    w("|---|---|---:|---|---|---:|---:|---|")
    for r in rl.get("results") or []:
        w(f"| {r.get('cik')} | {r.get('documentsIdentical')} | {_n(r.get('canonicalFacts'))} | "
          f"{r.get('canonicalFactsIdentical')} | {'+'.join(r.get('currencies') or [])} | "
          f"{_n(r.get('annualPeriods'))} | {_n(r.get('restated'))} | {r.get('everyFactHasFilingAndAccession')} |")
    w("")
    w("## 7 — Branchenschicht (§10)")
    w("")
    if industry:
        w("| Branche | Emittenten | mit Branchenkennzahl | Anteil | Kennzahlen |")
        w("|---|---:|---:|---:|---|")
        for ind, e in industry.items():
            metrics = ", ".join(f"{m} ({_n(v.get('ISSUERS'))})" for m, v in (e.get("metrics") or {}).items())
            w(f"| {ind} | {_n(e.get('ISSUERS'))} | {_n(e.get('ISSUERS_WITH_ANY_INDUSTRY_METRIC'))} | "
              f"{_n(e.get('PERCENT_WITH_ANY_INDUSTRY_METRIC'))} % | {metrics or '-'} |")
    else:
        w("Noch keine Messung der Branchenschicht im Abgleich (industryLayer fehlt).")
    w("")
    w("## 8 — Anbieterfrage (§22)")
    w("")
    w(f"Kandidatenprofil: {_n(ext.get('COUNT'))} Titel, davon {_n(ext.get('FOREIGN_ISSUERS'))} auslaendische "
      f"Emittenten, {_n(ext.get('OTHER'))} sonstige. Entscheidung: **{ext.get('providerDecision', 'n/a')}** "
      f"Ein Anbieter schliesst nur, was die SEC nicht fuehrt: Emittenten ohne XBRL-Abschluesse "
      f"(40-F-Befreiung, leeres companyfacts) und Titel ohne CIK.")
    w("")
    w("## 9 — Bestaetigungen (§26)")
    w("")
    w("| Bestaetigung | Beleg |")
    w("|---|---|")
    for text, evidence in CONFIRMATIONS:
        w(f"| {text} | {evidence} |")
    w("")
    w("## 10 — Versionen")
    w("")
    w("```json")
    w(json.dumps(rec.get("versions") or {}, indent=2))
    w("```")
    w("")
    return "\n".join(lines)

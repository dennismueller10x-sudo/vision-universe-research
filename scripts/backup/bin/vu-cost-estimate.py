"""Speicherbedarf und B2-Kosten der Sicherung hochrechnen (nur lesend, keine Zugangsdaten).

  vu-cost-estimate.py --repo owner/name [--git-growth-gib-day 0.33] [--r2-tier1-gb 4]
                      [--r2-tier2-gb 8.5] [--tier2 monthly|weekly] [--hide-days 400]
                      [--runs-per-month 12] [--usd-per-tb 6.95]

Liest die Repository-Groesse ueber die oeffentliche GitHub-API (Feld size, KiB).
Modell:
- Git-Historie waechst nur; dedupliziert belegt sie Startgroesse + Wachstum.
- Stufe 1 (R2): kleine Aenderungsrate (10 % je Monat neu).
- Stufe 2 (R2): je Stand bis zu voll neu (ungünstig) bzw. 20 % neu (erwartet).
- Verborgene Daten bleiben hide-days lang physisch liegen.
- Egress: Restore-Proben lesen alles; im Modus incremental zusaetzlich je Lauf den Mirror.
  Frei bis 3 x gespeicherte Menge, darueber 0,01 USD/GB.
"""
import argparse
import json
import urllib.request


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--git-growth-gib-day", type=float, default=0.33)
    ap.add_argument("--r2-tier1-gb", type=float, default=4.0)
    ap.add_argument("--r2-tier2-gb", type=float, default=8.5)
    ap.add_argument("--tier2", choices=["monthly", "weekly"], default="monthly")
    ap.add_argument("--hide-days", type=int, default=400)
    ap.add_argument("--runs-per-month", type=int, default=12)
    ap.add_argument("--usd-per-tb", type=float, default=6.95)
    ap.add_argument("--git-mode", choices=["bundle", "incremental"], default="bundle",
                    help="bundle: je Lauf nur Ref-Liste aus dem Ziel lesen; incremental: ganzen Mirror zuruecklesen")
    ap.add_argument("--drills-per-month", type=int, default=1, help="vollstaendige Restore-Proben (lesen alles)")
    a = ap.parse_args()
    with urllib.request.urlopen(f"https://api.github.com/repos/{a.repo}", timeout=30) as resp:
        git_gb = json.load(resp)["size"] * 1024 / 1e9
    per_month_t2 = 1 if a.tier2 == "monthly" else 4.3
    rows = []
    for month in (0, 3, 6, 12):
        git = git_gb + a.git_growth_gib_day * 1.074 * 30.4 * month
        kept = min(month, a.hide_days / 30.4)
        t1 = a.r2_tier1_gb * (1 + 0.10 * kept)
        t2_exp = a.r2_tier2_gb * (1 + 0.20 * per_month_t2 * kept)
        t2_bad = a.r2_tier2_gb * (1 + 1.00 * per_month_t2 * kept)
        exp = git + t1 + t2_exp + 1
        bad = git + t1 + t2_bad + 1
        cost = lambda gb: max(0.0, gb - 10) * a.usd_per_tb / 1000
        reads_per_month = a.drills_per_month + (a.runs_per_month if a.git_mode == "incremental" else 0)
        egress = reads_per_month * git + a.runs_per_month * 0.02 * exp   # + Stichproben-Pruefung (2 %)
        egress_cost = max(0.0, egress - 3 * exp) * 0.01
        rows.append({"monat": month, "git_gb": round(git, 1), "erwartet_gb": round(exp, 1), "unguenstig_gb": round(bad, 1),
                     "usd_erwartet": round(cost(exp) + egress_cost, 2), "usd_unguenstig": round(cost(bad) + egress_cost, 2),
                     "egress_gb": round(egress), "egress_usd": round(egress_cost, 2)})
    print(f"Repository {a.repo}: {git_gb:.1f} GB (GitHub-API), Git-Modus {a.git_mode}, Stufe 2 {a.tier2}, verborgene Daten {a.hide_days} Tage, B2 {a.usd_per_tb} USD/TB")
    print("| Monat | Git (GB) | belegt erwartet (GB) | belegt ungünstig (GB) | USD/Monat erwartet | USD/Monat ungünstig | Egress je Monat (GB) |")
    print("|---|---|---|---|---|---|---|")
    for r in rows:
        print(f"| {r['monat']} | {r['git_gb']} | {r['erwartet_gb']} | {r['unguenstig_gb']} | {r['usd_erwartet']} | {r['usd_unguenstig']} | {r['egress_gb']} |")


if __name__ == "__main__":
    main()

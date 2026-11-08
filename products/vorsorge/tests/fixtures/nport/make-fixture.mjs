/* Synthetische N-PORT-Testdaten (KEINE echten Bestaende): zwei Quartale fuer eine Serie,
   Spaltenlayout wie die SEC-DERA-Datasets. Erzeugt Zips im uebergebenen Verzeichnis. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
export function makeFixture(dir) {
  const q = {
    "2026q1": { acc: "0001-26-000001", report: "31-MAR-2026", filed: "28-MAY-2026", net: "1000000000",
      rows: [["H1", "Alpha Corp", "000000AA1", "7.10", "EC", "US", "USD", "US0000000AA1", "ALPHA"], ["H2", "Beta Inc", "000000BB2", "6.80", "EC", "US", "USD", "", "BETA"],
             ["H3", "Gamma Ltd", "", "4.00", "EC", "JP", "JPY", "JP0000000GA1", ""], ["H4", "Delta AG", "", "1.20", "EC", "DE", "EUR", "DE0000000DE1", ""],
             ["H5", "US Treasury Bill", "912797AA1", "0.40", "DBT", "US", "USD", "", ""], ["H6", "Cash Mgmt Fund", "", "0.50", "STIV", "US", "USD", "", ""], ["H9", "Omega Holdings", "000000OM9", "80.00", "EC", "US", "USD", "", "OMEGA"]] },
    "2026q2": { acc: "0001-26-000002", report: "30-JUN-2026", filed: "27-AUG-2026", net: "1200000000",
      rows: [["H1", "Alpha Corp", "000000AA1", "7.40", "EC", "US", "USD", "US0000000AA1", "ALPHA"], ["H2", "Beta Inc", "000000BB2", "6.20", "EC", "US", "USD", "", "BETA"],
             ["H3", "Gamma Ltd", "", "4.10", "EC", "JP", "JPY", "JP0000000GA1", ""], ["H7", "Epsilon SA", "", "2.50", "EC", "FR", "EUR", "FR0000000EP1", ""],
             ["H6", "Cash Mgmt Fund", "", "0.30", "STIV", "US", "USD", "", ""], ["H9", "Omega Holdings", "000000OM9", "79.50", "EC", "US", "USD", "", "OMEGA"]] }
  };
  const zips = {};
  for (const [name, d] of Object.entries(q)) {
    const t = join(dir, name); mkdirSync(t, { recursive: true });
    writeFileSync(join(t, "SUBMISSION.tsv"), "ACCESSION_NUMBER\tFILING_DATE\tSUB_TYPE\tREPORT_ENDING_PERIOD\tREPORT_DATE\tIS_LAST_FILING\n" + `${d.acc}\t${d.filed}\tNPORT-P\t${d.report}\t${d.report}\tN\n`);
    writeFileSync(join(t, "REGISTRANT.tsv"), "ACCESSION_NUMBER\tCIK\tREGISTRANT_NAME\tLEI\n" + `${d.acc}\t1100663\tTEST TRUST\t\n`);
    writeFileSync(join(t, "FUND_REPORTED_INFO.tsv"), "ACCESSION_NUMBER\tSERIES_NAME\tSERIES_ID\tSERIES_LEI\tTOTAL_ASSETS\tNET_ASSETS\n" + `${d.acc}\tTest Series\tS000004310\t\t${d.net}\t${d.net}\n`);
    writeFileSync(join(t, "FUND_REPORTED_HOLDING.tsv"), "ACCESSION_NUMBER\tHOLDING_ID\tISSUER_NAME\tISSUER_TITLE\tISSUER_CUSIP\tBALANCE\tUNIT\tCURRENCY_CODE\tCURRENCY_VALUE\tEXCHANGE_RATE\tPERCENTAGE\tASSET_CAT\tINVESTMENT_COUNTRY\tDERIVATIVE_CAT\n" +
      d.rows.map((r) => [d.acc, r[0] + name, r[1], r[1], r[2], "100", "NS", r[6], "1000", "1", r[3], r[4], r[5], ""].join("\t")).join("\n") + "\n");
    writeFileSync(join(t, "IDENTIFIERS.tsv"), "HOLDING_ID\tIDENTIFIERS_ID\tIDENTIFIER_ISIN\tIDENTIFIER_TICKER\n" + d.rows.map((r, i) => [r[0] + name, i, r[7], r[8]].join("\t")).join("\n") + "\n");
    const zip = join(dir, name + "_nport.zip");
    execFileSync("zip", ["-q", "-j", zip, ...["SUBMISSION", "REGISTRANT", "FUND_REPORTED_INFO", "FUND_REPORTED_HOLDING", "IDENTIFIERS"].map((f) => join(t, f + ".tsv"))]);
    zips[name] = zip;
  }
  const mf = join(dir, "company_tickers_mf.json");
  writeFileSync(mf, JSON.stringify({ fields: ["cik", "seriesId", "classId", "symbol"], data: [[1100663, "S000004310", "C000012040", "IVV"], [1, "S999", "C999", "NOTINDEX"]] }));
  return { zips, mf };
}

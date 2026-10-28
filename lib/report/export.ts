/**
 * Report exports — shared by /api/reports/export and the verification
 * script. Two formats, exactly the same rows and columns:
 *
 *   CSV  UTF-8 BOM + RFC-4180 escaping, so Excel opens it cleanly
 *   XLS  a real SpreadsheetML 2003 workbook (native Excel format),
 *        not a CSV file renamed to .xls
 *
 * Column order is fixed by the Reports spec:
 *   Name, Position, Month, Result, Required hours, Recorded hours,
 *   Credited hours, Compliance %, Status, Days recorded, Working days,
 *   Missing days, Incomplete records
 */

import { COMPLIANCE_STATUS_LABEL } from "./constants";
import type { ReportRowView } from "./queries";

export const EXPORT_COLUMNS = [
  "Name",
  "Position",
  "Month",
  "Result",
  "Required hours",
  "Recorded hours",
  "Credited hours",
  "Compliance %",
  "Status",
  "Days recorded",
  "Working days",
  "Missing days",
  "Incomplete records",
] as const;

function positionLabel(position: string | null): string {
  if (!position) return "—";
  return position.charAt(0).toUpperCase() + position.slice(1);
}

/** One export row, already display-formatted. */
export function toExportRow(row: ReportRowView, month: string, isFinalized: boolean) {
  return [
    row.full_name || "Unnamed",
    positionLabel(row.position),
    month,
    isFinalized ? "Finalized" : "Provisional",
    round(row.required_hours),
    round(row.recorded_hours),
    round(row.credited_hours),
    round(row.compliance_percent),
    COMPLIANCE_STATUS_LABEL[row.status] ?? row.status,
    row.days_recorded,
    row.elapsed_working_days,
    row.missing_days,
    row.incomplete_records,
  ];
}

function round(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

// ---------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------

/** Escape one CSV field: quote when needed, double inner quotes. */
export function csvEscape(value: string | number): string {
  const raw = String(value ?? "");
  // Spreadsheet formula injection: a cell beginning with these characters
  // can execute a formula when opened in Excel/LibreOffice. Prefix it with
  // an apostrophe so it is always treated as text.
  const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildCsv(
  rows: ReportRowView[],
  month: string,
  isFinalized: boolean
): string {
  const lines: string[] = [EXPORT_COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(toExportRow(row, month, isFinalized).map(csvEscape).join(","));
  }
  // CRLF so Excel renders every row on its own line.
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------
// XLS — SpreadsheetML 2003 (a real Excel workbook)
// ---------------------------------------------------------------------

function xmlEscape(value: string | number): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const NUMERIC_COLUMNS = new Set([4, 5, 6, 7, 9, 10, 11, 12]);

export function buildXls(
  rows: ReportRowView[],
  month: string,
  isFinalized: boolean
): string {
  const headerCells = EXPORT_COLUMNS.map(
    (column) => `<Cell ss:StyleID="header"><Data ss:Type="String">${xmlEscape(column)}</Data></Cell>`
  ).join("");

  const bodyRows = rows
    .map((row) => {
      const values = toExportRow(row, month, isFinalized);
      const cells = values
        .map((value, index) => {
          const type = NUMERIC_COLUMNS.has(index) ? "Number" : "String";
          return `<Cell><Data ss:Type="${type}">${xmlEscape(value)}</Data></Cell>`;
        })
        .join("");
      return `<Row>${cells}</Row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="header">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#2563EB" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Report ${xmlEscape(month)}">
  <Table>
${EXPORT_COLUMNS.map(
    () => `<Column ss:Width="110"/>`
  ).join("")}
   <Row>${headerCells}</Row>
   ${bodyRows}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <FreezePanes/>
   <SplitHorizontal>1</SplitHorizontal>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`;
}

/** File name: current month is provisional, closed months finalized. */
export function exportFileName(
  month: string,
  isFinalized: boolean,
  format: "csv" | "xls"
): string {
  const suffix = isFinalized ? "" : "-provisional";
  return `attendance-report-${month}${suffix}.${format}`;
}

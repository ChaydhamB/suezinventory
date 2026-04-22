import * as XLSX from "xlsx";

/** Export an array of plain objects (rows) as a single-sheet XLSX file. */
export function exportRowsXLSX(rows: Record<string, any>[], sheetName: string, fileBase: string) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "(vide)": "" }]);
  const safe = sheetName.replace(/[\\/?*[\]:]/g, "_").slice(0, 28) || "Feuille";
  XLSX.utils.book_append_sheet(wb, ws, safe);
  const stamp = new Date().toISOString().split("T")[0];
  XLSX.writeFile(wb, `${fileBase}_${stamp}.xlsx`);
}

/** Parse a CSV (or simple XLSX) file uploaded by the user into row objects. */
export async function parseSheetFile(file: File): Promise<Record<string, any>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
}

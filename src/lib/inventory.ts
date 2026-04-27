import seed from "@/data/seed.json";
import * as XLSX from "xlsx";

export type Item = {
  id: string;
  cat: string;
  name: string;
  ref: string;
  supplier: string;
  unitPrice: number;
  stock: number;
  consSfax?: number;
};

export type Transaction = {
  id: string;
  type: "in" | "out";
  itemId: string;
  qty: number;
  date: string;
  note?: string;
  armoireId?: string;
};

export type Armoire = { id: string; name: string };

export type HistoryEntry = { date: string; time?: string; desig: string; ref: string; qty: string; txId?: string; type?: "in" | "out" };

export type PurchaseEntry = { id: string; itemId: string; qty: number; note?: string; date: string };

const LS = {
  items: "atelier.items",
  tx: "atelier.tx",
  armoires: "atelier.armoires",
  cats: "atelier.cats",
  history: "atelier.history",
  purchases: "atelier.purchases",
};

export const ADMIN_PASSWORD = "atelier2024";

export const DEFAULT_ARMOIRES: Armoire[] = [{ id: "arm1", name: "Sfax Nord ACC1" }];

export function loadItems(): Item[] {
  const raw = localStorage.getItem(LS.items);
  if (raw) return JSON.parse(raw);
  return seed.items as Item[];
}
export function saveItems(items: Item[]) {
  localStorage.setItem(LS.items, JSON.stringify(items));
}
export function loadTransactions(): Transaction[] {
  const raw = localStorage.getItem(LS.tx);
  return raw ? JSON.parse(raw) : [];
}
export function saveTransactions(t: Transaction[]) {
  localStorage.setItem(LS.tx, JSON.stringify(t));
}
export function loadArmoires(): Armoire[] {
  const raw = localStorage.getItem(LS.armoires);
  return raw ? JSON.parse(raw) : DEFAULT_ARMOIRES;
}
export function saveArmoires(a: Armoire[]) {
  localStorage.setItem(LS.armoires, JSON.stringify(a));
}
export function loadCustomCats(): string[] {
  const raw = localStorage.getItem(LS.cats);
  return raw ? JSON.parse(raw) : [];
}
export function saveCustomCats(c: string[]) {
  localStorage.setItem(LS.cats, JSON.stringify(c));
}
export function loadHistory(): HistoryEntry[] {
  const raw = localStorage.getItem(LS.history);
  if (raw) return JSON.parse(raw);
  return seed.history as HistoryEntry[];
}
export function saveHistory(h: HistoryEntry[]) {
  localStorage.setItem(LS.history, JSON.stringify(h));
}
export function loadPurchases(): PurchaseEntry[] {
  const raw = localStorage.getItem(LS.purchases);
  return raw ? JSON.parse(raw) : [];
}
export function savePurchases(p: PurchaseEntry[]) {
  localStorage.setItem(LS.purchases, JSON.stringify(p));
}

export function resetAll() {
  Object.values(LS).forEach((k) => localStorage.removeItem(k));
}

export function computeStock(item: Item, transactions: Transaction[]): number {
  const delta = transactions
    .filter((t) => t.itemId === item.id)
    .reduce((s, t) => (t.type === "in" ? s + t.qty : s - t.qty), 0);
  return item.stock + delta;
}

export function fmtPrice(n: number) {
  return (n || 0).toFixed(3) + " DT";
}
export function todayISO() {
  return new Date().toISOString().split("T")[0];
}
export function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function exportXLSX(opts: {
  items: Item[];
  transactions: Transaction[];
  armoires: Armoire[];
  history: HistoryEntry[];
  computeStockFn: (item: Item) => number;
}) {
  const { items, transactions, armoires, history, computeStockFn } = opts;
  const wb = XLSX.utils.book_new();

  const stockRows = items.map((i, idx) => {
    const cur = computeStockFn(i);
    return {
      "N°": idx + 1,
      Catégorie: i.cat,
      Désignation: i.name,
      Référence: i.ref,
      Fournisseur: i.supplier,
      "Prix unitaire (DT)": i.unitPrice,
      "Stock initial": i.stock,
      "Stock actuel": cur,
      Disponible: cur > 0 ? "Oui" : "Non",
      "Valeur stock (DT)": +(cur * i.unitPrice).toFixed(3),
    };
  });
  const wsStock = XLSX.utils.json_to_sheet(stockRows);
  XLSX.utils.book_append_sheet(wb, wsStock, "Stock");

  const txRows = transactions.map((t) => {
    const it = items.find((i) => i.id === t.itemId);
    const arm = armoires.find((a) => a.id === t.armoireId);
    return {
      Date: t.date,
      Type: t.type === "in" ? "Entrée" : "Sortie",
      Article: it?.name ?? "?",
      Référence: it?.ref ?? "",
      Catégorie: it?.cat ?? "",
      Quantité: t.qty,
      Armoire: arm?.name ?? "",
      Note: t.note ?? "",
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txRows), "Transactions");

  const histRows = history.map((h, i) => ({ "N°": i + 1, Date: h.date, Désignation: h.desig, Référence: h.ref, Quantité: h.qty }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(histRows), "Historique");

  // Per armoire consumption
  armoires.forEach((arm) => {
    const grouped: Record<string, number> = {};
    transactions.filter((t) => t.type === "out" && t.armoireId === arm.id).forEach((t) => {
      grouped[t.itemId] = (grouped[t.itemId] || 0) + t.qty;
    });
    const rows = Object.entries(grouped).map(([iid, qty]) => {
      const it = items.find((i) => i.id === iid);
      return {
        Catégorie: it?.cat ?? "",
        Article: it?.name ?? "",
        Référence: it?.ref ?? "",
        Quantité: qty,
        "Prix unit. (DT)": it?.unitPrice ?? 0,
        "Coût total (DT)": +((it?.unitPrice ?? 0) * qty).toFixed(3),
      };
    });
    if (rows.length === 0) rows.push({ Catégorie: "", Article: "(aucune sortie)", Référence: "", Quantité: 0, "Prix unit. (DT)": 0, "Coût total (DT)": 0 });
    const ws = XLSX.utils.json_to_sheet(rows);
    const safeName = arm.name.replace(/[\\/?*[\]:]/g, "_").slice(0, 28);
    XLSX.utils.book_append_sheet(wb, ws, safeName || "Armoire");
  });

  const stamp = new Date().toISOString().split("T")[0];
  XLSX.writeFile(wb, `Atelier_Stock_${stamp}.xlsx`);
}

/* ------------------------------------------------------------------ */
/*  Update an existing template (Mise_a_jour_atelier.xlsx layout)      */
/*  - Stock area: cols F..M (header row 3, data row 4+)                */
/*    ref in col I, current stock written to col L                     */
/*  - Armoire consumption: cols P+, header row 3                       */
/*  - History: cols A..D, dated sections stacked vertically            */
/*  All existing cell styles, colors, column widths and merges are     */
/*  preserved. Empty/non-matching cells are left untouched.            */
/* ------------------------------------------------------------------ */
const normRef = (v: unknown) =>
  String(v ?? "").trim().toLowerCase().replace(/\s+/g, "");

/** Write a value into a cell while preserving its existing style (`s`). */
function setCell(ws: XLSX.WorkSheet, addr: string, cell: XLSX.CellObject) {
  const prev = ws[addr] as XLSX.CellObject | undefined;
  const next: XLSX.CellObject = { ...cell };
  if (prev && (prev as any).s !== undefined) (next as any).s = (prev as any).s;
  ws[addr] = next;
}

function updateSheet(
  ws: XLSX.WorkSheet,
  refToItem: Map<string, Item>,
  consMap: Map<string, Map<string, number>>,
  armoires: Armoire[],
  history: HistoryEntry[],
  computeStockFn: (item: Item) => number,
) {
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");

  // Detect stock area: scan rows for a ref in col I that we know
  const stockRows: { r: number; item: Item }[] = [];
  for (let r = 3; r <= Math.min(range.e.r, 5000); r++) {
    const refCell = ws[XLSX.utils.encode_cell({ r, c: 8 })];
    if (!refCell || refCell.v == null) continue;
    const it = refToItem.get(normRef(refCell.v));
    if (it) stockRows.push({ r, item: it });
  }

  // 1) Update col L (current stock) preserving cell style
  stockRows.forEach(({ r, item }) => {
    const stock = computeStockFn(item);
    setCell(ws, XLSX.utils.encode_cell({ r, c: 11 }), { t: "n", v: stock });
  });

  // 2) Armoire columns: detect existing headers from row 3, col P (15) onward
  const armoireColMap = new Map<string, number>();
  const scanEnd = Math.max(range.e.c, 15 + armoires.length + 4);
  for (let c = 15; c <= scanEnd; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 2, c })];
    if (cell && cell.v != null && String(cell.v).trim() !== "") {
      armoireColMap.set(String(cell.v).trim(), c);
    }
  }
  // Add missing armoire columns to the right
  let nextCol = scanEnd + 1;
  armoires.forEach((a) => {
    if (!armoireColMap.has(a.name)) {
      armoireColMap.set(a.name, nextCol);
      // Try to clone style of existing armoire header (col P / r=2)
      const tmpl = ws[XLSX.utils.encode_cell({ r: 2, c: 15 })] as any;
      const cell: any = { t: "s", v: a.name };
      if (tmpl?.s !== undefined) cell.s = tmpl.s;
      ws[XLSX.utils.encode_cell({ r: 2, c: nextCol })] = cell;
      nextCol++;
    }
  });

  // 3) Fill consumption values per armoire/item row (preserve style)
  stockRows.forEach(({ r, item }) => {
    armoires.forEach((a) => {
      const col = armoireColMap.get(a.name)!;
      const qty = consMap.get(a.name)?.get(item.id) ?? 0;
      const addr = XLSX.utils.encode_cell({ r, c: col });
      if (qty > 0) setCell(ws, addr, { t: "n", v: qty });
      else if (!ws[addr]) ws[addr] = { t: "s", v: "" };
    });
  });

  // 4) HISTORY (cols A..D)
  // Find existing date markers in col A and the last used row.
  const existingDates = new Set<string>();
  let lastHistRow = 0;
  // A "date marker" row is a row where col A is a Date or YYYY-MM-DD string
  // and cols B..D are empty (no header row underneath yet processed).
  for (let r = 0; r <= range.e.r; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    if (cell && cell.v != null && String(cell.v).trim() !== "") lastHistRow = r;
    if (!cell) continue;
    const v = cell.v;
    if (v instanceof Date) existingDates.add(v.toISOString().split("T")[0]);
    else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) existingDates.add(v.slice(0, 10));
  }

  // Capture style templates from an existing history block (rows 3 = date, 4 = header, 5 = first data)
  const styleDate = (ws["A3"] as any)?.s;
  const styleHeader = {
    A: (ws["A4"] as any)?.s,
    B: (ws["B4"] as any)?.s,
    C: (ws["C4"] as any)?.s,
    D: (ws["D4"] as any)?.s,
  };
  const styleData = {
    A: (ws["A5"] as any)?.s,
    B: (ws["B5"] as any)?.s,
    C: (ws["C5"] as any)?.s,
    D: (ws["D5"] as any)?.s,
  };

  // Group new history by date; skip dates already present
  const grouped = new Map<string, HistoryEntry[]>();
  history.forEach((h) => {
    if (!h?.date) return;
    if (existingDates.has(h.date)) return;
    if (!grouped.has(h.date)) grouped.set(h.date, []);
    grouped.get(h.date)!.push(h);
  });

  let writeRow = lastHistRow + 2;
  let maxRow = range.e.r;
  Array.from(grouped.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([date, entries]) => {
      // Date marker row
      const dateAddr = XLSX.utils.encode_cell({ r: writeRow, c: 0 });
      const dateCell: any = { t: "d", v: new Date(date), z: "yyyy-mm-dd" };
      if (styleDate !== undefined) dateCell.s = styleDate;
      ws[dateAddr] = dateCell;
      writeRow++;
      // Header row
      ["N°", "Désignation", "Référence", "Quantité"].forEach((h, i) => {
        const a = XLSX.utils.encode_cell({ r: writeRow, c: i });
        const c: any = { t: "s", v: h };
        const st = [styleHeader.A, styleHeader.B, styleHeader.C, styleHeader.D][i];
        if (st !== undefined) c.s = st;
        ws[a] = c;
      });
      writeRow++;
      // Data rows
      entries.forEach((e, idx) => {
        const cells: [number, XLSX.CellObject, any][] = [
          [0, { t: "n", v: idx + 1 }, styleData.A],
          [1, { t: "s", v: e.desig || "" }, styleData.B],
          [2, { t: "s", v: e.ref || "" }, styleData.C],
          [3, { t: "s", v: String(e.qty ?? "") }, styleData.D],
        ];
        cells.forEach(([col, cell, st]) => {
          const a = XLSX.utils.encode_cell({ r: writeRow, c: col });
          const c: any = { ...cell };
          if (st !== undefined) c.s = st;
          ws[a] = c;
        });
        writeRow++;
      });
      writeRow++; // blank separator
    });
  maxRow = Math.max(maxRow, writeRow);

  // Update sheet range to encompass new content (without touching the rest)
  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: maxRow, c: Math.max(range.e.c, nextCol) },
  });
}

export async function updateExistingXLSX(opts: {
  file: File;
  items: Item[];
  transactions: Transaction[];
  armoires: Armoire[];
  history: HistoryEntry[];
  computeStockFn: (item: Item) => number;
}) {
  const { file, items, transactions, armoires, history, computeStockFn } = opts;
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, {
    type: "array",
    cellStyles: true,
    cellFormula: true,
    cellDates: true,
    cellNF: true,
    bookVBA: true,
  });

  // Build ref → item lookup
  const refToItem = new Map<string, Item>();
  items.forEach((it) => {
    const k = normRef(it.ref);
    if (k && k !== "-") refToItem.set(k, it);
  });

  // Pre-compute consumption: armoireName -> itemId -> qty
  const consMap = new Map<string, Map<string, number>>();
  armoires.forEach((a) => consMap.set(a.name, new Map()));
  transactions.filter((t) => t.type === "out" && t.armoireId).forEach((t) => {
    const arm = armoires.find((a) => a.id === t.armoireId);
    if (!arm) return;
    const m = consMap.get(arm.name)!;
    m.set(t.itemId, (m.get(t.itemId) || 0) + t.qty);
  });

  // Update every sheet that looks like the template (has stock layout).
  wb.SheetNames.forEach((sn) => {
    const ws = wb.Sheets[sn];
    if (!ws) return;
    // Only touch sheets that have the stock layout in col I row 3+
    const probe = ws["I3"];
    if (!probe) return;
    updateSheet(ws, refToItem, consMap, armoires, history, computeStockFn);
  });

  const stamp = new Date().toISOString().split("T")[0];
  const baseName = file.name.replace(/\.xlsx$/i, "");
  XLSX.writeFile(wb, `${baseName}_maj_${stamp}.xlsx`, {
    bookType: "xlsx",
    cellStyles: true,
    compression: true,
  });
}

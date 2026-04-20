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
/*  - Keeps original sheet structure & formatting                      */
/*  - Updates stock col (L), armoire consumption cols (P+)             */
/*  - Appends new history sections (cols A-D) per date                 */
/* ------------------------------------------------------------------ */
const normRef = (v: unknown) =>
  String(v ?? "").trim().toLowerCase().replace(/\s+/g, "");

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
  const wb = XLSX.read(buf, { type: "array", cellStyles: true, cellFormula: true, cellDates: true });

  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");

  // 1) Build a ref → item lookup
  const refToItem = new Map<string, Item>();
  items.forEach((it) => {
    const k = normRef(it.ref);
    if (k && k !== "-") refToItem.set(k, it);
  });

  // 2) Walk the Stock area (col I = ref, col L = stock qty, starts row 4)
  //    Update col L with current computed stock.
  for (let r = 3; r <= range.e.r; r++) {
    const refCell = ws[XLSX.utils.encode_cell({ r, c: 8 })]; // col I
    if (!refCell || refCell.v == null) continue;
    const it = refToItem.get(normRef(refCell.v));
    if (!it) continue;
    const stock = computeStockFn(it);
    const addr = XLSX.utils.encode_cell({ r, c: 11 }); // col L
    ws[addr] = { t: "n", v: stock };
  }

  // 3) Armoire columns: header row index 2 (row 3 in Excel) starting col 15 (P)
  //    For each armoire header found, fill consumption per item row.
  const armoireColMap = new Map<string, number>(); // armoireName -> col index
  for (let c = 15; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 2, c })];
    if (cell && cell.v) armoireColMap.set(String(cell.v).trim(), c);
  }

  // Pre-compute consumption: armoireName -> itemId -> qty
  const consMap = new Map<string, Map<string, number>>();
  armoires.forEach((a) => consMap.set(a.name, new Map()));
  transactions.filter((t) => t.type === "out" && t.armoireId).forEach((t) => {
    const arm = armoires.find((a) => a.id === t.armoireId);
    if (!arm) return;
    const m = consMap.get(arm.name)!;
    m.set(t.itemId, (m.get(t.itemId) || 0) + t.qty);
  });

  // Add missing armoire columns to the right
  let nextCol = Math.max(range.e.c + 1, 15);
  armoires.forEach((a) => {
    if (!armoireColMap.has(a.name)) {
      armoireColMap.set(a.name, nextCol);
      ws[XLSX.utils.encode_cell({ r: 2, c: nextCol })] = { t: "s", v: a.name };
      nextCol++;
    }
  });

  // Fill consumption values aligned to stock rows
  for (let r = 3; r <= range.e.r; r++) {
    const refCell = ws[XLSX.utils.encode_cell({ r, c: 8 })];
    if (!refCell || refCell.v == null) continue;
    const it = refToItem.get(normRef(refCell.v));
    if (!it) continue;
    armoires.forEach((a) => {
      const col = armoireColMap.get(a.name)!;
      const qty = consMap.get(a.name)?.get(it.id) ?? 0;
      const addr = XLSX.utils.encode_cell({ r, c: col });
      ws[addr] = qty > 0 ? { t: "n", v: qty } : { t: "s", v: "" };
    });
  }

  // 4) History append (cols A-D). Find last used row in col A.
  let lastHistRow = 0;
  for (let r = 0; r <= range.e.r; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    if (cell && cell.v != null && String(cell.v).trim() !== "") lastHistRow = r;
  }

  // Existing dates already present in the template (col A as date or string)
  const existingDates = new Set<string>();
  for (let r = 0; r <= lastHistRow; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    if (!cell) continue;
    const v = cell.v;
    if (v instanceof Date) existingDates.add(v.toISOString().split("T")[0]);
    else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) existingDates.add(v.slice(0, 10));
  }

  // Group new history by date, skip dates already present
  const grouped = new Map<string, HistoryEntry[]>();
  history.forEach((h) => {
    if (existingDates.has(h.date)) return;
    if (!grouped.has(h.date)) grouped.set(h.date, []);
    grouped.get(h.date)!.push(h);
  });

  let writeRow = lastHistRow + 2;
  Array.from(grouped.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([date, entries]) => {
      ws[XLSX.utils.encode_cell({ r: writeRow, c: 0 })] = { t: "d", v: new Date(date) };
      writeRow++;
      ["N°", "Désignation", "Référence", "Quantité"].forEach((h, i) => {
        ws[XLSX.utils.encode_cell({ r: writeRow, c: i })] = { t: "s", v: h };
      });
      writeRow++;
      entries.forEach((e, idx) => {
        ws[XLSX.utils.encode_cell({ r: writeRow, c: 0 })] = { t: "n", v: idx + 1 };
        ws[XLSX.utils.encode_cell({ r: writeRow, c: 1 })] = { t: "s", v: e.desig };
        ws[XLSX.utils.encode_cell({ r: writeRow, c: 2 })] = { t: "s", v: e.ref || "" };
        ws[XLSX.utils.encode_cell({ r: writeRow, c: 3 })] = { t: "s", v: String(e.qty) };
        writeRow++;
      });
      writeRow++; // blank line between dates
    });

  // Update sheet range to encompass new content
  const newRange = {
    s: { r: 0, c: 0 },
    e: { r: Math.max(range.e.r, writeRow), c: Math.max(range.e.c, nextCol) },
  };
  ws["!ref"] = XLSX.utils.encode_range(newRange);

  const stamp = new Date().toISOString().split("T")[0];
  const baseName = file.name.replace(/\.xlsx$/i, "");
  XLSX.writeFile(wb, `${baseName}_maj_${stamp}.xlsx`);
}

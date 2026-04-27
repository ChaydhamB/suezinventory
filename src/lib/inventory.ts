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
/*  Update an existing template using ExcelJS to FULLY preserve        */
/*  styles (fills, fonts, borders, number formats, column widths,      */
/*  merges, images). Layout assumed:                                   */
/*   - Stock: ref in col I, write current stock into col L (data 4+)   */
/*   - Armoire consumption: headers on row 3 from col P (16) onward    */
/*   - History: cols A..D, dated sections stacked vertically           */
/* ------------------------------------------------------------------ */
const normRef = (v: unknown) => {
  if (v == null) return "";
  // ExcelJS rich text / hyperlink cell values
  if (typeof v === "object") {
    const anyV = v as any;
    if (anyV.richText) return normRef(anyV.richText.map((p: any) => p.text).join(""));
    if (anyV.text) return normRef(anyV.text);
    if (anyV.result != null) return normRef(anyV.result);
    if (anyV.hyperlink && anyV.text) return normRef(anyV.text);
  }
  return String(v).trim().toLowerCase().replace(/\s+/g, "");
};

export async function updateExistingXLSX(opts: {
  file: File;
  items: Item[];
  transactions: Transaction[];
  armoires: Armoire[];
  history: HistoryEntry[];
  computeStockFn: (item: Item) => number;
}) {
  const { file, items, armoires, history, computeStockFn } = opts;
  const ExcelJS = (await import("exceljs")).default;

  const buf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  // ref → item lookup
  const refToItem = new Map<string, Item>();
  items.forEach((it) => {
    const k = normRef(it.ref);
    if (k && k !== "-") refToItem.set(k, it);
  });

  // armoireName → itemId → qty
  const consMap = new Map<string, Map<string, number>>();
  armoires.forEach((a) => consMap.set(a.name, new Map()));
  opts.transactions
    .filter((t) => t.type === "out" && t.armoireId)
    .forEach((t) => {
      const arm = armoires.find((a) => a.id === t.armoireId);
      if (!arm) return;
      const m = consMap.get(arm.name)!;
      m.set(t.itemId, (m.get(t.itemId) || 0) + t.qty);
    });

  wb.eachSheet((ws) => {
    // Skip sheets without a stock layout (probe I3)
    const probe = ws.getCell(3, 9).value;
    if (probe == null || probe === "") return;

    // 1) Find rows whose col I matches a known reference, update col L
    const stockRows: { row: number; item: Item }[] = [];
    const lastRow = Math.min(ws.actualRowCount + 50, 5000);
    for (let r = 4; r <= lastRow; r++) {
      const refVal = ws.getCell(r, 9).value;
      const it = refToItem.get(normRef(refVal));
      if (!it) continue;
      stockRows.push({ row: r, item: it });
      const target = ws.getCell(r, 12); // col L
      target.value = computeStockFn(it);
      // numFmt is preserved from template
    }

    // 2) Detect existing armoire columns at row 3 (col P=16 onward)
    const armoireCol = new Map<string, number>();
    const headerRow = ws.getRow(3);
    const scanEnd = Math.max(ws.actualColumnCount, 16 + armoires.length + 4);
    for (let c = 16; c <= scanEnd; c++) {
      const v = headerRow.getCell(c).value;
      const s = v == null ? "" : String((v as any).richText
        ? (v as any).richText.map((p: any) => p.text).join("")
        : (v as any).text ?? v).trim();
      if (s) armoireCol.set(s, c);
    }

    // Add missing armoire columns, copying header style from col P
    let nextCol = scanEnd + 1;
    const tmplHeader = headerRow.getCell(16);
    armoires.forEach((a) => {
      if (!armoireCol.has(a.name)) {
        const c = headerRow.getCell(nextCol);
        c.value = a.name;
        if (tmplHeader.style) c.style = JSON.parse(JSON.stringify(tmplHeader.style));
        armoireCol.set(a.name, nextCol);
        nextCol++;
      }
    });

    // 3) Fill consumption per row/armoire (preserve any existing cell style)
    stockRows.forEach(({ row, item }) => {
      armoires.forEach((a) => {
        const col = armoireCol.get(a.name)!;
        const qty = consMap.get(a.name)?.get(item.id) ?? 0;
        if (qty > 0) ws.getCell(row, col).value = qty;
      });
    });

    // 4) HISTORY (cols A..D)
    const existingDates = new Set<string>();
    let lastHistRow = 0;
    for (let r = 1; r <= ws.actualRowCount; r++) {
      const v = ws.getCell(r, 1).value;
      if (v == null || v === "") continue;
      lastHistRow = r;
      if (v instanceof Date) existingDates.add(v.toISOString().split("T")[0]);
      else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v))
        existingDates.add(v.slice(0, 10));
    }

    // Capture style templates from rows 3 (date), 4 (header), 5 (data)
    const cloneStyle = (cell: any) =>
      cell?.style ? JSON.parse(JSON.stringify(cell.style)) : undefined;
    const styleDate = cloneStyle(ws.getCell(3, 1));
    const styleHeader = [1, 2, 3, 4].map((c) => cloneStyle(ws.getCell(4, c)));
    const styleData = [1, 2, 3, 4].map((c) => cloneStyle(ws.getCell(5, c)));

    const grouped = new Map<string, HistoryEntry[]>();
    history.forEach((h) => {
      if (!h?.date || existingDates.has(h.date)) return;
      if (!grouped.has(h.date)) grouped.set(h.date, []);
      grouped.get(h.date)!.push(h);
    });

    let writeRow = lastHistRow + 2;
    Array.from(grouped.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([date, entries]) => {
        const dCell = ws.getCell(writeRow, 1);
        dCell.value = new Date(date);
        if (styleDate) dCell.style = JSON.parse(JSON.stringify(styleDate));
        else dCell.numFmt = "yyyy-mm-dd";
        writeRow++;

        ["N°", "Désignation", "Référence", "Quantité"].forEach((h, i) => {
          const c = ws.getCell(writeRow, i + 1);
          c.value = h;
          if (styleHeader[i]) c.style = JSON.parse(JSON.stringify(styleHeader[i]));
        });
        writeRow++;

        entries.forEach((e, idx) => {
          const vals: any[] = [idx + 1, e.desig || "", e.ref || "", e.qty ?? ""];
          vals.forEach((val, i) => {
            const c = ws.getCell(writeRow, i + 1);
            c.value = val;
            if (styleData[i]) c.style = JSON.parse(JSON.stringify(styleData[i]));
          });
          writeRow++;
        });
        writeRow++; // blank separator
      });
  });

  const out = await wb.xlsx.writeBuffer();
  const stamp = new Date().toISOString().split("T")[0];
  const baseName = file.name.replace(/\.xlsx$/i, "");
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${baseName}_maj_${stamp}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

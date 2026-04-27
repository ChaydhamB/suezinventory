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
  onProgress?: (msg: string) => void;
}) {
  const { file, items, transactions, armoires, history, computeStockFn, onProgress } = opts;
  const buffer = await file.arrayBuffer();

  // Precompute current stock so the worker doesn't need the function reference
  const stockMap: Record<string, number> = {};
  items.forEach((it) => (stockMap[it.id] = computeStockFn(it)));

  const worker = new Worker(
    new URL("../workers/excelUpdate.worker.ts", import.meta.url),
    { type: "module" }
  );

  return new Promise<void>((resolve, reject) => {
    worker.onmessage = (ev: MessageEvent<any>) => {
      const { type } = ev.data || {};
      if (type === "progress") {
        onProgress?.(ev.data.message);
      } else if (type === "done") {
        const stamp = new Date().toISOString().split("T")[0];
        const baseName = file.name.replace(/\.xlsx$/i, "");
        const blob = new Blob([ev.data.buffer], {
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
        worker.terminate();
        resolve();
      } else if (type === "error") {
        worker.terminate();
        reject(new Error(ev.data.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || "Worker error"));
    };

    worker.postMessage(
      {
        buffer,
        fileName: file.name,
        items,
        transactions,
        armoires,
        history,
        stockMap,
      },
      [buffer]
    );
  });
}

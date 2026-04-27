/// <reference lib="webworker" />
import ExcelJS from "exceljs";

type Item = {
  id: string;
  cat: string;
  name: string;
  ref: string;
  supplier: string;
  unitPrice: number;
  stock: number;
};
type Transaction = {
  id: string;
  type: "in" | "out";
  itemId: string;
  qty: number;
  date: string;
  armoireId?: string;
};
type Armoire = { id: string; name: string };
type HistoryEntry = { date: string; desig: string; ref: string; qty: string };

type Payload = {
  buffer: ArrayBuffer;
  fileName: string;
  items: Item[];
  transactions: Transaction[];
  armoires: Armoire[];
  history: HistoryEntry[];
  stockMap: Record<string, number>; // itemId → current stock
};

const normRef = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    const anyV = v as any;
    if (anyV.richText) return normRef(anyV.richText.map((p: any) => p.text).join(""));
    if (anyV.text) return normRef(anyV.text);
    if (anyV.result != null) return normRef(anyV.result);
  }
  return String(v).trim().toLowerCase().replace(/\s+/g, "");
};

const post = (type: string, data?: any) =>
  (self as unknown as Worker).postMessage({ type, ...data });

self.onmessage = async (ev: MessageEvent<Payload>) => {
  try {
    const { buffer, fileName, items, transactions, armoires, history, stockMap } = ev.data;
    post("progress", { message: "Lecture du fichier…" });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);

    const refToItem = new Map<string, Item>();
    items.forEach((it) => {
      const k = normRef(it.ref);
      if (k && k !== "-") refToItem.set(k, it);
    });

    const consMap = new Map<string, Map<string, number>>();
    armoires.forEach((a) => consMap.set(a.name, new Map()));
    transactions
      .filter((t) => t.type === "out" && t.armoireId)
      .forEach((t) => {
        const arm = armoires.find((a) => a.id === t.armoireId);
        if (!arm) return;
        const m = consMap.get(arm.name)!;
        m.set(t.itemId, (m.get(t.itemId) || 0) + t.qty);
      });

    post("progress", { message: "Mise à jour des feuilles…" });

    wb.eachSheet((ws) => {
      const probe = ws.getCell(3, 9).value;
      if (probe == null || probe === "") return;

      const stockRows: { row: number; item: Item }[] = [];
      const lastRow = Math.min(ws.actualRowCount + 50, 5000);
      for (let r = 4; r <= lastRow; r++) {
        const refVal = ws.getCell(r, 9).value;
        const it = refToItem.get(normRef(refVal));
        if (!it) continue;
        stockRows.push({ row: r, item: it });
        ws.getCell(r, 12).value = stockMap[it.id] ?? it.stock;
      }

      const armoireCol = new Map<string, number>();
      const headerRow = ws.getRow(3);
      const scanEnd = Math.max(ws.actualColumnCount, 16 + armoires.length + 4);
      for (let c = 16; c <= scanEnd; c++) {
        const v = headerRow.getCell(c).value;
        const s =
          v == null
            ? ""
            : String(
                (v as any).richText
                  ? (v as any).richText.map((p: any) => p.text).join("")
                  : (v as any).text ?? v
              ).trim();
        if (s) armoireCol.set(s, c);
      }

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

      stockRows.forEach(({ row, item }) => {
        armoires.forEach((a) => {
          const col = armoireCol.get(a.name)!;
          const qty = consMap.get(a.name)?.get(item.id) ?? 0;
          if (qty > 0) ws.getCell(row, col).value = qty;
        });
      });

      // History
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
          writeRow++;
        });
    });

    post("progress", { message: "Génération du fichier…" });
    const out = await wb.xlsx.writeBuffer();
    (self as unknown as Worker).postMessage(
      { type: "done", buffer: out, fileName },
      [out as ArrayBuffer]
    );
  } catch (err: any) {
    post("error", { message: err?.message || String(err) });
  }
};

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
  stockMap: Record<string, number>;
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

const cellText = (v: any): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    if (v.richText) return v.richText.map((p: any) => p.text).join("");
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
  }
  return String(v);
};

const post = (type: string, data?: any) =>
  (self as unknown as Worker).postMessage({ type, ...data });

const yieldTick = () => new Promise<void>((r) => setTimeout(r, 0));

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

    const sheets: ExcelJS.Worksheet[] = [];
    wb.eachSheet((ws) => sheets.push(ws));

    for (let si = 0; si < sheets.length; si++) {
      const ws = sheets[si];
      post("progress", {
        message: `Feuille ${si + 1}/${sheets.length}: ${ws.name}…`,
      });
      await yieldTick();

      try {
        // Detect stock-like sheet: header in I3 must be non-empty
        const probe = cellText(ws.getCell(3, 9).value).trim();
        const isStockSheet = !!probe;

        if (isStockSheet) {
          // ---- 1. Update stock col L by ref col I ----
          const stockRows: { row: number; item: Item }[] = [];
          const lastRow = Math.min(ws.rowCount || 0, 5000);
          for (let r = 4; r <= lastRow; r++) {
            const refVal = ws.getCell(r, 9).value;
            const it = refToItem.get(normRef(refVal));
            if (!it) continue;
            stockRows.push({ row: r, item: it });
            ws.getCell(r, 12).value = stockMap[it.id] ?? it.stock;
          }

          // ---- 2. Armoire columns from col P (16) ----
          const armoireCol = new Map<string, number>();
          const headerRow = ws.getRow(3);
          const scanEnd = Math.max(ws.columnCount || 16, 16 + armoires.length + 4);
          for (let c = 16; c <= scanEnd; c++) {
            const s = cellText(headerRow.getCell(c).value).trim();
            if (s) armoireCol.set(s, c);
          }

          // Cache header style clone once
          const tmplHeaderStyle = headerRow.getCell(16).style
            ? JSON.parse(JSON.stringify(headerRow.getCell(16).style))
            : undefined;

          let nextCol = scanEnd + 1;
          armoires.forEach((a) => {
            if (!armoireCol.has(a.name)) {
              const c = headerRow.getCell(nextCol);
              c.value = a.name;
              if (tmplHeaderStyle) c.style = tmplHeaderStyle;
              armoireCol.set(a.name, nextCol);
              nextCol++;
            }
          });

          // Write consumption values
          for (let i = 0; i < stockRows.length; i++) {
            const { row, item } = stockRows[i];
            for (const a of armoires) {
              const col = armoireCol.get(a.name)!;
              const qty = consMap.get(a.name)?.get(item.id) ?? 0;
              if (qty > 0) ws.getCell(row, col).value = qty;
            }
            if (i % 200 === 0) await yieldTick();
          }
        }

        // ---- 3. History block (cols A..D) ----
        // Only run on sheets that look like history (col A row 3 is a date)
        const histProbe = ws.getCell(3, 1).value;
        const looksLikeHistory =
          histProbe instanceof Date ||
          (typeof histProbe === "string" && /^\d{4}-\d{2}-\d{2}/.test(histProbe));

        if (looksLikeHistory) {
          const existingDates = new Set<string>();
          let lastHistRow = 0;
          const scanRows = Math.min(ws.rowCount || 0, 5000);
          for (let r = 1; r <= scanRows; r++) {
            const v = ws.getCell(r, 1).value;
            if (v == null || v === "") continue;
            lastHistRow = r;
            if (v instanceof Date) existingDates.add(v.toISOString().split("T")[0]);
            else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v))
              existingDates.add(v.slice(0, 10));
          }

          // Cache styles ONCE
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
          const dateEntries = Array.from(grouped.entries()).sort((a, b) =>
            a[0].localeCompare(b[0])
          );

          for (let di = 0; di < dateEntries.length; di++) {
            const [date, entries] = dateEntries[di];
            const dCell = ws.getCell(writeRow, 1);
            dCell.value = new Date(date);
            if (styleDate) dCell.style = styleDate;
            else dCell.numFmt = "yyyy-mm-dd";
            writeRow++;

            ["N°", "Désignation", "Référence", "Quantité"].forEach((h, i) => {
              const c = ws.getCell(writeRow, i + 1);
              c.value = h;
              if (styleHeader[i]) c.style = styleHeader[i];
            });
            writeRow++;

            for (let ei = 0; ei < entries.length; ei++) {
              const e = entries[ei];
              const vals: any[] = [ei + 1, e.desig || "", e.ref || "", e.qty ?? ""];
              for (let i = 0; i < vals.length; i++) {
                const c = ws.getCell(writeRow, i + 1);
                c.value = vals[i];
                if (styleData[i]) c.style = styleData[i];
              }
              writeRow++;
            }
            writeRow++;
            if (di % 20 === 0) await yieldTick();
          }
        }
      } catch (sheetErr: any) {
        post("progress", {
          message: `⚠ ${ws.name}: ${sheetErr?.message || "ignorée"}`,
        });
      }
    }

    post("progress", { message: "Génération du fichier…" });
    await yieldTick();
    const out = await wb.xlsx.writeBuffer();
    (self as unknown as Worker).postMessage(
      { type: "done", buffer: out, fileName },
      [out as ArrayBuffer]
    );
  } catch (err: any) {
    post("error", { message: err?.message || String(err) });
  }
};

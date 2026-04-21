import { supabase } from "@/integrations/supabase/client";
import seed from "@/data/seed.json";
import type {
  Armoire,
  HistoryEntry,
  Item,
  PurchaseEntry,
  Transaction,
} from "./inventory";
import { DEFAULT_ARMOIRES } from "./inventory";

export type ArmoireComponent = {
  id?: string;
  armoireId: string;
  itemId: string;
  requiredQty: number;
  actualQty: number;
  note?: string;
};

/* ---------- DB row mappers ---------- */
const itemFromRow = (r: any): Item => ({
  id: r.id,
  cat: r.cat,
  name: r.name,
  ref: r.ref ?? "",
  supplier: r.supplier ?? "",
  unitPrice: Number(r.unit_price ?? 0),
  stock: Number(r.stock ?? 0),
  consSfax: r.cons_sfax ?? undefined,
});
const itemToRow = (i: Item) => ({
  id: i.id,
  cat: i.cat,
  name: i.name,
  ref: i.ref ?? "",
  supplier: i.supplier ?? "",
  unit_price: i.unitPrice,
  stock: i.stock,
  cons_sfax: i.consSfax ?? null,
});
const txFromRow = (r: any): Transaction => ({
  id: r.id,
  type: r.type,
  itemId: r.item_id,
  qty: r.qty,
  date: r.date,
  note: r.note ?? undefined,
  armoireId: r.armoire_id ?? undefined,
});
const txToRow = (t: Transaction) => ({
  id: t.id,
  type: t.type,
  item_id: t.itemId,
  qty: t.qty,
  date: t.date,
  note: t.note ?? null,
  armoire_id: t.armoireId ?? null,
});
const histFromRow = (r: any): HistoryEntry & { _id?: string } => ({
  date: r.date,
  time: r.time ?? undefined,
  desig: r.desig,
  ref: r.ref ?? "",
  qty: r.qty ?? "",
  txId: r.tx_id ?? undefined,
  type: r.type ?? undefined,
  _id: r.id,
});
const histToRow = (h: HistoryEntry, position: number) => ({
  date: h.date,
  time: h.time ?? null,
  desig: h.desig,
  ref: h.ref ?? "",
  qty: String(h.qty ?? ""),
  tx_id: h.txId ?? null,
  type: h.type ?? null,
  position,
});
const purFromRow = (r: any): PurchaseEntry => ({
  id: r.id,
  itemId: r.item_id,
  qty: r.qty,
  note: r.note ?? undefined,
  date: r.date,
});
const purToRow = (p: PurchaseEntry) => ({
  id: p.id,
  item_id: p.itemId,
  qty: p.qty,
  note: p.note ?? null,
  date: p.date,
});
const armFromRow = (r: any): Armoire => ({ id: r.id, name: r.name });
const armToRow = (a: Armoire) => ({ id: a.id, name: a.name });

/* ---------- Loaders ---------- */
export async function cloudLoadItems(): Promise<Item[]> {
  const { data, error } = await supabase.from("items").select("*").order("cat");
  if (error) throw error;
  return (data ?? []).map(itemFromRow);
}
export async function cloudLoadTransactions(): Promise<Transaction[]> {
  const { data, error } = await supabase.from("transactions").select("*").order("created_at");
  if (error) throw error;
  return (data ?? []).map(txFromRow);
}
export async function cloudLoadArmoires(): Promise<Armoire[]> {
  const { data, error } = await supabase.from("armoires").select("*").order("created_at");
  if (error) throw error;
  return (data ?? []).map(armFromRow);
}
export async function cloudLoadCustomCats(): Promise<string[]> {
  const { data, error } = await supabase.from("custom_cats").select("name").order("name");
  if (error) throw error;
  return (data ?? []).map((r: any) => r.name);
}
export async function cloudLoadHistory(): Promise<HistoryEntry[]> {
  const { data, error } = await supabase.from("history_entries").select("*").order("position");
  if (error) throw error;
  return (data ?? []).map(histFromRow);
}
export async function cloudLoadPurchases(): Promise<PurchaseEntry[]> {
  const { data, error } = await supabase.from("purchases").select("*").order("created_at");
  if (error) throw error;
  return (data ?? []).map(purFromRow);
}

/* ---------- Replace-all savers (simple & correct) ---------- */
async function replaceTable(table: string, rows: any[]) {
  // delete all then insert (small dataset, fine for shared workspace)
  const { error: dErr } = await supabase.from(table).delete().not("id", "is", null);
  if (dErr) throw dErr;
  if (rows.length === 0) return;
  const { error: iErr } = await supabase.from(table).insert(rows);
  if (iErr) throw iErr;
}

export async function cloudSaveItems(items: Item[]) {
  await replaceTable("items", items.map(itemToRow));
}
export async function cloudSaveTransactions(tx: Transaction[]) {
  await replaceTable("transactions", tx.map(txToRow));
}
export async function cloudSaveArmoires(arms: Armoire[]) {
  await replaceTable("armoires", arms.map(armToRow));
}
export async function cloudSaveCustomCats(cats: string[]) {
  // primary key is name, no id
  const { error: dErr } = await supabase.from("custom_cats").delete().not("name", "is", null);
  if (dErr) throw dErr;
  if (cats.length === 0) return;
  const { error: iErr } = await supabase.from("custom_cats").insert(cats.map((name) => ({ name })));
  if (iErr) throw iErr;
}
export async function cloudSaveHistory(history: HistoryEntry[]) {
  // history uses uuid id; full replace
  const { error: dErr } = await supabase.from("history_entries").delete().not("id", "is", null);
  if (dErr) throw dErr;
  if (history.length === 0) return;
  const rows = history.map((h, i) => histToRow(h, i));
  const { error: iErr } = await supabase.from("history_entries").insert(rows);
  if (iErr) throw iErr;
}
export async function cloudSavePurchases(p: PurchaseEntry[]) {
  await replaceTable("purchases", p.map(purToRow));
}

/* ---------- Armoire components ---------- */
export async function cloudLoadArmoireComponents(): Promise<ArmoireComponent[]> {
  const { data, error } = await supabase.from("armoire_components").select("*");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    armoireId: r.armoire_id,
    itemId: r.item_id,
    requiredQty: r.required_qty,
    actualQty: r.actual_qty,
    note: r.note ?? undefined,
  }));
}
export async function cloudUpsertArmoireComponent(c: ArmoireComponent) {
  const row: any = {
    armoire_id: c.armoireId,
    item_id: c.itemId,
    required_qty: c.requiredQty,
    actual_qty: c.actualQty,
    note: c.note ?? null,
  };
  if (c.id) row.id = c.id;
  const { data, error } = await supabase
    .from("armoire_components")
    .upsert(row, { onConflict: "armoire_id,item_id" })
    .select()
    .single();
  if (error) throw error;
  return data;
}
export async function cloudDeleteArmoireComponent(id: string) {
  const { error } = await supabase.from("armoire_components").delete().eq("id", id);
  if (error) throw error;
}

/* ---------- One-time migration from localStorage ---------- */
const MIGRATION_KEY = "ls_migration_v1";
export async function ensureInitialDataMigration() {
  // Check if we've already migrated
  const { data: meta } = await supabase
    .from("app_meta")
    .select("value")
    .eq("key", MIGRATION_KEY)
    .maybeSingle();
  if (meta) return; // already done

  // Check if any data exists in cloud already
  const { count } = await supabase
    .from("items")
    .select("*", { count: "exact", head: true });

  if ((count ?? 0) > 0) {
    // Mark migrated and exit
    await supabase.from("app_meta").insert({ key: MIGRATION_KEY, value: { source: "existing" } });
    return;
  }

  // Pull from localStorage if present, otherwise from seed
  const lsItems = localStorage.getItem("atelier.items");
  const lsTx = localStorage.getItem("atelier.tx");
  const lsArm = localStorage.getItem("atelier.armoires");
  const lsCats = localStorage.getItem("atelier.cats");
  const lsHist = localStorage.getItem("atelier.history");
  const lsPur = localStorage.getItem("atelier.purchases");

  const items: Item[] = lsItems ? JSON.parse(lsItems) : (seed.items as Item[]);
  const transactions: Transaction[] = lsTx ? JSON.parse(lsTx) : [];
  const armoires: Armoire[] = lsArm ? JSON.parse(lsArm) : DEFAULT_ARMOIRES;
  const customCats: string[] = lsCats ? JSON.parse(lsCats) : [];
  const history: HistoryEntry[] = lsHist ? JSON.parse(lsHist) : (seed.history as HistoryEntry[]);
  const purchases: PurchaseEntry[] = lsPur ? JSON.parse(lsPur) : [];

  // Insert (don't use replaceTable — tables are empty)
  if (items.length) {
    const { error } = await supabase.from("items").insert(items.map(itemToRow));
    if (error) throw error;
  }
  if (armoires.length) {
    const { error } = await supabase.from("armoires").insert(armoires.map(armToRow));
    if (error) throw error;
  }
  if (transactions.length) {
    const { error } = await supabase.from("transactions").insert(transactions.map(txToRow));
    if (error) throw error;
  }
  if (customCats.length) {
    const { error } = await supabase.from("custom_cats").insert(customCats.map((name) => ({ name })));
    if (error) throw error;
  }
  if (history.length) {
    const { error } = await supabase
      .from("history_entries")
      .insert(history.map((h, i) => histToRow(h, i)));
    if (error) throw error;
  }
  if (purchases.length) {
    const { error } = await supabase.from("purchases").insert(purchases.map(purToRow));
    if (error) throw error;
  }

  await supabase.from("app_meta").insert({
    key: MIGRATION_KEY,
    value: { source: lsItems ? "localStorage" : "seed", migrated_at: new Date().toISOString() },
  });
}

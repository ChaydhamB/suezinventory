import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ADMIN_PASSWORD,
  Armoire,
  HistoryEntry,
  Item,
  Transaction,
  computeStock as computeStockUtil,
  exportXLSX,
  fmtPrice,
  loadArmoires,
  loadCustomCats,
  loadHistory,
  loadItems,
  loadTransactions,
  resetAll,
  saveArmoires,
  saveCustomCats,
  saveHistory,
  saveItems,
  saveTransactions,
  todayISO,
} from "@/lib/inventory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Box,
  Download,
  LayoutGrid,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Warehouse,
  History as HistoryIcon,
  Search,
  Lock,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function useAdminGate() {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  const [cb, setCb] = useState<(() => void) | null>(null);

  const require = useCallback((fn: () => void) => {
    setCb(() => fn);
    setOpen(true);
    setPw("");
    setErr(false);
  }, []);

  const submit = () => {
    if (pw === ADMIN_PASSWORD) {
      setOpen(false);
      cb?.();
    } else setErr(true);
  };

  const Modal = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4" /> Authentification administrateur
          </DialogTitle>
          <DialogDescription>
            Entrez le mot de passe pour effectuer cette modification.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Mot de passe</Label>
          <Input
            type="password"
            value={pw}
            autoFocus
            onChange={(e) => {
              setPw(e.target.value);
              setErr(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          {err && <p className="text-sm text-destructive">Mot de passe incorrect.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={submit}>Confirmer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { require, Modal };
}

/* ------------------------------------------------------------------ */
/*  Item form (create / edit)                                          */
/* ------------------------------------------------------------------ */
function ItemForm({
  item,
  categories,
  onCancel,
  onSubmit,
}: {
  item?: Item | null;
  categories: string[];
  onCancel: () => void;
  onSubmit: (i: Item) => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [cat, setCat] = useState(item?.cat ?? categories[0] ?? "");
  const [ref, setRef] = useState(item?.ref ?? "");
  const [supplier, setSupplier] = useState(item?.supplier ?? "");
  const [unitPrice, setUnitPrice] = useState(String(item?.unitPrice ?? 0));
  const [stock, setStock] = useState(String(item?.stock ?? 0));

  const submit = () => {
    if (!name.trim()) {
      toast.error("Le nom de l'article est requis.");
      return;
    }
    onSubmit({
      id: item?.id ?? uid(),
      name: name.trim(),
      cat: cat || "Autre article",
      ref: ref.trim() || "-",
      supplier: supplier.trim() || "-",
      unitPrice: Number(unitPrice) || 0,
      stock: Number(stock) || 0,
      consSfax: item?.consSfax,
    });
  };

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label>Désignation *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: WDU2.5 BORNIE A VIS 2.5MM" />
        </div>
        <div className="space-y-1.5">
          <Label>Catégorie</Label>
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Référence</Label>
          <Input value={ref} onChange={(e) => setRef(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Fournisseur</Label>
          <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Prix unitaire (DT)</Label>
          <Input type="number" step="0.001" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Stock initial (de base)</Label>
          <Input type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
          <p className="text-xs text-muted-foreground">Le stock actuel = stock de base + entrées − sorties.</p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Annuler</Button>
        <Button onClick={submit}>{item ? "Enregistrer" : "Créer l'article"}</Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main app                                                           */
/* ------------------------------------------------------------------ */
export default function Index() {
  const [items, setItems] = useState<Item[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [armoires, setArmoires] = useState<Armoire[]>([]);
  const [customCats, setCustomCats] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const { require: requireAdmin, Modal: AdminModal } = useAdminGate();

  // Load
  useEffect(() => {
    setItems(loadItems());
    setTransactions(loadTransactions());
    setArmoires(loadArmoires());
    setCustomCats(loadCustomCats());
    setHistory(loadHistory());
    setLoaded(true);
  }, []);

  // Persist
  useEffect(() => { if (loaded) saveItems(items); }, [items, loaded]);
  useEffect(() => { if (loaded) saveTransactions(transactions); }, [transactions, loaded]);
  useEffect(() => { if (loaded) saveArmoires(armoires); }, [armoires, loaded]);
  useEffect(() => { if (loaded) saveCustomCats(customCats); }, [customCats, loaded]);
  useEffect(() => { if (loaded) saveHistory(history); }, [history, loaded]);

  const allCategories = useMemo(() => {
    const fromItems = Array.from(new Set(items.map((i) => i.cat)));
    return Array.from(new Set([...fromItems, ...customCats])).sort();
  }, [items, customCats]);

  const computeStock = useCallback(
    (item: Item) => computeStockUtil(item, transactions),
    [transactions]
  );

  /* ---------- KPI ---------- */
  const kpi = useMemo(() => {
    const totalItems = items.length;
    const lowStock = items.filter((i) => computeStock(i) <= 0).length;
    const totalIn = transactions.filter((t) => t.type === "in").reduce((s, t) => s + t.qty, 0);
    const totalOut = transactions.filter((t) => t.type === "out").reduce((s, t) => s + t.qty, 0);
    const stockValue = items.reduce((s, i) => s + computeStock(i) * i.unitPrice, 0);
    return { totalItems, lowStock, totalIn, totalOut, stockValue };
  }, [items, transactions, computeStock]);

  /* ---------- Actions ---------- */
  const handleExport = () => {
    exportXLSX({ items, transactions, armoires, history, computeStockFn: computeStock });
    toast.success("Export Excel généré.");
  };

  const handleReset = () => {
    requireAdmin(() => {
      resetAll();
      setItems(loadItems());
      setTransactions(loadTransactions());
      setArmoires(loadArmoires());
      setCustomCats([]);
      setHistory(loadHistory());
      toast.success("Données réinitialisées au catalogue d'origine.");
    });
  };

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {AdminModal}
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Warehouse className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Atelier Stock</h1>
              <p className="text-xs text-muted-foreground">Gestion complète d'inventaire — Sfax</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" /> Export Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RefreshCw className="mr-2 h-4 w-4" /> Réinitialiser
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6">
        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-7">
            <TabsTrigger value="dashboard"><LayoutGrid className="mr-1.5 h-4 w-4" />Tableau</TabsTrigger>
            <TabsTrigger value="stock"><Package className="mr-1.5 h-4 w-4" />Stock</TabsTrigger>
            <TabsTrigger value="in"><ArrowDownToLine className="mr-1.5 h-4 w-4" />Entrées</TabsTrigger>
            <TabsTrigger value="out"><ArrowUpFromLine className="mr-1.5 h-4 w-4" />Sorties</TabsTrigger>
            <TabsTrigger value="armoires"><Box className="mr-1.5 h-4 w-4" />Armoires</TabsTrigger>
            <TabsTrigger value="cats"><LayoutGrid className="mr-1.5 h-4 w-4" />Catégories</TabsTrigger>
            <TabsTrigger value="history"><HistoryIcon className="mr-1.5 h-4 w-4" />Historique</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-4">
            <DashboardView kpi={kpi} items={items} transactions={transactions} computeStock={computeStock} />
          </TabsContent>

          <TabsContent value="stock">
            <StockView
              items={items}
              setItems={setItems}
              categories={allCategories}
              computeStock={computeStock}
              requireAdmin={requireAdmin}
            />
          </TabsContent>

          <TabsContent value="in">
            <IncomingView
              items={items}
              transactions={transactions}
              setTransactions={setTransactions}
              categories={allCategories}
              computeStock={computeStock}
              history={history}
              setHistory={setHistory}
            />
          </TabsContent>

          <TabsContent value="out">
            <OutgoingView
              items={items}
              transactions={transactions}
              setTransactions={setTransactions}
              armoires={armoires}
              categories={allCategories}
              computeStock={computeStock}
              history={history}
              setHistory={setHistory}
            />
          </TabsContent>

          <TabsContent value="armoires">
            <ArmoiresView
              armoires={armoires}
              setArmoires={setArmoires}
              transactions={transactions}
              setTransactions={setTransactions}
              items={items}
              requireAdmin={requireAdmin}
            />
          </TabsContent>

          <TabsContent value="cats">
            <CategoriesView
              categories={allCategories}
              customCats={customCats}
              setCustomCats={setCustomCats}
              items={items}
              setItems={setItems}
              requireAdmin={requireAdmin}
            />
          </TabsContent>

          <TabsContent value="history">
            <HistoryView history={history} setHistory={setHistory} requireAdmin={requireAdmin} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard                                                          */
/* ------------------------------------------------------------------ */
function StatCard({ label, value, icon, sub, tone = "default" }: any) {
  const tones: Record<string, string> = {
    default: "bg-card",
    warn: "bg-destructive/5 border-destructive/30",
    good: "bg-primary/5 border-primary/30",
  };
  return (
    <Card className={tones[tone] || ""}>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className="text-muted-foreground">{icon}</div>
      </CardContent>
    </Card>
  );
}

function DashboardView({ kpi, items, transactions, computeStock }: any) {
  const recent = [...transactions].slice(-10).reverse();
  const low = items.filter((i: Item) => computeStock(i) <= 5).slice(0, 12);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard label="Articles" value={kpi.totalItems} icon={<Package className="h-6 w-6" />} />
        <StatCard label="Stock épuisé" value={kpi.lowStock} icon={<AlertTriangle className="h-6 w-6" />} tone={kpi.lowStock ? "warn" : "default"} />
        <StatCard label="Total entrées" value={kpi.totalIn} icon={<ArrowDownToLine className="h-6 w-6" />} />
        <StatCard label="Total sorties" value={kpi.totalOut} icon={<ArrowUpFromLine className="h-6 w-6" />} />
        <StatCard label="Valeur stock" value={fmtPrice(kpi.stockValue)} icon={<Box className="h-6 w-6" />} tone="good" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transactions récentes</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune transaction.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Article</TableHead>
                    <TableHead className="text-right">Qté</TableHead>
                    <TableHead>Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((t: Transaction) => {
                    const it = items.find((i: Item) => i.id === t.itemId);
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs">{t.date}</TableCell>
                        <TableCell className="text-sm">{it?.name ?? "?"}</TableCell>
                        <TableCell className="text-right font-medium">{t.qty}</TableCell>
                        <TableCell>
                          <Badge variant={t.type === "in" ? "default" : "secondary"}>
                            {t.type === "in" ? "Entrée" : "Sortie"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Stock faible
            </CardTitle>
          </CardHeader>
          <CardContent>
            {low.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tout le stock est suffisant.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Article</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {low.map((i: Item) => (
                    <TableRow key={i.id}>
                      <TableCell className="text-sm">{i.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{i.cat}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={computeStock(i) <= 0 ? "destructive" : "secondary"}>
                          {computeStock(i)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stock view: full CRUD                                              */
/* ------------------------------------------------------------------ */
function StockView({ items, setItems, categories, computeStock, requireAdmin }: any) {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [editing, setEditing] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = items.filter((i: Item) => {
    if (catFilter !== "all" && i.cat !== catFilter) return false;
    if (stockFilter === "out" && computeStock(i) > 0) return false;
    if (stockFilter === "low" && (computeStock(i) <= 0 || computeStock(i) > 5)) return false;
    if (stockFilter === "ok" && computeStock(i) <= 5) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!i.name.toLowerCase().includes(q) && !i.ref.toLowerCase().includes(q) && !i.supplier.toLowerCase().includes(q))
        return false;
    }
    return true;
  });

  const onCreate = (data: Item) =>
    requireAdmin(() => {
      setItems([...items, data]);
      toast.success(`Article "${data.name}" ajouté.`);
      setCreating(false);
    });

  const onUpdate = (data: Item) =>
    requireAdmin(() => {
      setItems(items.map((i: Item) => (i.id === data.id ? data : i)));
      toast.success("Article mis à jour.");
      setEditing(null);
    });

  const onDelete = (i: Item) =>
    requireAdmin(() => {
      if (!confirm(`Supprimer "${i.name}" ? Cette action est irréversible.`)) return;
      setItems(items.filter((x: Item) => x.id !== i.id));
      toast.success("Article supprimé.");
    });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Catalogue stock</CardTitle>
          <CardDescription>{filtered.length} article(s) affiché(s) sur {items.length}</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="w-56 pl-8"
              placeholder="Rechercher (nom, réf, fournisseur)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes catégories</SelectItem>
              {categories.map((c: string) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={stockFilter} onValueChange={setStockFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les stocks</SelectItem>
              <SelectItem value="ok">Stock OK (&gt;5)</SelectItem>
              <SelectItem value="low">Stock faible (1-5)</SelectItem>
              <SelectItem value="out">Épuisé (≤0)</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Nouvel article
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Catégorie</TableHead>
                <TableHead>Désignation</TableHead>
                <TableHead>Référence</TableHead>
                <TableHead>Fournisseur</TableHead>
                <TableHead className="text-right">Prix unit.</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Valeur</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((i: Item) => {
                const s = computeStock(i);
                return (
                  <TableRow key={i.id}>
                    <TableCell><Badge variant="outline">{i.cat}</Badge></TableCell>
                    <TableCell className="font-medium">{i.name}</TableCell>
                    <TableCell className="text-xs">{i.ref}</TableCell>
                    <TableCell className="text-xs">{i.supplier}</TableCell>
                    <TableCell className="text-right text-sm">{fmtPrice(i.unitPrice)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={s <= 0 ? "destructive" : s <= 5 ? "secondary" : "default"}>{s}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm">{fmtPrice(s * i.unitPrice)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setEditing(i)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => onDelete(i)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    Aucun article trouvé.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Nouvel article</DialogTitle>
            <DialogDescription>Ajouter un élément au catalogue stock.</DialogDescription>
          </DialogHeader>
          <ItemForm categories={categories} onCancel={() => setCreating(false)} onSubmit={onCreate} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Modifier l'article</DialogTitle>
            <DialogDescription>Tous les champs peuvent être édités.</DialogDescription>
          </DialogHeader>
          {editing && (
            <ItemForm
              item={editing}
              categories={categories}
              onCancel={() => setEditing(null)}
              onSubmit={onUpdate}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Incoming                                                           */
/* ------------------------------------------------------------------ */
function IncomingView({ items, transactions, setTransactions, categories, computeStock, history, setHistory }: any) {
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());
  const [catFilter, setCatFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = items.filter((i: Item) => {
    if (catFilter !== "all" && i.cat !== catFilter) return false;
    if (search && !i.name.toLowerCase().includes(search.toLowerCase()) && !i.ref.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  const submit = () => {
    if (!itemId || !qty || Number(qty) <= 0) {
      toast.error("Sélectionnez un article et une quantité valide.");
      return;
    }
    const txId = uid();
    const tx: Transaction = { id: txId, type: "in", itemId, qty: Number(qty), note, date };
    setTransactions([...transactions, tx]);
    const it = items.find((i: Item) => i.id === itemId);
    setHistory([...history, { date, desig: `[ENTRÉE] ${it?.name ?? "?"}`, ref: it?.ref ?? "", qty: `+${qty}`, txId, type: "in" }]);
    toast.success(`+${qty} × "${it?.name}" ajouté(s).`);
    setItemId(""); setQty(""); setNote(""); setDate(todayISO());
  };

  const removeTx = (txId: string) => {
    if (!confirm("Supprimer cette entrée ? Le stock sera restauré.")) return;
    setTransactions(transactions.filter((t: Transaction) => t.id !== txId));
    setHistory(history.filter((h: HistoryEntry) => h.txId !== txId));
    toast.success("Entrée supprimée.");
  };

  const recent = [...transactions].filter((t: Transaction) => t.type === "in").slice(-10).reverse();
  const selectedItem = items.find((i: Item) => i.id === itemId);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ArrowDownToLine className="h-5 w-5" /> Nouvelle entrée</CardTitle>
          <CardDescription>Enregistrer une réception de stock.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Catégorie</Label>
              <Select value={catFilter} onValueChange={(v) => { setCatFilter(v); setItemId(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {categories.map((c: string) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Recherche</Label>
              <Input placeholder="Nom ou réf…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Article *</Label>
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {filtered.map((i: Item) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name} [{i.ref}] — stock: {computeStock(i)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Quantité reçue *</Label>
              <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Note (optionnel)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {selectedItem && (
            <div className="rounded-md bg-muted p-3 text-sm">
              Stock actuel: <strong>{computeStock(selectedItem)}</strong> →{" "}
              <strong>{computeStock(selectedItem) + Number(qty || 0)}</strong>
            </div>
          )}
          <Button onClick={submit} className="w-full">
            <Plus className="mr-1.5 h-4 w-4" /> Enregistrer l'entrée
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dernières entrées</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune entrée enregistrée.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Article</TableHead>
                  <TableHead className="text-right">Qté</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((t: Transaction) => {
                  const it = items.find((i: Item) => i.id === t.itemId);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs">{t.date}</TableCell>
                      <TableCell className="text-sm">{it?.name ?? "?"}</TableCell>
                      <TableCell className="text-right font-medium text-primary">+{t.qty}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.note || "—"}</TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => removeTx(t.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Outgoing                                                           */
/* ------------------------------------------------------------------ */
function OutgoingView({ items, transactions, setTransactions, armoires, categories, computeStock, history, setHistory }: any) {
  const [itemId, setItemId] = useState("");
  const [armoireId, setArmoireId] = useState(armoires[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());
  const [catFilter, setCatFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!armoireId && armoires[0]) setArmoireId(armoires[0].id);
  }, [armoires, armoireId]);

  const filtered = items.filter((i: Item) => {
    if (catFilter !== "all" && i.cat !== catFilter) return false;
    if (search && !i.name.toLowerCase().includes(search.toLowerCase()) && !i.ref.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  const selectedItem = items.find((i: Item) => i.id === itemId);
  const stockNow = selectedItem ? computeStock(selectedItem) : 0;

  const submit = () => {
    if (!itemId || !armoireId || !qty || Number(qty) <= 0) {
      toast.error("Veuillez remplir tous les champs obligatoires.");
      return;
    }
    if (Number(qty) > stockNow) {
      toast.error(`Stock insuffisant. Disponible: ${stockNow}`);
      return;
    }
    const txId = uid();
    const tx: Transaction = { id: txId, type: "out", itemId, armoireId, qty: Number(qty), note, date };
    const it = items.find((i: Item) => i.id === itemId);
    const arm = armoires.find((a: Armoire) => a.id === armoireId);
    setTransactions((prev: Transaction[]) => [...prev, tx]);
    setHistory((prev: HistoryEntry[]) => [...prev, { date, desig: `[SORTIE → ${arm?.name ?? "?"}] ${it?.name ?? "?"}`, ref: it?.ref ?? "", qty: `-${qty}`, txId, type: "out" }]);
    toast.success(`-${qty} × "${it?.name}" → "${arm?.name}".`);
    setItemId(""); setQty(""); setNote(""); setDate(todayISO());
  };

  const removeTx = (txId: string) => {
    if (!confirm("Supprimer cette sortie ? Le stock sera restauré.")) return;
    setTransactions(transactions.filter((t: Transaction) => t.id !== txId));
    setHistory(history.filter((h: HistoryEntry) => h.txId !== txId));
    toast.success("Sortie supprimée.");
  };

  const recent = [...transactions].filter((t: Transaction) => t.type === "out").slice(-10).reverse();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ArrowUpFromLine className="h-5 w-5" /> Nouvelle sortie</CardTitle>
          <CardDescription>Sortir des articles vers une armoire.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Armoire de destination *</Label>
            <Select value={armoireId} onValueChange={setArmoireId}>
              <SelectTrigger><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
              <SelectContent>
                {armoires.map((a: Armoire) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Catégorie</Label>
              <Select value={catFilter} onValueChange={(v) => { setCatFilter(v); setItemId(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {categories.map((c: string) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Recherche</Label>
              <Input placeholder="Nom ou réf…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Article *</Label>
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {filtered.map((i: Item) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name} [{i.ref}] — dispo: {computeStock(i)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Quantité sortie *</Label>
              <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Note (optionnel)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {selectedItem && (
            <div className={`rounded-md p-3 text-sm ${Number(qty) > stockNow ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>
              Stock: <strong>{stockNow}</strong> →{" "}
              <strong>{stockNow - Number(qty || 0)}</strong>
              {Number(qty) > stockNow && " — ⚠ Stock insuffisant!"}
            </div>
          )}
          <Button onClick={submit} className="w-full" variant="default">
            <ArrowUpFromLine className="mr-1.5 h-4 w-4" /> Enregistrer la sortie
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dernières sorties</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune sortie enregistrée.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Article</TableHead>
                  <TableHead className="text-right">Qté</TableHead>
                  <TableHead>Armoire</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((t: Transaction) => {
                  const it = items.find((i: Item) => i.id === t.itemId);
                  const arm = armoires.find((a: Armoire) => a.id === t.armoireId);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs">{t.date}</TableCell>
                      <TableCell className="text-sm">{it?.name ?? "?"}</TableCell>
                      <TableCell className="text-right font-medium text-destructive">-{t.qty}</TableCell>
                      <TableCell className="text-xs">{arm?.name ?? "?"}</TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => removeTx(t.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Armoires                                                           */
/* ------------------------------------------------------------------ */
function ArmoiresView({ armoires, setArmoires, transactions, setTransactions, items, requireAdmin }: any) {
  const [selected, setSelected] = useState(armoires[0]?.id ?? null);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    if (!selected && armoires[0]) setSelected(armoires[0].id);
  }, [armoires, selected]);

  const add = () => {
    if (!newName.trim()) return;
    requireAdmin(() => {
      const a: Armoire = { id: uid(), name: newName.trim() };
      setArmoires([...armoires, a]);
      setSelected(a.id);
      setNewName("");
      toast.success(`Armoire "${a.name}" ajoutée.`);
    });
  };

  const del = (id: string) => {
    requireAdmin(() => {
      const a = armoires.find((x: Armoire) => x.id === id);
      if (!confirm(`Supprimer l'armoire "${a?.name}" et toutes ses sorties ?`)) return;
      setArmoires(armoires.filter((x: Armoire) => x.id !== id));
      setTransactions(transactions.filter((t: Transaction) => t.armoireId !== id));
      setSelected(armoires.filter((x: Armoire) => x.id !== id)[0]?.id ?? null);
      toast.success("Armoire supprimée.");
    });
  };

  const rename = () => {
    if (!renameValue.trim() || !renamingId) return;
    requireAdmin(() => {
      setArmoires(armoires.map((a: Armoire) => (a.id === renamingId ? { ...a, name: renameValue.trim() } : a)));
      setRenamingId(null);
      setRenameValue("");
      toast.success("Armoire renommée.");
    });
  };

  const consumption = useMemo(() => {
    if (!selected) return [];
    const grouped: Record<string, number> = {};
    transactions.filter((t: Transaction) => t.type === "out" && t.armoireId === selected).forEach((t: Transaction) => {
      grouped[t.itemId] = (grouped[t.itemId] || 0) + t.qty;
    });
    return Object.entries(grouped)
      .map(([iid, qty]) => {
        const item = items.find((i: Item) => i.id === iid);
        return item ? { item, qty, total: qty * item.unitPrice } : null;
      })
      .filter(Boolean) as { item: Item; qty: number; total: number }[];
  }, [selected, transactions, items]);

  const total = consumption.reduce((s, c) => s + c.total, 0);
  const totalQty = consumption.reduce((s, c) => s + c.qty, 0);
  const sel = armoires.find((a: Armoire) => a.id === selected);

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Armoires</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {armoires.map((a: Armoire) => (
            <div
              key={a.id}
              onClick={() => setSelected(a.id)}
              className={`flex cursor-pointer items-center justify-between rounded-md p-2 text-sm ${
                selected === a.id ? "bg-primary/10 font-semibold" : "hover:bg-muted"
              }`}
            >
              <span className="flex-1 truncate">{a.name}</span>
              <div className="flex gap-1 opacity-60 hover:opacity-100">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setRenamingId(a.id); setRenameValue(a.name); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); del(a.id); }}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <Input
              placeholder="Nom de l'armoire"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            <Button size="icon" onClick={add}><Plus className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{sel?.name ?? "Aucune armoire"}</CardTitle>
          {sel && (
            <CardDescription>
              {totalQty} unités consommées — Coût total: <strong>{fmtPrice(total)}</strong>
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {!sel ? (
            <p className="text-sm text-muted-foreground">Sélectionnez ou créez une armoire.</p>
          ) : consumption.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun article sorti vers cette armoire.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Article</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead className="text-right">Qté</TableHead>
                  <TableHead className="text-right">Prix unit.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consumption.map(({ item, qty, total }) => (
                  <TableRow key={item.id}>
                    <TableCell><Badge variant="outline">{item.cat}</Badge></TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-xs">{item.ref}</TableCell>
                    <TableCell className="text-right">{qty}</TableCell>
                    <TableCell className="text-right">{fmtPrice(item.unitPrice)}</TableCell>
                    <TableCell className="text-right font-semibold">{fmtPrice(total)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted">
                  <TableCell colSpan={3} className="font-bold">TOTAL</TableCell>
                  <TableCell className="text-right font-bold">{totalQty}</TableCell>
                  <TableCell />
                  <TableCell className="text-right font-bold">{fmtPrice(total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!renamingId} onOpenChange={(o) => !o && setRenamingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renommer l'armoire</DialogTitle>
          </DialogHeader>
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && rename()} autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingId(null)}>Annuler</Button>
            <Button onClick={rename}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Categories                                                         */
/* ------------------------------------------------------------------ */
function CategoriesView({ categories, customCats, setCustomCats, items, setItems, requireAdmin }: any) {
  const [name, setName] = useState("");

  const stats = useMemo(() => {
    const m: Record<string, number> = {};
    categories.forEach((c: string) => (m[c] = 0));
    items.forEach((i: Item) => (m[i.cat] = (m[i.cat] || 0) + 1));
    return m;
  }, [categories, items]);

  const addCat = () => {
    if (!name.trim()) return;
    if (categories.includes(name.trim())) {
      toast.error("Cette catégorie existe déjà.");
      return;
    }
    requireAdmin(() => {
      setCustomCats([...customCats, name.trim()]);
      setName("");
      toast.success(`Catégorie "${name.trim()}" ajoutée.`);
    });
  };

  const renameCat = (oldName: string) => {
    const newName = prompt(`Renommer la catégorie "${oldName}" en :`, oldName);
    if (!newName || newName === oldName) return;
    requireAdmin(() => {
      setItems(items.map((i: Item) => (i.cat === oldName ? { ...i, cat: newName } : i)));
      setCustomCats(customCats.map((c: string) => (c === oldName ? newName : c)));
      toast.success("Catégorie renommée.");
    });
  };

  const deleteCat = (cat: string) => {
    if (stats[cat] > 0) {
      toast.error(`Impossible: ${stats[cat]} article(s) utilisent cette catégorie.`);
      return;
    }
    requireAdmin(() => {
      setCustomCats(customCats.filter((c: string) => c !== cat));
      toast.success("Catégorie supprimée.");
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Catégories</CardTitle>
        <CardDescription>Créez, renommez ou supprimez des catégories d'articles.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input placeholder="Nouvelle catégorie…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCat()} />
          <Button onClick={addCat}><Plus className="mr-1.5 h-4 w-4" /> Ajouter</Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Catégorie</TableHead>
              <TableHead className="text-right">Articles</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((c: string) => (
              <TableRow key={c}>
                <TableCell className="font-medium">{c}</TableCell>
                <TableCell className="text-right"><Badge variant="secondary">{stats[c] || 0}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => renameCat(c)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteCat(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  History                                                            */
/* ------------------------------------------------------------------ */
function HistoryView({ history, setHistory, requireAdmin }: any) {
  const [date, setDate] = useState(todayISO());
  const [desig, setDesig] = useState("");
  const [ref, setRef] = useState("");
  const [qty, setQty] = useState("");

  const add = () => {
    if (!desig.trim()) {
      toast.error("La désignation est requise.");
      return;
    }
    setHistory([...history, { date, desig: desig.trim(), ref: ref.trim(), qty: qty.trim() }]);
    setDesig(""); setRef(""); setQty("");
    toast.success("Entrée historique ajoutée.");
  };

  const del = (idx: number) =>
    requireAdmin(() => {
      setHistory(history.filter((_: HistoryEntry, i: number) => i !== idx));
      toast.success("Entrée supprimée.");
    });

  const grouped = useMemo(() => {
    const m: Record<string, HistoryEntry[]> = {};
    history.forEach((h: HistoryEntry) => {
      if (!m[h.date]) m[h.date] = [];
      m[h.date].push(h);
    });
    return Object.entries(m).sort((a, b) => b[0].localeCompare(a[0]));
  }, [history]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historique des mouvements</CardTitle>
        <CardDescription>Importé du fichier Excel — modifiable.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 rounded-md border p-3 md:grid-cols-[150px_1fr_180px_120px_auto]">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input placeholder="Désignation" value={desig} onChange={(e) => setDesig(e.target.value)} />
          <Input placeholder="Référence" value={ref} onChange={(e) => setRef(e.target.value)} />
          <Input placeholder="Quantité" value={qty} onChange={(e) => setQty(e.target.value)} />
          <Button onClick={add}><Plus className="mr-1.5 h-4 w-4" /> Ajouter</Button>
        </div>

        {grouped.map(([d, entries]) => (
          <div key={d}>
            <div className="mb-2 flex items-center gap-2">
              <Badge>{d}</Badge>
              <span className="text-xs text-muted-foreground">{entries.length} entrée(s)</span>
            </div>
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">N°</TableHead>
                    <TableHead>Désignation</TableHead>
                    <TableHead>Référence</TableHead>
                    <TableHead>Quantité</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((h, i) => {
                    const idx = history.indexOf(h);
                    return (
                      <TableRow key={idx}>
                        <TableCell className="text-xs">{i + 1}</TableCell>
                        <TableCell>{h.desig}</TableCell>
                        <TableCell className="text-xs">{h.ref || "—"}</TableCell>
                        <TableCell className="text-sm">{h.qty || "—"}</TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => del(idx)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

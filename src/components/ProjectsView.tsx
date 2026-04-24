import { useEffect, useMemo, useState } from "react";
import {
  Project,
  ProjectMember,
  ProjectItem,
  AppUser,
  loadProjects,
  createProject,
  updateProject,
  deleteProject,
  loadProjectMembers,
  addProjectMember,
  removeProjectMember,
  loadProjectItems,
  upsertProjectItem,
  removeProjectItem,
  listAppUsers,
  loadAllProjectItems,
} from "@/lib/cloudProjects";
import type { Item } from "@/lib/inventory";
import { fmtPrice } from "@/lib/inventory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Folder, Plus, Pencil, Trash2, Users, Boxes, Save, X,
} from "lucide-react";
import { toast } from "sonner";

type Props = {
  isAdmin: boolean;
  items: Item[];
  requireAdmin: (fn: () => void | Promise<void>) => void;
  onProjectsChanged?: (projects: Project[]) => void;
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
};

export default function ProjectsView({
  isAdmin, items, requireAdmin, onProjectsChanged, activeProjectId, setActiveProjectId,
}: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [allPI, setAllPI] = useState<ProjectItem[]>([]);
  const [editing, setEditing] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState<Project | null>(null);

  const refresh = async () => {
    try {
      const ps = await loadProjects();
      setProjects(ps);
      onProjectsChanged?.(ps);
      try {
        const pi = await loadAllProjectItems();
        setAllPI(pi);
      } catch { /* viewer might have partial */ }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const itemMap = useMemo(() => {
    const m = new Map<string, Item>();
    items.forEach((it) => m.set(it.id, it));
    return m;
  }, [items]);

  const projectStats = (p: Project) => {
    const pis = allPI.filter((x) => x.projectId === p.id);
    let cost = 0;
    let count = 0;
    for (const pi of pis) {
      const it = itemMap.get(pi.itemId);
      if (it) { cost += it.unitPrice * pi.allocatedQty; count += 1; }
    }
    return { cost, count, remaining: p.budget - cost };
  };

  if (loading) {
    return <p className="text-muted-foreground py-8 text-center">Chargement…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Folder className="h-5 w-5" /> Projets
          </h2>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Créez des projets, attribuez des éléments et des utilisateurs."
              : "Liste des projets auxquels vous avez accès."}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => requireAdmin(() => setCreating(true))}>
            <Plus className="mr-2 h-4 w-4" /> Nouveau projet
          </Button>
        )}
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Aucun projet {isAdmin ? "— créez-en un pour commencer." : "ne vous est attribué pour l'instant."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map((p) => {
            const s = projectStats(p);
            const isActive = activeProjectId === p.id;
            return (
              <Card
                key={p.id}
                className={`transition-smooth hover:shadow-md cursor-pointer ${isActive ? "ring-2 ring-primary" : ""}`}
                onClick={() => setActiveProjectId(isActive ? null : p.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Folder className="h-4 w-4 text-primary" />
                        {p.name}
                      </CardTitle>
                      <Badge variant="outline" className="mt-1 font-mono text-xs">{p.code}</Badge>
                    </div>
                    {isActive && <Badge>Actif</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {p.description && (
                    <p className="text-muted-foreground line-clamp-2">{p.description}</p>
                  )}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-xs text-muted-foreground">Éléments</div>
                      <div className="font-semibold">{s.count}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Coût</div>
                      <div className="font-semibold">{fmtPrice(s.cost)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Budget</div>
                      <div className="font-semibold">{fmtPrice(p.budget)}</div>
                    </div>
                  </div>
                  {p.budget > 0 && (
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full ${s.cost > p.budget ? "bg-destructive" : "bg-primary"}`}
                        style={{ width: `${Math.min(100, (s.cost / p.budget) * 100).toFixed(1)}%` }}
                      />
                    </div>
                  )}
                  {isAdmin && (
                    <div className="flex flex-wrap gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="outline" onClick={() => requireAdmin(() => setManaging(p))}>
                        <Boxes className="mr-1 h-3 w-3" /> Gérer
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => requireAdmin(() => setEditing(p))}>
                        <Pencil className="mr-1 h-3 w-3" /> Modifier
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        onClick={() => requireAdmin(async () => {
                          if (!confirm(`Supprimer le projet "${p.name}" ?`)) return;
                          try { await deleteProject(p.id); toast.success("Projet supprimé."); await refresh(); }
                          catch (e: any) { toast.error(e?.message ?? "Erreur"); }
                        })}
                      >
                        <Trash2 className="mr-1 h-3 w-3" /> Supprimer
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {creating && (
        <ProjectFormDialog
          onClose={() => setCreating(false)}
          onSave={async (p) => {
            try {
              await createProject(p);
              toast.success("Projet créé.");
              setCreating(false);
              await refresh();
            } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
          }}
        />
      )}
      {editing && (
        <ProjectFormDialog
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (p) => {
            try {
              await updateProject(editing.id, p);
              toast.success("Projet mis à jour.");
              setEditing(null);
              await refresh();
            } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
          }}
        />
      )}
      {managing && (
        <ManageProjectDialog
          project={managing}
          items={items}
          onClose={() => { setManaging(null); refresh(); }}
        />
      )}
    </div>
  );
}

/* ---------------- Project create/edit dialog ---------------- */
function ProjectFormDialog({
  initial, onClose, onSave,
}: {
  initial?: Project;
  onClose: () => void;
  onSave: (p: Omit<Project, "id">) => void | Promise<void>;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [budget, setBudget] = useState<number>(initial?.budget ?? 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Modifier le projet" : "Nouveau projet"}</DialogTitle>
          <DialogDescription>
            Le code est un identifiant court et unique (ex: DEPOT-TOTAL).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Code *</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="DEPOT-TOTAL" />
            </div>
            <div>
              <Label>Nom *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Depot Total" />
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div>
            <Label>Budget (TND)</Label>
            <Input
              type="number" min={0} step="0.01"
              value={budget}
              onChange={(e) => setBudget(parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}><X className="mr-2 h-4 w-4" />Annuler</Button>
          <Button
            onClick={() => {
              if (!code.trim() || !name.trim()) { toast.error("Code et nom requis."); return; }
              onSave({ code: code.trim(), name: name.trim(), description: description.trim(), budget });
            }}
          >
            <Save className="mr-2 h-4 w-4" /> Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Manage items + members dialog ---------------- */
function ManageProjectDialog({
  project, items, onClose,
}: {
  project: Project;
  items: Item[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"items" | "members">("items");
  const [pis, setPis] = useState<ProjectItem[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [search, setSearch] = useState("");
  const [selectUserId, setSelectUserId] = useState<string>("");

  const reload = async () => {
    const [pi, mb] = await Promise.all([
      loadProjectItems(project.id),
      loadProjectMembers(project.id),
    ]);
    setPis(pi);
    setMembers(mb);
    try {
      const us = await listAppUsers();
      setUsers(us);
    } catch (e: any) {
      toast.error("Impossible de charger les utilisateurs: " + (e?.message ?? ""));
    }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [project.id]);

  const piMap = useMemo(() => {
    const m = new Map<string, ProjectItem>();
    pis.forEach((p) => m.set(p.itemId, p));
    return m;
  }, [pis]);

  const memberMap = useMemo(() => {
    const m = new Map<string, AppUser>();
    users.forEach((u) => m.set(u.id, u));
    return m;
  }, [users]);

  const usersAvailable = users.filter((u) => !members.some((m) => m.userId === u.id));

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      i.name.toLowerCase().includes(q) ||
      (i.ref ?? "").toLowerCase().includes(q) ||
      i.id.toLowerCase().includes(q),
    );
  }, [items, search]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Folder className="h-4 w-4" /> {project.name}
            <Badge variant="outline" className="font-mono text-xs">{project.code}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 border-b pb-2">
          <Button variant={tab === "items" ? "default" : "ghost"} size="sm" onClick={() => setTab("items")}>
            <Boxes className="mr-2 h-4 w-4" /> Éléments ({pis.length})
          </Button>
          <Button variant={tab === "members" ? "default" : "ghost"} size="sm" onClick={() => setTab("members")}>
            <Users className="mr-2 h-4 w-4" /> Utilisateurs ({members.length})
          </Button>
        </div>

        {tab === "items" && (
          <div className="space-y-3">
            <Input
              placeholder="Rechercher un élément (nom, référence, code)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-[50vh] overflow-y-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Désignation</TableHead>
                    <TableHead>Réf.</TableHead>
                    <TableHead className="w-32">Qté allouée</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((it) => {
                    const pi = piMap.get(it.id);
                    return (
                      <TableRow key={it.id}>
                        <TableCell className="font-medium">{it.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{it.ref}</TableCell>
                        <TableCell>
                          <Input
                            type="number" min={0}
                            value={pi?.allocatedQty ?? 0}
                            onChange={async (e) => {
                              const q = parseInt(e.target.value) || 0;
                              try {
                                if (q === 0 && pi) {
                                  await removeProjectItem(project.id, it.id);
                                } else {
                                  await upsertProjectItem({ projectId: project.id, itemId: it.id, allocatedQty: q });
                                }
                                await reload();
                              } catch (err: any) { toast.error(err?.message ?? "Erreur"); }
                            }}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          {pi && (
                            <Button
                              size="sm" variant="ghost"
                              onClick={async () => {
                                try { await removeProjectItem(project.id, it.id); await reload(); }
                                catch (err: any) { toast.error(err?.message ?? "Erreur"); }
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {tab === "members" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Select value={selectUserId} onValueChange={setSelectUserId}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Choisir un utilisateur…" /></SelectTrigger>
                <SelectContent>
                  {usersAvailable.length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">Aucun utilisateur disponible</div>
                  )}
                  {usersAvailable.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={async () => {
                  if (!selectUserId) return;
                  try {
                    await addProjectMember(project.id, selectUserId);
                    setSelectUserId("");
                    await reload();
                    toast.success("Utilisateur ajouté.");
                  } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> Ajouter
              </Button>
            </div>
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.length === 0 && (
                    <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-6">
                      Aucun utilisateur attribué
                    </TableCell></TableRow>
                  )}
                  {members.map((m) => {
                    const u = memberMap.get(m.userId);
                    return (
                      <TableRow key={m.id}>
                        <TableCell>{u?.email ?? m.userId}</TableCell>
                        <TableCell>
                          <Button
                            size="sm" variant="ghost"
                            onClick={async () => {
                              try { await removeProjectMember(m.id); await reload(); }
                              catch (e: any) { toast.error(e?.message ?? "Erreur"); }
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

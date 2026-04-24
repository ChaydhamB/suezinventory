import { supabase } from "@/integrations/supabase/client";

export type Project = {
  id: string;
  code: string;
  name: string;
  description: string;
  budget: number;
  createdAt?: string;
};

export type ProjectMember = {
  id: string;
  projectId: string;
  userId: string;
  email?: string;
};

export type ProjectItem = {
  id?: string;
  projectId: string;
  itemId: string;
  allocatedQty: number;
  note?: string;
};

const projFromRow = (r: any): Project => ({
  id: r.id,
  code: r.code,
  name: r.name,
  description: r.description ?? "",
  budget: Number(r.budget ?? 0),
  createdAt: r.created_at,
});

export async function loadProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("code");
  if (error) throw error;
  return (data ?? []).map(projFromRow);
}

export async function createProject(p: Omit<Project, "id">): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .insert({
      code: p.code,
      name: p.name,
      description: p.description ?? "",
      budget: p.budget ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  return projFromRow(data);
}

export async function updateProject(id: string, patch: Partial<Project>) {
  const row: any = {};
  if (patch.code !== undefined) row.code = patch.code;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.budget !== undefined) row.budget = patch.budget;
  const { error } = await supabase.from("projects").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteProject(id: string) {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

/* ---------- Members ---------- */
export async function loadProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const { data, error } = await supabase
    .from("project_members")
    .select("*")
    .eq("project_id", projectId);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    projectId: r.project_id,
    userId: r.user_id,
  }));
}

export async function addProjectMember(projectId: string, userId: string) {
  const { error } = await supabase
    .from("project_members")
    .insert({ project_id: projectId, user_id: userId });
  if (error) throw error;
}

export async function removeProjectMember(memberId: string) {
  const { error } = await supabase.from("project_members").delete().eq("id", memberId);
  if (error) throw error;
}

/* ---------- Project items ---------- */
export async function loadProjectItems(projectId: string): Promise<ProjectItem[]> {
  const { data, error } = await supabase
    .from("project_items")
    .select("*")
    .eq("project_id", projectId);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    projectId: r.project_id,
    itemId: r.item_id,
    allocatedQty: r.allocated_qty,
    note: r.note ?? undefined,
  }));
}

export async function loadAllProjectItems(): Promise<ProjectItem[]> {
  const { data, error } = await supabase.from("project_items").select("*");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    projectId: r.project_id,
    itemId: r.item_id,
    allocatedQty: r.allocated_qty,
    note: r.note ?? undefined,
  }));
}

export async function upsertProjectItem(pi: ProjectItem) {
  const row: any = {
    project_id: pi.projectId,
    item_id: pi.itemId,
    allocated_qty: pi.allocatedQty,
    note: pi.note ?? null,
  };
  const { error } = await supabase
    .from("project_items")
    .upsert(row, { onConflict: "project_id,item_id" });
  if (error) throw error;
}

export async function removeProjectItem(projectId: string, itemId: string) {
  const { error } = await supabase
    .from("project_items")
    .delete()
    .eq("project_id", projectId)
    .eq("item_id", itemId);
  if (error) throw error;
}

/* ---------- Admin: list app users via edge function ---------- */
export type AppUser = { id: string; email: string };

export async function listAppUsers(): Promise<AppUser[]> {
  const { data, error } = await supabase.functions.invoke("list-users");
  if (error) throw error;
  return (data?.users ?? []) as AppUser[];
}

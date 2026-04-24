-- =========================================================
-- PROJECTS FEATURE
-- =========================================================

-- 1. projects table
CREATE TABLE public.projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  budget      numeric NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_projects_touch
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. project_members table
CREATE TABLE public.project_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
CREATE INDEX idx_project_members_user ON public.project_members(user_id);

-- 3. project_items table (many-to-many items <-> projects)
CREATE TABLE public.project_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  item_id       text NOT NULL,
  allocated_qty integer NOT NULL DEFAULT 0,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, item_id)
);
CREATE INDEX idx_project_items_project ON public.project_items(project_id);
CREATE INDEX idx_project_items_item ON public.project_items(item_id);
CREATE TRIGGER trg_project_items_touch
BEFORE UPDATE ON public.project_items
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. Add nullable project_id to existing tables
ALTER TABLE public.armoires        ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.purchases       ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.transactions    ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.history_entries ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX idx_armoires_project        ON public.armoires(project_id);
CREATE INDEX idx_purchases_project       ON public.purchases(project_id);
CREATE INDEX idx_transactions_project    ON public.transactions(project_id);
CREATE INDEX idx_history_entries_project ON public.history_entries(project_id);

-- 5. Security definer helper
CREATE OR REPLACE FUNCTION public.is_project_member(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE user_id = _user_id AND project_id = _project_id
  );
$$;

-- 6. Enable RLS
ALTER TABLE public.projects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_items   ENABLE ROW LEVEL SECURITY;

-- ---------- projects policies ----------
CREATE POLICY "projects: admin full"
  ON public.projects FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "projects: members read"
  ON public.projects FOR SELECT TO authenticated
  USING (public.is_project_member(auth.uid(), id));

-- ---------- project_members policies ----------
CREATE POLICY "project_members: admin full"
  ON public.project_members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "project_members: self read"
  ON public.project_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---------- project_items policies ----------
CREATE POLICY "project_items: admin full"
  ON public.project_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "project_items: members read"
  ON public.project_items FOR SELECT TO authenticated
  USING (public.is_project_member(auth.uid(), project_id));

CREATE POLICY "project_items: members write"
  ON public.project_items FOR INSERT TO authenticated
  WITH CHECK (public.is_project_member(auth.uid(), project_id));

CREATE POLICY "project_items: members update"
  ON public.project_items FOR UPDATE TO authenticated
  USING (public.is_project_member(auth.uid(), project_id))
  WITH CHECK (public.is_project_member(auth.uid(), project_id));

CREATE POLICY "project_items: members delete"
  ON public.project_items FOR DELETE TO authenticated
  USING (public.is_project_member(auth.uid(), project_id));

-- =========================================================
-- Replace permissive policies on existing tables with
-- admin-or-project-member rules.
-- =========================================================

-- ---------- armoires ----------
DROP POLICY IF EXISTS "auth read armoires"   ON public.armoires;
DROP POLICY IF EXISTS "auth insert armoires" ON public.armoires;
DROP POLICY IF EXISTS "auth update armoires" ON public.armoires;
DROP POLICY IF EXISTS "auth delete armoires" ON public.armoires;

CREATE POLICY "armoires: admin full"
  ON public.armoires FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "armoires: members read"
  ON public.armoires FOR SELECT TO authenticated
  USING (project_id IS NOT NULL AND public.is_project_member(auth.uid(), project_id));

CREATE POLICY "armoires: members insert"
  ON public.armoires FOR INSERT TO authenticated
  WITH CHECK (project_id IS NOT NULL AND public.is_project_member(auth.uid(), project_id));

CREATE POLICY "armoires: members update"
  ON public.armoires FOR UPDATE TO authenticated
  USING (project_id IS NOT NULL AND public.is_project_member(auth.uid(), project_id))
  WITH CHECK (project_id IS NOT NULL AND public.is_project_member(auth.uid(), project_id));

CREATE POLICY "armoires: members delete"
  ON public.armoires FOR DELETE TO authenticated
  USING (project_id IS NOT NULL AND public.is_project_member(auth.uid(), project_id));

-- ---------- armoire_components (scoped via parent armoire) ----------
DROP POLICY IF EXISTS "auth read armoire_components"   ON public.armoire_components;
DROP POLICY IF EXISTS "auth insert armoire_components" ON public.armoire_components;
DROP POLICY IF EXISTS "auth update armoire_components" ON public.armoire_components;
DROP POLICY IF EXISTS "auth delete armoire_components" ON public.armoire_components;

CREATE POLICY "armoire_components: admin full"
  ON public.armoire_components FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "armoire_components: members rw"
  ON public.armoire_components FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.armoires a
    WHERE a.id = armoire_components.armoire_id
      AND a.project_id IS NOT NULL
      AND public.is_project_member(auth.uid(), a.project_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.armoires a
    WHERE a.id = armoire_components.armoire_id
      AND a.project_id IS NOT NULL
      AND public.is_project_member(auth.uid(), a.project_id)
  ));

-- ---------- purchases ----------
DROP POLICY IF EXISTS "auth read purchases"   ON public.purchases;
DROP POLICY IF EXISTS "auth insert purchases" ON public.purchases;
DROP POLICY IF EXISTS "auth update purchases" ON public.purchases;
DROP POLICY IF EXISTS "auth delete purchases" ON public.purchases;

CREATE POLICY "purchases: admin full"
  ON public.purchases FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "purchases: members read"
  ON public.purchases FOR SELECT TO authenticated
  USING (project_id IS NOT NULL AND public.is_project_member(auth.uid(), project_id));

CREATE POLICY "purchases: members insert"
  ON public.purchases FOR INSERT TO authenticated
  WITH CHECK (project_id IS NOT NULL AND public.is_project_member(auth.uid(), project_id));

CREATE POLICY "purchases: members update"
  ON public.purchases FOR UPDATE TO authenticated
  USING (project_id IS NOT NULL AND public.is_project_member(auth.uid(), project_id))
  WITH CHECK (project_id IS NOT NULL AND public.is_project_member(auth.uid(), project_id));

CREATE POLICY "purchases: members delete"
  ON public.purchases FOR DELETE TO authenticated
  USING (project_id IS NOT NULL AND public.is_project_member(auth.uid(), project_id));

-- ---------- transactions ----------
DROP POLICY IF EXISTS "auth read transactions"   ON public.transactions;
DROP POLICY IF EXISTS "auth insert transactions" ON public.transactions;
DROP POLICY IF EXISTS "auth update transactions" ON public.transactions;
DROP POLICY IF EXISTS "auth delete transactions" ON public.transactions;

CREATE POLICY "transactions: admin full"
  ON public.transactions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "transactions: members read"
  ON public.transactions FOR SELECT TO authenticated
  USING (project_id IS NOT NULL AND public.is_project_member(auth.uid(), project_id));

CREATE POLICY "transactions: members insert"
  ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (project_id IS NOT NULL AND public.is_project_member(auth.uid(), project_id));

CREATE POLICY "transactions: members update"
  ON public.transactions FOR UPDATE TO authenticated
  USING (project_id IS NOT NULL AND public.is_project_member(auth.uid(), project_id))
  WITH CHECK (project_id IS NOT NULL AND public.is_project_member(auth.uid(), project_id));

CREATE POLICY "transactions: members delete"
  ON public.transactions FOR DELETE TO authenticated
  USING (project_id IS NOT NULL AND public.is_project_member(auth.uid(), project_id));

-- ---------- history_entries ----------
DROP POLICY IF EXISTS "auth read history_entries"   ON public.history_entries;
DROP POLICY IF EXISTS "auth insert history_entries" ON public.history_entries;
DROP POLICY IF EXISTS "auth update history_entries" ON public.history_entries;
DROP POLICY IF EXISTS "auth delete history_entries" ON public.history_entries;

CREATE POLICY "history_entries: admin full"
  ON public.history_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "history_entries: members read"
  ON public.history_entries FOR SELECT TO authenticated
  USING (project_id IS NOT NULL AND public.is_project_member(auth.uid(), project_id));

CREATE POLICY "history_entries: members insert"
  ON public.history_entries FOR INSERT TO authenticated
  WITH CHECK (project_id IS NOT NULL AND public.is_project_member(auth.uid(), project_id));

CREATE POLICY "history_entries: members update"
  ON public.history_entries FOR UPDATE TO authenticated
  USING (project_id IS NOT NULL AND public.is_project_member(auth.uid(), project_id))
  WITH CHECK (project_id IS NOT NULL AND public.is_project_member(auth.uid(), project_id));

CREATE POLICY "history_entries: members delete"
  ON public.history_entries FOR DELETE TO authenticated
  USING (project_id IS NOT NULL AND public.is_project_member(auth.uid(), project_id));

-- ---------- items ----------
-- Items are global (one row per stock SKU) but visibility for non-admins
-- is restricted to items linked to one of their projects via project_items.
DROP POLICY IF EXISTS "auth read items"   ON public.items;
DROP POLICY IF EXISTS "auth insert items" ON public.items;
DROP POLICY IF EXISTS "auth update items" ON public.items;
DROP POLICY IF EXISTS "auth delete items" ON public.items;

CREATE POLICY "items: admin full"
  ON public.items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "items: members read"
  ON public.items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.project_items pi
    WHERE pi.item_id = items.id
      AND public.is_project_member(auth.uid(), pi.project_id)
  ));

CREATE POLICY "items: members write"
  ON public.items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.project_items pi
    WHERE pi.item_id = items.id
      AND public.is_project_member(auth.uid(), pi.project_id)
  ));

CREATE POLICY "items: members update"
  ON public.items FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.project_items pi
    WHERE pi.item_id = items.id
      AND public.is_project_member(auth.uid(), pi.project_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.project_items pi
    WHERE pi.item_id = items.id
      AND public.is_project_member(auth.uid(), pi.project_id)
  ));

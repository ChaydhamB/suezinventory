-- 1. Fix mutable search_path on touch_updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 2. Tighten app_meta write policies (admin-only writes; reads stay open to authenticated)
DROP POLICY IF EXISTS "auth insert app_meta" ON public.app_meta;
DROP POLICY IF EXISTS "auth update app_meta" ON public.app_meta;
DROP POLICY IF EXISTS "auth delete app_meta" ON public.app_meta;

CREATE POLICY "app_meta: admin write"
  ON public.app_meta FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "app_meta: admin update"
  ON public.app_meta FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "app_meta: admin delete"
  ON public.app_meta FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- 3. Tighten custom_cats write policies (admin-only writes; reads stay open)
DROP POLICY IF EXISTS "auth insert custom_cats" ON public.custom_cats;
DROP POLICY IF EXISTS "auth update custom_cats" ON public.custom_cats;
DROP POLICY IF EXISTS "auth delete custom_cats" ON public.custom_cats;

CREATE POLICY "custom_cats: admin write"
  ON public.custom_cats FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "custom_cats: admin update"
  ON public.custom_cats FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "custom_cats: admin delete"
  ON public.custom_cats FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

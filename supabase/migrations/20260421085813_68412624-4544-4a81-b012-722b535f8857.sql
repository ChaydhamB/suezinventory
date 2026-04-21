
-- Shared workspace: any authenticated user can read/write everything (atelier team app)

create table public.items (
  id text primary key,
  cat text not null,
  name text not null,
  ref text not null default '',
  supplier text not null default '',
  unit_price numeric not null default 0,
  stock integer not null default 0,
  cons_sfax integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.armoires (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.transactions (
  id text primary key,
  type text not null check (type in ('in','out')),
  item_id text not null references public.items(id) on delete cascade,
  qty integer not null,
  date date not null,
  note text,
  armoire_id text references public.armoires(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.history_entries (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time text,
  desig text not null,
  ref text not null default '',
  qty text not null default '',
  tx_id text,
  type text check (type in ('in','out')),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.purchases (
  id text primary key,
  item_id text not null references public.items(id) on delete cascade,
  qty integer not null,
  note text,
  date date not null,
  created_at timestamptz not null default now()
);

create table public.custom_cats (
  name text primary key,
  created_at timestamptz not null default now()
);

-- Assigned components per armoire (expected) + actual quantity inside armoire
create table public.armoire_components (
  id uuid primary key default gen_random_uuid(),
  armoire_id text not null references public.armoires(id) on delete cascade,
  item_id text not null references public.items(id) on delete cascade,
  required_qty integer not null default 0,
  actual_qty integer not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (armoire_id, item_id)
);

-- Migration tracking (one-time localStorage import per project, not per user)
create table public.app_meta (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.items enable row level security;
alter table public.armoires enable row level security;
alter table public.transactions enable row level security;
alter table public.history_entries enable row level security;
alter table public.purchases enable row level security;
alter table public.custom_cats enable row level security;
alter table public.armoire_components enable row level security;
alter table public.app_meta enable row level security;

-- Shared access: any authenticated user can do anything (team workspace)
do $$
declare t text;
begin
  for t in select unnest(array['items','armoires','transactions','history_entries','purchases','custom_cats','armoire_components','app_meta']) loop
    execute format('create policy "auth read %1$s" on public.%1$s for select to authenticated using (true);', t);
    execute format('create policy "auth insert %1$s" on public.%1$s for insert to authenticated with check (true);', t);
    execute format('create policy "auth update %1$s" on public.%1$s for update to authenticated using (true) with check (true);', t);
    execute format('create policy "auth delete %1$s" on public.%1$s for delete to authenticated using (true);', t);
  end loop;
end $$;

-- updated_at trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger items_touch before update on public.items for each row execute function public.touch_updated_at();
create trigger armcomp_touch before update on public.armoire_components for each row execute function public.touch_updated_at();

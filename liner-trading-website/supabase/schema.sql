-- ============================================================================
-- Liner Trading PLC — Supabase schema for the client portal
-- ============================================================================
-- HOW TO RUN THIS:
--   Supabase Dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run: every statement uses IF NOT EXISTS / OR REPLACE / drops
--   the policy first, so re-running after an edit won't error out.
-- ============================================================================


-- 1) TABLES ------------------------------------------------------------------

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users (id) on delete cascade,
  order_number text not null,
  product_name text not null,
  -- 0=Order Confirmed, 1=Production & QC, 2=Export Clearance,
  -- 3=Loaded at Djibouti Port, 4=In Transit, 5=Delivered
  stage smallint not null default 0 check (stage between 0 and 5),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.order_documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  doc_type text not null check (doc_type in ('invoice', 'packing', 'bl', 'coo')),
  -- Path of the REAL uploaded file inside the private "order-documents"
  -- Storage bucket, e.g. "3fa85f64-.../bl.pdf". A row only needs to exist
  -- once staff have actually uploaded the signed file — see the README for
  -- the upload steps. No row yet = the portal shows "Not yet available".
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique (order_id, doc_type)
);


-- 2) KEEP updated_at CURRENT ON EVERY STAGE CHANGE ----------------------------

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();


-- 3) ROW LEVEL SECURITY --------------------------------------------------------
-- Customers can only ever READ their own orders/documents. There is no
-- insert/update/delete policy for them on purpose — order stage changes and
-- document uploads are a staff action, done from the Table Editor / Storage
-- UI (or a separate internal tool using the service_role key, never this
-- anon-key-based site). This means a logged-in customer cannot edit their
-- own shipment status or see anyone else's orders.

alter table public.orders enable row level security;
alter table public.order_documents enable row level security;

drop policy if exists "Customers can view their own orders" on public.orders;
create policy "Customers can view their own orders"
  on public.orders for select
  using (auth.uid() = customer_id);

drop policy if exists "Customers can view documents on their own orders" on public.order_documents;
create policy "Customers can view documents on their own orders"
  on public.order_documents for select
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_documents.order_id
      and orders.customer_id = auth.uid()
    )
  );


-- 4) STORAGE BUCKET FOR REAL SIGNED DOCUMENTS ---------------------------------
-- After running this file, also create the bucket itself (SQL can't do this
-- part): Supabase Dashboard → Storage → New bucket → name it exactly
-- "order-documents" → leave it PRIVATE (do not make it public — the policy
-- below is what grants access, not a public bucket setting).

insert into storage.buckets (id, name, public)
values ('order-documents', 'order-documents', false)
on conflict (id) do nothing;

-- A customer may read a file only if its path's first folder segment (the
-- order_id) matches an order they own. Staff upload real files at
-- "{order_id}/invoice.pdf", "{order_id}/bl.pdf", etc. through the Storage UI.
drop policy if exists "Customers can read their own order documents" on storage.objects;
create policy "Customers can read their own order documents"
  on storage.objects for select
  using (
    bucket_id = 'order-documents'
    and exists (
      select 1 from public.orders
      where orders.id::text = (storage.foldername(name))[1]
      and orders.customer_id = auth.uid()
    )
  );


-- ============================================================================
-- STAFF WORKFLOW (no admin UI is built — this is intentional, see README):
--
-- To add a tracked order for a client:
--   Table Editor → orders → Insert row
--     customer_id  = the client's UUID (Authentication → Users → copy UID)
--     order_number = e.g. "LT-1042"
--     product_name = e.g. "Red Kidney Beans — 25 MT"
--     stage        = 0 to start
--
-- To move a shipment forward:
--   Table Editor → orders → edit that row's "stage" value (0-5).
--
-- To attach a REAL signed document:
--   Storage → order-documents → open/create a folder named exactly the
--   order's UUID → upload the signed PDF, named invoice.pdf / packing.pdf /
--   bl.pdf / coo.pdf → then Table Editor → order_documents → Insert row
--     order_id     = that order's UUID
--     doc_type     = 'invoice' | 'packing' | 'bl' | 'coo'
--     storage_path = "{order_id}/invoice.pdf" (the exact path you uploaded to)
-- ============================================================================

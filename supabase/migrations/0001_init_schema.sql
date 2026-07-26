-- ============================================================
-- Skillona Globe — initial database schema (Stage 2 foundation)
-- Implements section 7 of the master plan.
-- Run in Supabase SQL editor or via `supabase db push`.
-- ============================================================

-- PostGIS for geographic queries (distance, bounding box, clustering)
create extension if not exists postgis;

-- ---------- ENUMS ----------

create type account_type as enum ('private', 'agency', 'developer', 'admin');

create type verification_status as enum ('unverified', 'pending', 'verified', 'rejected');

create type transaction_type as enum ('sale', 'long_term_rent', 'short_term_rent', 'investment_project');

create type property_type as enum (
  'house', 'apartment', 'villa', 'land', 'commercial', 'hotel', 'motel',
  'camp', 'resort', 'warehouse', 'industrial', 'farm', 'island', 'development_project'
);

create type listing_status as enum (
  'draft', 'pending_review', 'active', 'rejected', 'paused',
  'sold', 'rented', 'expired', 'deleted'
);

create type location_visibility as enum ('exact', 'approximate', 'city_only');

create type payment_status as enum ('pending', 'paid', 'failed', 'refunded');

create type product_type as enum (
  'basic_listing', 'featured_listing', 'premium_position',
  'listing_renewal', 'agency_package', 'developer_package'
);

create type report_status as enum ('open', 'in_review', 'resolved', 'dismissed');

-- ---------- PROFILES (extends Supabase auth.users) ----------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  phone text,
  country text,
  account_type account_type not null default 'private',
  verification_status verification_status not null default 'unverified',
  promotion_start timestamptz,
  promotion_end timestamptz,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row when a user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name) values (new.id, new.raw_user_meta_data->>'name');
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- AGENCIES ----------

create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  company_name text not null,
  registration_number text,
  tax_number text,
  website text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- LISTINGS ----------

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  agency_id uuid references public.agencies (id) on delete set null,
  title text not null,
  description text,
  property_type property_type not null,
  transaction_type transaction_type not null,
  price numeric(14,2),
  price_on_request boolean not null default false,
  negotiable boolean not null default false,
  currency char(3) not null default 'EUR',
  country text not null,
  region text,
  city text,
  address text,
  postal_code text,
  location geography(point, 4326) not null,
  location_visibility location_visibility not null default 'exact',
  bedrooms smallint,
  bathrooms smallint,
  interior_area numeric(10,2),
  land_area numeric(12,2),
  year_built smallint,
  condition text,
  sea_view boolean not null default false,
  distance_to_sea_m integer,
  pool boolean not null default false,
  parking boolean not null default false,
  energy_certificate text,
  ownership_status text,
  status listing_status not null default 'draft',
  is_featured boolean not null default false,
  is_premium boolean not null default false,
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  view_count integer not null default 0,
  phone_click_count integer not null default 0,
  save_count integer not null default 0
);

create index listings_location_gist on public.listings using gist (location);
create index listings_status_idx on public.listings (status);
create index listings_country_idx on public.listings (country);
create index listings_price_idx on public.listings (price);
create index listings_property_type_idx on public.listings (property_type);
create index listings_transaction_type_idx on public.listings (transaction_type);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger listings_set_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

-- ---------- IMAGES ----------

create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  file_url text not null,
  sort_order smallint not null default 0,
  is_primary boolean not null default false
);

create index listing_images_listing_idx on public.listing_images (listing_id);

-- ---------- FEATURES ----------

create table public.features (
  id serial primary key,
  name text not null unique,
  category text
);

create table public.listing_features (
  listing_id uuid not null references public.listings (id) on delete cascade,
  feature_id integer not null references public.features (id) on delete cascade,
  primary key (listing_id, feature_id)
);

-- ---------- PAYMENTS ----------

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  listing_id uuid references public.listings (id) on delete set null,
  product_type product_type not null,
  amount numeric(10,2) not null,
  currency char(3) not null default 'EUR',
  payment_status payment_status not null default 'pending',
  provider_reference text,      -- Stripe payment intent / checkout session id
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index payments_user_idx on public.payments (user_id);

-- ---------- FAVORITES ----------

create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

-- ---------- INQUIRIES ----------

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  sender_user_id uuid references public.profiles (id) on delete set null,
  sender_name text,
  sender_email text,
  message text not null,
  created_at timestamptz not null default now()
);

create index inquiries_listing_idx on public.inquiries (listing_id);

-- ---------- REPORTS ----------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  reporting_user_id uuid references public.profiles (id) on delete set null,
  reason text not null,
  description text,
  status report_status not null default 'open',
  created_at timestamptz not null default now()
);

-- ---------- AUDIT LOG ----------

create table public.audit_logs (
  id bigserial primary key,
  user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  object_type text,
  object_id text,
  created_at timestamptz not null default now()
);

-- ---------- GLOBE QUERY: listings in visible area ----------
-- Returns only listings inside the current viewport (bounding box),
-- capped, so the globe never loads the whole world at once.

create or replace function public.listings_in_bbox(
  min_lng double precision, min_lat double precision,
  max_lng double precision, max_lat double precision,
  max_results integer default 200
)
returns setof public.listings
language sql stable as $$
  select * from public.listings
  where status = 'active'
    and location && st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
  order by is_premium desc, is_featured desc, published_at desc
  limit least(max_results, 500);
$$;

-- Cluster counts per country for the zoomed-out globe view
create or replace function public.listing_counts_by_country()
returns table (country text, listing_count bigint)
language sql stable as $$
  select country, count(*) from public.listings
  where status = 'active'
  group by country;
$$;

-- ---------- ROW LEVEL SECURITY ----------

alter table public.profiles enable row level security;
alter table public.agencies enable row level security;
alter table public.listings enable row level security;
alter table public.listing_images enable row level security;
alter table public.features enable row level security;
alter table public.listing_features enable row level security;
alter table public.payments enable row level security;
alter table public.favorites enable row level security;
alter table public.inquiries enable row level security;
alter table public.reports enable row level security;
alter table public.audit_logs enable row level security;

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and account_type = 'admin');
$$;

-- profiles: users see/edit their own; admins see all
create policy "own profile read"   on public.profiles for select using (auth.uid() = id or public.is_admin());
create policy "own profile update" on public.profiles for update using (auth.uid() = id);

-- listings: anyone can read active listings; owners manage their own; admins manage all
create policy "public read active listings" on public.listings for select
  using (status = 'active' or user_id = auth.uid() or public.is_admin());
create policy "owner insert listing" on public.listings for insert with check (user_id = auth.uid());
create policy "owner update listing" on public.listings for update
  using (user_id = auth.uid() or public.is_admin());
create policy "owner delete listing" on public.listings for delete
  using (user_id = auth.uid() or public.is_admin());

-- images follow their listing
create policy "public read images" on public.listing_images for select using (
  exists (select 1 from public.listings l where l.id = listing_id
          and (l.status = 'active' or l.user_id = auth.uid() or public.is_admin()))
);
create policy "owner manage images" on public.listing_images for all using (
  exists (select 1 from public.listings l where l.id = listing_id
          and (l.user_id = auth.uid() or public.is_admin()))
);

-- features: readable by all, managed by admins
create policy "public read features" on public.features for select using (true);
create policy "admin manage features" on public.features for all using (public.is_admin());
create policy "public read listing_features" on public.listing_features for select using (true);
create policy "owner manage listing_features" on public.listing_features for all using (
  exists (select 1 from public.listings l where l.id = listing_id
          and (l.user_id = auth.uid() or public.is_admin()))
);

-- agencies: owner + admin
create policy "public read verified agencies" on public.agencies for select
  using (verified or owner_user_id = auth.uid() or public.is_admin());
create policy "owner manage agency" on public.agencies for all
  using (owner_user_id = auth.uid() or public.is_admin());

-- payments: own + admin
create policy "own payments" on public.payments for select
  using (user_id = auth.uid() or public.is_admin());

-- favorites: own only
create policy "own favorites" on public.favorites for all using (user_id = auth.uid());

-- inquiries: listing owner and sender can read; anyone can send
create policy "read own inquiries" on public.inquiries for select using (
  sender_user_id = auth.uid() or public.is_admin()
  or exists (select 1 from public.listings l where l.id = listing_id and l.user_id = auth.uid())
);
create policy "send inquiry" on public.inquiries for insert with check (true);

-- reports: anyone can report; admins read/manage
create policy "create report" on public.reports for insert with check (true);
create policy "admin read reports" on public.reports for select using (public.is_admin());
create policy "admin manage reports" on public.reports for update using (public.is_admin());

-- audit logs: admin only
create policy "admin read audit" on public.audit_logs for select using (public.is_admin());

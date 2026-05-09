create extension if not exists pgcrypto;

do $$ begin
  create type user_role as enum ('admin', 'seller', 'customer', 'employee');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type user_status as enum ('pending', 'approved', 'rejected', 'blocked', 'active');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type business_status as enum ('pending', 'approved', 'rejected', 'blocked');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type order_status as enum ('pending_payment', 'paid', 'confirmed', 'processing', 'delivering', 'delivered', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type payment_status as enum ('pending', 'submitted', 'paid', 'failed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type delivery_status as enum ('pending', 'assigned', 'picked_up', 'delivered', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists users (
  id bigserial primary key,
  name text not null default '',
  email text not null unique,
  password text not null,
  role user_role not null default 'customer',
  status user_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists businesses (
  id bigserial primary key,
  user_id bigint references users(id) on delete set null,
  name text not null,
  owner_name text not null default '',
  phone text not null default '',
  email text not null,
  type text not null default 'Retail',
  location_name text not null default '',
  latitude numeric(10, 7) not null default 0,
  longitude numeric(10, 7) not null default 0,
  payment_methods jsonb not null default '[]'::jsonb,
  till_number text not null default '',
  pochi_number text not null default '',
  bank_account text not null default '',
  delivery_availability text not null default '',
  delivery_notes text not null default '',
  logo text not null default '',
  logo_image text not null default '',
  rating numeric(3, 2) not null default 4.50,
  status business_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists categories (
  id bigserial primary key,
  business_id bigint references businesses(id) on delete cascade,
  name text not null,
  image text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists categories_business_name_unique
  on categories (business_id, lower(name))
  where business_id is not null;

create unique index if not exists categories_global_name_unique
  on categories (lower(name))
  where business_id is null;

create table if not exists products (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  category_id bigint references categories(id) on delete set null,
  name text not null,
  image text not null default '',
  price numeric(12, 2) not null default 0,
  offer_flag boolean not null default false,
  offer_text text not null default '',
  stock integer not null default 0,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists seller_offers (
  public_id text primary key,
  seller_public_id text not null,
  store_name text not null default '',
  offer_title text not null default '',
  offer_note text not null default '',
  offer_expiry text not null default '',
  offer_image text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists cart (
  id bigserial primary key,
  session_id text not null,
  product_public_id text not null default '',
  product_name text not null default '',
  store_public_id text not null default '',
  store_name text not null default '',
  quantity integer not null default 1,
  unit_price numeric(12, 2) not null default 0,
  image text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists cart_session_idx on cart (session_id);

create table if not exists orders (
  id bigserial primary key,
  public_id text not null unique,
  marketplace_id text not null default 'tamu-express',
  customer_name text not null default '',
  customer_phone text not null default '',
  buyer_location text not null default '',
  buyer_latitude numeric(10, 7) not null default 0,
  buyer_longitude numeric(10, 7) not null default 0,
  payment_method text not null default '',
  payment_status text not null default 'pending_payment',
  mpesa_name text not null default '',
  mpesa_number text not null default '',
  mpesa_reference text not null default '',
  notes text not null default '',
  store_summary text not null default '',
  subtotal numeric(12, 2) not null default 0,
  delivery_fee numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  status order_status not null default 'pending_payment',
  created_at timestamptz not null default now()
);

create table if not exists order_items (
  id bigserial primary key,
  order_id bigint not null references orders(id) on delete cascade,
  product_public_id text not null default '',
  product_name text not null default '',
  store_public_id text not null default '',
  business_id bigint references businesses(id) on delete set null,
  store_name text not null default '',
  quantity integer not null default 1,
  unit_price numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null default 0
);

create table if not exists order_route_breakdown (
  id bigserial primary key,
  order_id bigint not null references orders(id) on delete cascade,
  store_public_id text not null default '',
  store_name text not null default '',
  distance_km numeric(10, 2) not null default 0,
  route_fee numeric(12, 2) not null default 0,
  quantity integer not null default 0,
  subtotal numeric(12, 2) not null default 0
);

create table if not exists payments (
  id bigserial primary key,
  order_public_id text not null,
  business_id bigint references businesses(id) on delete set null,
  method text not null default '',
  reference text not null default '',
  amount numeric(12, 2) not null default 0,
  status payment_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists deliveries (
  id bigserial primary key,
  order_public_id text not null,
  status delivery_status not null default 'pending',
  distance_km numeric(10, 2) not null default 0,
  delivery_fee numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists employees (
  id bigserial primary key,
  email text not null unique,
  uid text not null unique,
  role text not null default 'employee',
  county text not null default '',
  approved boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into users (name, email, password, role, status)
values (
  'Admin',
  'AdminTamuEpress@gmail.com',
  crypt('Admin@Tamu@2025', gen_salt('bf')),
  'admin',
  'approved'
)
on conflict (email) do update set
  name = excluded.name,
  password = excluded.password,
  role = excluded.role,
  status = excluded.status;

insert into categories (business_id, name, image)
values
  (null, 'Supermarket', ''),
  (null, 'Retail', ''),
  (null, 'Wholesale', '')
on conflict do nothing;

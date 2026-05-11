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
  subscription_started_at timestamptz,
  subscription_expires_at timestamptz,
  subscription_status text not null default 'inactive',
  created_at timestamptz not null default now()
);

alter table businesses add column if not exists subscription_started_at timestamptz;
alter table businesses add column if not exists subscription_expires_at timestamptz;
alter table businesses add column if not exists subscription_status text not null default 'inactive';
create index if not exists businesses_subscription_active_idx
  on businesses (status, subscription_expires_at);

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
  compare_at_price numeric(12, 2) not null default 0,
  offer_flag boolean not null default false,
  offer_text text not null default '',
  stock integer not null default 0,
  description text not null default '',
  created_at timestamptz not null default now(),
  constraint products_are_not_offers_chk check (coalesce(offer_flag, false) = false and coalesce(offer_text, '') = '')
);

alter table products add column if not exists offer_text text not null default '';
alter table products add column if not exists compare_at_price numeric(12, 2) not null default 0;
alter table products add column if not exists offer_flag boolean not null default false;
alter table products add column if not exists description text not null default '';
alter table categories add column if not exists image text not null default '';

update products
set offer_flag = false,
    offer_text = '',
    compare_at_price = 0
where coalesce(offer_flag, false) = true
   or offer_flag is null
   or offer_text is null
   or compare_at_price is null
   or coalesce(offer_text, '') <> ''
   or coalesce(compare_at_price, 0) <> 0;

do $$
begin
  alter table products
    add constraint products_are_not_offers_chk
    check (coalesce(offer_flag, false) = false and coalesce(offer_text, '') = '');
exception
  when duplicate_object then null;
end $$;

create table if not exists seller_offers (
  public_id text primary key,
  seller_public_id text not null,
  store_name text not null default '',
  offer_title text not null default '',
  offer_note text not null default '',
  offer_before_price numeric(12, 2) not null default 0,
  offer_now_price numeric(12, 2) not null default 0,
  offer_expiry text not null default '',
  offer_image text not null default '',
  created_at timestamptz not null default now()
);

alter table seller_offers add column if not exists offer_title text not null default '';
alter table seller_offers add column if not exists offer_note text not null default '';
alter table seller_offers add column if not exists offer_before_price numeric(12, 2) not null default 0;
alter table seller_offers add column if not exists offer_now_price numeric(12, 2) not null default 0;
alter table seller_offers add column if not exists offer_expiry text not null default '';
alter table seller_offers add column if not exists offer_image text not null default '';

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
  firebase_uid text unique,
  display_name text not null default '',
  role text not null default 'employee',
  county text not null default '',
  approved boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table employees add column if not exists firebase_uid text;
alter table employees add column if not exists display_name text not null default '';
create unique index if not exists employees_firebase_uid_unique
  on employees (firebase_uid)
  where firebase_uid is not null and firebase_uid <> '';

create table if not exists app_realtime_events (
  id bigserial primary key,
  channel text not null,
  reason text not null default 'mutation',
  created_at timestamptz not null default now()
);

create index if not exists app_realtime_events_channel_id_idx
  on app_realtime_events (channel, id desc);

create or replace function app_realtime_touch()
returns trigger
language plpgsql
security definer
as $$
declare
  event_channel text;
begin
  event_channel := case TG_TABLE_NAME
    when 'orders' then 'orders'
    when 'order_items' then 'orders'
    when 'order_route_breakdown' then 'orders'
    when 'deliveries' then 'orders'
    when 'payments' then 'payments'
    when 'users' then 'users'
    when 'employees' then 'users'
    else 'marketplace'
  end;

  insert into app_realtime_events (channel, reason)
  values (event_channel, lower(TG_OP) || ':' || TG_TABLE_NAME);

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

drop trigger if exists businesses_realtime_touch on businesses;
create trigger businesses_realtime_touch
after insert or update or delete on businesses
for each row execute function app_realtime_touch();

drop trigger if exists categories_realtime_touch on categories;
create trigger categories_realtime_touch
after insert or update or delete on categories
for each row execute function app_realtime_touch();

drop trigger if exists products_realtime_touch on products;
create trigger products_realtime_touch
after insert or update or delete on products
for each row execute function app_realtime_touch();

drop trigger if exists seller_offers_realtime_touch on seller_offers;
create trigger seller_offers_realtime_touch
after insert or update or delete on seller_offers
for each row execute function app_realtime_touch();

drop trigger if exists orders_realtime_touch on orders;
create trigger orders_realtime_touch
after insert or update or delete on orders
for each row execute function app_realtime_touch();

drop trigger if exists order_items_realtime_touch on order_items;
create trigger order_items_realtime_touch
after insert or update or delete on order_items
for each row execute function app_realtime_touch();

drop trigger if exists payments_realtime_touch on payments;
create trigger payments_realtime_touch
after insert or update or delete on payments
for each row execute function app_realtime_touch();

drop trigger if exists deliveries_realtime_touch on deliveries;
create trigger deliveries_realtime_touch
after insert or update or delete on deliveries
for each row execute function app_realtime_touch();

drop trigger if exists users_realtime_touch on users;
create trigger users_realtime_touch
after insert or update or delete on users
for each row execute function app_realtime_touch();

drop trigger if exists employees_realtime_touch on employees;
create trigger employees_realtime_touch
after insert or update or delete on employees
for each row execute function app_realtime_touch();

update businesses
set subscription_started_at = coalesce(subscription_started_at, now()),
    subscription_expires_at = coalesce(subscription_expires_at, now() + interval '1 month'),
    subscription_status = 'active'
where status = 'approved'
  and subscription_expires_at is null;

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

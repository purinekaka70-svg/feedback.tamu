-- Compatibility guard for databases that already have the legacy cart table.
alter type order_status add value if not exists 'confirmed';
alter type order_status add value if not exists 'delivering';
alter type delivery_status add value if not exists 'picked_up';

alter table public.cart add column if not exists product_public_id text not null default '';
alter table public.cart add column if not exists product_name text not null default '';
alter table public.cart add column if not exists store_public_id text not null default '';
alter table public.cart add column if not exists store_name text not null default '';
alter table public.cart add column if not exists unit_price numeric(12, 2) not null default 0;
alter table public.cart add column if not exists image text not null default '';
create index if not exists cart_session_idx on public.cart (session_id);
create unique index if not exists cart_session_product_store_unique on public.cart (session_id, product_public_id, store_public_id);
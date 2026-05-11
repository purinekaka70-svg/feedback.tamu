-- Supabase/Postgres migration for richer seller catalog details.
-- Safe to run more than once in the Supabase SQL editor.

alter table categories
  add column if not exists image text not null default '';

alter table products
  add column if not exists offer_text text not null default '';

alter table products
  add column if not exists compare_at_price numeric(12, 2) not null default 0;

alter table products
  add column if not exists description text not null default '';

alter table seller_offers
  add column if not exists offer_title text not null default '';

alter table seller_offers
  add column if not exists offer_note text not null default '';

alter table seller_offers
  add column if not exists offer_before_price numeric(12, 2) not null default 0;

alter table seller_offers
  add column if not exists offer_now_price numeric(12, 2) not null default 0;

alter table seller_offers
  add column if not exists offer_expiry text not null default '';

alter table seller_offers
  add column if not exists offer_image text not null default '';

create index if not exists products_business_category_idx
  on products (business_id, category_id);

create index if not exists categories_business_name_idx
  on categories (business_id, lower(name));

create index if not exists seller_offers_seller_idx
  on seller_offers (seller_public_id);

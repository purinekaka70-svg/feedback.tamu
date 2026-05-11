-- Keep normal products and standalone offers separated.
-- Safe to run more than once in the Supabase SQL editor.

alter table products
  add column if not exists offer_flag boolean not null default false;

alter table products
  add column if not exists offer_text text not null default '';

alter table products
  add column if not exists compare_at_price numeric(12, 2) not null default 0;

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

create index if not exists products_business_category_idx
  on products (business_id, category_id);

create index if not exists seller_offers_seller_idx
  on seller_offers (seller_public_id);

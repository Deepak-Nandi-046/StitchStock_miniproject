-- Patch 2: store each customer's shopping bag and wishlist in the database.
-- Run once in the Supabase SQL Editor (safe to run again).

create table if not exists public.cart_item (
    customer_id uuid   not null references public.customer(customer_id) on delete cascade,
    product_id  bigint not null references public.product(product_id)   on delete cascade,
    quantity    integer not null default 1 check (quantity between 1 and 20),
    color       text,
    updated_at  timestamptz not null default now(),
    primary key (customer_id, product_id)
);

create table if not exists public.wishlist_item (
    customer_id uuid   not null references public.customer(customer_id) on delete cascade,
    product_id  bigint not null references public.product(product_id)   on delete cascade,
    created_at  timestamptz not null default now(),
    primary key (customer_id, product_id)
);

-- The backend connects with the database owner role, which bypasses RLS.
-- Enabling RLS (with no policies) blocks direct access through the public Supabase API.
alter table public.cart_item     enable row level security;
alter table public.wishlist_item enable row level security;

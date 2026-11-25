-- Persist return and cancellation requests in PostgreSQL.
-- Safe to run for both new databases and older return_request tables.

create table if not exists public.return_request (
    request_id     uuid        primary key,
    order_id       bigint      not null references public.orders(order_id) on delete cascade,
    customer_id    uuid        not null references public.customer(customer_id) on delete cascade,
    customer_name  text,
    customer_email text        not null default '',
    type           text        not null check (type in ('Return', 'Cancellation')),
    product_name   text        not null,
    quantity       integer     not null check (quantity > 0),
    order_status   text        not null,
    message        text        not null,
    status         text        not null default 'Pending'
                               check (status in ('Pending', 'Under Review', 'Approved', 'Rejected', 'Completed')),
    rejection_reason text,
    evidence        jsonb       not null default '[]'::jsonb
                               check (jsonb_typeof(evidence) = 'array'),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz
);

-- Older deployments used request_type, reason, and order_status_at_request.
-- Keep those columns nullable for compatibility while the app uses the current names.
alter table public.return_request add column if not exists request_type text;
alter table public.return_request add column if not exists reason text;
alter table public.return_request add column if not exists order_status_at_request text;
alter table public.return_request add column if not exists customer_name text;
alter table public.return_request add column if not exists customer_email text not null default '';
alter table public.return_request add column if not exists type text;
alter table public.return_request add column if not exists product_name text;
alter table public.return_request add column if not exists quantity integer;
alter table public.return_request add column if not exists order_status text;
alter table public.return_request add column if not exists message text;
alter table public.return_request add column if not exists rejection_reason text;
alter table public.return_request add column if not exists evidence jsonb not null default '[]'::jsonb;
alter table public.return_request add column if not exists updated_at timestamptz;

update public.return_request r
set customer_name = coalesce(nullif(r.customer_name, ''), (
        select c.full_name from public.customer c where c.customer_id = r.customer_id
    ), 'Customer'),
    customer_email = coalesce(r.customer_email, (
        select c.email from public.customer c where c.customer_id = r.customer_id
    ), ''),
    type = coalesce(nullif(r.type, ''), r.request_type, 'Return'),
    product_name = coalesce(nullif(r.product_name, ''), (
        select p.product_name
        from public.order_item oi
        join public.product p on p.product_id = oi.product_id
        where oi.order_id = r.order_id
        order by oi.order_item_id
        limit 1
    ), 'Handmade item'),
    quantity = coalesce(r.quantity, (
        select oi.quantity
        from public.order_item oi
        where oi.order_id = r.order_id
        order by oi.order_item_id
        limit 1
    ), 1),
    order_status = coalesce(nullif(r.order_status, ''), r.order_status_at_request, (
        select o.order_status from public.orders o where o.order_id = r.order_id
    ), 'Unknown'),
    message = coalesce(nullif(r.message, ''), r.reason, 'No reason provided'),
    evidence = coalesce(r.evidence, '[]'::jsonb);

alter table public.return_request alter column customer_name set not null;
alter table public.return_request alter column type set not null;
alter table public.return_request alter column product_name set not null;
alter table public.return_request alter column quantity set not null;
alter table public.return_request alter column order_status set not null;
alter table public.return_request alter column message set not null;
alter table public.return_request alter column evidence set not null;
alter table public.return_request alter column request_type drop not null;
alter table public.return_request alter column reason drop not null;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.return_request'::regclass
          and conname = 'return_request_type_check'
    ) then
        alter table public.return_request
            add constraint return_request_type_check
            check (type in ('Return', 'Cancellation'));
    end if;
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.return_request'::regclass
          and conname = 'return_request_quantity_check'
    ) then
        alter table public.return_request
            add constraint return_request_quantity_check check (quantity > 0);
    end if;
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.return_request'::regclass
          and conname = 'return_request_evidence_check'
    ) then
        alter table public.return_request
            add constraint return_request_evidence_check
            check (jsonb_typeof(evidence) = 'array');
    end if;
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.return_request'::regclass
          and conname = 'return_request_status_check'
    ) then
        alter table public.return_request
            add constraint return_request_status_check
            check (status in ('Pending', 'Under Review', 'Approved', 'Rejected', 'Completed'));
    end if;
end $$;

create unique index if not exists return_request_one_open_per_order
    on public.return_request (order_id, customer_id)
    where status in ('Pending', 'Under Review', 'Approved');

create index if not exists return_request_customer_created
    on public.return_request (customer_id, created_at desc);

alter table public.return_request enable row level security;

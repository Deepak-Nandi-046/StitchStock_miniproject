-- Store customisation request records and attachment metadata in PostgreSQL.

create table if not exists public.customization_request (
    customization_id uuid primary key default gen_random_uuid(),
    customer_id uuid not null references public.customer(customer_id),
    product_id bigint references public.product(product_id),
    order_id bigint references public.orders(order_id),
    customer_email text,
    customer_phone text,
    requested_details jsonb not null default '{}'::jsonb,
    agreed_details text,
    agreed_price numeric,
    admin_reply text not null default '',
    estimated_completion text not null default '',
    customization_status text not null default 'Submitted'
        check (customization_status in (
            'Submitted', 'Under Review', 'Need More Details', 'Offer Sent',
            'Accepted', 'Rejected', 'Order Confirmed'
        )),
    advance_amount numeric,
    advance_status text,
    advance_confirmed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz
);

create table if not exists public.customization_attachment (
    attachment_id uuid primary key default gen_random_uuid(),
    customization_id uuid not null
        references public.customization_request(customization_id) on delete cascade,
    file_name text not null,
    mime_type text not null,
    size_bytes integer not null,
    storage_path text not null
);

create index if not exists customization_request_customer_created_idx
    on public.customization_request (customer_id, created_at desc);
create index if not exists customization_attachment_request_idx
    on public.customization_attachment (customization_id);

alter table public.customization_request enable row level security;
alter table public.customization_attachment enable row level security;

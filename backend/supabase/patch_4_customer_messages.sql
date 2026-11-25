-- Store customer and admin conversations in PostgreSQL.
-- Safe to run when the message tables already exist.

create table if not exists public.message_thread (
    thread_id  uuid        primary key default gen_random_uuid(),
    customer_id uuid       not null unique references public.customer(customer_id),
    status     text        not null default 'Open'
                           check (status in ('Open', 'Closed')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.message (
    message_id       uuid        primary key default gen_random_uuid(),
    thread_id        uuid        not null references public.message_thread(thread_id) on delete cascade,
    sender           text        not null check (sender in ('customer', 'admin')),
    subject          text        not null default '',
    body             text        not null,
    sent_at          timestamptz not null default now(),
    read_by_admin    boolean     not null default false,
    read_by_customer boolean     not null default false
);

create index if not exists message_thread_updated_at_idx
    on public.message_thread (updated_at desc);
create index if not exists message_thread_sent_at_idx
    on public.message (thread_id, sent_at, message_id);
create index if not exists message_unread_by_admin_idx
    on public.message (thread_id)
    where sender = 'customer' and read_by_admin = false;
create index if not exists message_unread_by_customer_idx
    on public.message (thread_id)
    where sender = 'admin' and read_by_customer = false;

alter table public.message_thread enable row level security;
alter table public.message enable row level security;

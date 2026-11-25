-- Track whether the owner has viewed each customisation request.

alter table public.customization_request
    add column if not exists admin_viewed_at timestamptz;

create index if not exists customization_request_unviewed_idx
    on public.customization_request (created_at desc)
    where admin_viewed_at is null;

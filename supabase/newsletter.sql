begin;

create extension if not exists pgcrypto;

alter table public.subscribers
  add column if not exists unsubscribe_token uuid;

update public.subscribers
set unsubscribe_token = gen_random_uuid()
where unsubscribe_token is null;

alter table public.subscribers
  alter column unsubscribe_token set default gen_random_uuid(),
  alter column unsubscribe_token set not null;

create unique index if not exists subscribers_unsubscribe_token_key
  on public.subscribers (unsubscribe_token);

create index if not exists subscribers_status_created_at_idx
  on public.subscribers (status, created_at, id);

commit;

-- Public share links for WingsCrew Looks.
-- Paste this whole file into the Supabase SQL editor and run it once.
-- The app uses only the public anon key. The owner secret stays on the owner's phone.
-- Do not put the service_role key in the app.

create extension if not exists pgcrypto;

create table if not exists public.shared_looks (
  token text primary key,
  look_id text not null default '',
  name text not null,
  occasion text not null default '',
  image_path text not null,
  owner_secret text not null,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  constraint shared_looks_token_length check (char_length(token) between 8 and 80),
  constraint shared_looks_secret_length check (char_length(owner_secret) between 16 and 80),
  constraint shared_looks_name_length check (char_length(name) between 1 and 80)
);

create table if not exists public.votes (
  id bigint generated always as identity primary key,
  look_token text not null references public.shared_looks (token) on delete cascade,
  device_id text not null,
  choice text not null,
  created_at timestamptz not null default now(),
  constraint votes_choice check (choice in ('fit', 'miss')),
  constraint votes_device_length check (char_length(device_id) between 8 and 80),
  constraint votes_one_per_device unique (look_token, device_id)
);

create index if not exists votes_look_token_idx on public.votes (look_token);

alter table public.shared_looks enable row level security;
alter table public.votes enable row level security;

-- Supabase REST puts request headers here. Missing headers return null.
create or replace function public.request_header(header_name text)
returns text
language plpgsql
stable
as $$
declare
  headers json;
begin
  begin
    headers := current_setting('request.headers', true)::json;
  exception when others then
    return null;
  end;
  if headers is null then
    return null;
  end if;
  return nullif(headers ->> lower(header_name), '');
end;
$$;

-- True only while that token is still shared. Does not reveal the owner secret.
create or replace function public.look_is_live(look_token text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shared_looks
    where revoked = false
      and (token = look_token or image_path = look_token)
  );
$$;

-- True only when the secret matches the phone that published this token.
create or replace function public.owns_look(look_token text, secret text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(secret, '') <> '' and exists (
    select 1
    from public.shared_looks
    where token = look_token
      and owner_secret = secret
  );
$$;

revoke all on function public.request_header(text) from public;
revoke all on function public.look_is_live(text) from public;
revoke all on function public.owns_look(text, text) from public;
grant execute on function public.request_header(text) to anon;
grant execute on function public.look_is_live(text) to anon;
grant execute on function public.owns_look(text, text) to anon;

drop policy if exists "anon inserts a shared look" on public.shared_looks;
drop policy if exists "anon reads one live look by token" on public.shared_looks;
drop policy if exists "owner revokes their look" on public.shared_looks;
drop policy if exists "anon inserts one vote" on public.votes;
drop policy if exists "owner reads votes" on public.votes;

-- Anyone with the anon key may publish a look. They choose the token and the owner secret.
create policy "anon inserts a shared look"
  on public.shared_looks
  for insert
  to anon
  with check (
    revoked = false
    and name <> ''
    and image_path <> ''
    and owner_secret <> ''
  );

-- A visitor can read one live look, and only when they send that look's token.
create policy "anon reads one live look by token"
  on public.shared_looks
  for select
  to anon
  using (
    revoked = false
    and token = public.request_header('x-look-token')
  );

-- The owner phone sends its secret to stop the link. It cannot turn the link back on.
create policy "owner revokes their look"
  on public.shared_looks
  for update
  to anon
  using (public.owns_look(token, public.request_header('x-owner-secret')) and revoked = false)
  with check (revoked = true and public.owns_look(token, public.request_header('x-owner-secret')));

-- One row per phone per look. A second insert fails the unique constraint.
create policy "anon inserts one vote"
  on public.votes
  for insert
  to anon
  with check (
    choice in ('fit', 'miss')
    and device_id <> ''
    and public.look_is_live(look_token)
  );

-- Vote totals stay with the owner. Visitors do not get to read them.
create policy "owner reads votes"
  on public.votes
  for select
  to anon
  using (public.owns_look(look_token, public.request_header('x-owner-secret')));

revoke all on table public.shared_looks from anon;
revoke all on table public.votes from anon;
grant insert (token, look_id, name, occasion, image_path, owner_secret, revoked) on table public.shared_looks to anon;
grant select (token, look_id, name, occasion, image_path, revoked, created_at) on table public.shared_looks to anon;
grant update (revoked) on table public.shared_looks to anon;
grant insert (look_token, device_id, choice) on table public.votes to anon;
grant select (look_token, choice) on table public.votes to anon;

insert into storage.buckets (id, name, public)
values ('looks', 'looks', false)
on conflict (id) do update set public = false;

drop policy if exists "anon uploads a look image" on storage.objects;
drop policy if exists "anon reads a live look image" on storage.objects;
drop policy if exists "owner deletes a look image" on storage.objects;

create policy "anon uploads a look image"
  on storage.objects
  for insert
  to anon
  with check (
    bucket_id = 'looks'
    and name ~ '^[A-Za-z0-9-]{8,80}\.jpg$'
  );

-- The picture loads only while the look is still shared.
create policy "anon reads a live look image"
  on storage.objects
  for select
  to anon
  using (
    bucket_id = 'looks'
    and public.look_is_live(name)
  );

create policy "owner deletes a look image"
  on storage.objects
  for delete
  to anon
  using (
    bucket_id = 'looks'
    and public.owns_look(regexp_replace(name, '\.jpg$', ''), public.request_header('x-owner-secret'))
  );

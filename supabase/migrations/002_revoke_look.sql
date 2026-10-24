-- Run this once in the Supabase SQL editor on the live project.
-- Stop sharing calls revoke_look. A direct PATCH cannot revoke the row:
-- PostgREST tries to read every column back (anon cannot read owner_secret),
-- and the select policy hides the row as soon as revoked becomes true.

create or replace function public.revoke_look(look_token text, secret text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated int;
begin
  if coalesce(secret, '') = '' or coalesce(look_token, '') = '' then
    return false;
  end if;
  if exists (
    select 1 from public.shared_looks
    where token = look_token and owner_secret = secret and revoked = true
  ) then
    return true;
  end if;
  update public.shared_looks
    set revoked = true
    where token = look_token
      and owner_secret = secret
      and revoked = false;
  get diagnostics updated = row_count;
  return updated > 0;
end;
$$;

revoke all on function public.revoke_look(text, text) from public;
grant execute on function public.revoke_look(text, text) to anon;

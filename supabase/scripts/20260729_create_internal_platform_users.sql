-- Execute manualmente no SQL Editor do Supabase.
-- Estes usuarios pertencem a franqueadora e recebem acesso global ao sistema.
-- Antes de executar, substitua as duas senhas temporarias abaixo.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter table public.app_users
  add column if not exists job_title text not null default '';

do $$
declare
  v_maximiano_password text := 'TROQUE_PELA_SENHA_DO_MAXIMIANO';
  v_marcos_password text := 'TROQUE_PELA_SENHA_DO_MARCOS';
  v_maximiano_id uuid;
  v_marcos_id uuid;
begin
  if v_maximiano_password like 'TROQUE_%'
     or v_marcos_password like 'TROQUE_%' then
    raise exception
      'Substitua as senhas temporarias no inicio do bloco antes de executar.';
  end if;

  if char_length(v_maximiano_password) < 12
     or char_length(v_marcos_password) < 12 then
    raise exception
      'Cada senha temporaria precisa ter pelo menos 12 caracteres.';
  end if;

  insert into public.app_users (
    email,
    password_hash,
    name,
    job_title,
    role,
    active
  )
  values (
    'maximiano.33doctor@gmail.com',
    extensions.crypt(v_maximiano_password, extensions.gen_salt('bf', 12)),
    'MAXIMIANO VINICIOS GOMES TEIXEIRA DA SILVA',
    'GERENTE DE OPERAÇÕES',
    'platform_admin',
    true
  )
  on conflict (email) do update
    set password_hash = excluded.password_hash,
        name = excluded.name,
        job_title = excluded.job_title,
        role = excluded.role,
        active = true,
        updated_at = now()
  returning id into v_maximiano_id;

  insert into public.app_users (
    email,
    password_hash,
    name,
    job_title,
    role,
    active
  )
  values (
    'comercial33doctor@gmail.com',
    extensions.crypt(v_marcos_password, extensions.gen_salt('bf', 12)),
    'MARCOS AGUIAR',
    'DIRETOR EXECUTIVO',
    'platform_admin',
    true
  )
  on conflict (email) do update
    set password_hash = excluded.password_hash,
        name = excluded.name,
        job_title = excluded.job_title,
        role = excluded.role,
        active = true,
        updated_at = now()
  returning id into v_marcos_id;

  insert into public.app_user_profiles (user_id, display_name)
  values
    (v_maximiano_id, 'MAXIMIANO VINICIOS GOMES TEIXEIRA DA SILVA'),
    (v_marcos_id, 'MARCOS AGUIAR')
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        updated_at = now();

  -- Encerra sessoes anteriores caso algum dos e-mails ja existisse.
  delete from public.app_sessions
  where user_id in (v_maximiano_id, v_marcos_id);
end;
$$;

select
  email,
  name,
  job_title,
  role,
  active
from public.app_users
where email in (
  'maximiano.33doctor@gmail.com',
  'comercial33doctor@gmail.com'
)
order by email;

alter table public.app_users
  add column if not exists regional text;

alter table public.app_users
  drop constraint if exists app_users_regional_length_check;

alter table public.app_users
  add constraint app_users_regional_length_check
  check (regional is null or char_length(regional) <= 120);

comment on column public.app_users.regional is
  'Regional de atuação do usuário na franqueadora ou na rede.';

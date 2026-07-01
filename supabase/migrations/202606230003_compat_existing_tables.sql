alter table public.units
  add column if not exists owner_name text,
  add column if not exists priority text not null default 'Normal';

alter table public.roadmap_tasks
  add column if not exists template_id bigint references public.roadmap_task_templates(id) on delete set null,
  add column if not exists sort_order integer not null default 0;

alter table public.purchase_items
  add column if not exists template_id bigint references public.purchase_item_templates(id) on delete set null,
  add column if not exists sort_order integer not null default 0;

alter table public.accreditation_procedures
  add column if not exists sort_order integer not null default 0;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'accreditation_statuses'
      and constraint_name = 'accreditation_statuses_unit_id_fkey'
  ) then
    alter table public.accreditation_statuses
      drop constraint accreditation_statuses_unit_id_fkey;
  end if;
end;
$$;

alter table public.accreditation_statuses
  add column if not exists owner_name text;

alter table public.audit_events
  add column if not exists user_id uuid references public.app_users(id) on delete set null,
  add column if not exists payload jsonb;

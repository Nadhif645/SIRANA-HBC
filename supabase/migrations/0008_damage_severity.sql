alter table public.damage_tickets
  add column if not exists damage_severity text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'damage_tickets_damage_severity_check'
      and conrelid = 'public.damage_tickets'::regclass
  ) then
    alter table public.damage_tickets
      add constraint damage_tickets_damage_severity_check
      check (damage_severity is null or damage_severity in ('ringan', 'sedang', 'berat'));
  end if;
end;
$$;

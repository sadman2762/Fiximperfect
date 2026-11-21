-- Row Level Security.
-- Students never query tables directly: their access is mediated by server
-- routes that verify hashed tracking/feedback tokens. The anon role therefore
-- has no table access at all. Staff access is limited by role and building.

create or replace function public.current_staff_role() returns public.staff_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active);
$$;

create or replace function public.has_building_access(p_building uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active
      and (p.role in ('administrator', 'management') or p_building = any(p.building_access))
  );
$$;

create or replace function public.can_manage_building(p_building uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active
      and (p.role = 'administrator' or (p.role = 'caretaker' and p_building = any(p.building_access)))
  );
$$;

create or replace function public.ticket_building(p_ticket uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select building_id from public.tickets where id = p_ticket;
$$;

create or replace function public.is_assigned_worker(p_ticket uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tickets t
    left join public.team_members tm on tm.team_id = t.assigned_team_id and tm.profile_id = auth.uid()
    join public.profiles p on p.id = auth.uid() and p.is_active and p.role = 'maintenance_staff'
    where t.id = p_ticket and (t.assigned_to = auth.uid() or tm.profile_id is not null)
      and t.building_id = any(p.building_access)
  );
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_staff_role() = 'administrator', false);
$$;

alter table public.buildings enable row level security;
alter table public.locations enable row level security;
alter table public.maintenance_teams enable row level security;
alter table public.categories enable row level security;
alter table public.routing_rules enable row level security;
alter table public.assets enable row level security;
alter table public.profiles enable row level security;
alter table public.team_members enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.tickets enable row level security;
alter table public.reports enable row level security;
alter table public.ticket_events enable row level security;
alter table public.maintenance_costs enable row level security;
alter table public.resolution_feedback enable row level security;
alter table public.notifications enable row level security;
alter table public.emergency_alerts enable row level security;
alter table public.app_settings enable row level security;
alter table public.rate_limits enable row level security;
alter table public.audit_logs enable row level security;
alter table public.ai_runs enable row level security;

-- Reference data -------------------------------------------------------------
create policy buildings_read on public.buildings for select to authenticated using (public.has_building_access(id));
create policy buildings_admin on public.buildings for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy locations_read on public.locations for select to authenticated using (public.has_building_access(building_id));
create policy locations_admin on public.locations for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy assets_read on public.assets for select to authenticated using (public.has_building_access(building_id));
create policy assets_admin on public.assets for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy teams_read on public.maintenance_teams for select to authenticated using (public.is_staff());
create policy teams_admin on public.maintenance_teams for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy categories_read on public.categories for select to authenticated using (public.is_staff());
create policy categories_admin on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy routing_read on public.routing_rules for select to authenticated using (public.is_staff());
create policy routing_admin on public.routing_rules for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy settings_read on public.app_settings for select to authenticated using (public.is_staff());
create policy settings_admin on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Staff ----------------------------------------------------------------------
create policy profiles_read on public.profiles for select to authenticated using (public.is_staff());
create policy profiles_admin on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy team_members_read on public.team_members for select to authenticated using (public.is_staff());
create policy team_members_admin on public.team_members for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy contacts_read on public.emergency_contacts for select to authenticated using (public.has_building_access(building_id));
create policy contacts_admin on public.emergency_contacts for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Tickets and related records -----------------------------------------------
create policy tickets_read on public.tickets for select to authenticated using (public.has_building_access(building_id));
-- Caretakers (own buildings) and administrators may modify tickets; maintenance
-- staff only tickets assigned to them or their team. Management is read-only.
create policy tickets_update on public.tickets for update to authenticated
  using (public.can_manage_building(building_id) or public.is_assigned_worker(id))
  with check (public.can_manage_building(building_id) or public.is_assigned_worker(id));

create policy reports_read on public.reports for select to authenticated
  using (public.has_building_access((select l.building_id from public.locations l where l.id = location_id)));

create policy events_read on public.ticket_events for select to authenticated
  using (public.has_building_access(public.ticket_building(ticket_id)));
create policy events_insert on public.ticket_events for insert to authenticated
  with check ((public.can_manage_building(public.ticket_building(ticket_id)) or public.is_assigned_worker(ticket_id))
              and actor_id = auth.uid());

create policy costs_read on public.maintenance_costs for select to authenticated
  using (public.has_building_access(public.ticket_building(ticket_id)));
create policy costs_insert on public.maintenance_costs for insert to authenticated
  with check (public.can_manage_building(public.ticket_building(ticket_id)) or public.is_assigned_worker(ticket_id));

create policy feedback_read on public.resolution_feedback for select to authenticated
  using (public.has_building_access(public.ticket_building(ticket_id)));

create policy notifications_read on public.notifications for select to authenticated
  using (ticket_id is null and public.is_admin() or public.has_building_access(public.ticket_building(ticket_id)));

create policy alerts_read on public.emergency_alerts for select to authenticated
  using (public.has_building_access(public.ticket_building(ticket_id)));

create policy audit_read on public.audit_logs for select to authenticated using (public.is_admin());

create policy ai_runs_read on public.ai_runs for select to authenticated
  using (ticket_id is not null and public.has_building_access(public.ticket_building(ticket_id)));

-- rate_limits: no policies -> only the service role can use it.

-- Token columns hold SHA-256 hashes of 256-bit random tokens; a hash cannot be
-- turned back into a usable link, so staff visibility of the column is harmless.

-- ---------------------------------------------------------------------------
-- Private storage bucket for report photographs (Supabase environments only).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('report-images', 'report-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
    on conflict (id) do update set public = false;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Realtime: dashboards subscribe to ticket and alert changes (RLS-filtered).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tickets, public.emergency_alerts, public.reports;
  end if;
end $$;

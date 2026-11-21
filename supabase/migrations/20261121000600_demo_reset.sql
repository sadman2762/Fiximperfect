-- Demo data reset. Deletes every record belonging to demo buildings (and the
-- demo staff accounts are handled by scripts/seed-demo.ts via the Auth admin API).
-- Restricted to the service role.
create or replace function public.demo_reset() returns jsonb
language plpgsql as $$
declare
  v_buildings uuid[] := array(select id from public.buildings where is_demo);
  v_tickets integer;
  v_reports integer;
begin
  delete from public.notifications where ticket_id in (select id from public.tickets where building_id = any(v_buildings))
     or report_id in (select r.id from public.reports r join public.locations l on l.id = r.location_id where l.building_id = any(v_buildings))
     or (ticket_id is null and recipient like '%.example');
  delete from public.ai_runs where report_id in (select r.id from public.reports r join public.locations l on l.id = r.location_id where l.building_id = any(v_buildings));
  delete from public.reports r using public.locations l where l.id = r.location_id and l.building_id = any(v_buildings);
  get diagnostics v_reports = row_count;
  delete from public.tickets where building_id = any(v_buildings);
  get diagnostics v_tickets = row_count;
  delete from public.emergency_contacts where building_id = any(v_buildings);
  delete from public.routing_rules where building_id = any(v_buildings);
  delete from public.assets where building_id = any(v_buildings);
  delete from public.locations where building_id = any(v_buildings);
  delete from public.buildings where id = any(v_buildings);
  delete from public.rate_limits;
  -- Restart ticket numbering only when no real tickets exist.
  if not exists (select 1 from public.tickets) then
    perform setval('public.ticket_number_seq', 1, false);
  end if;
  return jsonb_build_object('deleted_tickets', v_tickets, 'deleted_reports', v_reports);
end;
$$;

revoke execute on function public.demo_reset() from public, anon, authenticated;
grant execute on function public.demo_reset() to service_role;

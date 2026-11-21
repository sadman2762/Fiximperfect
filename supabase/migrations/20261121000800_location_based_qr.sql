-- Location-based QR codes.
-- One QR code identifies one room or shared space; equipment can be replaced
-- without touching it. Purely additive: no asset, report or ticket is deleted.

-- 1. Locations: room number, stable human-readable code, updated_at.
alter table public.locations
  add column if not exists room_number text,
  add column if not exists location_code text,
  add column if not exists updated_at timestamptz not null default now();

update public.locations set location_code = upper(qr_slug) where location_code is null;
alter table public.locations alter column location_code set not null;
create unique index if not exists locations_location_code_key on public.locations(location_code);
alter table public.locations add constraint locations_location_code_format check (location_code ~ '^[A-Z0-9-]{2,80}$');
create index if not exists locations_building_floor_idx on public.locations(building_id, floor);

drop trigger if exists locations_touch on public.locations;
create trigger locations_touch before update on public.locations for each row execute function public.touch_updated_at();

-- A printed QR code must keep working: its slug can never change once created.
create or replace function public.prevent_qr_slug_change() returns trigger
language plpgsql as $$
begin
  if new.qr_slug is distinct from old.qr_slug then
    raise exception 'qr_slug_is_permanent: the QR identifier of a location cannot be changed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists locations_qr_slug_permanent on public.locations;
create trigger locations_qr_slug_permanent before update of qr_slug on public.locations
  for each row execute function public.prevent_qr_slug_change();

-- 2. Reports keep their building and the (optional) equipment category the student chose.
alter table public.reports
  add column if not exists building_id uuid references public.buildings(id) on delete restrict,
  add column if not exists equipment_category text check (equipment_category is null or length(equipment_category) <= 60);

update public.reports r set building_id = l.building_id from public.locations l where l.id = r.location_id and r.building_id is null;

-- Building is always derived from the QR-identified location on the server.
create or replace function public.reports_set_building() returns trigger
language plpgsql as $$
begin
  select building_id into new.building_id from public.locations where id = new.location_id;
  return new;
end;
$$;
drop trigger if exists reports_building on public.reports;
create trigger reports_building before insert or update of location_id on public.reports
  for each row execute function public.reports_set_building();

alter table public.reports alter column building_id set not null;
create index if not exists reports_building_idx on public.reports(building_id);

-- 3. Equipment QR codes are retired. The column stays so labels already printed
--    keep opening their room (resolved to the asset's location), but no new
--    equipment QR codes are generated.
comment on column public.assets.qr_slug is 'DEPRECATED: legacy equipment QR. Resolves to the asset''s location. Do not issue new ones.';

-- 4. Duplicate linking is location-based (see comments in the function).
create or replace function public.attach_report_to_ticket(p jsonb)
returns jsonb
language plpgsql as $$
declare
  v_report public.reports%rowtype;
  v_ticket public.tickets%rowtype;
  v_decision text := p->>'decision';
  v_matched uuid := nullif(p->>'matched_ticket_id', '')::uuid;
  v_candidates uuid[] := coalesce(array(select jsonb_array_elements_text(coalesce(p->'candidate_ids', '[]'::jsonb))::uuid), '{}');
  v_conf numeric := nullif(p->>'confidence', '')::numeric;
  v_reason text := p->>'reason';
  v_t jsonb := coalesce(p->'ticket', '{}'::jsonb);
  v_category text := coalesce(v_t->>'category', 'General');
  v_building uuid;
  v_concurrent uuid;
  v_new_ticket_id uuid;
  v_status public.ticket_status;
  v_safety public.safety_level := coalesce(nullif(v_t->>'safety_level', ''), 'none')::public.safety_level;
  v_priority public.priority_level := coalesce(nullif(v_t->>'priority', ''), 'medium')::public.priority_level;
  v_team uuid := nullif(v_t->>'assigned_team_id', '')::uuid;
  v_escalate boolean := false;
  v_lock_key text;
  v_label text := coalesce(p->>'actor_label', 'AI workflow');
begin
  if v_decision not in ('link', 'new', 'review') then
    raise exception 'invalid decision %', v_decision;
  end if;

  select * into v_report from public.reports where id = (p->>'report_id')::uuid for update;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0002';
  end if;
  if v_report.ticket_id is not null then
    select * into v_ticket from public.tickets where id = v_report.ticket_id;
    return jsonb_build_object('status', 'already_processed', 'ticket_id', v_ticket.id, 'ticket_number', v_ticket.ticket_number);
  end if;

  select building_id into v_building from public.locations where id = v_report.location_id;

  -- One QR code = one location: serialise per location + problem category.
  v_lock_key := v_report.location_id::text || ':' || lower(v_category);
  perform pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

  -- Detect active tickets for the same asset/location+category that the caller did not consider.
  select t.id into v_concurrent
  from public.tickets t
  where t.status not in ('resolved', 'closed')
    and t.building_id = v_building
    and lower(t.category) = lower(v_category)
    and t.location_id = v_report.location_id
    -- Two identified, different machines are different problems.
    and not (v_report.asset_id is not null and t.asset_id is not null and t.asset_id <> v_report.asset_id)
    and not (t.id = any(v_candidates))
  order by t.created_at desc
  limit 1;

  if v_concurrent is not null then
    if coalesce((p->>'retry_count')::int, 0) < 2 then
      return jsonb_build_object('status', 'retry', 'ticket_id', v_concurrent);
    end if;
    -- Retries exhausted: never auto-create a parallel ticket; ask a human instead.
    if v_decision = 'new' then
      v_decision := 'review';
      v_matched := v_concurrent;
      v_reason := 'A ticket for the same asset and category was created concurrently; caretaker review required.';
    end if;
  end if;

  if v_decision = 'link' then
    select * into v_ticket from public.tickets where id = v_matched for update;
    if not found or v_ticket.status in ('closed') or v_ticket.building_id <> v_building then
      -- The AI may never link across buildings or into closed tickets.
      return jsonb_build_object('status', 'retry', 'ticket_id', v_matched, 'reason', 'matched_ticket_not_linkable');
    end if;

    -- The ticket learns which machine it is as soon as any linked report identifies it.
    if v_ticket.asset_id is null and v_report.asset_id is not null then
      update public.tickets set asset_id = v_report.asset_id where id = v_ticket.id;
    end if;

    update public.reports set
      ticket_id = v_ticket.id,
      link_status = 'auto_linked',
      duplicate_confidence = v_conf,
      duplicate_reason = v_reason
    where id = v_report.id;

    insert into public.ticket_events (ticket_id, actor_label, event_type, new_value, note, metadata)
    values (v_ticket.id, v_label, 'report_linked', v_report.report_number, v_reason,
            jsonb_build_object('report_id', v_report.id, 'confidence', v_conf));

    -- A linked report can raise, but never lower, the safety level of the ticket.
    if v_safety = 'critical' and v_ticket.safety_level <> 'critical' then
      update public.tickets set
        safety_level = 'critical',
        priority = 'critical',
        safety_reason = coalesce(v_t->>'safety_reason', safety_reason),
        priority_reason = 'Escalated: a linked report identified a critical safety hazard.'
      where id = v_ticket.id;
      insert into public.ticket_events (ticket_id, actor_label, event_type, old_value, new_value, note)
      values (v_ticket.id, 'Safety rules', 'safety_escalated', v_ticket.safety_level::text, 'critical', v_t->>'safety_reason');
      v_escalate := true;
    end if;

    -- A resolved ticket receiving a fresh report of the same fault is reopened.
    if v_ticket.status = 'resolved' then
      perform public.apply_ticket_transition(v_ticket.id, 'resolved', 'reopened', null, v_label,
        'New report received after resolution: ' || v_report.report_number);
    end if;

    return jsonb_build_object('status', 'linked', 'ticket_id', v_ticket.id, 'ticket_number', v_ticket.ticket_number,
                              'escalate', v_escalate);
  end if;

  -- 'new' or 'review' => create a ticket.
  v_status := case
    when v_decision = 'review' then 'needs_review'
    when coalesce((v_t->>'needs_review')::boolean, false) then 'needs_review'
    when v_team is null then 'needs_review'
    else 'assigned'
  end;

  insert into public.tickets (
    building_id, location_id, asset_id, category, subcategory, title, description,
    priority, priority_reason, safety_level, safety_reason, escalation_status,
    status, needs_review_reason, assigned_team_id, routing_reason, ai_mode, is_demo
  ) values (
    v_building, v_report.location_id, v_report.asset_id, v_category, v_t->>'subcategory',
    coalesce(nullif(v_t->>'title', ''), left(v_report.description, 120)),
    coalesce(nullif(v_t->>'description', ''), v_report.description),
    v_priority, v_t->>'priority_reason', v_safety, v_t->>'safety_reason',
    case when v_safety = 'critical' then 'pending'::public.escalation_status else 'none'::public.escalation_status end,
    v_status,
    case
      when v_decision = 'review' then coalesce(v_reason, 'Possible duplicate requires caretaker review.')
      else v_t->>'needs_review_reason'
    end,
    v_team, v_t->>'routing_reason', coalesce(p->>'ai_mode', 'mock'), v_report.is_demo
  ) returning * into v_ticket;
  v_new_ticket_id := v_ticket.id;

  update public.reports set
    ticket_id = v_new_ticket_id,
    link_status = case when v_decision = 'review' then 'pending_review'::public.report_link_status else 'new_ticket'::public.report_link_status end,
    duplicate_confidence = v_conf,
    duplicate_reason = v_reason,
    suggested_ticket_id = case when v_decision = 'review' then v_matched else null end
  where id = v_report.id;

  insert into public.ticket_events (ticket_id, actor_label, event_type, new_value, note, metadata) values
    (v_new_ticket_id, v_label, 'ticket_created', 'submitted', v_t->>'priority_reason',
       jsonb_build_object('report_id', v_report.id, 'priority', v_priority, 'safety_level', v_safety)),
    (v_new_ticket_id, v_label, 'report_linked', v_report.report_number, 'First report for this ticket.',
       jsonb_build_object('report_id', v_report.id));

  if v_status = 'assigned' then
    insert into public.ticket_events (ticket_id, actor_label, event_type, old_value, new_value, note)
    values (v_new_ticket_id, v_label, 'status_changed', 'submitted', 'assigned', v_t->>'routing_reason');
    insert into public.ticket_events (ticket_id, actor_label, event_type, new_value, note)
    values (v_new_ticket_id, v_label, 'team_assigned', v_team::text, v_t->>'routing_reason');
  else
    insert into public.ticket_events (ticket_id, actor_label, event_type, old_value, new_value, note)
    values (v_new_ticket_id, v_label, 'status_changed', 'submitted', 'needs_review', v_ticket.needs_review_reason);
  end if;

  if v_decision = 'review' and v_matched is not null then
    insert into public.ticket_events (ticket_id, actor_label, event_type, new_value, note, metadata)
    values (v_new_ticket_id, v_label, 'possible_duplicate', v_matched::text, v_reason,
            jsonb_build_object('confidence', v_conf));
  end if;

  return jsonb_build_object('status', 'created', 'ticket_id', v_new_ticket_id, 'ticket_number', v_ticket.ticket_number,
                            'ticket_status', v_status, 'escalate', v_safety = 'critical');
end;
$$;

revoke execute on function public.attach_report_to_ticket(jsonb) from public, anon, authenticated;
grant execute on function public.attach_report_to_ticket(jsonb) to service_role;

-- Transactional workflow functions. These are executed server-side with the
-- service role only; EXECUTE is revoked from anon/authenticated at the end.

-- ---------------------------------------------------------------------------
-- Settings helper
-- ---------------------------------------------------------------------------
create or replace function public.setting_numeric(p_key text, p_default numeric)
returns numeric language sql stable as $$
  select coalesce((select (value #>> '{}')::numeric from public.app_settings where key = p_key), p_default);
$$;

-- ---------------------------------------------------------------------------
-- Ticket lifecycle state machine (mirrors src/lib/tickets/state-machine.ts)
-- ---------------------------------------------------------------------------
create or replace function public.is_valid_transition(p_from public.ticket_status, p_to public.ticket_status)
returns boolean language sql immutable as $$
  select case p_from
    when 'submitted'         then p_to in ('needs_review', 'assigned', 'in_progress', 'closed')
    when 'needs_review'      then p_to in ('submitted', 'assigned', 'in_progress', 'closed')
    when 'assigned'          then p_to in ('needs_review', 'in_progress', 'waiting_for_parts', 'resolved')
    when 'in_progress'       then p_to in ('assigned', 'waiting_for_parts', 'resolved')
    when 'waiting_for_parts' then p_to in ('in_progress', 'resolved')
    when 'resolved'          then p_to in ('closed', 'reopened')
    when 'reopened'          then p_to in ('assigned', 'in_progress', 'waiting_for_parts', 'resolved', 'needs_review')
    when 'closed'            then p_to in ('reopened')
    else false
  end;
$$;

-- Atomically changes status and writes the audit event. Returns the event id.
-- p_expected_status provides optimistic concurrency: the update fails if the
-- ticket changed underneath the caller.
create or replace function public.apply_ticket_transition(
  p_ticket_id uuid,
  p_expected_status public.ticket_status,
  p_new_status public.ticket_status,
  p_actor_id uuid,
  p_actor_label text,
  p_note text default null,
  p_metadata jsonb default null
) returns uuid
language plpgsql as $$
declare
  v_ticket public.tickets%rowtype;
  v_event_id uuid;
begin
  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'ticket_not_found' using errcode = 'P0002';
  end if;
  if p_expected_status is not null and v_ticket.status <> p_expected_status then
    raise exception 'status_conflict: expected %, found %', p_expected_status, v_ticket.status using errcode = 'P0001';
  end if;
  if not public.is_valid_transition(v_ticket.status, p_new_status) then
    raise exception 'invalid_transition: % -> %', v_ticket.status, p_new_status using errcode = 'P0001';
  end if;

  update public.tickets set
    status = p_new_status,
    resolved_at = case when p_new_status = 'resolved' then now() else resolved_at end,
    resolution_verified = case when p_new_status in ('resolved', 'reopened') then false else resolution_verified end,
    verified_at = case when p_new_status in ('resolved', 'reopened') then null else verified_at end,
    closed_at = case when p_new_status = 'closed' then now() when p_new_status = 'reopened' then null else closed_at end,
    reopened_count = reopened_count + case when p_new_status = 'reopened' then 1 else 0 end
  where id = p_ticket_id;

  insert into public.ticket_events (ticket_id, actor_id, actor_label, event_type, old_value, new_value, note, metadata)
  values (p_ticket_id, p_actor_id, coalesce(p_actor_label, 'system'), 'status_changed', v_ticket.status::text, p_new_status::text, p_note, p_metadata)
  returning id into v_event_id;

  return v_event_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Concurrency-safe report -> ticket linking
--
-- Input (jsonb):
--   report_id, decision ('link' | 'new' | 'review'), matched_ticket_id,
--   candidate_ids (uuid[] the duplicate agent compared against),
--   confidence, reason, ticket (fields for a new ticket), ai_mode
--
-- Output: { status: 'linked' | 'created' | 'retry' | 'already_processed', ticket_id, ticket_number, ... }
--
-- A transaction-scoped advisory lock keyed on (asset or location, category)
-- serialises concurrent submissions about the same thing. If a matching active
-- ticket appeared after the caller retrieved its candidates, 'retry' is
-- returned so the duplicate agent can re-evaluate with the new candidate,
-- instead of silently creating a second ticket.
-- ---------------------------------------------------------------------------
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

  v_lock_key := coalesce(v_report.asset_id::text, v_report.location_id::text) || ':' || lower(v_category);
  perform pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

  -- Detect active tickets for the same asset/location+category that the caller did not consider.
  select t.id into v_concurrent
  from public.tickets t
  where t.status not in ('resolved', 'closed')
    and t.building_id = v_building
    and lower(t.category) = lower(v_category)
    and (
      (v_report.asset_id is not null and t.asset_id = v_report.asset_id)
      or (v_report.asset_id is null and t.location_id = v_report.location_id)
    )
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

-- ---------------------------------------------------------------------------
-- Caretaker decision on a possible duplicate: merge the review ticket's reports
-- into the target ticket. Reports are moved, never deleted; the review ticket
-- is closed with a 'merged_into' event so its history is preserved.
-- ---------------------------------------------------------------------------
create or replace function public.merge_ticket_into(
  p_source_ticket uuid, p_target_ticket uuid, p_actor_id uuid, p_actor_label text
) returns jsonb
language plpgsql as $$
declare
  v_source public.tickets%rowtype;
  v_target public.tickets%rowtype;
  v_moved integer;
begin
  if p_source_ticket = p_target_ticket then
    raise exception 'cannot_merge_into_self';
  end if;
  select * into v_source from public.tickets where id = p_source_ticket for update;
  select * into v_target from public.tickets where id = p_target_ticket for update;
  if v_source.id is null or v_target.id is null then
    raise exception 'ticket_not_found' using errcode = 'P0002';
  end if;
  if v_source.building_id <> v_target.building_id then
    raise exception 'cannot_merge_across_buildings';
  end if;
  if v_target.status = 'closed' then
    raise exception 'target_closed';
  end if;

  update public.reports set ticket_id = v_target.id, link_status = 'manually_linked', suggested_ticket_id = null
  where ticket_id = v_source.id;
  get diagnostics v_moved = row_count;

  if v_source.safety_level = 'critical' and v_target.safety_level <> 'critical' then
    update public.tickets set safety_level = 'critical', priority = 'critical',
      safety_reason = v_source.safety_reason, priority_reason = 'Escalated by merged critical report.'
    where id = v_target.id;
  end if;

  insert into public.ticket_events (ticket_id, actor_id, actor_label, event_type, new_value, note)
  values (v_target.id, p_actor_id, p_actor_label, 'tickets_merged', v_source.ticket_number,
          v_moved || ' report(s) merged from ' || v_source.ticket_number);

  update public.tickets set status = 'closed', closed_at = now(), merged_into = v_target.id,
    needs_review_reason = 'Merged into ' || v_target.ticket_number
  where id = v_source.id;
  insert into public.ticket_events (ticket_id, actor_id, actor_label, event_type, old_value, new_value, note)
  values (v_source.id, p_actor_id, p_actor_label, 'merged_into', v_source.status::text, v_target.ticket_number,
          'Duplicate confirmed by caretaker.');

  return jsonb_build_object('moved_reports', v_moved, 'target_ticket_number', v_target.ticket_number);
end;
$$;

-- ---------------------------------------------------------------------------
-- Student resolution feedback. Responses are stored individually; any negative
-- response from a legitimate linked reporter reopens the ticket; the ticket is
-- student-verified only when every eligible reporter for the resolution event
-- has confirmed the fix.
-- ---------------------------------------------------------------------------
create or replace function public.submit_resolution_feedback(
  p_feedback_id uuid, p_response public.feedback_response, p_comment text
) returns jsonb
language plpgsql as $$
declare
  v_fb public.resolution_feedback%rowtype;
  v_ticket public.tickets%rowtype;
  v_latest_resolution uuid;
  v_pending integer;
  v_negative integer;
  v_reopened boolean := false;
  v_verified boolean := false;
begin
  select * into v_fb from public.resolution_feedback where id = p_feedback_id for update;
  if not found then
    raise exception 'feedback_not_found' using errcode = 'P0002';
  end if;
  if v_fb.response is not null then
    raise exception 'already_responded' using errcode = 'P0001';
  end if;
  if v_fb.expires_at < now() then
    raise exception 'feedback_expired' using errcode = 'P0001';
  end if;

  update public.resolution_feedback set response = p_response, comment = p_comment, responded_at = now()
  where id = p_feedback_id;

  select * into v_ticket from public.tickets where id = v_fb.ticket_id for update;

  -- Is this feedback about the most recent resolution of the ticket?
  select e.id into v_latest_resolution from public.ticket_events e
  where e.ticket_id = v_ticket.id and e.event_type = 'status_changed' and e.new_value = 'resolved'
  order by e.created_at desc limit 1;

  insert into public.ticket_events (ticket_id, actor_label, event_type, new_value, note, metadata)
  values (v_ticket.id, 'Student feedback', case when p_response = 'fixed' then 'feedback_positive' else 'feedback_negative' end,
          p_response::text, p_comment,
          jsonb_build_object('feedback_id', v_fb.id, 'report_id', v_fb.report_id, 'resolution_event_id', v_fb.resolution_event_id));

  if p_response = 'still_broken' then
    if v_ticket.status in ('resolved', 'closed') and v_latest_resolution = v_fb.resolution_event_id then
      perform public.apply_ticket_transition(v_ticket.id, v_ticket.status, 'reopened', null, 'Student feedback',
        'Reopened automatically: a reporting student says the problem is not fixed.',
        jsonb_build_object('feedback_id', v_fb.id));
      v_reopened := true;
    end if;
  elsif v_latest_resolution = v_fb.resolution_event_id and v_ticket.status in ('resolved', 'closed') then
    select count(*) filter (where response is null), count(*) filter (where response = 'still_broken')
      into v_pending, v_negative
    from public.resolution_feedback where resolution_event_id = v_fb.resolution_event_id;
    if v_pending = 0 and v_negative = 0 then
      update public.tickets set resolution_verified = true, verified_at = now() where id = v_ticket.id;
      insert into public.ticket_events (ticket_id, actor_label, event_type, new_value, note)
      values (v_ticket.id, 'Student feedback', 'student_verified', 'true', 'All reporting students confirmed the fix.');
      v_verified := true;
    end if;
  end if;

  return jsonb_build_object('ticket_id', v_ticket.id, 'reopened', v_reopened, 'verified', v_verified);
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixed-window rate limiter for public endpoints.
-- ---------------------------------------------------------------------------
create or replace function public.check_rate_limit(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limits (bucket, window_start, hits) values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;
  -- Opportunistic cleanup of old windows.
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return v_hits <= p_max;
end;
$$;

-- Only the server (service role) may run workflow functions.
revoke execute on function public.apply_ticket_transition(uuid, public.ticket_status, public.ticket_status, uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.attach_report_to_ticket(jsonb) from public, anon, authenticated;
revoke execute on function public.merge_ticket_into(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.submit_resolution_feedback(uuid, public.feedback_response, text) from public, anon, authenticated;
revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.apply_ticket_transition(uuid, public.ticket_status, public.ticket_status, uuid, text, text, jsonb) to service_role;
grant execute on function public.attach_report_to_ticket(jsonb) to service_role;
grant execute on function public.merge_ticket_into(uuid, uuid, uuid, text) to service_role;
grant execute on function public.submit_resolution_feedback(uuid, public.feedback_response, text) to service_role;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

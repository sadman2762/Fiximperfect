-- Analytics and asset intelligence. Every figure shown on dashboards is
-- computed here from stored records; the LLM never produces statistics.
-- Functions are SECURITY INVOKER so that, when called with a staff session,
-- Row Level Security limits results to buildings the user may access.

-- Tickets that represent a real, unique problem (merged duplicates excluded).
create or replace view public.unique_tickets with (security_invoker = true) as
  select * from public.tickets where merged_into is null;

-- ---------------------------------------------------------------------------
-- Asset intelligence: failure frequency, repair spend, replacement comparison
-- ---------------------------------------------------------------------------
create or replace function public.asset_intelligence(p_asset_id uuid default null)
returns table (
  asset_id uuid,
  asset_code text,
  asset_name text,
  category text,
  building_id uuid,
  building_name text,
  location_name text,
  floor integer,
  installation_date date,
  age_years numeric,
  expected_useful_life_years integer,
  currency text,
  replacement_cost numeric,
  failures_30d integer,
  failures_60d integer,
  failures_90d integer,
  failures_total integer,
  repair_count integer,
  cumulative_repair_cost numeric,
  average_repair_cost numeric,
  other_currency_costs jsonb,
  mean_days_between_failures numeric,
  repeat_failures_after_repair integer,
  repair_to_replacement_ratio numeric,
  failure_threshold integer,
  window_days integer,
  ratio_threshold numeric,
  flag_frequent_failures boolean,
  flag_cost_exceeds_replacement boolean,
  flag_beyond_useful_life boolean,
  replacement_review boolean
)
language sql stable security invoker as $$
  with cfg as (
    select public.setting_numeric('replacement_failure_threshold', 4)::int as fail_threshold,
           public.setting_numeric('replacement_window_days', 60)::int as window_days,
           public.setting_numeric('replacement_cost_ratio_threshold', 100) as ratio_threshold
  ),
  t as (
    select tk.asset_id, tk.id, tk.created_at, tk.resolved_at, tk.reopened_count
    from public.tickets tk
    where tk.asset_id is not null and tk.merged_into is null
      and (p_asset_id is null or tk.asset_id = p_asset_id)
  ),
  fails as (
    select t.asset_id,
      count(*) filter (where t.created_at >= now() - interval '30 days')::int as f30,
      count(*) filter (where t.created_at >= now() - interval '60 days')::int as f60,
      count(*) filter (where t.created_at >= now() - interval '90 days')::int as f90,
      count(*) filter (where t.created_at >= now() - make_interval(days => (select window_days from cfg)))::int as fwin,
      count(*)::int as ftotal,
      case when count(*) > 1
        then round((extract(epoch from max(t.created_at) - min(t.created_at)) / 86400.0 / (count(*) - 1))::numeric, 1)
      end as mean_gap,
      coalesce(sum(t.reopened_count), 0)::int as reopens
    from t group by t.asset_id
  ),
  repeats as (
    -- A new failure within 30 days of a previous repair on the same asset.
    select a.asset_id, count(*)::int as n
    from t a
    where exists (
      select 1 from t b
      where b.asset_id = a.asset_id and b.id <> a.id and b.resolved_at is not null
        and a.created_at > b.resolved_at and a.created_at <= b.resolved_at + interval '30 days'
    )
    group by a.asset_id
  ),
  costs as (
    select mc.asset_id, mc.currency, sum(mc.total_cost) as total, count(distinct mc.ticket_id)::int as repairs
    from public.maintenance_costs mc
    where mc.asset_id is not null and (p_asset_id is null or mc.asset_id = p_asset_id)
    group by mc.asset_id, mc.currency
  )
  select
    a.id, a.asset_code, a.asset_name, a.category, a.building_id, b.name, l.area_name, l.floor,
    a.installation_date,
    case when a.installation_date is not null
      then round((extract(epoch from (now() - a.installation_date::timestamptz)) / 31557600.0)::numeric, 1) end,
    a.expected_useful_life_years,
    a.currency::text,
    a.replacement_cost,
    coalesce(f.f30, 0), coalesce(f.f60, 0), coalesce(f.f90, 0), coalesce(f.ftotal, 0),
    coalesce(c.repairs, 0),
    coalesce(c.total, 0)::numeric(12,2),
    case when coalesce(c.repairs, 0) > 0 then round(c.total / c.repairs, 2) else 0 end,
    coalesce((select jsonb_object_agg(oc.currency, oc.total) from costs oc
              where oc.asset_id = a.id and oc.currency <> a.currency), '{}'::jsonb),
    f.mean_gap,
    coalesce(r.n, 0) + coalesce(f.reopens, 0),
    case when a.replacement_cost > 0 then round(coalesce(c.total, 0) / a.replacement_cost * 100, 1) end,
    cfg.fail_threshold, cfg.window_days, cfg.ratio_threshold,
    coalesce(f.fwin, 0) >= cfg.fail_threshold,
    a.replacement_cost > 0 and coalesce(c.total, 0) / a.replacement_cost * 100 > cfg.ratio_threshold,
    a.installation_date is not null and a.expected_useful_life_years is not null
      and a.installation_date + make_interval(years => a.expected_useful_life_years) < current_date,
    coalesce(f.fwin, 0) >= cfg.fail_threshold
      and a.replacement_cost > 0 and coalesce(c.total, 0) / a.replacement_cost * 100 > cfg.ratio_threshold
  from public.assets a
  join public.buildings b on b.id = a.building_id
  join public.locations l on l.id = a.location_id
  cross join cfg
  left join fails f on f.asset_id = a.id
  left join repeats r on r.asset_id = a.id
  left join costs c on c.asset_id = a.id and c.currency = a.currency
  where (p_asset_id is null or a.id = p_asset_id);
$$;

-- ---------------------------------------------------------------------------
-- Operational overview metrics (caretaker + management dashboards)
-- ---------------------------------------------------------------------------
create or replace function public.analytics_overview(p_since timestamptz default null)
returns jsonb
language sql stable security invoker as $$
  with tk as (
    select * from public.tickets
    where merged_into is null and (p_since is null or created_at >= p_since)
  ),
  rp as (
    select r.* from public.reports r
    where (p_since is null or r.created_at >= p_since)
  ),
  ever_resolved as (
    select distinct e.ticket_id from public.ticket_events e
    join tk on tk.id = e.ticket_id
    where e.event_type = 'status_changed' and e.new_value = 'resolved'
  ),
  repeat_after_resolution as (
    select count(*)::int as n from tk a
    where a.asset_id is not null and exists (
      select 1 from public.tickets b
      where b.asset_id = a.asset_id and b.id <> a.id and b.merged_into is null and b.resolved_at is not null
        and a.created_at > b.resolved_at and a.created_at <= b.resolved_at + interval '30 days')
  )
  select jsonb_build_object(
    'total_reports', (select count(*) from rp),
    'unique_tickets', (select count(*) from tk),
    'tickets_with_reports', (select count(distinct ticket_id) from rp where ticket_id is not null),
    'duplicate_reports', (select count(*) from rp where ticket_id is not null)
                         - (select count(distinct ticket_id) from rp where ticket_id is not null),
    'duplicate_report_rate', (select case when count(*) = 0 then 0 else
        round(((count(*) filter (where ticket_id is not null)) - count(distinct ticket_id))::numeric / count(*) * 100, 1) end from rp),
    'active_tickets', (select count(*) from tk where status not in ('resolved', 'closed')),
    'critical_active', (select count(*) from tk where status not in ('resolved', 'closed') and priority = 'critical'),
    'high_active', (select count(*) from tk where status not in ('resolved', 'closed') and priority = 'high'),
    'unassigned_active', (select count(*) from tk where status not in ('resolved', 'closed') and assigned_team_id is null and assigned_to is null),
    'needs_review', (select count(*) from tk where status = 'needs_review'),
    'in_progress', (select count(*) from tk where status = 'in_progress'),
    'reopened_active', (select count(*) from tk where status = 'reopened'),
    'avg_resolution_hours', (select round((avg(extract(epoch from resolved_at - created_at)) / 3600.0)::numeric, 1) from tk where resolved_at is not null),
    'tickets_marked_resolved', (select count(*) from ever_resolved),
    'student_verified', (select count(*) from tk where resolution_verified),
    'verified_resolution_rate', (select case when (select count(*) from ever_resolved) = 0 then null else
        round((select count(*) from tk where resolution_verified)::numeric / (select count(*) from ever_resolved) * 100, 1) end),
    'reopened_tickets', (select count(*) from tk where reopened_count > 0),
    'reopened_rate', (select case when (select count(*) from ever_resolved) = 0 then null else
        round((select count(*) from tk where reopened_count > 0)::numeric / (select count(*) from ever_resolved) * 100, 1) end),
    'unverified_resolutions', (select count(*) from tk where status in ('resolved', 'closed') and not resolution_verified),
    'avg_hours_to_verified', (select round((avg(extract(epoch from verified_at - created_at)) / 3600.0)::numeric, 1) from tk where verified_at is not null),
    'repeat_failures_after_resolution', (select n from repeat_after_resolution),
    'costs_by_currency', coalesce((select jsonb_object_agg(currency, total) from (
        select mc.currency, sum(mc.total_cost) as total from public.maintenance_costs mc
        join tk on tk.id = mc.ticket_id group by mc.currency) c), '{}'::jsonb),
    'open_emergencies', (select count(*) from tk where safety_level = 'critical' and escalation_status in ('pending', 'alerting', 'exhausted'))
  );
$$;

create or replace function public.analytics_breakdowns(p_since timestamptz default null)
returns jsonb
language sql stable security invoker as $$
  with tk as (
    select * from public.tickets where merged_into is null and (p_since is null or created_at >= p_since)
  )
  select jsonb_build_object(
    'by_category', coalesce((select jsonb_agg(x order by x.tickets desc) from (
        select category, count(*)::int as tickets,
               (select count(*) from public.reports r join tk t2 on t2.id = r.ticket_id where t2.category = tk.category)::int as reports
        from tk group by category) x), '[]'::jsonb),
    'by_building', coalesce((select jsonb_agg(x order by x.building_name) from (
        select b.id as building_id, b.name as building_name,
          (select count(*) from public.reports r join tk t on t.id = r.ticket_id where t.building_id = b.id)::int as reports,
          (select count(*) from tk t where t.building_id = b.id)::int as tickets,
          (select count(*) from tk t where t.building_id = b.id and t.safety_level = 'critical')::int as critical_incidents,
          (select count(*) from (select t.asset_id from tk t where t.building_id = b.id and t.asset_id is not null
              and t.created_at >= now() - interval '90 days' group by t.asset_id having count(*) >= 2) s)::int as recurring_assets,
          (select round((avg(extract(epoch from t.resolved_at - t.created_at)) / 3600.0)::numeric, 1)
              from tk t where t.building_id = b.id and t.resolved_at is not null) as avg_resolution_hours,
          coalesce((select jsonb_object_agg(c.currency, c.total) from (
              select mc.currency, sum(mc.total_cost) as total from public.maintenance_costs mc
              join tk t on t.id = mc.ticket_id where t.building_id = b.id group by mc.currency) c), '{}'::jsonb) as costs
        from public.buildings b) x), '[]'::jsonb),
    'team_workload', coalesce((select jsonb_agg(x order by x.open_tickets desc) from (
        select mt.id as team_id, mt.team_name,
          (select count(*) from tk t where t.assigned_team_id = mt.id and t.status not in ('resolved', 'closed'))::int as open_tickets,
          (select count(*) from tk t where t.assigned_team_id = mt.id and t.status = 'in_progress')::int as in_progress,
          (select count(*) from tk t where t.assigned_team_id = mt.id and t.status in ('resolved', 'closed'))::int as completed
        from public.maintenance_teams mt) x), '[]'::jsonb),
    'weekly_trend', coalesce((select jsonb_agg(x order by x.week) from (
        select to_char(date_trunc('week', t.created_at), 'YYYY-MM-DD') as week, b.name as building_name, count(*)::int as tickets
        from tk t join public.buildings b on b.id = t.building_id
        where t.created_at >= now() - interval '12 weeks'
        group by 1, 2) x), '[]'::jsonb),
    'status_distribution', coalesce((select jsonb_object_agg(status, n) from (
        select status::text, count(*)::int as n from tk group by status) s), '{}'::jsonb)
  );
$$;

grant execute on function public.asset_intelligence(uuid) to authenticated, service_role;
grant execute on function public.analytics_overview(timestamptz) to authenticated, service_role;
grant execute on function public.analytics_breakdowns(timestamptz) to authenticated, service_role;

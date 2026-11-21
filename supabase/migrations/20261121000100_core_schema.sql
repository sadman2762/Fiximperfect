-- Fiximperfect core schema
-- Reports (one per student submission) are strictly separated from tickets
-- (one per underlying maintenance problem). Money is numeric(12,2), never float.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.staff_role as enum ('caretaker', 'maintenance_staff', 'administrator', 'management');
create type public.ticket_status as enum (
  'submitted', 'needs_review', 'assigned', 'in_progress', 'waiting_for_parts', 'resolved', 'reopened', 'closed'
);
create type public.priority_level as enum ('low', 'medium', 'high', 'critical');
create type public.safety_level as enum ('none', 'low', 'elevated', 'critical');
create type public.escalation_status as enum ('none', 'pending', 'alerting', 'acknowledged', 'exhausted');
create type public.location_type as enum ('laundry', 'kitchen', 'corridor', 'bathroom', 'common_room', 'bedroom', 'technical', 'other');
create type public.asset_operational_status as enum ('operational', 'degraded', 'out_of_service', 'retired');
create type public.asset_condition as enum ('new', 'good', 'fair', 'poor', 'critical');
create type public.notification_channel as enum ('email', 'sms', 'voice', 'realtime');
create type public.delivery_status as enum ('queued', 'sent', 'delivered', 'failed', 'simulated');
create type public.feedback_response as enum ('fixed', 'still_broken');
create type public.report_link_status as enum ('new_ticket', 'auto_linked', 'pending_review', 'manually_linked', 'review_new_ticket');
create type public.contact_role as enum ('primary_caretaker', 'secondary_caretaker', 'backup_maintenance');

-- ---------------------------------------------------------------------------
-- Generic updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Organisation structure
-- ---------------------------------------------------------------------------
create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique check (code ~ '^[A-Z0-9-]{2,20}$'),
  address text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  floor integer not null,
  area_name text not null,
  qr_slug text not null unique check (qr_slug ~ '^[a-z0-9-]{3,80}$'),
  location_type public.location_type not null default 'other',
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index locations_building_idx on public.locations(building_id);

create table public.maintenance_teams (
  id uuid primary key default gen_random_uuid(),
  team_name text not null unique,
  description text,
  responsible_categories text[] not null default '{}',
  is_manual_review_queue boolean not null default false,
  created_at timestamptz not null default now()
);

-- Maintenance categories (configurable by administrators) and their default routing.
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  default_team_id uuid references public.maintenance_teams(id) on delete set null,
  default_priority public.priority_level not null default 'medium',
  created_at timestamptz not null default now()
);

-- Optional per-building routing overrides (category + building -> team).
create table public.routing_rules (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  building_id uuid references public.buildings(id) on delete cascade,
  team_id uuid not null references public.maintenance_teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique nulls not distinct (category_id, building_id)
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  asset_code text not null unique check (asset_code ~ '^[A-Z0-9-]{3,40}$'),
  asset_name text not null,
  category text not null,
  manufacturer text,
  model text,
  building_id uuid not null references public.buildings(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  qr_slug text unique check (qr_slug ~ '^[a-z0-9-]{3,80}$'),
  installation_date date,
  purchase_date date,
  purchase_cost numeric(12,2) check (purchase_cost >= 0),
  replacement_cost numeric(12,2) check (replacement_cost >= 0),
  currency char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  expected_useful_life_years integer check (expected_useful_life_years > 0),
  condition public.asset_condition not null default 'good',
  operational_status public.asset_operational_status not null default 'operational',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assets_building_idx on public.assets(building_id);
create index assets_location_idx on public.assets(location_id);
create index assets_category_idx on public.assets(category);
create trigger assets_touch before update on public.assets for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  phone text,
  role public.staff_role not null,
  -- Buildings this account may access. Administrators and management have system-wide read access.
  building_access uuid[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.maintenance_teams(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (team_id, profile_id)
);

create table public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  contact_role public.contact_role not null,
  escalation_order integer not null check (escalation_order between 1 and 10),
  name text not null,
  email text,
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (building_id, escalation_order),
  check (email is not null or phone is not null)
);

-- ---------------------------------------------------------------------------
-- Tickets and reports
-- ---------------------------------------------------------------------------
create sequence public.ticket_number_seq start 1;

create or replace function public.next_ticket_number() returns text
language sql volatile as $$
  select 'MNT-' || lpad(n::text, greatest(3, length(n::text)), '0')
  from (select nextval('public.ticket_number_seq') as n) s;
$$;

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique default public.next_ticket_number(),
  building_id uuid not null references public.buildings(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  asset_id uuid references public.assets(id) on delete set null,
  category text not null,
  subcategory text,
  title text not null,
  description text not null,
  priority public.priority_level not null default 'medium',
  priority_reason text,
  safety_level public.safety_level not null default 'none',
  safety_reason text,
  escalation_status public.escalation_status not null default 'none',
  status public.ticket_status not null default 'submitted',
  needs_review_reason text,
  assigned_team_id uuid references public.maintenance_teams(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  routing_reason text,
  resolved_at timestamptz,
  resolution_verified boolean not null default false,
  verified_at timestamptz,
  closed_at timestamptz,
  reopened_count integer not null default 0 check (reopened_count >= 0),
  merged_into uuid references public.tickets(id) on delete set null,
  ai_mode text not null default 'mock' check (ai_mode in ('live', 'mock', 'manual')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tickets_building_idx on public.tickets(building_id);
create index tickets_asset_idx on public.tickets(asset_id);
create index tickets_status_idx on public.tickets(status);
create index tickets_priority_idx on public.tickets(priority);
create index tickets_created_idx on public.tickets(created_at desc);
create index tickets_category_idx on public.tickets(category);
create index tickets_location_idx on public.tickets(location_id);
create index tickets_team_idx on public.tickets(assigned_team_id);
create trigger tickets_touch before update on public.tickets for each row execute function public.touch_updated_at();

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  report_number text not null unique default ('RPT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  ticket_id uuid references public.tickets(id) on delete set null,
  location_id uuid not null references public.locations(id) on delete restrict,
  asset_id uuid references public.assets(id) on delete set null,
  reporter_name text not null check (length(reporter_name) between 1 and 120),
  reporter_email text not null check (reporter_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  description text not null check (length(description) between 3 and 4000),
  additional_details text check (additional_details is null or length(additional_details) <= 4000),
  image_path text,
  ai_analysis jsonb,
  processing_status text not null default 'received' check (processing_status in ('received', 'processing', 'processed', 'failed')),
  processing_error text,
  link_status public.report_link_status,
  duplicate_confidence numeric(4,3) check (duplicate_confidence between 0 and 1),
  duplicate_reason text,
  suggested_ticket_id uuid references public.tickets(id) on delete set null,
  tracking_token_hash text not null unique,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index reports_ticket_idx on public.reports(ticket_id);
create index reports_location_idx on public.reports(location_id);
create index reports_asset_idx on public.reports(asset_id);
create index reports_created_idx on public.reports(created_at desc);
create index reports_email_idx on public.reports(lower(reporter_email));

create table public.ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_label text not null default 'system',
  event_type text not null,
  old_value text,
  new_value text,
  note text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index ticket_events_ticket_idx on public.ticket_events(ticket_id, created_at);
create index ticket_events_type_idx on public.ticket_events(event_type);

create table public.maintenance_costs (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null,
  parts_cost numeric(12,2) not null default 0 check (parts_cost >= 0),
  labour_cost numeric(12,2) not null default 0 check (labour_cost >= 0),
  other_cost numeric(12,2) not null default 0 check (other_cost >= 0),
  -- Always computed by the database; client-submitted totals are never trusted.
  total_cost numeric(12,2) generated always as (parts_cost + labour_cost + other_cost) stored,
  currency char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  expense_date date not null default current_date,
  notes text,
  recorded_by uuid references public.profiles(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index maintenance_costs_ticket_idx on public.maintenance_costs(ticket_id);
create index maintenance_costs_asset_idx on public.maintenance_costs(asset_id, expense_date);

create table public.resolution_feedback (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  reporter_email text not null,
  feedback_token_hash text not null unique,
  response public.feedback_response,
  comment text check (comment is null or length(comment) <= 2000),
  resolution_event_id uuid not null references public.ticket_events(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  -- One request per reporter per resolution event; prevents duplicate requests.
  unique (resolution_event_id, reporter_email)
);
create index resolution_feedback_ticket_idx on public.resolution_feedback(ticket_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.tickets(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  audience text not null check (audience in ('student', 'caretaker', 'management', 'team')),
  recipient text not null,
  channel public.notification_channel not null,
  notification_type text not null,
  subject text,
  -- Body preview. Secure links are redacted unless the message was simulated in demo mode.
  body_preview text,
  delivery_status public.delivery_status not null default 'queued',
  provider text,
  provider_reference text,
  error_message text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index notifications_ticket_idx on public.notifications(ticket_id);
create index notifications_created_idx on public.notifications(created_at desc);

create table public.emergency_alerts (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  severity public.safety_level not null,
  contact_id uuid references public.emergency_contacts(id) on delete set null,
  recipient text not null,
  recipient_name text,
  channel public.notification_channel not null,
  delivery_status public.delivery_status not null default 'queued',
  provider_reference text,
  error_message text,
  ack_token_hash text unique,
  acknowledged_at timestamptz,
  acknowledged_by text,
  escalation_attempt integer not null default 1 check (escalation_attempt >= 1),
  escalate_after timestamptz,
  created_at timestamptz not null default now()
);
create index emergency_alerts_ticket_idx on public.emergency_alerts(ticket_id);
create index emergency_alerts_pending_idx on public.emergency_alerts(escalate_after) where acknowledged_at is null;

-- ---------------------------------------------------------------------------
-- Configuration, rate limiting and audit
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_label text not null default 'system',
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs(created_at desc);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete set null,
  agent text not null,
  mode text not null check (mode in ('live', 'mock')),
  model text,
  input_summary jsonb,
  output jsonb,
  valid boolean not null default true,
  error text,
  latency_ms integer,
  created_at timestamptz not null default now()
);
create index ai_runs_report_idx on public.ai_runs(report_id);

insert into public.app_settings (key, value, description) values
  ('duplicate_auto_link_threshold', '0.85', 'Confidence at or above which a report is linked automatically to an existing ticket.'),
  ('duplicate_review_threshold', '0.65', 'Confidence at or above which a possible duplicate is flagged for caretaker review.'),
  ('duplicate_window_days', '14', 'How many days back to search for related active tickets.'),
  ('classification_review_threshold', '0.55', 'Classifications below this confidence are sent to the review queue.'),
  ('emergency_ack_timeout_minutes', '10', 'Minutes before an unacknowledged emergency alert escalates to the next contact.'),
  ('replacement_failure_threshold', '4', 'Failures within the replacement window that trigger a replacement review.'),
  ('replacement_window_days', '60', 'Window (days) for counting failures for replacement review.'),
  ('replacement_cost_ratio_threshold', '100', 'Repair-to-replacement ratio (%) that triggers a replacement review.'),
  ('feedback_token_ttl_days', '14', 'Days a resolution feedback link remains valid.'),
  ('backlog_alert_threshold', '25', 'Open tickets per building that trigger a management backlog notification.');

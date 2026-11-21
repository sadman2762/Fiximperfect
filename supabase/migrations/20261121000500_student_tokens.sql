-- Additional student access tokens. The primary tracking token hash lives on
-- reports.tracking_token_hash; further tokens are issued for status-update
-- emails (tracking) and for the "my reports" history link (history).
create table public.student_access_tokens (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('tracking', 'history')),
  report_id uuid references public.reports(id) on delete cascade,
  reporter_email text,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check ((purpose = 'tracking' and report_id is not null) or (purpose = 'history' and reporter_email is not null))
);
create index student_access_tokens_report_idx on public.student_access_tokens(report_id);
alter table public.student_access_tokens enable row level security;
-- No policies: only the service role (server routes verifying tokens) can read it.

-- Staff "acknowledge" from the dashboard and the escalation job need quick lookup.
create index tickets_escalation_idx on public.tickets(escalation_status) where escalation_status in ('pending', 'alerting');


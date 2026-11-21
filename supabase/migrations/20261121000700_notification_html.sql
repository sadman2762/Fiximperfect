-- Rendered e-mail HTML, kept so staff (and, in demo mode, the reporting
-- student) can see exactly what was sent. Secure links are redacted unless the
-- message was only simulated in demo mode (see src/lib/notifications/dispatcher.ts).
alter table public.notifications add column if not exists body_html text;


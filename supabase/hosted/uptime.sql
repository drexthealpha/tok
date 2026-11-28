-- Hosted project only (not a migration): an uptime check from outside
-- GitHub. Every 10 minutes Supabase's scheduler calls Tok's server, which
-- keeps Render's free instance awake and leaves a record of each answer.
create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.unschedule('tok-uptime') where exists (select 1 from cron.job where jobname = 'tok-uptime');
select cron.schedule(
  'tok-uptime',
  '*/10 * * * *',
  $$ select net.http_get(url := 'https://tok-server.onrender.com/health', timeout_milliseconds := 60000) $$
);

-- The last answers, readable by anyone (no user data in them).
create or replace view public.uptime as
  select created as at, status_code, timed_out, error_msg
  from net._http_response
  order by id desc
  limit 50;
grant select on public.uptime to anon, authenticated;

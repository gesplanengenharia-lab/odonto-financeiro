CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('auto-settle-due-entries', '10 3 * * *', 'select public.auto_settle_due_entries()');
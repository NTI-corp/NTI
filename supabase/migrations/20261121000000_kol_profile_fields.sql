-- Display name and avatar for KOLs, filled by the harvest/profile-refresh job.
alter table kols add column if not exists display_name text;
alter table kols add column if not exists avatar_url text;

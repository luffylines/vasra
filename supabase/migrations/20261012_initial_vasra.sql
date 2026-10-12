-- VASRA PostgreSQL schema (review before applying to a dedicated Supabase project).
-- Keep all tables in the private vasra schema; use only server-side credentials.
create schema if not exists vasra;
create extension if not exists pgcrypto;
create table if not exists vasra.users (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 email text not null unique,
 password text not null,
 role text not null check (role in ('youth','sk','chairman')),
 must_change boolean not null default false,
 created timestamptz not null default now()
);
create table if not exists vasra.sessions (
 token text primary key,
 user_id uuid not null references vasra.users(id) on delete cascade,
 expires timestamptz not null
);
create index if not exists vasra_sessions_expires_idx on vasra.sessions(expires);
create table if not exists vasra.images (
 id uuid primary key default gen_random_uuid(),
 mime text not null check (mime in ('image/png','image/jpeg','image/webp')),
 storage_path text not null unique,
 owner uuid not null references vasra.users(id),
 created timestamptz not null default now()
);
create table if not exists vasra.projects (
 id uuid primary key default gen_random_uuid(),
 title text not null, category text not null, description text not null,
 scope text not null, status text not null check(status in ('Pinaplano','Isinasagawa','Natapos')),
 progress integer not null check(progress between 0 and 100),
 published boolean not null default false,
 image_id uuid references vasra.images(id),
 created_by uuid not null references vasra.users(id),
 updated_by uuid not null references vasra.users(id),
 created timestamptz not null default now(),
 updated timestamptz not null default now(),
 version integer not null default 1
);
create index if not exists vasra_projects_public_idx on vasra.projects(published,updated desc);
create table if not exists vasra.audit (
 id bigint generated always as identity primary key,
 actor_id uuid not null,
 actor_name text not null,
 action text not null,
 entity text not null,
 details jsonb not null,
 created timestamptz not null default now()
);
create or replace function vasra.prevent_audit_mutation() returns trigger language plpgsql
set search_path = '' as $$
begin
 raise exception 'Audit records are immutable';
end $$;
drop trigger if exists audit_no_update on vasra.audit;
create trigger audit_no_update before update on vasra.audit for each row execute function vasra.prevent_audit_mutation();
drop trigger if exists audit_no_delete on vasra.audit;
create trigger audit_no_delete before delete on vasra.audit for each row execute function vasra.prevent_audit_mutation();
-- Explicit defense in depth: no browser/anon/authenticated access to private schema.
revoke all on schema vasra from public, anon, authenticated;
revoke all on all tables in schema vasra from public, anon, authenticated;
revoke all on all functions in schema vasra from public, anon, authenticated;
alter default privileges in schema vasra revoke all on tables from public, anon, authenticated;
alter default privileges in schema vasra revoke all on functions from public, anon, authenticated;

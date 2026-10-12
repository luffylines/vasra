-- SK finance, project-month archive, and officials (no seed budget amounts)
create table if not exists vasra.annual_budgets (year integer primary key check(year between 2000 and 2100), amount numeric(14,2) not null check(amount>=0), reference text not null default '', published boolean not null default false, updated_by uuid references vasra.users(id));
create table if not exists vasra.monthly_updates (id uuid primary key default gen_random_uuid(), project_id uuid not null references vasra.projects(id), month date not null, summary text not null, expense numeric(14,2) check(expense>=0), published boolean not null default false, updated_by uuid references vasra.users(id), unique(project_id,month));
create table if not exists vasra.officials (id uuid primary key default gen_random_uuid(), name text not null, position text not null, display_order integer default 10, published boolean not null default false, updated_by uuid references vasra.users(id));
alter table vasra.annual_budgets enable row level security;
alter table vasra.monthly_updates enable row level security;
alter table vasra.officials enable row level security;
revoke all on vasra.annual_budgets,vasra.monthly_updates,vasra.officials from anon,authenticated;

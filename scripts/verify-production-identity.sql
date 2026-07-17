-- READ-ONLY pre-deployment audit. Run with an authorized administrator.

-- Must return zero: Auth identities without an approved global profile.
select au.id, au.email, au.created_at
from auth.users au
left join global.users gu on gu.id = au.id
where gu.id is null;

-- Must return zero: global identities without an Auth identity.
select gu.id, gu.email, gu.status
from global.users gu
left join auth.users au on au.id = gu.id
where au.id is null;

-- Must show row_security=true and force_row_security=true for every row.
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as row_security,
       c.relforcerowsecurity as force_row_security
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('global', 'workforce') and c.relkind = 'r'
order by n.nspname, c.relname;

-- Review every global.users policy. Self-read must not imply organization-wide
-- enumeration or browser writes.
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'global' and tablename = 'users'
order by policyname;

-- Must return zero after all rebuild migrations.
select * from workforce.audit_workforce_integrity();

-- Must return zero: Workforce foreign keys into Finance/public.
select c.conrelid::regclass as workforce_table, c.conname,
       c.confrelid::regclass as referenced_table
from pg_constraint c
join pg_namespace n on n.oid = c.connamespace
join pg_class rc on rc.oid = c.confrelid
join pg_namespace rn on rn.oid = rc.relnamespace
where n.nspname = 'workforce' and c.contype = 'f' and rn.nspname = 'public';

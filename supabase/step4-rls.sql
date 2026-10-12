-- 4단계 ③ 학습용: vault_notes 한 테이블에만 RLS + 최소 권한. 다른 테이블은 건드리지 않습니다.
-- 앱 API는 서버 전용 키(service_role)로 접속하고 자체 소유자 검사를 하므로 이 SQL의 영향을 받지 않습니다.
-- 이 정책은 Data API로 직접 들어오는 요청(anon·authenticated 역할)을 막는 두 번째 벽입니다.

-- [적용 전] 두 역할의 실제 권한
select 'before' as at, grantee, string_agg(privilege_type, ',' order by privilege_type) as grants
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'vault_notes' and grantee in ('anon', 'authenticated')
 group by grantee;
select 'before' as at, r.role,
       has_table_privilege(r.role, 'public.vault_notes', 'select') as sel,
       has_table_privilege(r.role, 'public.vault_notes', 'insert') as ins,
       has_table_privilege(r.role, 'public.vault_notes', 'update') as upd,
       has_table_privilege(r.role, 'public.vault_notes', 'delete') as del,
       has_table_privilege(r.role, 'public.vault_notes', 'truncate') as trunc,
       has_table_privilege(r.role, 'public.vault_notes', 'references') as refs,
       has_table_privilege(r.role, 'public.vault_notes', 'trigger') as trig
  from (values ('anon'), ('authenticated')) as r(role);

begin;

alter table public.vault_notes enable row level security;

-- 1) 기존 권한 회수 → 2) authenticated에 네 가지만 부여 (anon은 아무것도 없음)
revoke all on table public.vault_notes from public, anon, authenticated;
grant select, insert, update, delete on table public.vault_notes to authenticated;

-- 3) 본인 행만: auth.uid() = owner_id
drop policy if exists vault_notes_select_own on public.vault_notes;
drop policy if exists vault_notes_insert_own on public.vault_notes;
drop policy if exists vault_notes_update_own on public.vault_notes;
drop policy if exists vault_notes_delete_own on public.vault_notes;

create policy vault_notes_select_own on public.vault_notes
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy vault_notes_insert_own on public.vault_notes
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy vault_notes_update_own on public.vault_notes
  for update to authenticated
  using ((select auth.uid()) = owner_id)          -- 기존 행이 본인 것
  with check ((select auth.uid()) = owner_id);    -- 새 행도 본인 것(소유자 변경 금지)
create policy vault_notes_delete_own on public.vault_notes
  for delete to authenticated using ((select auth.uid()) = owner_id);

commit;

-- [적용 후] 기대값: anon 행 없음 / authenticated = DELETE,INSERT,SELECT,UPDATE
select 'after' as at, grantee, string_agg(privilege_type, ',' order by privilege_type) as grants
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'vault_notes' and grantee in ('anon', 'authenticated')
 group by grantee;
-- 기대값: anon 전부 false / authenticated sel·ins·upd·del만 true
select 'after' as at, r.role,
       has_table_privilege(r.role, 'public.vault_notes', 'select') as sel,
       has_table_privilege(r.role, 'public.vault_notes', 'insert') as ins,
       has_table_privilege(r.role, 'public.vault_notes', 'update') as upd,
       has_table_privilege(r.role, 'public.vault_notes', 'delete') as del,
       has_table_privilege(r.role, 'public.vault_notes', 'truncate') as trunc,
       has_table_privilege(r.role, 'public.vault_notes', 'references') as refs,
       has_table_privilege(r.role, 'public.vault_notes', 'trigger') as trig
  from (values ('anon'), ('authenticated')) as r(role);
select policyname, cmd, roles, qual, with_check
  from pg_policies where schemaname = 'public' and tablename = 'vault_notes' order by policyname;

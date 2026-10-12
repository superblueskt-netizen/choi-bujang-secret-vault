-- 5단계 학습용: vault_notes 한 테이블의 직접 권한(PUBLIC·anon·authenticated)을 모두 거둡니다.
-- 이후 메모는 Vercel 서버 함수(서버 전용 키 = service_role)로만 읽고 씁니다. 다른 테이블은 건드리지 않습니다.
-- RLS와 4단계 정책은 그대로 둡니다: 누가 실수로 권한을 다시 줘도 본인 행만 허용되는 두 번째 벽입니다.
-- 결과창은 마지막 표만 보여 주므로, 적용 전 권한을 임시 표에 저장했다가 적용 후와 한 표로 비교합니다.

drop table if exists pg_temp._before;
create temp table _before as
select r.role,
  (select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants g
    where g.table_schema = 'public' and g.table_name = 'vault_notes' and g.grantee = r.role) as grants,
  concat_ws(',', case when has_table_privilege(r.role, 'public.vault_notes', 'select') then 'sel' end,
    case when has_table_privilege(r.role, 'public.vault_notes', 'insert') then 'ins' end,
    case when has_table_privilege(r.role, 'public.vault_notes', 'update') then 'upd' end,
    case when has_table_privilege(r.role, 'public.vault_notes', 'delete') then 'del' end,
    case when has_table_privilege(r.role, 'public.vault_notes', 'truncate') then 'trunc' end,
    case when has_table_privilege(r.role, 'public.vault_notes', 'references') then 'refs' end,
    case when has_table_privilege(r.role, 'public.vault_notes', 'trigger') then 'trig' end) as has_priv
from (values ('anon'), ('authenticated'), ('service_role')) as r(role);

alter table public.vault_notes enable row level security;
revoke all on table public.vault_notes from public, anon, authenticated;

-- 기대값: anon·authenticated after 칸 비어 있음 / service_role은 그대로(서버 함수가 쓰는 역할)
select r.role, b.grants as before_grants, b.has_priv as before_has_priv,
  (select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants g
    where g.table_schema = 'public' and g.table_name = 'vault_notes' and g.grantee = r.role) as after_grants,
  concat_ws(',', case when has_table_privilege(r.role, 'public.vault_notes', 'select') then 'sel' end,
    case when has_table_privilege(r.role, 'public.vault_notes', 'insert') then 'ins' end,
    case when has_table_privilege(r.role, 'public.vault_notes', 'update') then 'upd' end,
    case when has_table_privilege(r.role, 'public.vault_notes', 'delete') then 'del' end,
    case when has_table_privilege(r.role, 'public.vault_notes', 'truncate') then 'trunc' end,
    case when has_table_privilege(r.role, 'public.vault_notes', 'references') then 'refs' end,
    case when has_table_privilege(r.role, 'public.vault_notes', 'trigger') then 'trig' end) as after_has_priv,
  (select relrowsecurity from pg_class where oid = 'public.vault_notes'::regclass) as rls_on
from (values ('anon'), ('authenticated'), ('service_role')) as r(role) join _before b using (role);

-- 적용 뒤 바깥에서 확인(브라우저 콘솔 등): 공개 키로 원본 주소를 직접 부르면 401 권한 오류(42501)여야 합니다.
-- fetch('https://giixryoqzyamfedhnnpt.supabase.co/rest/v1/vault_notes', { headers: { apikey: '<publishable key>' } })

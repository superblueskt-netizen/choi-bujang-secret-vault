-- 12단계: 서버 관측 기록 (제안, 학생이 검토 후 Supabase SQL Editor에서 실행)
-- 점검 요청의 caseId·requestKey·상태만 남깁니다. 메모 본문·토큰·사용자 ID는 없습니다.
create table if not exists public.aleph_check_observations (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  case_id text not null,
  request_key uuid not null,
  method text not null,
  path text not null,
  status integer not null,
  json_ready boolean not null default false
);
create index if not exists aleph_check_observations_key_idx on public.aleph_check_observations (request_key);
create index if not exists aleph_check_observations_at_idx on public.aleph_check_observations (at desc);
alter table public.aleph_check_observations enable row level security;
revoke all on table public.aleph_check_observations from public, anon, authenticated;
-- 서버 함수는 추가·읽기만 합니다(고치거나 지우지 않음).
grant select, insert on table public.aleph_check_observations to service_role;

select table_name, grantee, privilege_type from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'aleph_check_observations' order by grantee, privilege_type;

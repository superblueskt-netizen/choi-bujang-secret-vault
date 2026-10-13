-- 8단계: 강사 공지 구역과 강사 목록 (제안, 학생이 검토 후 Supabase SQL Editor에서 실행)
-- 메모(vault_notes)와 공지(vault_notices)를 다른 테이블로 나눠 자원 ID가 섞이지 않게 합니다.
-- 강사 여부는 화면이나 요청 본문이 아니라 이 vault_instructors 표로만 판단합니다.

create table if not exists public.vault_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.vault_instructors (
  user_id uuid primary key
);

-- 2·5단계와 같은 원칙: 브라우저 키(anon·authenticated)는 직접 접근 불가, 서버 함수(service_role)만 접근
alter table public.vault_notices enable row level security;
alter table public.vault_instructors enable row level security;
revoke all on table public.vault_notices from public, anon, authenticated;
revoke all on table public.vault_instructors from public, anon, authenticated;
grant select, insert, update, delete on table public.vault_notices to service_role;
grant select, insert, update, delete on table public.vault_instructors to service_role;

-- 시험용 가상 공지 한 건
insert into public.vault_notices (title, body)
select '8단계 시험 공지', '강사만 고칠 수 있는 가상 공지입니다.'
where not exists (select 1 from public.vault_notices);

-- 강사 계정 지정: 강사 역할로 쓸 시험 계정 이메일만 바꿔서 실행합니다. A·B 학생 계정은 넣지 않습니다.
-- insert into public.vault_instructors (user_id)
--   select id from auth.users where email = '강사계정@이메일'
-- on conflict do nothing;

-- 확인: anon·authenticated의 권한이 비어 있어야 합니다.
select table_name, grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name in ('vault_notices', 'vault_instructors')
 order by table_name, grantee, privilege_type;

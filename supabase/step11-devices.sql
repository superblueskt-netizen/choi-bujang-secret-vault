-- 11단계: 기기 승인 표 (제안, 학생이 검토 후 Supabase SQL Editor에서 실행)
-- 서버에는 패스키 공개키만 저장합니다. 개인키·토큰·메모 내용은 없습니다.

create table if not exists public.vault_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  credential_id text not null unique,
  public_key text not null,
  alg integer not null,
  sign_count bigint not null default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'revoked')),
  label text not null default '',
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  last_verified_at timestamptz
);
create index if not exists vault_devices_user_idx on public.vault_devices (user_id);

create table if not exists public.vault_device_challenges (
  challenge text primary key,
  user_id uuid not null,
  purpose text not null check (purpose in ('register', 'verify')),
  expires_at timestamptz not null
);

alter table public.vault_devices enable row level security;
alter table public.vault_device_challenges enable row level security;
revoke all on table public.vault_devices from public, anon, authenticated;
revoke all on table public.vault_device_challenges from public, anon, authenticated;
-- 서버 함수는 기기를 '등록(pending)'·서명 횟수 갱신만 합니다. 승인 상태는 아래처럼 운영자가 SQL로만 바꿉니다.
grant select, insert, update on table public.vault_devices to service_role;
grant select, insert, delete on table public.vault_device_challenges to service_role;

-- 확인: anon·authenticated 권한이 비어 있어야 합니다.
select table_name, grantee, privilege_type from information_schema.role_table_grants
 where table_schema = 'public' and table_name in ('vault_devices', 'vault_device_challenges')
 order by table_name, grantee, privilege_type;

-- ===== 승인(운영자만, 화면 버튼으로는 불가) =====
-- 1) 대기 중인 기기 보기:
--    select d.id, u.email, d.label, d.status, d.created_at from public.vault_devices d join auth.users u on u.id = d.user_id order by d.created_at;
-- 2) 내 기기가 맞는지 확인한 뒤 한 대만 승인:
--    update public.vault_devices set status = 'approved', approved_at = now() where id = '<기기 id>' and status = 'pending';
-- 3) 승인 취소(즉시 자료 차단):
--    update public.vault_devices set status = 'revoked' where id = '<기기 id>';

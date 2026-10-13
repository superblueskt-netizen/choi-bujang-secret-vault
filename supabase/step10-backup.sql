-- 10단계: 비공개 백업 사본과 감사 기록 (제안, 학생이 검토 후 Supabase SQL Editor에서 실행)
-- 메모 내용은 이 파일에 없습니다. 백업은 DB 안에서만 복사하고, 브라우저 키로는 읽을 수 없습니다.

create table if not exists public.vault_notes_backup (
  id uuid primary key,
  owner_id uuid not null,
  title text not null,
  body text not null default '',
  content_sha256 text not null,
  backed_up_at timestamptz not null default now()
);

create table if not exists public.vault_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  action text not null,
  resource text not null,
  actor uuid,
  result text not null
);

alter table public.vault_notes_backup enable row level security;
alter table public.vault_audit enable row level security;
revoke all on table public.vault_notes_backup from public, anon, authenticated;
revoke all on table public.vault_audit from public, anon, authenticated;
grant select, insert on table public.vault_notes_backup to service_role;
-- 감사 기록은 추가와 읽기만: 서버 함수도 고치거나 지울 수 없습니다.
revoke update, delete, truncate on table public.vault_audit from service_role;
grant select, insert on table public.vault_audit to service_role;

-- 침해 전 백업: 시험 계정 B의 메모만 사본으로 떠 둡니다. 해시는 title + 줄바꿈 + body 의 SHA-256 입니다.
-- 'B계정@이메일'만 바꿔서 실행합니다. 이미 떠 둔 사본은 덮어쓰지 않습니다.
insert into public.vault_notes_backup (id, owner_id, title, body, content_sha256)
select n.id, n.owner_id, n.title, coalesce(n.body, ''),
       encode(sha256(convert_to(n.title || E'\n' || coalesce(n.body, ''), 'UTF8')), 'hex')
  from public.vault_notes n
  join auth.users u on u.id = n.owner_id
 where u.email = 'B계정@이메일'
on conflict (id) do nothing;

-- 확인: 사본 건수와 해시 앞부분(내용은 출력하지 않음)
select id, left(content_sha256, 16) as sha256_prefix, backed_up_at from public.vault_notes_backup order by backed_up_at;

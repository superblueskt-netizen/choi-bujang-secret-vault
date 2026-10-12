-- 3단계: 메모 API 모양({id, title, body}, id는 UUID)에 맞게 vault_notes를 바꿉니다.
-- 가상 메모 문장은 들어 있지 않습니다. Supabase SQL Editor에서 한 번 실행합니다.

alter table public.vault_notes rename column content to body;
alter table public.vault_notes drop column id;                -- bigint 기본키를 버리고
alter table public.vault_notes add column id uuid primary key default gen_random_uuid();
create index if not exists vault_notes_owner_id_idx on public.vault_notes (owner_id);

-- RLS와 권한은 2단계 그대로: anon·authenticated는 직접 읽기·쓰기 불가, 서버(service_role)만 접근
alter table public.vault_notes enable row level security;
revoke all on table public.vault_notes from anon, authenticated;

-- A 계정을 만든 뒤, 기존 가상 메모 네 건을 A 소유로 연결합니다(이메일만 바꿔서 실행).
-- update public.vault_notes set owner_id = (select id from auth.users where email = 'A계정@이메일')
--  where owner_id is null;

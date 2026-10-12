-- 4단계 ① 학습용: 가상 메모 네 건을 A 소유로, B 소유의 공개 가능한 시험 메모 한 건 추가
-- API·권한 정책은 바꾸지 않습니다. 실제 이메일은 공개 저장소에 올리지 않도록 자리표시자로 두었습니다.
-- 실제 값을 채운 사본은 supabase/step4-owners.local.sql(Git 제외)에 있습니다.
-- A·B 계정이 auth.users에 없으면 아무 행도 바뀌지 않습니다(확인 쿼리에서 0으로 보임).

with a as (select id from auth.users where email = 'A계정@이메일'   -- ← A 이메일로 바꾸기)
update public.vault_notes n
   set owner_id = a.id
  from a
 where n.owner_id is null or n.owner_id = a.id;   -- 기존 네 건(아직 소유자 없음 또는 이미 A)

insert into public.vault_notes (owner_id, title, body)
select b.id, 'B 시험 메모', 'B 계정 소유 확인용 공개 가능 시험 문장'
  from auth.users b
 where b.email = 'B계정@이메일'                     -- ← B 이메일로 바꾸기
   and not exists (select 1 from public.vault_notes where owner_id = b.id and title = 'B 시험 메모');

-- 확인: A 4건, B 1건, 소유자 없음 0건이어야 합니다.
select coalesce(u.email, '(소유자 없음)') as owner, count(*) as notes
  from public.vault_notes n left join auth.users u on u.id = n.owner_id
 group by u.email order by u.email;

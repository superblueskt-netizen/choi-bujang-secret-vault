# BYTE BACK 방어전 시작 틀 R5

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 포함된 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 학생이 하는 일: 세 걸음

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

배포가 끝나면 `/`에서 점령된 가상 자료실을 볼 수 있습니다. `/data.json`에는 같은 가상 메모가 공개됩니다. 이 공개 상태를 확인하는 것이 1단계의 출발점입니다. 1단계 접수와 심판 판정은 포털에서 확인합니다.

## 시작 틀의 자동 처리

`vercel.json`은 정적 결과물 `public`을 배포합니다. 빌드 명령 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 이 값이 없으면 빌드가 실패하므로, 성공한 것처럼 빈 주소를 내보내지 않습니다. `aleph.json`의 내용만으로 저장소 소유권이나 방어 성공을 인정하지 않습니다. 심판이 공개 저장소의 실제 커밋과 배포된 자료를 따로 대조해야 합니다.

`aleph.config.json`의 `repoUrl`과 `publicAppUrl`은 이전 제출 묶음 방식의 자리표시자입니다. 1단계에서는 학생이 편집하지 않습니다. 2단계 이후 코딩 도구가 필요한 설정과 보호 기능을 단계별로 작성합니다. `npm run bundle`과 `bundle-notes.json`도 1단계의 세 걸음에는 포함되지 않습니다.

로컬에서 가상 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. 저장소의 `src/attack-check.mjs`는 실제 배포가 된 뒤 `/data.json`을 비로그인으로 요청해 공개 가상 메모의 확인 표시를 읽습니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.

## 단계 기록

- **1단계:** Deploy 버튼으로 공개 저장소와 Vercel 배포를 만들었습니다. 배포 주소는 `https://choi-bujang-secret-vault-five-eta.vercel.app/`입니다. `/data.json`에 가상 메모 네 건이 공개된 상태를 확인했습니다.
- **2단계 「자료를 코드 밖으로 옮깁니다」:** 커밋 `d15ddfe`(2단계 저장점)과 `40001c2`(오류 기록 보강). 메모를 Supabase로 옮기고 공개 `data.json`을 없앴습니다.
- **3단계 「진짜 로그인을 붙입니다」:** 커밋 `c41064f`(3단계 저장점). 로그인·토큰 검사·메모 CRUD API.
- **4단계 「로그인해도 내 자료만 보이게 합니다」:** 커밋 `64bfad7`(4단계 저장점). 커밋 뒤 학습 DB에 `step4-owners.local.sql`(A 4건·B 1건)과 RLS·최소 권한 SQL을 실제로 실행했습니다.
- **5단계 「자료 요청을 서버 한곳으로 모읍니다」:** 커밋 `9370122`(5단계 저장점). 원본 주소 직접 권한 회수.
- **보너스 xdr-01·xdr-02·xdr-03:** 커밋 `8217d0b`(brute-force), `0007c87`(web-injection), 「보너스 xdr-03 저장점」(known-cve, Log4Shell `${jndi:` 구문 탐지). `xdr/` 폴더만 바꿨습니다. 다시 실행: `npm run xdr:run -- known-cve`, 차단 연결: `node xdr/known-cve/respond.mjs`. 자세한 내용은 [xdr/README.md](xdr/README.md).
- **6단계 「등록한 기기만 자료실에 들어옵니다」:** 커밋 `d6ca34b`(6단계 저장점). 판정기 `device_registered` 규칙.
- **7단계 「평소와 다른 접속은 다시 확인합니다」:** 커밋 `0cf4ba9`(7단계 저장점). 입력 검사와 `step_up_required` 규칙.
- **8단계 「자료마다 갈 수 있는 구역을 나눕니다」:** 커밋 `9f1bfd7`(8단계 저장점)과 판정기 수정 `d33a901`·`6646f68`·`535cd3e`. 마지막 `535cd3e`에서 판정기는 공지 읽기·메모 전체 목록을 거부하고, 메모 한 건 주인 비교는 API에 맡깁니다.
- **9단계 「도플갱어를 찾고 권한을 거둡니다」:** 커밋 `fdf4960`(9단계 저장점). 탐지 규칙 `burst_read`.
- **10단계 「백업에서 자료실을 되살립니다」:** 「10단계 저장점」 커밋. 아래 「10단계」 절이 현재 상태입니다.

## 2단계에서 만든 것 (3단계에도 유지)

- 가상 메모는 학습용 Supabase 테이블 `vault_notes`에 있습니다. 저장소의 `data.json`과 `public/data.json`은 지웠고, 빌드도 더 이상 공개 `data.json`을 만들지 않습니다. 둘 중 하나가 다시 생기면 빌드가 멈춥니다.
- 서버 함수는 `SUPABASE_URL`과 서버 전용 `SUPABASE_SECRET_KEY`를 Vercel 환경변수에서만 읽습니다. 키는 브라우저 파일·응답·로그에 넣지 않습니다. 오류가 나도 오류 이름만 돌려줍니다.
- 모든 응답에 보안 헤더 `X-Content-Type-Options: nosniff`를 붙입니다(`vercel.json`의 `headers`).
- 빌드는 `aleph.config.json`의 `step`이 2 이상일 때 돌아가고, 배포마다 `/aleph.json`(저장소·커밋·주소·단계)을 만듭니다.

### 다시 실행하는 방법

1. Supabase 대시보드 → SQL Editor에 `supabase/step2-notes.local.sql`을 붙여넣고 Run을 누릅니다. 이 파일은 가상 메모 문장을 담고 있어서 `.gitignore`로 Git에서 뺐습니다. 테이블은 RLS가 켜져 있고 정책이 없어서, `anon`·`authenticated`는 읽을 수 없습니다. `owner_id uuid` 칸은 있지만 `auth.users` 외래키는 걸지 않았습니다.
2. Vercel → Settings → Environment Variables에 `SUPABASE_URL`과 `SUPABASE_SECRET_KEY`를 학생이 직접 넣습니다. 값은 코드·Git·채팅에 적지 않습니다. 넣은 뒤에는 Redeploy를 누릅니다.
3. 로컬 확인: `npm run build -- --local`

## (해소됨, 2단계 기록) 공개 서버 API

2단계 때 `/api/notes`는 **로그인 없이 누구나 부를 수 있는 공개 주소**였습니다. 3단계에서 토큰 검사를 붙여 막았습니다. 키는 서버에 숨겼지만, 함수가 받는 요청을 가리지 않으므로 가상 메모 네 건은 여전히 누구에게나 내려갑니다. 그래서 3단계 전까지는 가상 메모만 둡니다. 로그인 확인은 3단계에서 붙입니다.

## 노출 확인 절차 (가상 메모 문장 검색)

메모 문장은 이 README에 적지 않습니다. 검색어는 메모 문장에 공통으로 들어가는 앞부분 `실습용 가상`을 씁니다.

1. **현재 배포 정적 파일:** 시크릿 창에서 `/data.json`을 엽니다. 404가 나오거나 메모가 0건이어야 합니다. `/`의 페이지 소스(Ctrl+U)에서 `실습용 가상`을 찾았을 때 결과가 없어야 합니다. 카드는 API로 불러오므로 소스에는 없습니다.
2. **GitHub 최신 파일:** 저장소 검색창에 `"실습용 가상"`을 입력합니다. 로컬에서는 `git grep -n "실습용 가상" HEAD`를 실행합니다. 결과가 없어야 합니다.
3. **공개 API:** 시크릿 창에서 `/api/notes`를 엽니다. 3단계부터는 `401`과 JSON 오류(`LOGIN_REQUIRED`)가 나와야 합니다.

3단계 `npm run bundle`의 자기 점검은 무로그인 목록·추가·삭제와 가짜 토큰 요청이 거부되는지 기록합니다. 이 점검은 학생의 실제 요청 결과이며, 심판의 판정이 아닙니다.

### 과거 노출은 해소되지 않았습니다

최신 파일에서 메모를 지워도 **1단계 공개 커밋(`f2aa3b5`)과 그 커밋의 옛 Vercel 배포는 그대로 남아 있습니다.** 누구나 GitHub 커밋 기록이나 옛 배포 주소로 그때의 `data.json`을 볼 수 있습니다. 이미 복제·보관된 사본도 회수할 수 없습니다. 따라서 이번 단계는 "앞으로의 노출을 줄인 것"이지 과거 노출을 없앤 것이 아닙니다. 실제 자료였다면 노출된 값을 모두 폐기하고 교체해야 합니다.

## 3단계에서 만든 것 (4단계에도 유지)

- **로그인·로그아웃:** 첫 화면에서 Supabase Auth 이메일·비밀번호로 로그인합니다(공식 SDK `signInWithPassword`/`signOut`). 실패하면 화면에 이유가 나옵니다. 화면 코드에는 공개용 Project URL과 publishable key만 있습니다.
- **서버 토큰 검사:** 모든 메모 API는 시작 틀의 `src/verify-login.mjs`로 `Authorization: Bearer` 토큰을 검사합니다. 토큰이 없거나 검사에 실패하면 자료 없이 `401 {"error":"LOGIN_REQUIRED"}`를 돌려줍니다. 브라우저가 보낸 `userId`·`role`·`owner_id`는 읽지 않습니다. 검사에 쓴 발급자 정보는 `aleph.config.json`의 `identityProvider`에 있습니다(비밀 키 없음).
- **메모 API** (`src/notes-api.mjs`, `api/notes.js`, `api/notes/[id].js`)

| 경로 | 동작 |
|---|---|
| `GET /api/notes` | 로그인 사용자 소유(`owner_id` = 서버가 확인한 사용자 ID) 메모 배열 `[{id,title,body}]` |
| `POST /api/notes` | `{id?, title, body}` 저장. `id`는 UUID, 없으면 서버가 만들고 `201 {id}`. `owner_id`는 서버가 확인한 ID |
| `GET /api/notes/:id` | `{id,title,body}`. 없거나 지운 뒤면 `404` |
| `PUT /api/notes/:id` | `title`·`body` 수정 후 `{id,title,body}` |
| `DELETE /api/notes/:id` | 삭제 후 `{id, deleted: true}` |

- **DB:** `supabase/step3-schema.sql`로 `vault_notes`를 `id uuid`, `body` 칸으로 바꿨습니다. RLS·권한은 2단계와 같습니다. 기존 가상 메모 네 건은 A 계정 소유로 연결합니다(파일 아래 주석의 `update`).

### 확인 방법

1. 시크릿 창에서 `/`을 엽니다. 로그인 화면만 보이고 메모는 보이지 않아야 합니다. `/api/notes`를 직접 열면 `401` JSON 오류가 나와야 합니다.
2. A 계정으로 로그인합니다. 메모 목록이 보이고, 추가·수정·삭제가 되어야 합니다. 로그아웃하면 다시 로그인 화면만 보여야 합니다.
3. 틀린 비밀번호로 로그인하면 "로그인 실패: 이메일 또는 비밀번호가 맞지 않습니다."가 나와야 합니다.
4. 브라우저 개발자 도구의 Sources에서 `sb_secret_`을 검색하면 결과가 없어야 합니다.

### (해소됨, 3단계 기록) 소유자 검사 없음

3단계 때 `GET`·`PUT`·`DELETE /api/notes/:id`는 로그인 여부만 확인했습니다. 로그인한 B가 A 메모의 `id`를 알면 읽고 고치고 지울 수 있었습니다. 4단계에서 소유자 검사로 막았습니다.

## 4단계에서 만든 것 (5단계에도 유지)

- **API 소유자 검사** (`src/notes-api.mjs`): 서버가 `src/verify-login.mjs`로 확인한 사용자 ID와 DB 행의 `owner_id`를 비교하고, 맞지 않으면 기본 거부합니다. URL·본문의 `owner_id`·`userId`는 소유자 판단에 쓰지 않습니다.
  - `GET /api/notes`: 본인 메모만 돌려줍니다.
  - `POST /api/notes`: `owner_id`는 확인된 ID로 저장합니다. 본문에 다른 사람을 소유자로 적으면 `403`입니다.
  - `GET·PUT·DELETE /api/notes/:id`: 기존 행을 먼저 읽어 본인 것이 아니면 `404`로 답합니다. 남의 메모와 없는 메모를 구별할 수 없게 하려는 것입니다. `PUT`은 `id`와 `owner_id` 조건으로만 고치고 `owner_id`를 쓰지 않아서, 새 행의 소유자도 본인으로 유지됩니다. 본문에 다른 소유자를 적으면 `403`입니다.
  - 응답 모양은 그대로입니다. 한 건은 `{id,title,body}`, 수정 본문은 `{title,body}`입니다.
- **로컬 시험:** `node --test test/owner.test.mjs`. 가짜 검사기와 메모리 DB로 A/B 자기 메모 CRUD 허용, 상대 메모 읽기·수정·삭제 404, 소유자 변경 403, 무로그인 401을 확인합니다. 실제 배포 판정이 아닙니다.
- **학습용 SQL (제안, 학생이 검토 후 실행):**
  - `supabase/step4-owners.sql`: 이메일로 `auth.users`의 ID를 찾아 가상 메모 네 건을 A 소유로 연결하고, B 소유 시험 메모 한 건을 넣습니다.
  - `supabase/step4-rls.sql`: `vault_notes`에만 적용합니다. `PUBLIC`·`anon`·`authenticated` 권한을 모두 회수한 뒤 `authenticated`에 `SELECT·INSERT·UPDATE·DELETE`만 줍니다. 정책은 `auth.uid() = owner_id`입니다(`SELECT`·`DELETE`는 USING, `INSERT`는 WITH CHECK, `UPDATE`는 둘 다). 적용 전후 `information_schema.role_table_grants`와 `has_table_privilege` 비교 쿼리가 들어 있습니다.
  - 앱 API는 서버 전용 키(service_role)를 쓰므로 RLS를 우회합니다. 앱의 1차 방어는 위 API 소유자 검사이고, RLS는 Data API 직접 접근을 막는 2차 방어입니다.

### 확인 방법

1. A로 로그인합니다. 가상 메모 네 건이 보이고 추가·수정·삭제가 되어야 합니다.
2. B로 로그인합니다. 자기 메모만 보여야 합니다. 개발자 도구 콘솔에서 A 메모의 id로 `fetch('/api/notes/<A id>', {headers:{Authorization:'Bearer <B 토큰>'}})`를 보내면 `404`가 나와야 합니다. `PUT`·`DELETE`도 같습니다.
3. `npm run bundle`의 자기 점검은 무로그인·가짜 토큰 거부와 anon 키 Data API 직접 읽기를 실제로 보냅니다. B 토큰이 필요한 교차 접근은 **미실행**으로 기록합니다.

## 5단계에서 만든 것 (6단계에도 유지)

- **브라우저는 서버 함수만 부릅니다.** `public/index.html`의 Supabase 호출은 로그인용(`signInWithPassword`·`signOut`·`getSession`·`onAuthStateChange`)뿐이고, 메모 읽기·추가·수정·삭제는 모두 `/api/notes`와 `/api/notes/:id`로 갑니다. 그래서 브라우저 코드는 바꾸지 않았습니다.
- **서버 함수 확인** (배포 주소, A 로그인 세션, 2026-10-12): 목록 `200`(가상 메모 4건), 추가 `201 {id}`, 한 건 `200 {id,title,body}`, 수정 `200`, 삭제 `200`, 지운 뒤 한 건 `404`, 목록 다시 4건. 시험 메모는 만들었다가 지웠습니다.
- **남아 있던 길 (적용 전 관찰):** 공개 키만으로 원본 주소를 부르면 이미 `401`(42501)이었습니다. 하지만 **A의 로그인 토큰을 붙여 원본 주소를 직접 부르면 `200`, 자기 행 4개가 내려왔습니다.** 4단계에서 authenticated에 준 권한 때문입니다.
- **직접 권한 회수 SQL (제안, 학생이 검토 후 실행):** `supabase/step5-revoke-direct.sql`은 `vault_notes` 한 테이블에서 `PUBLIC`·`anon`·`authenticated` 권한을 모두 거둡니다. 서버 함수가 쓰는 `service_role` 권한과 RLS·4단계 정책은 그대로 둡니다. 적용 전후 `role_table_grants`·`has_table_privilege`를 한 표로 비교합니다.
- **원본 자료 주소:** `aleph.config.json`의 `originalApiUrl` = `https://giixryoqzyamfedhnnpt.supabase.co/rest/v1/vault_notes` (쿼리 없음).
- 서버 함수의 로그인 검사(`src/verify-login.mjs`), 소유자 검사, 서버 전용 설정(`SUPABASE_URL`·`SUPABASE_SECRET_KEY`)은 바꾸지 않았습니다.

### 확인 방법

1. SQL 적용 뒤 결과 표에서 `anon`·`authenticated`의 after 칸이 비어 있고 `service_role`은 그대로여야 합니다.
2. 로그인한 화면의 개발자 도구 콘솔에서 원본 주소를 공개 키와 내 토큰으로 직접 부르면 `401`/`403` 권한 오류여야 합니다. 공개 키만으로 불러도 마찬가지입니다.
3. 화면에서 A의 메모 읽기·추가·수정·삭제는 그대로 되어야 합니다(서버 함수 경유).
4. `npm run bundle`은 공개 키로 `originalApiUrl`을 직접 부른 결과를 기록합니다.

### 남은 점

- 화면 코드에는 아직 Supabase 공개 키(`sb_publishable_…`)가 있습니다. 로그인까지 서버 함수로 옮기면 없앨 수 있지만, 로그인이 깨질 위험이 있어 이번에는 하지 않았습니다.

## 6단계에서 만든 것 (7단계에도 유지)

- **판정기 규칙 `device_registered`** (`src/decider.mjs`): 반 엔진이 보낸 판정 요청의 최상위 값 `deviceRegistered`가 `true`일 때만 `allow`(`approved`)를 돌려줍니다. `false`이거나 값이 없거나 다른 값이면 `deny`와 이유 코드 `device_not_registered`로 거부합니다. 6단계 당시 `RULE_IDS`는 `['device_registered']`만 남겼습니다(시작 틀의 `starter.deny`는 더 쓰지 않아 뺐습니다).
- 계약(`docs/DECIDER_REQUEST.md`)에 있는 값만 읽습니다. `request.device`·`request.identity` 같은 값은 만들지 않았습니다. `decide(request)` 이름·인자와 응답 다섯 항목(`schema`·`requestId`·`decision`·`reasonCode`·`ruleIds`)은 그대로입니다.
- 이번 단계에는 설치할 접속 프로그램이 없습니다. 인증서·CA·서명 키·기기 개인키를 만들거나 Git에 넣지 않았습니다.
- 기존 자료실 주소, 화면, 로그인·소유자 검사, 서버 함수는 바꾸지 않았습니다.

### 확인 순서

1. `npm run decider:test`를 실행합니다.
2. `통과 · 등록 기기의 정상 요청`이 나와야 합니다(`deviceRegistered: true` → `allow`).
3. `통과 · 미등록 기기의 가상 요청`이 나와야 합니다(`deviceRegistered: false` → `deny`·`device_not_registered`).
4. 하나라도 `확인 필요`가 나오면 `src/decider.mjs`의 `RULE_IDS`와 `deviceRegistered` 비교를 먼저 봅니다.

이 시험은 가상 요청으로 하는 로컬 연습이며 심판 판정이 아닙니다. 미등록 기기로 들어오는 실제 공격 요청은 심판이 보냅니다. `npm run bundle`의 자기 점검에도 이 공격은 **미실행**으로 기록합니다.

## 7단계에서 만든 것 (8단계에도 유지)

- **입력 검사** (`src/decider.mjs`의 `readSignals`·`readRecentEvents`·`readStepUp`): 판정기는 엔진이 넘긴 판정 요청의 최상위 값만 읽고, 브라우저 헤더나 위치는 읽지 않습니다. `signals.source`가 `judge_fixture`(심판의 가상 사건)일 때만 지역·네트워크·시각을 씁니다. `none`(실제 경로, 정보 없음)이나 목록에 없는 출처(예: `client_header`)는 모두 `unknown`/`null`로 두고, 빠진 값도 정상값으로 채우지 않습니다.
- **규칙 `step_up_required`:** 평소와 다른 시각(0~5시) + 처음 보는 네트워크(`unusual`) + 최근 600초 안 대량 읽기 사건(`risk_signal`·`bulk_read` 합계 10건 이상)이 **모두** 겹치면 `step_up`과 이유 코드 `step_up_required`를 돌려줍니다. 지역은 조건에 넣지 않았고, 이 규칙은 `deny`(영구 차단)를 하지 않습니다.
- **다시 확인:** 엔진이 검증한 `stepUp.verified === true`이고 `authAgeSeconds`가 0~900초일 때만 복합 이상 요청을 허용합니다. 그 밖(`'true'` 문자열, 나이 없음, 900초 초과)은 계속 `step_up`입니다.
- **기기 규칙 유지:** `device_registered`가 먼저 돌고, 미등록 기기는 `deny`·`device_not_registered`입니다. 7단계 당시 `RULE_IDS` = `['device_registered', 'step_up_required']`.
- 판정 요청 계약에는 `stepUp`(엔진이 확인한 새 로그인 시각)이 있습니다. 다만 재로그인 전 실제 자료 차단과 새 로그인 뒤 허용은 제공 엔진이 그 시각을 검증하는 환경에서만 잴 수 있어, `npm run bundle`의 자기 점검에는 **미실행**으로 남깁니다. 토큰 원문은 어디에도 기록하지 않습니다.

### 확인 순서

1. `npm run decider:test` → 네 줄 모두 `통과`여야 합니다(등록 기기 정상, 미등록 기기, 복합 이상 접속 → `step_up`, 다시 확인한 복합 이상 접속 → `allow`).
2. `npm run fixture:7` → `정상 사건: allow`, `복합 이상 사건: step_up`.
3. `node --test test/step7.test.mjs` → 위조 출처가 신뢰 값으로 승격되지 않음, 빠진 값을 정상값으로 채우지 않음, 지역만 다르면 허용, 만료된 재로그인은 다시 `step_up`, 기기 규칙 유지. 6개 모두 통과여야 합니다.

이 시험들은 가상 요청으로 하는 로컬 연습이며 심판 판정이 아닙니다.

## 8단계에서 만든 것 (9단계에도 유지)

- **자원 ID:** 메모는 `note:<id>`, 강사 공지는 `notice:<id>`, 목록은 `notes:mine`·`notices:all`입니다. 서버 함수가 응답 헤더 `X-Aleph-Resource`에 붙입니다. 응답 본문 모양(`{id,title,body}`)과 기존 메모 주소는 그대로입니다. 메모와 공지는 다른 테이블(`vault_notes`·`vault_notices`)이라 id가 섞이지 않습니다.
- **공지 API** (`api/notices.js`, `api/notices/[id].js`, `src/notes-api.mjs`):

| 경로 | 동작 |
|---|---|
| `GET /api/notices` | 로그인 사용자에게 공지 목록 |
| `GET /api/notices/:id` | 로그인 사용자에게 공지 한 건, 없으면 `404` |
| `PUT /api/notices/:id` | **DB의 강사 목록(`vault_instructors`)에 있는 사용자만** 수정. 아니면 `403 {"error":"INSTRUCTOR_ONLY"}` |

- **API 권한 재확인:** 메모는 4단계처럼 저장된 `owner_id`와 검증된 사용자 ID를 비교합니다(남의 메모는 `404`). 공지 수정은 검증된 사용자 ID를 강사 목록과 대조합니다. 화면 메뉴와 요청 본문의 `role`·`isInstructor`는 읽지 않습니다. 거부하면 서버 로그에 `zone deny: owner_mismatch note:<id>`처럼 짧은 사유와 자원 ID만 남기고, 사용자 ID·토큰·본문은 남기지 않습니다.
- **판정기 구역 규칙** (`src/decider.mjs`): 엔진이 확인한 `subjectId`·`deviceId`·`method`·`route`·`path`를 씁니다. 구역 표에 있는 경로 모양(`route`)과 메서드가 일치하고, 실제 `path`가 그 모양과 정확히 맞으며, 쿼리가 없을 때만 구역을 받습니다.
  - `zone_own_notes`: `POST /notes`, `GET·PUT·DELETE /notes/:id` → 허용. 메모 한 건의 주인 비교는 자료 API(`owner_id`)가 합니다. 메모 전체 목록(`GET /notes`)은 여러 사람의 자료를 한꺼번에 여는 경로라 판정기에서 거부합니다(`route_not_allowed`).
  - 공지 읽기(`GET /notices`, `GET /notices/:id`)는 강사 구역이라 판정기에서 허용하지 않습니다(`route_not_allowed`). 처음 저장점에서는 공지 읽기와 메모 전체 목록을 허용했다가 심판 판정(S08_OTHER_ZONE_ALLOWED) 뒤 뺐습니다.
  - `zone_notice_write`: `PUT /notices/:id` → `deny`·`instructor_role_unverified`. 현재 판정 요청 계약에는 엔진이 확인한 역할이 없어서, 추측하지 않고 거부합니다.
  - `zone_route_allowlist`: 표에 없는 경로(예: `/notes/:id/export`, `/export`), 메서드 불일치, 쿼리 있음, 형식이 틀린 기기 ID → `deny`·`route_not_allowed`
  - 자료는 경로의 `:id` 한 칸으로만 고르고, 쿼리로 기능을 고르지 않습니다. `:id`와 같은 깊이에 기능 경로를 두지 않았습니다.
  - 순서: `device_registered` → 구역 → `step_up_required` → 허용. `RULE_IDS` = `['device_registered', 'step_up_required', 'zone_route_allowlist', 'zone_own_notes', 'zone_notice_write']`.
- **판정기와 API의 역할:** 판정 요청에는 메모 소유자가 없습니다. 판정기는 경로·메서드로 구역을 나누고, 메모 한 건의 주인 비교는 자료 API가 `404`로 막습니다. 새 이유 코드 `route_not_allowed`·`instructor_role_unverified`가 운영 등록부의 `allowedReasonCodes`에 있는지는 확인하지 못했습니다.
- **DB SQL (제안, 학생이 검토 후 실행):** `supabase/step8-zones.sql`이 `vault_notices`·`vault_instructors`를 만들고 RLS를 켜고, `anon`·`authenticated` 권한을 회수합니다. 가상 공지 한 건을 넣습니다. 강사 계정은 파일 아래 주석의 이메일만 바꿔서 직접 넣습니다. 이 SQL을 실행하기 전에는 공지 API가 `502`를 돌려줍니다.

### 확인 순서

1. `node --test test/zone.test.mjs` → 8개 통과. 판정기: 자기 메모 allow, 공지 수정·공지 읽기 deny, 기능·알 수 없는 경로 deny, 이전 규칙 유지. API: 자원 ID 구분, A 자기 메모 200, B의 A 메모 404, 학생 공지 수정(본문 role 포함) 403, 강사 공지 수정 200, 공지 id를 메모 주소로 보내면 404.
2. `npm run decider:test`, `npm run fixture:7`, `node --test test/step7.test.mjs`가 그대로 통과해야 합니다.
3. SQL을 실행하고 배포한 뒤, 시크릿 창에서 `/api/notices`를 열면 `401`이어야 합니다. A로 로그인한 화면의 콘솔에서 `fetch('/api/notices/<공지 id>', {method:'PUT', headers:{Authorization:'Bearer <A 토큰>','Content-Type':'application/json'}, body: JSON.stringify({title:'x', role:'instructor'})})`를 보내면 `403 INSTRUCTOR_ONLY`여야 합니다.

이 시험들은 가상 요청과 가짜 DB로 하는 로컬 연습이며 심판 판정이 아닙니다.

## 9단계에서 만든 것 (10단계에도 유지)

- **탐지 함수** (`src/detect.mjs`, 계약 `docs/DETECT_EVENTS.md`)
  - **입력 정리 `readEvents`:** 사건에서 시각(`at`), 요청 종류(`method`), 가명 사용자(`identity.sub`)만 읽습니다. 메모 내용·토큰·실명 같은 다른 값은 버리고, 사건을 저장하거나 출력하지 않습니다. 형식이 틀린 사건과 `GET`이 아닌 요청은 세지 않습니다.
  - **탐지 규칙 `burst_read` (`findBurst`):** 같은 가명 사용자의 `GET`이 어느 10분 구간에서든 **120건을 넘을 때만** 의심입니다. 정확히 120건은 정상입니다. 다른 사용자의 사건은 합치지 않고, 10분 밖의 사건은 같은 묶음으로 세지 않습니다.
  - **결과:** 의심이면 `{action:'propose_revocation', reasonCode:'burst_read', subject:'해당 sub'}`, 아니면 `{action:'observe'}`입니다. 회수는 **제안만** 하고, 회수 API를 만들거나 기기 권한을 바꾸지 않습니다. 실제 회수와 첫 의심 요청부터 회수까지의 시간은 심판·운영 엔진이 확인합니다.
- 판정기(`src/decider.mjs`)의 허용·거부 응답 형식과 규칙은 바꾸지 않았습니다.
- **9단계 지시와 계약의 차이:** 지시는 "평소와 다른 네트워크 + 다량 조회"와 "기기 한 개"를 대상으로 하라고 합니다. 하지만 현재 탐지 계약의 사건에는 `at`·`method`·`identity.sub`만 있고, 네트워크·기기 값이 없습니다. 결과도 계약 모양과 정확히 같아야 해서, 계약대로 **다량 조회 + 가명 사용자 한 명**을 대상으로 했습니다. 네트워크·기기 조건은 엔진이 해당 값을 계약에 넣으면 추가합니다.

### 확인 순서

1. `npm run detect:test` → 6개 모두 `통과`여야 합니다(정상 30건·정확히 120건·서로 다른 사용자·10분 밖으로 흩어진 200건은 `observe`, 121건·200건 폭주는 `propose_revocation`).
2. `node --test test/detect.test.mjs` → 5개 통과(다른 값은 버림, 결과에 본문·토큰 없음, `GET`이 아닌 요청·틀린 사건은 세지 않음, 폭주한 한 사용자만 대상).
3. `npm run decider:test`와 `node --test test/zone.test.mjs`가 그대로 통과해 이전 판정 규칙이 유지되는지 봅니다.

이 시험들은 가상 사건으로 하는 로컬 연습이며, 실제 접속 회수나 심판 판정이 아닙니다.

## 10단계: 현재 작동하는 기능

### 1. 안전 정책 사본과 시험 정책 비교·되돌리기

- **검증한 사본:** `backup/policy-safe.json`(버전 `step9-fdf4960`)은 침해 전 `notes` 서비스의 안전 정책입니다(판정기 규칙·허용 경로, API 소유자 검사·강사 전용 공지 수정·본문 role 무시, `allowedRoutes`). 봉인 해시는 `backup/policy-safe.sha256`에 있습니다.
- **시험 정책:** `policy/test-policy.json`. 실제 운영 정책(`src/decider.mjs`, `src/notes-api.mjs`, DB 권한)은 이 도구가 바꾸지 않습니다.
- **차이 보기:** `npm run policy:diff`
  - 사본이 없거나(`SNAPSHOT_MISSING`), 해시가 틀리거나(`SNAPSHOT_HASH_MISMATCH`), 사본이 지금 판정기의 `RULE_IDS`·허용 경로와 다르면 즉시 중단합니다.
  - 통과하면 복원할 버전과 바뀔 항목(`notes.…` 경로, 지금 값 → 복원값)만 보여 주고 아무것도 바꾸지 않습니다.
- **되돌리기:** `npm run policy:restore -- --apply --yes`
  - `--yes`가 없으면 중단합니다. 실행하면 `services.notes`만 사본 버전으로 바꾸고, 다른 서비스(`ai`, `threat-intel`) 규칙은 그대로 둡니다.
  - 실행할 때마다 `backup/audit.log` 끝에 한 줄(시각·버전·사본 해시·바뀐 항목)을 덧붙입니다. 이전 줄은 지우거나 고치지 않습니다.
- 봉인은 실수나 부분 변조를 잡는 무결성 검사입니다. 사본과 봉인을 함께 바꾸는 공격자까지 막지는 못하므로, 사본은 Git 기록(커밋 해시)으로도 대조합니다.

### 2. 메모 한 건 복원: `POST /api/restore/:id`

- **서비스·경로:** `notes` 서비스, `POST /api/restore/:id` (`api/restore/[id].js` → `src/notes-api.mjs`의 `handleRestore`). `aleph.config.json`의 `restoreRoute`와 `allowedRoutes`에 적었습니다. 판정기에는 이 경로를 열지 않았습니다(알 수 없는 경로로 거부).
- **동작:** 로그인한 사용자가 자기 메모 한 건만 비공개 백업 사본(`vault_notes_backup`)에서 되살립니다.
  1. 사본을 읽어 `owner_id`가 검증된 사용자와 같은지 봅니다. 남의 사본과 없는 사본은 `404`입니다.
  2. 사본 내용의 SHA-256(`title` + 줄바꿈 + `body`)이 기록된 `content_sha256`과 같은지 다시 계산합니다. 틀리면 `409 BACKUP_HASH_MISMATCH`이고 쓰지 않습니다.
  3. 같은 id가 다른 소유자 메모면 `409 OWNER_CONFLICT`이고 덮어쓰지 않습니다.
  4. 그 한 건만 쓰고 다시 읽어 id·소유자·해시가 사본과 같은지 확인한 뒤 `200 {id, restored:true, ownerMatch:true, contentSha256}`을 돌려줍니다. 응답에 메모 내용은 없습니다.
  5. 결과는 `vault_audit`에 한 줄 추가합니다. 이 표는 서버 함수도 추가·읽기만 가능하고 고치거나 지울 수 없습니다.
- **DB SQL (2026-10-13 실행함):** `supabase/step10-backup.sql`이 `vault_notes_backup`·`vault_audit`를 만들고 RLS·권한 회수를 한 뒤, **시험 계정 B의 메모만** 사본으로 떠 둡니다(`B계정@이메일`만 바꿔서 실행).
- **B로 확인하는 방법:** B로 로그인한 화면의 개발자 도구 콘솔에서 B 메모 id로 `fetch('/api/restore/<B 메모 id>', {method:'POST', headers:{Authorization:'Bearer <B 토큰>'}})`를 보냅니다. `200`과 `contentSha256`이 나오고, SQL Editor에서 같은 id의 사본 해시와 같아야 합니다.

### 3. 복구 뒤 1~9단계 재시험 순서

아래 결과 칸은 **실제로 실행한 것만** 채웁니다. 실행하지 않은 시험은 미실행으로 둡니다. 「로컬」은 가상 요청·가짜 DB 연습이고, 「배포」는 실제 배포 주소에 보낸 요청입니다. 어느 것도 심판 판정은 아닙니다.

| 순서 | 단계 | 정상 요청 (유지돼야 함) | 금지 요청 (거부돼야 함) | 방법 | 결과 |
|---|---|---|---|---|---|
| 1 | 정책 | `npm run policy:diff` → 바뀔 항목 없음 | 사본 해시 틀림 → 중단 | 터미널, `node --test test/restore.test.mjs` | 실행(2026-10-13, 로컬): `policy:diff` 바뀔 항목 없음·사본 검증 통과, `test/restore.test.mjs` 5개 통과(변조 감지·해시 틀림 중단 포함) |
| 2 | 1·2단계 공개 자료 | — | 시크릿 창 `/data.json` 404, 페이지 소스에 메모 없음 | 브라우저 | 미실행 |
| 3 | 3단계 로그인 | A 로그인 후 목록 `200` | 비로그인·가짜 토큰 `/api/notes` `401` | `npm run bundle` 자기 점검 | 부분 실행(2026-10-13 `npm run bundle`): 비로그인·가짜 토큰 `/api/notes` `401`. A 로그인 목록은 미실행 |
| 4 | 4단계 소유자 | A가 자기 메모 읽기·수정 `200` | B가 A 메모 `GET·PUT·DELETE` `404` | 브라우저 콘솔(B 토큰), `node --test test/owner.test.mjs` | 부분 실행(2026-10-13 배포, B 세션): B가 A 메모 `GET` `404`. `PUT·DELETE`는 미실행. `test/owner.test.mjs` 통과 |
| 5 | 5단계 원본 주소 | 화면에서 A 메모 CRUD | 공개 키·로그인 토큰으로 원본 주소 직접 읽기 `401/403` | `npm run bundle` 자기 점검 | 부분 실행(2026-10-13 `npm run bundle`): 공개 키로 원본 주소 `401`(42501). 로그인 토큰 직접 읽기·화면 CRUD는 미실행 |
| 6 | 6단계 기기 | 등록 기기 `allow` | 미등록 기기 `deny`·`device_not_registered` | `npm run decider:test` | 실행(로컬 가상 요청): `decider:test` 등록 allow·미등록 deny 통과 |
| 7 | 7단계 재확인 | 정상 사건 `allow`, 재확인 뒤 `allow` | 복합 이상 `step_up` | `npm run fixture:7`, `node --test test/step7.test.mjs` | 실행(로컬 가상 요청): `fixture:7` 정상 allow·복합 이상 step_up, `test/step7.test.mjs` 통과 |
| 8 | 8단계 구역 | 자기 메모 한 건 `allow` | 메모 전체 목록·공지 수정 `deny`, 학생 공지 수정 `403` | `node --test test/zone.test.mjs`, 브라우저 콘솔 | 부분 실행: `test/zone.test.mjs` 통과(로컬), `npm run bundle` 비로그인 공지 `401`. 학생 공지 수정 `403`은 복구 전(15:17)에만 확인, 복구 뒤 미실행 |
| 9 | 9단계 탐지 | 정상 사건 `observe` | 10분 121건 이상 `propose_revocation` | `npm run detect:test` | 실행(로컬 가상 사건): `detect:test` 6/6 통과 |
| 10 | 10단계 복원 | B 메모 한 건 복원 `200`, 해시 같음 | A가 B 사본 복원 `404`, 비로그인 `401` | B 콘솔, `npm run bundle` | 실행(2026-10-13 16:15 배포, B 세션): B 메모 변조(해시 `92bdf66e…`) 뒤 `POST /api/restore/23cad896…` `200`, 복원 해시 `9e6cf487ae785b97` = 사본 해시, id·소유자 같음, B 메모 1건 그대로. B가 A 메모 복원 `404`. `vault_audit`에 `note_restore · restored` 1줄. 비로그인·가짜 토큰 복원 `401`(bundle) |

로컬 시험(`node --test`, `npm run …:test`)은 가상 요청·가짜 DB 연습이며 심판 판정이 아닙니다.

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
- **보너스 xdr-01·xdr-02:** 커밋 `8217d0b`(brute-force), `0007c87`(web-injection). `xdr/` 폴더만 바꿨습니다. 자세한 내용은 [xdr/README.md](xdr/README.md).
- **6단계 「등록한 기기만 자료실에 들어옵니다」:** 「6단계 저장점」 커밋. 아래 「6단계」 절이 현재 상태입니다.

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

## 6단계: 현재 작동하는 기능

- **판정기 규칙 `device_registered`** (`src/decider.mjs`): 반 엔진이 보낸 판정 요청의 최상위 값 `deviceRegistered`가 `true`일 때만 `allow`(`approved`)를 돌려줍니다. `false`이거나 값이 없거나 다른 값이면 `deny`와 이유 코드 `device_not_registered`로 거부합니다. `RULE_IDS`는 실제 구현한 `['device_registered']`만 남겼습니다(시작 틀의 `starter.deny`는 더 쓰지 않아 뺐습니다).
- 계약(`docs/DECIDER_REQUEST.md`)에 있는 값만 읽습니다. `request.device`·`request.identity` 같은 값은 만들지 않았습니다. `decide(request)` 이름·인자와 응답 다섯 항목(`schema`·`requestId`·`decision`·`reasonCode`·`ruleIds`)은 그대로입니다.
- 이번 단계에는 설치할 접속 프로그램이 없습니다. 인증서·CA·서명 키·기기 개인키를 만들거나 Git에 넣지 않았습니다.
- 기존 자료실 주소, 화면, 로그인·소유자 검사, 서버 함수는 바꾸지 않았습니다.

### 확인 순서

1. `npm run decider:test`를 실행합니다.
2. `통과 · 등록 기기의 정상 요청`이 나와야 합니다(`deviceRegistered: true` → `allow`).
3. `통과 · 미등록 기기의 가상 요청`이 나와야 합니다(`deviceRegistered: false` → `deny`·`device_not_registered`).
4. 하나라도 `확인 필요`가 나오면 `src/decider.mjs`의 `RULE_IDS`와 `deviceRegistered` 비교를 먼저 봅니다.

이 시험은 가상 요청으로 하는 로컬 연습이며 심판 판정이 아닙니다. 미등록 기기로 들어오는 실제 공격 요청은 심판이 보냅니다. `npm run bundle`의 자기 점검에도 이 공격은 **미실행**으로 기록합니다.

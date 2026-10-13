// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (config.step === 2) return runStep2Checks(config);
  if (config.step === 3) return runStep3Checks(config);
  if (config.step === 4) return runStep4Checks(config);
  if (config.step === 5) return runStep5Checks(config);
  if (config.step === 6) return runStep6Checks(config);
  if (config.step === 7) return runStep7Checks(config);
  if (config.step === 8) return runStep8Checks(config);
  if (config.step === 9) return runStep9Checks(config);
  if (config.step === 10) return runStep10Checks(config);
  if (config.step === 11) return runStep11Checks(config);
  if (config.step === 12) return runStep12Checks(config);
  if (config.step !== 1) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  const app = appUrl(config);
  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  const response = await fetch(new URL('/data.json', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let visible = false;
  if (response.ok) {
    try {
      const data = await response.json();
      visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
        && data.notes.length > 0;
    } catch {
      // A non-JSON response is a failed check, not a successful deployment.
    }
  }
  return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
    observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
}

function appUrl(config) {
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  return app;
}

// 2단계: 실제로 보낸 비로그인 요청의 결과만 적습니다. 메모 본문은 기록하지 않습니다.
// 12단계: 제출 묶음은 격리 환경에서 공개 HTTPS 주소에 GET·HEAD만 보냅니다. 쓰기 요청이 필요한 점검은 보내지 않고 not_run으로 둡니다.
async function anonymousGet(app, path, init = {}) {
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return { status: 0, body: null, notRun: true };
  try {
    const response = await fetch(new URL(path, app), { redirect: 'error', signal: AbortSignal.timeout(10000), ...init });
    let body = null;
    try { body = await response.json(); } catch { /* JSON이 아니면 null */ }
    return { status: response.status, body };
  } catch (error) {
    return { status: 0, body: null, failed: error.name };
  }
}

const unreached = result => (result.status === 0 ? 'not_run' : null);

async function runStep2Checks(config) {
  const app = appUrl(config);
  const staticFile = await anonymousGet(app, '/data.json');
  const staticCount = Array.isArray(staticFile.body?.notes) ? staticFile.body.notes.length : 0;
  const api = await anonymousGet(app, '/api/notes');
  const apiCount = Array.isArray(api.body?.notes) ? api.body.notes.length : 0;
  const identity = await anonymousGet(app, '/aleph.json');
  return [
    { attackId: 'static_data_json_read', expected: '/data.json에서 메모가 나오지 않음(404 또는 0건)',
      observed: unreached(staticFile) ?? `비로그인 /data.json HTTP ${staticFile.status} · 메모 ${staticCount}건` },
    { attackId: 'anonymous_api_notes_read', expected: '약점 관찰: 3단계 전까지 /api/notes는 로그인 없이 열림',
      observed: unreached(api) ?? `비로그인 /api/notes HTTP ${api.status} · 메모 ${apiCount}건${apiCount ? ' (공개 API 약점 남음)' : ''}` },
    { attackId: 'deployment_identity_present', expected: '/aleph.json에 step 2 배포 식별 정보가 있음',
      observed: unreached(identity) ?? `비로그인 /aleph.json HTTP ${identity.status} · step ${identity.body?.step ?? '없음'}` },
  ];
}

// 3단계: 토큰 없이·가짜 토큰으로 보낸 요청이 자료 없이 거부되는지 실제로 확인합니다.
// 정상 A 로그인과 B의 타인 메모 접근은 비밀번호·토큰이 필요하므로 여기서 실행하지 않습니다(화면에서 직접 확인).
async function runStep3Checks(config) {
  const app = appUrl(config);
  const describe = (label, result) => unreached(result) ?? `${label} HTTP ${result.status} · `
    + (Array.isArray(result.body) ? `메모 ${result.body.length}건 노출` : `오류 ${result.body?.error ?? 'JSON 아님'}`);
  const list = await anonymousGet(app, '/api/notes');
  const create = await anonymousGet(app, '/api/notes', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'anonymous', body: 'should be rejected' }),
  });
  const forged = await anonymousGet(app, '/api/notes', {
    headers: { Authorization: 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.forged' },
  });
  const item = await anonymousGet(app, '/api/notes/00000000-0000-4000-8000-000000000000', { method: 'DELETE' });
  const identity = await anonymousGet(app, '/aleph.json');
  return [
    { attackId: 'anonymous_list_notes', expected: '토큰 없는 목록 요청은 401 JSON 오류로 거부', observed: describe('비로그인 GET /api/notes', list) },
    { attackId: 'anonymous_create_note', expected: '토큰 없는 추가 요청은 401 JSON 오류로 거부', observed: describe('비로그인 POST /api/notes', create) },
    { attackId: 'forged_token_list_notes', expected: '서명 없는 가짜 토큰은 401 JSON 오류로 거부', observed: describe('가짜 토큰 GET /api/notes', forged) },
    { attackId: 'anonymous_delete_note', expected: '토큰 없는 삭제 요청은 401 JSON 오류로 거부', observed: describe('비로그인 DELETE /api/notes/:id', item) },
    { attackId: 'deployment_identity_present', expected: '/aleph.json에 step 3 배포 식별 정보가 있음',
      observed: unreached(identity) ?? `비로그인 /aleph.json HTTP ${identity.status} · step ${identity.body?.step ?? '없음'}` },
  ];
}

// 4단계: 무로그인 거부는 실제로 다시 확인하고, Data API는 anon(공개) 키로만 직접 찔러 봅니다.
// B가 A 메모에 접근하는 시험은 B의 토큰이 있어야 하므로 bundle에서는 실행하지 않습니다(미실행으로 기록).
async function runStep4Checks(config) {
  const base = await runStep3Checks(config);
  const checks = base.filter((item) => item.attackId !== 'deployment_identity_present');
  const app = appUrl(config);
  const identity = await anonymousGet(app, '/aleph.json');
  checks.push({ attackId: 'deployment_identity_present', expected: '/aleph.json에 step 4 배포 식별 정보가 있음',
    observed: unreached(identity) ?? `비로그인 /aleph.json HTTP ${identity.status} · step ${identity.body?.step ?? '없음'}` });
  const issuer = config.identityProvider?.issuer;
  // 11단계부터 공개 키 값은 Git·설정에 두지 않습니다. 점검할 때만 환경변수 ALEPH_PUBLIC_DATA_API_KEY로 넣습니다.
  const anonKey = config.publicDataApiKey ?? process.env.ALEPH_PUBLIC_DATA_API_KEY;
  if (typeof issuer === 'string' && typeof anonKey === 'string') {
    const restUrl = new URL('/rest/v1/vault_notes?select=id', new URL(issuer).origin);
    const direct = await anonymousGet(restUrl, '', { headers: { apikey: anonKey } });
    checks.push({ attackId: 'anon_data_api_read', expected: 'anon 키로 Data API를 직접 읽으면 권한 오류',
      observed: unreached(direct) ?? `anon 키 GET /rest/v1/vault_notes HTTP ${direct.status} · `
        + (Array.isArray(direct.body) ? `행 ${direct.body.length}개 노출` : `오류 ${direct.body?.code ?? direct.body?.message ?? '없음'}`) });
  }
  checks.push({ attackId: 'cross_owner_note_access', expected: 'B 토큰으로 A 메모 GET·PUT·DELETE는 거부',
    observed: 'not_run' });
  return checks;
}

// 5단계: 원본 자료 주소(originalApiUrl)를 공개 키로 직접 불러 메모가 없어야 합니다. 나머지는 4단계 점검을 이어 씁니다.
async function runStep5Checks(config) {
  const base = (await runStep4Checks(config))
    .filter((item) => !['deployment_identity_present', 'anon_data_api_read'].includes(item.attackId));
  const app = appUrl(config);
  const identity = await anonymousGet(app, '/aleph.json');
  base.push({ attackId: 'deployment_identity_present', expected: '/aleph.json에 step 5 배포 식별 정보가 있음',
    observed: unreached(identity) ?? `비로그인 /aleph.json HTTP ${identity.status} · step ${identity.body?.step ?? '없음'}` });
  const publicKey = config.publicDataApiKey ?? process.env.ALEPH_PUBLIC_DATA_API_KEY;
  if (typeof config.originalApiUrl === 'string' && typeof publicKey !== 'string') {
    base.push({ attackId: 'original_api_direct_read', expected: '공개 키로 원본 자료 주소를 직접 부르면 메모 없음(권한 오류)',
      observed: 'not_run' });
  }
  if (typeof config.originalApiUrl === 'string' && typeof publicKey === 'string') {
    const direct = await anonymousGet(new URL(config.originalApiUrl), '', { headers: { apikey: publicKey } });
    base.push({ attackId: 'original_api_direct_read', expected: '공개 키로 원본 자료 주소를 직접 부르면 메모 없음(권한 오류)',
      observed: unreached(direct) ?? `공개 키 GET originalApiUrl HTTP ${direct.status} · `
        + (Array.isArray(direct.body) ? `행 ${direct.body.length}개 노출` : `오류 ${direct.body?.code ?? direct.body?.message ?? '없음'}`) });
  }
  return base;
}

// 6단계: 5단계 점검을 이어 쓰고, 판정기 device_registered 규칙을 로컬 가상 요청으로 확인합니다.
// 미등록 기기로 실제 자료실에 들어오는 공격은 심판이 보내므로 여기서는 미실행으로 남깁니다.
async function runStep6Checks(config) {
  const base = (await runStep5Checks(config)).filter((item) => item.attackId !== 'deployment_identity_present');
  const identity = await anonymousGet(appUrl(config), '/aleph.json');
  base.push({ attackId: 'deployment_identity_present', expected: '/aleph.json에 step 6 배포 식별 정보가 있음',
    observed: unreached(identity) ?? `비로그인 /aleph.json HTTP ${identity.status} · step ${identity.body?.step ?? '없음'}` });
  try {
    const { checkDecider } = await import('../scripts/decider-test.mjs');
    const { decide, RULE_IDS } = await import('./decider.mjs');
    const results = await checkDecider({ decide, ruleIds: RULE_IDS });
    base.push({ attackId: 'decider_device_registered_local', expected: '로컬 가상 요청: 등록 기기 allow, 미등록 기기 deny·device_not_registered',
      observed: `로컬 연습(심판 판정 아님) · ${results.map((r) => `${r.name} ${r.passed ? '통과' : '확인 필요'}`).join(' · ')}` });
  } catch (error) {
    base.push({ attackId: 'decider_device_registered_local', expected: '로컬 가상 요청: 등록 기기 allow, 미등록 기기 deny·device_not_registered',
      observed: `로컬 연습 오류: ${error.message}`.slice(0, 300) });
  }
  base.push({ attackId: 'unregistered_device_access', expected: '미등록 기기로 자료실 읽기 요청은 거부',
    observed: 'not_run' });
  return base;
}

// 7단계: 6단계 점검을 이어 쓰고, step_up_required 규칙을 로컬 가상 사건으로 확인합니다.
// 재로그인 전 실제 자료 차단은 제공 엔진이 새 로그인 시각(stepUp)을 검증하는 환경에서만 잴 수 있어 미실행으로 남깁니다.
async function runStep7Checks(config) {
  const base = (await runStep6Checks(config)).filter((item) => !['deployment_identity_present', 'decider_device_registered_local'].includes(item.attackId));
  const identity = await anonymousGet(appUrl(config), '/aleph.json');
  base.push({ attackId: 'deployment_identity_present', expected: '/aleph.json에 step 7 배포 식별 정보가 있음',
    observed: unreached(identity) ?? `비로그인 /aleph.json HTTP ${identity.status} · step ${identity.body?.step ?? '없음'}` });
  try {
    const { checkDecider } = await import('../scripts/decider-test.mjs');
    const { decide, RULE_IDS } = await import('./decider.mjs');
    const results = await checkDecider({ decide, ruleIds: RULE_IDS });
    base.push({ attackId: 'decider_rules_local', expected: '로컬 가상 요청: 등록 allow, 미등록 deny, 복합 이상 step_up, 재확인 뒤 allow',
      observed: `로컬 연습(심판 판정 아님) · ${results.map((r) => `${r.name} ${r.passed ? '통과' : '확인 필요'}`).join(' · ')}`.slice(0, 300) });
  } catch (error) {
    base.push({ attackId: 'decider_rules_local', expected: '로컬 가상 요청: 등록 allow, 미등록 deny, 복합 이상 step_up, 재확인 뒤 allow',
      observed: `로컬 연습 오류: ${error.message}`.slice(0, 300) });
  }
  base.push({ attackId: 'step_up_before_reauth_block', expected: '복합 이상 접속은 새 로그인 전 자료 없음, 새 로그인 뒤 요청은 허용',
    observed: 'not_run' });
  return base;
}

// 8단계: 7단계 점검을 이어 쓰고, 공지 구역을 비로그인·가짜 토큰으로 직접 불러 자료 없이 거부되는지 봅니다.
// 학생 토큰으로 공지 수정·B 토큰으로 A 메모 읽기는 로그인 토큰이 필요해 bundle에서 보내지 않습니다(로컬 시험만).
async function runStep8Checks(config) {
  const base = (await runStep7Checks(config)).filter((item) => item.attackId !== 'deployment_identity_present');
  const app = appUrl(config);
  const describe = (label, result) => unreached(result) ?? `${label} HTTP ${result.status} · `
    + (Array.isArray(result.body) ? `자료 ${result.body.length}건 노출` : `오류 ${result.body?.error ?? 'JSON 아님'}`);
  const identity = await anonymousGet(app, '/aleph.json');
  base.push({ attackId: 'deployment_identity_present', expected: '/aleph.json에 step 8 배포 식별 정보가 있음',
    observed: unreached(identity) ?? `비로그인 /aleph.json HTTP ${identity.status} · step ${identity.body?.step ?? '없음'}` });
  const list = await anonymousGet(app, '/api/notices');
  base.push({ attackId: 'anonymous_list_notices', expected: '토큰 없는 공지 목록 요청은 401로 거부', observed: describe('비로그인 GET /api/notices', list) });
  const forged = await anonymousGet(app, '/api/notices/00000000-0000-4000-8000-000000000000', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.forged' },
    body: JSON.stringify({ title: 'forged', role: 'instructor' }),
  });
  base.push({ attackId: 'forged_role_notice_update', expected: '가짜 토큰+본문 role로 공지 수정은 401로 거부', observed: describe('가짜 토큰 PUT /api/notices/:id', forged) });
  try {
    const { fixtureRequests } = await import('../scripts/fixture-7.mjs');
    const { decide } = await import('./decider.mjs');
    const { normal } = fixtureRequests();
    const at = (method, route, path) => decide({ ...normal, requestId: crypto.randomUUID(), method, route, path });
    const own = await at('GET', 'GET /notes/:id', '/notes/demo');
    const list = await at('GET', 'GET /notes', '/notes');
    const notice = await at('PUT', 'PUT /notices/:id', '/notices/x1');
    const unknown = await at('GET', 'GET /notes/:id/export', '/notes/n1/export');
    base.push({ attackId: 'decider_zone_local', expected: '로컬 가상 요청: 자기 메모 allow, 메모 전체 목록·공지 수정·알 수 없는 경로 deny',
      observed: `로컬 연습(심판 판정 아님) · 자기 메모 ${own.decision} · 메모 전체 목록 ${list.decision}(${list.reasonCode}) · 공지 수정 ${notice.decision}(${notice.reasonCode}) · 기능 경로 ${unknown.decision}(${unknown.reasonCode})` });
  } catch (error) {
    base.push({ attackId: 'decider_zone_local', expected: '로컬 가상 요청: 자기 메모 allow, 공지 수정 deny, 알 수 없는 경로 deny',
      observed: `로컬 연습 오류: ${error.message}`.slice(0, 300) });
  }
  base.push({ attackId: 'student_notice_update', expected: '학생 토큰으로 공지 수정은 403 INSTRUCTOR_ONLY',
    observed: 'not_run' });
  return base;
}

// 9단계: 8단계 점검을 이어 쓰고, 탐지 규칙 burst_read를 로컬 가상 사건으로 확인합니다.
// 실제 회수 집행과 첫 의심 요청부터 회수까지의 시간은 심판이 가상 사건을 보내 확인하므로 미실행으로 남깁니다.
async function runStep9Checks(config) {
  const base = (await runStep8Checks(config)).filter((item) => !['deployment_identity_present', 'decider_rules_local'].includes(item.attackId));
  const identity = await anonymousGet(appUrl(config), '/aleph.json');
  base.push({ attackId: 'deployment_identity_present', expected: '/aleph.json에 step 9 배포 식별 정보가 있음',
    observed: unreached(identity) ?? `비로그인 /aleph.json HTTP ${identity.status} · step ${identity.body?.step ?? '없음'}` });
  try {
    // 격리 환경에서 쓸 수 없는 node:util을 피하려고 scripts/detect-test.mjs와 같은 6개 사례를 여기서 직접 만듭니다.
    const { detect } = await import('./detect.mjs');
    const START = Date.UTC(2026, 9, 1);
    const reads = (n, { gap = 2, sub = 'learner_fixture' } = {}) => Array.from({ length: n }, (_, i) => ({
      at: new Date(START + i * gap * 1000).toISOString(), method: 'GET', identity: { sub } }));
    const hit = { action: 'propose_revocation', reasonCode: 'burst_read', subject: 'learner_fixture' };
    const cases = [
      { name: '정상 조회 30건', events: reads(30), expected: { action: 'observe' } },
      { name: '10분 안에 120건', events: reads(120), expected: { action: 'observe' } },
      { name: '10분 안에 121건', events: reads(121), expected: hit },
      { name: '폭주 조회 200건', events: reads(200), expected: hit },
      { name: '서로 다른 사용자 각 100건', events: [...reads(100), ...reads(100, { sub: 'other_fixture' })], expected: { action: 'observe' } },
      { name: '10분 밖으로 흩어진 조회 200건', events: reads(200, { gap: 7 }), expected: { action: 'observe' } },
    ];
    const results = cases.map((c) => ({ name: c.name, passed: JSON.stringify(detect(c.events)) === JSON.stringify(c.expected) }));
    base.push({ attackId: 'detect_burst_read_local', expected: '로컬 가상 사건: 10분 안 120건 초과만 propose_revocation, 정상은 observe',
      observed: `로컬 연습(심판 판정 아님) · ${results.filter((r) => r.passed).length}/${results.length} 통과`
        + (results.every((r) => r.passed) ? '' : ` · 확인 필요: ${results.filter((r) => !r.passed).map((r) => r.name).join(', ')}`) });
  } catch (error) {
    base.push({ attackId: 'detect_burst_read_local', expected: '로컬 가상 사건: 10분 안 120건 초과만 propose_revocation, 정상은 observe',
      observed: `로컬 연습 오류: ${error.message}`.slice(0, 300) });
  }
  base.push({ attackId: 'revocation_enforced', expected: '회수 제안 뒤 해당 접속이 회수되고 정상 기기는 유지',
    observed: 'not_run' });
  return base;
}

// 10단계: 9단계 점검을 이어 쓰고, 복원 경로를 로그인 없이·가짜 토큰으로 불러 거부되는지 봅니다.
// B 토큰으로 하는 실제 한 건 복원과 정책 되돌리기 실행은 bundle에서 하지 않으므로 미실행으로 남깁니다.
async function runStep10Checks(config) {
  const base = (await runStep9Checks(config)).filter((item) => item.attackId !== 'deployment_identity_present');
  const app = appUrl(config);
  const identity = await anonymousGet(app, '/aleph.json');
  base.push({ attackId: 'deployment_identity_present', expected: '/aleph.json에 step 10 배포 식별 정보가 있음',
    observed: unreached(identity) ?? `비로그인 /aleph.json HTTP ${identity.status} · step ${identity.body?.step ?? '없음'}` });
  const target = '/api/restore/00000000-0000-4000-8000-000000000000';
  const anon = await anonymousGet(app, target, { method: 'POST' });
  const forged = await anonymousGet(app, target, { method: 'POST', headers: { Authorization: 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.forged' } });
  const show = (label, r) => unreached(r) ?? `${label} HTTP ${r.status} · 오류 ${r.body?.error ?? 'JSON 아님'}`;
  base.push({ attackId: 'anonymous_restore', expected: '로그인 없는 복원 요청은 401', observed: show('비로그인 POST /api/restore/:id', anon) });
  base.push({ attackId: 'forged_token_restore', expected: '가짜 토큰 복원 요청은 401', observed: show('가짜 토큰 POST /api/restore/:id', forged) });
  base.push({ attackId: 'restore_one_note_b', expected: 'B 메모 한 건 복원 뒤 id·소유자·내용 해시가 사본과 같음',
    observed: 'not_run' });
  return base.slice(-20);
}

// 11단계: 10단계 점검을 이어 쓰고, 접속 앱 설정(manifest)과 기기 승인 API를 로그인 없이 불러 봅니다.
// 승인된 기기에서 기존 화면이 열리는지는 패스키와 로그인이 필요해 bundle에서 하지 않습니다(미실행).
async function runStep11Checks(config) {
  const base = (await runStep10Checks(config)).filter((item) => !['deployment_identity_present', 'restore_one_note_b',
    'revocation_enforced', 'step_up_before_reauth_block', 'unregistered_device_access'].includes(item.attackId));
  const app = appUrl(config);
  const identity = await anonymousGet(app, '/aleph.json');
  base.push({ attackId: 'deployment_identity_present', expected: '/aleph.json에 step 11 배포 식별 정보가 있음',
    observed: unreached(identity) ?? `비로그인 /aleph.json HTTP ${identity.status} · step ${identity.body?.step ?? '없음'}` });
  const manifest = await anonymousGet(app, '/manifest.webmanifest');
  base.push({ attackId: 'app_manifest_present', expected: '접속 앱 manifest가 있고 설치만으로 기기 확인이라고 하지 않음',
    observed: unreached(manifest) ?? `GET /manifest.webmanifest HTTP ${manifest.status} · 이름 ${manifest.body?.short_name ?? '없음'} · display ${manifest.body?.display ?? '없음'}` });
  const status = await anonymousGet(app, '/api/device/status');
  base.push({ attackId: 'anonymous_device_status', expected: '로그인 없는 기기 상태 요청은 401', observed: unreached(status) ?? `비로그인 GET /api/device/status HTTP ${status.status} · 오류 ${status.body?.error ?? 'JSON 아님'}` });
  const fakeCookie = await anonymousGet(app, '/api/notes', { headers: { cookie: '__Host-vault_device=eyJ1IjoieCJ9.forged',
    Authorization: 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.forged' } });
  base.push({ attackId: 'forged_device_cookie', expected: '가짜 기기 쿠키+가짜 토큰으로 자료 요청은 거부(401/403)',
    observed: unreached(fakeCookie) ?? `가짜 쿠키 GET /api/notes HTTP ${fakeCookie.status} · 오류 ${fakeCookie.body?.error ?? 'JSON 아님'}` });
  base.push({ attackId: 'approved_device_opens_vault', expected: '승인 전 자료 없음(403), 서버 승인·패스키 확인 뒤 기존 화면 정상',
    observed: 'not_run' });
  return base.slice(-20);
}

// 12단계: 점검마다 공개 HTTPS 주소에 GET 요청을 한 번씩만 보내고, 그 요청에 X-Aleph-Attack-Id 헤더로 attackId를 붙입니다.
// observed에는 실제로 보낸 메서드·전체 주소와 서버가 돌려준 상태·오류 코드만 적습니다.
// 요청을 보내지 않은 점검(쓰기 요청이 필요하거나 로그인·기기 패스키가 필요한 것)은 observed를 not_run으로 둡니다.
// 로컬 시험(가짜 DB·가상 요청)은 요청이 아니므로 이 묶음에 넣지 않고 README·작전실에서 따로 보여 줍니다.
const FORGED_BEARER = 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.forged';
// 심판이 요청 기록과 attackId를 짝짓는 이름이 문서에 없어, 흔한 이름 여러 곳에 같은 attackId를 붙입니다.
// 우리 앱 주소에는 ?attackId= 도 붙입니다(서버는 이 값을 쓰지 않음). 외부 원본 주소에는 쿼리를 붙이지 않습니다.
async function sendGet(attackId, url, headers = {}, { query = true } = {}) {
  const target = new URL(url);
  if (query) target.searchParams.set('attackId', attackId);
  try {
    const response = await fetch(target.href, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { 'X-Aleph-Attack-Id': attackId, 'X-Attack-Id': attackId, 'X-Aleph-Attack': attackId, ...headers } });
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* JSON 아님 */ }
    return { status: response.status, body, text };
  } catch {
    return null;
  }
}

async function runStep12Checks(config) {
  const app = appUrl(config);
  const at = (path) => new URL(path, app).href;
  const id = '00000000-0000-4000-8000-000000000001';
  const gets = [
    { attackId: 'deployment_identity_present', url: at('/aleph.json'), expected: 'GET /aleph.json 200, step 12 배포 식별 정보', show: (r) => `step ${r.body?.step ?? '없음'}` },
    { attackId: 'public_data_json_removed', url: at('/data.json'), expected: 'GET /data.json 404 (공개 메모 파일 없음)' },
    { attackId: 'anonymous_list_notes', url: at('/api/notes'), expected: '로그인 없는 메모 목록 GET은 401' },
    { attackId: 'forged_token_list_notes', url: at('/api/notes'), headers: { Authorization: FORGED_BEARER }, expected: '가짜 토큰 메모 목록 GET은 401' },
    { attackId: 'anonymous_read_note', url: at(`/api/notes/${id}`), expected: '로그인 없는 메모 한 건 GET은 401' },
    { attackId: 'anonymous_list_notices', url: at('/api/notices'), expected: '로그인 없는 공지 목록 GET은 401' },
    { attackId: 'forged_device_cookie', url: at('/api/notes'), headers: { Cookie: '__Host-vault_device=eyJ1IjoieCJ9.forged', Authorization: FORGED_BEARER }, expected: '가짜 기기 쿠키·가짜 토큰 메모 GET은 401/403' },
    { attackId: 'anonymous_device_status', url: at('/api/device/status'), expected: '로그인 없는 기기 상태 GET은 401' },
    { attackId: 'anonymous_auth_me', url: at('/api/auth/me'), expected: '로그인 없는 내 정보 GET은 401' },
    { attackId: 'app_manifest_present', url: at('/manifest.webmanifest'), expected: 'GET /manifest.webmanifest 200, 접속 앱 설정', show: (r) => `이름 ${r.body?.short_name ?? '없음'}` },
    { attackId: 'anonymous_ops_summary', url: at('/api/ops/summary'), expected: '로그인 없는 작전실 요약 GET은 401' },
    { attackId: 'ops_page_present', url: at('/ops.html'), expected: 'GET /ops.html 200, 키 값 없음', show: (r) => `키 값 ${/sb_publishable_|sb_secret_/u.test(r.text) ? '있음' : '없음'}` },
  ];
  if (typeof config.originalApiUrl === 'string') {
    const key = config.publicDataApiKey ?? process.env.ALEPH_PUBLIC_DATA_API_KEY;
    gets.push({ attackId: 'original_api_direct_read', url: config.originalApiUrl, headers: key ? { apikey: key } : {},
      expected: '원본 자료 주소 직접 GET은 메모 없이 401/403', show: () => (key ? '공개 키 붙임' : '키 없이 보냄') });
  }
  const results = [];
  for (const item of gets) {
    const sameApp = new URL(item.url).origin === app.origin;
    const sent = sameApp ? `${item.url}${item.url.includes('?') ? '&' : '?'}attackId=${item.attackId}` : item.url;
    const r = await sendGet(item.attackId, item.url, item.headers, { query: sameApp });
    const observed = !r ? 'not_run'
      : `GET ${sent} → HTTP ${r.status}`
        + (Array.isArray(r.body) ? ` · 배열 ${r.body.length}건` : r.body?.error || r.body?.code ? ` · ${r.body.error ?? r.body.code}` : '')
        + (item.show ? ` · ${item.show(r)}` : '');
    results.push({ attackId: item.attackId, expected: item.expected, observed: observed.slice(0, 300) });
  }
  const notRun = [
    ['anonymous_create_note', '로그인 없는 메모 추가(POST)는 401 — 쓰기 요청이라 보내지 않음'],
    ['anonymous_delete_note', '로그인 없는 메모 삭제(DELETE)는 401 — 쓰기 요청이라 보내지 않음'],
    ['forged_role_notice_update', '가짜 토큰·본문 role 공지 수정(PUT)은 401 — 쓰기 요청이라 보내지 않음'],
    ['anonymous_restore', '로그인 없는 복원(POST)은 401 — 쓰기 요청이라 보내지 않음'],
    ['cross_owner_note_access', 'B 토큰으로 A 메모는 404 — 로그인 토큰이 필요해 보내지 않음'],
    ['approved_device_opens_vault', '승인 기기 확인 뒤 기존 화면 정상 — 로그인·패스키가 필요해 보내지 않음'],
    ['ops_live_matrix', '로그인한 브라우저의 작전실 실측표 — 로그인 쿠키가 필요해 보내지 않음'],
  ];
  for (const [attackId, expected] of notRun) results.push({ attackId, expected, observed: 'not_run' });
  return results.slice(0, 20);
}

// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (config.step === 2) return runStep2Checks(config);
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
async function anonymousGet(app, path) {
  try {
    const response = await fetch(new URL(path, app), { redirect: 'error', signal: AbortSignal.timeout(10000) });
    let body = null;
    try { body = await response.json(); } catch { /* JSON이 아니면 null */ }
    return { status: response.status, body };
  } catch (error) {
    return { status: 0, body: null, failed: error.name };
  }
}

const unreached = result => result.status === 0
  ? `요청 실패(${result.failed ?? '네트워크'}) · 미실행과 같음, 판정 근거로 쓰지 않음` : null;

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

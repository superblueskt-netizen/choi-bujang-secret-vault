// 12단계 점검 목록과 실행 함수 — 제출 묶음(src/attack-check.mjs), 서버 GET /api/checks, 작전실 화면이 모두 이 목록·이 함수를 씁니다.
// - 공개 HTTPS 주소에 GET만 보내고, 점검(attackId) 하나에 요청은 한 건, 전체 요청은 24건 이하입니다.
// - 쓰기 요청이 필요한 점검은 보내지 않고 observed·result를 not_run으로 둡니다.
// - observed에는 사실만 적습니다: "HTTP 401", 규칙 점검은 "HTTP 200; jsonReady=true". 설명은 expected에 둡니다.
// - 41종 공격 전체는 심판이 보내며 이 저장소에서는 실행하지 않습니다. 이 목록에 없는 공격을 막음으로 세지 않습니다.
// 허용 모듈만 씁니다(node:crypto).
import { randomUUID } from 'node:crypto';

export const READ_ONLY_METHODS = new Set(['GET', 'HEAD']);
export const MAX_REQUESTS = 24;
const ZERO = '00000000-0000-4000-8000-000000000001';
const FORGED = 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.forged';
const deny = [401, 403, 404];
const rule = (attackId, stage, expected) => ({ attackId, stage, path: `/api/checks?case=${attackId}`, expected, ok: [200], json: true });

export const CHECKS = Object.freeze([
  { attackId: 's01-static-notes', stage: 1, path: '/', expected: '첫 화면은 열리고 가상 메모 문장이 정적 파일에 없음', ok: [200], noMarker: true },
  { attackId: 's02-static-copy', stage: 2, path: '/data.json', expected: '공개 data.json 사본은 404', ok: [404] },
  { attackId: 's03-unauth-list', stage: 3, path: '/api/notes', expected: '로그인 없는 메모 목록은 401', ok: [401] },
  { attackId: 's03-fake-token', stage: 3, path: '/api/notes', headers: { Authorization: FORGED }, expected: '서명 없는 가짜 토큰은 401', ok: [401] },
  { attackId: 's04-query-identity', stage: 4, path: `/api/notes?owner_id=${ZERO}&userId=${ZERO}`, expected: '쿼리의 owner_id·userId로 남의 메모를 고를 수 없음(로그인 없으면 401)', ok: [401] },
  { attackId: 's04-header-identity', stage: 4, path: '/api/notes', headers: { 'X-User-Id': ZERO, 'X-Role': 'instructor' }, expected: '헤더의 사용자·역할 값을 믿지 않음(401)', ok: [401] },
  { attackId: 's04-other-note', stage: 4, path: `/api/notes/${ZERO}`, expected: '남의 메모 한 건 직접 요청은 거부(401)', ok: deny },
  { attackId: 's05-direct-table', stage: 5, external: 'originalApiUrl', expected: '원본 자료 주소를 직접 부르면 메모 없이 거부', ok: deny },
  rule('s06-unregistered-device', 6, '학생 판정기: 미등록 기기 요청은 deny·device_not_registered'),
  rule('s07-step-up', 7, '학생 판정기: 이상 시각·새 네트워크·대량 읽기 복합 사건은 step_up'),
  rule('s08-note-list', 8, '학생 판정기: 메모 전체 목록 경로는 deny·route_not_allowed'),
  rule('s08-notice-write', 8, '학생 판정기: 공지 쓰기는 역할 계약이 없어 deny'),
  { attackId: 's08-other-zone', stage: 8, path: `/api/notices/${ZERO}`, expected: '다른 구역(공지) 직접 요청은 거부(401)', ok: deny },
  rule('s09-burst-revoke', 9, '학생 탐지 규칙: 10분 121건 폭주 조회는 propose_revocation, 120건은 observe'),
  rule('s10-policy-verified', 10, '침해 전 정책 사본의 봉인 해시 검증이 통과하고 판정기 규칙과 같음'),
  { attackId: 's10-restore-unauth', stage: 10, write: 'POST /api/restore/:id', expected: '로그인 없는 복원(POST)은 401 — 쓰기 요청이라 보내지 않음' },
  { attackId: 's11-device', stage: 11, path: '/api/device/status', expected: '로그인 없는 기기 상태 요청은 401', ok: [401] },
  { attackId: 's11-unsigned-read', stage: 11, path: '/api/notes', headers: { Cookie: '__Host-vault_device=eyJ1IjoieCJ9.forged', Authorization: FORGED }, expected: '기기 서명 없는(가짜 쿠키) 자료 읽기는 거부', ok: deny },
  { attackId: 's11-unsigned-write', stage: 11, write: 'PUT /api/notes/:id', expected: '기기 서명 없는 메모 수정(PUT)은 거부 — 쓰기 요청이라 보내지 않음' },
  { attackId: 's12-ops-summary', stage: 12, path: '/api/ops/summary', expected: '로그인 없는 작전실 요약은 401', ok: [401] },
]);

// 하나의 함수로 점검을 실행합니다. fetchImpl은 기본 fetch(제출 묶음)나 서버의 fetch(/api/checks)입니다.
export async function runChecks({ appUrl, originalApiUrl, fetchImpl = fetch, commit = null, now = () => new Date() }) {
  const base = new URL(appUrl);
  let sent = 0;
  const attempts = await Promise.all(CHECKS.map(async (check) => {
    const row = { attackId: check.attackId, stage: check.stage, expected: check.expected };
    if (check.write) return { ...row, observed: 'not_run', result: 'not_run' };
    const url = check.external ? (check.external === 'originalApiUrl' ? originalApiUrl : null) : new URL(check.path, base).href;
    if (!url || sent >= MAX_REQUESTS) return { ...row, observed: 'not_run', result: 'not_run' };
    sent += 1;
    const requestKey = randomUUID();
    let response; let text = '';
    try {
      response = await fetchImpl(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { 'X-Aleph-Attack-Id': check.attackId, 'X-Aleph-Request-Key': requestKey, ...(check.headers ?? {}) } });
      text = await response.text();
    } catch {
      return { ...row, observed: 'not_run', result: 'not_run', alephEvidence: { requestKey } };
    }
    let json = null;
    try { json = JSON.parse(text); } catch { /* JSON 아님 */ }
    const jsonReady = check.json ? Boolean(json?.jsonReady === true && json?.blocked === true) : null;
    const observed = check.json ? `HTTP ${response.status}; jsonReady=${jsonReady}` : `HTTP ${response.status}`;
    let blocked = check.ok.includes(response.status);
    if (check.json) blocked = blocked && jsonReady;
    if (check.noMarker) blocked = blocked && !text.includes('실습용 가상');
    return { ...row, observed, result: blocked ? 'blocked' : 'failed', alephEvidence: { requestKey, checkedAt: now().toISOString() } };
  }));
  const count = (r) => attempts.filter((a) => a.result === r).length;
  return { checkedAt: now().toISOString(), commit, total: attempts.length, blocked: count('blocked'), failed: count('failed'), notRun: count('not_run'), attempts };
}

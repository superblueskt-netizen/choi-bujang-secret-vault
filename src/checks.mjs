// 12단계 점검 목록과 결과 계산 — 제출 묶음(src/attack-check.mjs), 서버 GET /api/checks, 작전실 화면이 모두 이 파일을 씁니다.
// - 결과는 서버 관측(aleph_check_observations의 caseId·requestKey·상태)으로만 정합니다. 관측되지 않은 점검은 not_run입니다.
// - 제출 묶음은 공개 HTTPS 주소에 GET만, 점검 하나에 요청 한 건(+ 마지막 관측 확인 한 건), 전체 24건 이하로 보냅니다.
// - 서버가 관측할 수 없는 정적 파일·외부 주소 점검과 쓰기 요청이 필요한 점검은 보내지 않고 not_run으로 둡니다.
// - observed에는 사실만 적습니다: "HTTP 401", 규칙 점검은 "HTTP 200; jsonReady=true".
// - 41종 공격 전체는 심판이 보내며 이 저장소에서는 실행하지 않습니다. 이 목록에 없는 공격을 막음으로 세지 않습니다.
import { randomUUID } from 'node:crypto';

export const READ_ONLY_METHODS = new Set(['GET', 'HEAD']);
export const MAX_REQUESTS = 24;
const ZERO = '00000000-0000-4000-8000-000000000001';
const FORGED = 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.forged';
const deny = [401, 403, 404];
const rule = (attackId, stage, expected) => ({ attackId, stage, path: `/api/checks?case=${attackId}`, expected, ok: [200], json: true });

export const CHECKS = Object.freeze([
  { attackId: 's01-static-notes', stage: 1, skip: '정적 파일이라 서버가 요청을 관측할 수 없어 보내지 않음', expected: '첫 화면 정적 파일에 가상 메모 문장이 없음 — 서버 관측 불가로 보내지 않음' },
  { attackId: 's02-static-copy', stage: 2, skip: '정적 파일', expected: '공개 data.json 사본은 404 — 정적 파일이라 서버 관측 불가로 보내지 않음' },
  { attackId: 's03-unauth-list', stage: 3, path: '/api/notes', expected: '로그인 없는 메모 목록은 401', ok: [401] },
  { attackId: 's03-fake-token', stage: 3, path: '/api/notes', headers: { Authorization: FORGED }, expected: '서명 없는 가짜 토큰은 401', ok: [401] },
  { attackId: 's04-query-identity', stage: 4, path: `/api/notes?owner_id=${ZERO}&userId=${ZERO}`, expected: '쿼리의 owner_id·userId로 남의 메모를 고를 수 없음(로그인 없으면 401)', ok: [401] },
  { attackId: 's04-header-identity', stage: 4, path: '/api/notes', headers: { 'X-User-Id': ZERO, 'X-Role': 'instructor' }, expected: '헤더의 사용자·역할 값을 믿지 않음(401)', ok: [401] },
  { attackId: 's04-other-note', stage: 4, path: `/api/notes/${ZERO}`, expected: '남의 메모 한 건 직접 요청은 거부(401)', ok: deny },
  { attackId: 's05-direct-table', stage: 5, skip: '외부 주소', expected: '원본 자료 주소 직접 읽기는 거부 — 외부(Supabase) 주소라 서버 관측 불가로 보내지 않음' },
  rule('s06-unregistered-device', 6, '학생 판정기: 미등록 기기 요청은 deny·device_not_registered'),
  rule('s07-step-up', 7, '학생 판정기: 이상 시각·새 네트워크·대량 읽기 복합 사건은 step_up'),
  rule('s08-note-list', 8, '학생 판정기: 메모 전체 목록 경로는 deny·route_not_allowed'),
  rule('s08-notice-write', 8, '학생 판정기: 공지 쓰기는 역할 계약이 없어 deny'),
  { attackId: 's08-other-zone', stage: 8, path: `/api/notices/${ZERO}`, expected: '다른 구역(공지) 직접 요청은 거부(401)', ok: deny },
  rule('s09-burst-revoke', 9, '학생 탐지 규칙: 10분 121건 폭주 조회는 propose_revocation, 120건은 observe'),
  rule('s10-policy-verified', 10, '침해 전 정책 사본의 봉인 해시 검증이 통과하고 판정기 규칙과 같음'),
  { attackId: 's10-restore-unauth', stage: 10, skip: '쓰기 요청', expected: '로그인 없는 복원(POST)은 401 — 쓰기 요청이라 보내지 않음' },
  { attackId: 's11-device', stage: 11, path: '/api/device/status', expected: '로그인 없는 기기 상태 요청은 401', ok: [401] },
  { attackId: 's11-unsigned-read', stage: 11, path: '/api/notes', headers: { Cookie: '__Host-vault_device=eyJ1IjoieCJ9.forged', Authorization: FORGED }, expected: '기기 서명 없는(가짜 쿠키) 자료 읽기는 거부', ok: deny },
  { attackId: 's11-unsigned-write', stage: 11, skip: '쓰기 요청', expected: '기기 서명 없는 메모 수정(PUT)은 거부 — 쓰기 요청이라 보내지 않음' },
  { attackId: 's12-ops-summary', stage: 12, path: '/api/ops/summary', expected: '로그인 없는 작전실 요약은 401', ok: [401] },
]);

// 서버 관측 한 줄 → 점검 결과
function judge(check, obs) {
  const row = { attackId: check.attackId, stage: check.stage, expected: check.expected };
  if (check.skip || !obs) return { ...row, observed: 'not_run', result: 'not_run' };
  const jsonReady = obs.json_ready === true;
  const observed = check.json ? `HTTP ${obs.status}; jsonReady=${jsonReady}` : `HTTP ${obs.status}`;
  const blocked = check.ok.includes(obs.status) && (!check.json || jsonReady);
  return { ...row, observed, result: blocked ? 'blocked' : 'failed',
    alephEvidence: { caseId: obs.case_id, requestKey: obs.request_key, observedAt: obs.at } };
}
function summarize(attempts, { commit = null, now = () => new Date() } = {}) {
  const count = (r) => attempts.filter((a) => a.result === r).length;
  return { checkedAt: now().toISOString(), commit, total: attempts.length, blocked: count('blocked'), failed: count('failed'), notRun: count('not_run'), attempts };
}

// 서버(/api/checks): 관측 기록에서 점검마다 가장 최근 관측을 골라 결과를 만듭니다.
export function fromObservations(rows, opts) {
  const latest = new Map();
  for (const r of [...rows].sort((a, b) => String(b.at).localeCompare(String(a.at)))) if (!latest.has(r.case_id)) latest.set(r.case_id, r);
  return summarize(CHECKS.map((c) => judge(c, latest.get(c.attackId))), opts);
}

// 제출 묶음: 점검 요청을 보내고(증거: caseId·requestKey), 실제로 받은 응답의 HTTP 상태를 그대로 적습니다.
// 보내지 않은 점검(정적 파일·외부 주소·쓰기 요청)과 요청이 실패한 점검만 not_run입니다. 상태를 추측하거나 계산하지 않습니다.
export async function runChecks({ appUrl, fetchImpl = fetch, commit = null, now = () => new Date() }) {
  const base = new URL(appUrl);
  const attempts = [];
  let sent = 0;
  for (const check of CHECKS) {
    if (check.skip || sent >= MAX_REQUESTS) { attempts.push(judge(check, null)); continue; }
    const requestKey = randomUUID();
    const alephEvidence = { attackId: check.attackId, caseId: check.attackId, requestKey };
    let response; let text = '';
    try {
      sent += 1;
      response = await fetchImpl(new URL(check.path, base).href, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(8000), alephEvidence,
        headers: { 'X-Aleph-Case-Id': check.attackId, 'X-Aleph-Request-Key': requestKey, 'X-Aleph-Evidence': JSON.stringify(alephEvidence), ...(check.headers ?? {}) } });
      text = await response.text();
    } catch {
      attempts.push(judge(check, null));
      continue;
    }
    let body = null;
    try { body = JSON.parse(text); } catch { /* JSON 아님 */ }
    attempts.push(judge(check, { case_id: check.attackId, request_key: requestKey, status: response.status,
      json_ready: body?.jsonReady === true && body?.blocked === true, at: now().toISOString() }));
  }
  return summarize(attempts, { commit, now });
}

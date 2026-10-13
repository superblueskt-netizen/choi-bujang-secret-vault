// 12단계 탈환 작전실 요약: GET /api/ops/summary
// 서버가 지금 실제로 쓰는 판정기 규칙·탐지 규칙·내 기기 회수 상태·정책 사본 검증·복구 감사 기록을 읽어 돌려줍니다.
// 로그인한 사용자 본인의 기록만 보여 주고, 메모 본문·토큰·전체 사용자 ID·공개키는 넣지 않습니다(자원 ID는 앞 8자리만).
// 엔진이 전달하는 실제 탐지 사건 경로는 연결되지 않았으므로 '미실행'으로 표시합니다.
import { randomUUID } from 'node:crypto';
import { RULE_IDS, ZONE_ROUTES } from './decider.mjs';
import { DETECT_RULE } from './detect.mjs';
import { loadVerifiedSnapshot } from '../scripts/policy-restore.mjs';
import { authenticateLoginOnly } from './notes-api.mjs';

const send = (response, status, body) => response.status(status).json(body);
const mask = (resource) => (typeof resource === 'string' ? resource.replace(/:([0-9a-f]{8})[0-9a-f-]*/iu, ':$1…') : null);

export async function handleOps(request, response, action) {
  if (action !== 'summary') return send(response, 404, { error: 'NOT_FOUND' });
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
  }
  const ctx = await authenticateLoginOnly(request, response);
  if (!ctx) return;
  const checkedAt = new Date().toISOString();
  const summaryId = randomUUID();

  // 판정기·탐지 규칙: 배포된 코드에서 직접 읽음(화면 문구가 아님)
  const decider = { source: 'server-code', ruleIds: [...RULE_IDS], zoneRoutes: [...ZONE_ROUTES] };
  const detection = { source: 'server-code', rule: DETECT_RULE,
    events: { status: '미실행', reason: '엔진이 검증한 실제 사건을 이 서버로 전달하는 경로가 연결되지 않음' } };

  // 회수 상태: 내 기기 승인·대기·회수 수(서버 DB)
  let revocation;
  const devices = await ctx.db.from('vault_devices').select('status').eq('user_id', ctx.userId);
  if (devices.error) revocation = { source: 'server-db', status: '읽기 실패', error: devices.error.code ?? 'DB' };
  else {
    const rows = devices.data ?? [];
    const count = (s) => rows.filter((r) => r.status === s).length;
    revocation = { source: 'server-db', approved: count('approved'), pending: count('pending'), revoked: count('revoked') };
  }

  // 복구 버전: 정책 사본 봉인 검증(서버 파일) + 내 복원 감사 기록(서버 DB, 최근 10건)
  let policy;
  try {
    const snap = loadVerifiedSnapshot(undefined, { ruleIds: RULE_IDS, zoneRoutes: ZONE_ROUTES });
    policy = { source: 'server-file', verified: true, version: snap.version, sha256Prefix: snap.sha256.slice(0, 16) };
  } catch (error) {
    policy = { source: 'server-file', verified: false, error: error.code ?? 'SNAPSHOT_ERROR' };
  }
  let restores;
  const audit = await ctx.db.from('vault_audit').select('at, action, resource, result').eq('actor', ctx.userId)
    .order('at', { ascending: false }).limit(10);
  if (audit.error) restores = { source: 'server-db', status: '읽기 실패', error: audit.error.code ?? 'DB' };
  else restores = { source: 'server-db', count: (audit.data ?? []).length,
    recent: (audit.data ?? []).map((r) => ({ at: r.at, action: r.action, resource: mask(r.resource), result: r.result })) };

  response.setHeader('X-Ops-Summary-Id', summaryId);
  return send(response, 200, { summaryId, checkedAt, decider, detection, revocation, policy, restores });
}

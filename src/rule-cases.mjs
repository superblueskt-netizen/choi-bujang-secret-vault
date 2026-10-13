// 12단계 규칙 점검: GET /api/checks?case=<attackId>
// 학생 판정기·학생 탐지 규칙·정책 사본 검증을 가상 입력으로 실행해 결과만 돌려줍니다(자료·토큰 없음).
// 실제 판정 요청을 만들고 결과를 집행하는 것은 ALEPH SDP 엔진(반 엔진·심판)이며, 여기서는 집행 여부를 확인하지 않습니다.
import { createHash, randomUUID } from 'node:crypto';
import { decide, RULE_IDS, ZONE_ROUTES } from './decider.mjs';
import { detect } from './detect.mjs';
import { loadVerifiedSnapshot } from '../scripts/policy-restore.mjs';

const ENGINE = { engine: 'ALEPH SDP 엔진', engineEnforced: 'not_run' };
const request = (patch = {}) => ({
  schema: 'aleph.decision.v1', requestId: randomUUID(), classId: 'class_fixture', projectId: 'project_fixture',
  subjectId: 'learner_fixture', deviceId: 'a'.repeat(16), service: 'notes', method: 'GET', path: '/notes/demo',
  route: 'GET /notes/:id', queryLength: 0, querySha256: createHash('sha256').update('').digest('hex'),
  at: new Date().toISOString(), policyRevision: 1, deviceRegistered: true,
  stepUp: { verified: false, authAgeSeconds: null }, recentEvents: [],
  signals: { source: 'judge_fixture', region: 'local', network: 'usual', hour: 14 }, ...patch,
});
const reads = (n) => Array.from({ length: n }, (_, i) => ({ at: new Date(Date.UTC(2026, 9, 1) + i * 2000).toISOString(), method: 'GET', identity: { sub: 'learner_fixture' } }));

const CASES = {
  's06-unregistered-device': async () => {
    const out = await decide(request({ deviceRegistered: false }));
    return { source: '학생 판정기', decision: out.decision, reasonCode: out.reasonCode, blocked: out.decision === 'deny' && out.reasonCode === 'device_not_registered' };
  },
  's07-step-up': async () => {
    const out = await decide(request({ signals: { source: 'judge_fixture', region: 'foreign', network: 'unusual', hour: 3 }, recentEvents: [{ kind: 'risk_signal', ageSeconds: 60, count: 20 }] }));
    return { source: '학생 판정기', decision: out.decision, reasonCode: out.reasonCode, blocked: out.decision === 'step_up' };
  },
  's08-note-list': async () => {
    const out = await decide(request({ route: 'GET /notes', path: '/notes' }));
    return { source: '학생 판정기', decision: out.decision, reasonCode: out.reasonCode, blocked: out.decision === 'deny' };
  },
  's08-notice-write': async () => {
    const out = await decide(request({ method: 'PUT', route: 'PUT /notices/:id', path: '/notices/demo' }));
    return { source: '학생 판정기', decision: out.decision, reasonCode: out.reasonCode, blocked: out.decision === 'deny' };
  },
  's09-burst-revoke': async () => {
    const burst = detect(reads(121)); const normal = detect(reads(120));
    return { source: '학생 탐지 규칙', burst: burst.action, normal: normal.action,
      blocked: burst.action === 'propose_revocation' && burst.reasonCode === 'burst_read' && normal.action === 'observe' };
  },
  's10-policy-verified': async () => {
    try {
      const snap = loadVerifiedSnapshot(undefined, { ruleIds: RULE_IDS, zoneRoutes: ZONE_ROUTES });
      return { source: '학생 정책 사본(backup/)', version: snap.version, sha256Prefix: snap.sha256.slice(0, 16), blocked: true };
    } catch (error) {
      return { source: '학생 정책 사본(backup/)', error: error.code ?? 'SNAPSHOT_ERROR', blocked: false };
    }
  },
};

export async function runRuleCase(name) {
  if (!Object.hasOwn(CASES, name)) return null;
  const result = await CASES[name]();
  return { case: name, jsonReady: true, ...result, ...ENGINE };
}

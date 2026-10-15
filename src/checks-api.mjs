// GET /api/checks — 서버가 관측한 점검 요청 기록(caseId·requestKey·상태)으로 점검표를 만듭니다. 서버가 새로 요청을 보내지 않습니다.
// GET /api/checks?requestKeys=k1,k2 — 그 requestKey들의 서버 관측 기록(제출 묶음이 자기 요청이 관측됐는지 확인할 때 씀)
// GET /api/checks?case=<attackId> — 규칙 점검 결과(src/rule-cases.mjs). 자료·토큰·본문은 넣지 않습니다.
import { fromObservations } from './checks.mjs';
import { runRuleCase } from './rule-cases.mjs';
import { observationStore } from './observe.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const send = (response, status, body) => response.status(status).json(body);

export async function handleChecks(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
  }
  const name = request.query?.case;
  if (typeof name === 'string' && name) {
    const out = await runRuleCase(name);
    return out ? send(response, 200, out) : send(response, 404, { error: 'UNKNOWN_CASE' });
  }
  const store = observationStore();
  const keysParam = request.query?.requestKeys;
  if (typeof keysParam === 'string' && keysParam) {
    const keys = keysParam.split(',').map((k) => k.trim().toLowerCase()).filter((k) => UUID.test(k)).slice(0, 30);
    const observations = store && keys.length ? await store.byKeys(keys) : [];
    return send(response, 200, { observations });
  }
  const rows = store ? await store.latest() : [];
  return send(response, 200, fromObservations(rows, { commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null }));
}

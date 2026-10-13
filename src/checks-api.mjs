// GET /api/checks — 제출 묶음과 같은 목록·같은 함수(src/checks.mjs)로 서버가 자기 공개 주소에 점검 요청을 보내고 결과를 돌려줍니다.
// GET /api/checks?case=<attackId> — 규칙 점검(src/rule-cases.mjs) 결과. 자료·토큰·본문은 넣지 않습니다.
import { readFileSync } from 'node:fs';
import { runChecks } from './checks.mjs';
import { runRuleCase } from './rule-cases.mjs';

const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));
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
  const summary = await runChecks({ appUrl: config.publicAppUrl, originalApiUrl: config.originalApiUrl,
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null });
  return send(response, 200, summary);
}
